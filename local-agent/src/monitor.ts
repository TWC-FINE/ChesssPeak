import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import type { PoolStats, WorkerPool, WorkerStats } from './pool.js';
import { HttpError, type ExtraRoutes } from './server.js';

// Load balancer monitor: GET /lb/stats (JSON), GET /lb/events (Server-Sent Events, one snapshot per second),
// POST /lb/workers/:id/kill (failure demo) and GET /lb/dashboard (the page in public/).

const run = promisify(execFile);

export interface MonitorStats extends Omit<PoolStats, 'workers'> {
  at: number;
  agent: { pid: number; uptimeSeconds: number; rssBytes: number };
  workers: Array<WorkerStats & { rssBytes: number | null }>;
}

/** Parses `tasklist /FO CSV /NH`: "image","pid","session","session#","1.234 KB" (the memory column is localised). */
export function parseTasklist(output: string): Map<number, number> {
  const rss = new Map<number, number>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^"[^"]*","(\d+)","[^"]*","[^"]*","([^"]*)"/.exec(line);
    if (match === null) continue;
    const kilobytes = Number(match[2]!.replace(/\D/g, ''));
    if (Number.isFinite(kilobytes)) rss.set(Number(match[1]), kilobytes * 1024);
  }
  return rss;
}

/**
 * Resident memory of each PID, in bytes, read from the operating system; PIDs it cannot read are left out.
 * Undefined when the OS could not be asked at all. On Windows `imageName` matters: a full tasklist takes
 * seconds, one filtered by executable takes milliseconds.
 */
export async function readRss(pids: number[], imageName?: string): Promise<Map<number, number> | undefined> {
  if (pids.length === 0) return new Map();
  try {
    if (process.platform === 'win32') {
      const filter = imageName === undefined ? [] : ['/FI', `IMAGENAME eq ${imageName}`];
      const { stdout } = await run('tasklist', ['/FO', 'CSV', '/NH', ...filter], { timeout: 5000, windowsHide: true });
      return parseTasklist(stdout);
    }
    if (process.platform === 'linux') {
      const entries = await Promise.all(
        pids.map(async (pid) => {
          const status = await readFile(`/proc/${pid}/status`, 'utf8').catch(() => '');
          const kilobytes = /VmRSS:\s+(\d+)\s+kB/.exec(status)?.[1];
          return kilobytes === undefined ? undefined : ([pid, Number(kilobytes) * 1024] as const);
        }),
      );
      return new Map(entries.filter((entry) => entry !== undefined));
    }
    const { stdout } = await run('ps', ['-o', 'pid=,rss=', '-p', pids.join(',')], { timeout: 3000 });
    const rss = new Map<number, number>();
    for (const line of stdout.trim().split('\n')) {
      const [pid, kilobytes] = line.trim().split(/\s+/).map(Number);
      if (pid !== undefined && kilobytes !== undefined) rss.set(pid, kilobytes * 1024);
    }
    return rss;
  } catch {
    return undefined;
  }
}

export interface MonitorOptions {
  /** How often /lb/events pushes a snapshot. */
  intervalMs?: number;
  /** How often the workers' memory is read from the OS (it spawns tasklist on Windows). */
  memoryIntervalMs?: number;
  readMemory?: (pids: number[]) => Promise<Map<number, number> | undefined>;
  dashboardPath?: URL;
}

export interface Monitor {
  routes: ExtraRoutes;
  snapshot(): MonitorStats;
  /** Stops the timers and ends the open event streams. */
  close(): void;
}

const KILL_ROUTE = /^\/lb\/workers\/([\w-]+)\/kill$/;

export function createMonitor(pool: WorkerPool, options: MonitorOptions = {}): Monitor {
  const readMemory = options.readMemory ?? readRss;
  const dashboardPath = options.dashboardPath ?? new URL('../public/dashboard.html', import.meta.url);
  const streams = new Set<ServerResponse>();
  let memory = new Map<number, number>();
  let streamTimer: NodeJS.Timeout | undefined;
  let sampling = false;

  const sampleMemory = async (): Promise<void> => {
    if (sampling) return;
    sampling = true;
    const pids = pool.stats().workers.flatMap((worker) => (worker.pid === undefined ? [] : [worker.pid]));
    // a failed read keeps the last values instead of blanking the dashboard
    memory = (await readMemory(pids)) ?? memory;
    sampling = false;
  };
  void sampleMemory();
  const memoryTimer = setInterval(() => void sampleMemory(), options.memoryIntervalMs ?? 2000);
  memoryTimer.unref();

  const snapshot = (): MonitorStats => {
    const stats = pool.stats();
    return {
      ...stats,
      at: Date.now(),
      agent: { pid: process.pid, uptimeSeconds: Math.round(process.uptime()), rssBytes: process.memoryUsage().rss },
      workers: stats.workers.map((worker) => ({
        ...worker,
        rssBytes: worker.pid === undefined ? null : (memory.get(worker.pid) ?? null),
      })),
    };
  };

  const push = (): void => {
    const event = `data: ${JSON.stringify(snapshot())}\n\n`;
    for (const stream of streams) stream.write(event);
  };

  // one shared timer for every open stream, running only while somebody is watching
  const openStream = (req: IncomingMessage, res: ServerResponse, cors: Record<string, string>): void => {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-content-type-options': 'nosniff',
      ...cors,
    });
    // if the agent restarts, EventSource reconnects after this many ms
    res.write('retry: 2000\n\n');
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
    streams.add(res);
    streamTimer ??= setInterval(push, options.intervalMs ?? 1000);
    req.once('close', () => {
      streams.delete(res);
      if (streams.size === 0) {
        clearInterval(streamTimer);
        streamTimer = undefined;
      }
    });
  };

  const json = (res: ServerResponse, status: number, body: unknown, cors: Record<string, string>): void => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors });
    res.end(JSON.stringify(body));
  };

  const routes: ExtraRoutes = async (req, res, url, cors) => {
    const path = url.pathname;
    if (!path.startsWith('/lb/') && path !== '/lb') return false;

    if (path === '/lb' || path === '/lb/') {
      res.writeHead(302, { location: '/lb/dashboard' });
      res.end();
      return true;
    }

    const kill = KILL_ROUTE.exec(path);
    if (kill !== null) {
      if (req.method !== 'POST') throw new HttpError(405, 'Usa POST');
      const result = pool.killWorker(kill[1]!);
      if (result === 'unknown') throw new HttpError(404, `No existe el worker ${kill[1]}`);
      if (result === 'not-up') throw new HttpError(409, `El worker ${kill[1]} no está activo`);
      json(res, 202, { killed: kill[1], pid: result.pid }, cors);
      return true;
    }

    if (req.method !== 'GET') throw new HttpError(405, 'Usa GET');
    if (path === '/lb/stats') {
      json(res, 200, snapshot(), cors);
      return true;
    }
    if (path === '/lb/events') {
      openStream(req, res, cors);
      return true;
    }
    if (path === '/lb/dashboard') {
      const html = await readFile(dashboardPath, 'utf8');
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        // the page only talks to this agent
        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
      });
      res.end(html);
      return true;
    }
    return false;
  };

  return {
    routes,
    snapshot,
    close: () => {
      clearInterval(memoryTimer);
      clearInterval(streamTimer);
      streamTimer = undefined;
      for (const stream of streams) stream.end();
      streams.clear();
    },
  };
}
