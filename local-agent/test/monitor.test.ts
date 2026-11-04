import { request, createServer as createProbe, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMonitor, parseTasklist, type Monitor, type MonitorStats } from '../src/monitor.js';
import { WorkerPool, type WorkerHandle } from '../src/pool.js';
import { agentConfigFromEnv, createAgent } from '../src/server.js';
import { LeastConnections } from '../src/strategies.js';

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createProbe();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

function call(port: number, method: string, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Opens /lb/events and resolves with the first `count` snapshots. */
function readEvents(port: number, count: number) {
  return new Promise<{ contentType: string | undefined; events: MonitorStats[] }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/lb/events', headers: { host: `127.0.0.1:${port}` } }, (res) => {
      const events: MonitorStats[] = [];
      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = block.split('\n').find((line) => line.startsWith('data: '));
          if (data !== undefined) events.push(JSON.parse(data.slice(6)) as MonitorStats);
          if (events.length === count) {
            req.destroy();
            resolve({ contentType: res.headers['content-type'], events });
          }
        }
      });
    });
    req.on('error', (error) => (error.message.includes('aborted') || error.message.includes('socket hang up') ? undefined : reject(error)));
    req.end();
  });
}

function fakeHandle(port: number): WorkerHandle {
  let exit!: () => void;
  const exited = new Promise<void>((resolve) => (exit = resolve));
  return { url: `http://fake:${port}`, pid: port, exited, stop: async () => exit(), killNow: () => exit() };
}

describe('load balancer monitor', () => {
  let pool: WorkerPool;
  let monitor: Monitor;
  let server: Server;
  let port: number;

  beforeEach(async () => {
    pool = new WorkerPool({
      size: 2,
      basePort: 9101,
      strategy: new LeastConnections(),
      launch: async (p) => fakeHandle(p),
      probe: async () => true,
      send: async () => ({ text: 'e cuatro', ms: 1 }),
      healthIntervalMs: 10,
      backoffInitialMs: 50,
    });
    await pool.start();
    monitor = createMonitor(pool, { intervalMs: 20, readMemory: async (pids) => new Map(pids.map((pid) => [pid, pid * 1024])) });
    port = await freePort();
    server = createAgent({ ...agentConfigFromEnv({}), port }, { info: () => ({}), transcribe: (wav) => pool.transcribe(wav) }, monitor.routes);
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  });

  afterEach(async () => {
    monitor.close();
    await pool.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /lb/stats returns every worker with its counters, uptime and memory', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const reply = await call(port, 'GET', '/lb/stats');
    expect(reply.status).toBe(200);
    const stats = JSON.parse(reply.body) as MonitorStats;
    expect(stats.strategy).toBe('least-connections');
    expect(stats.workers).toHaveLength(2);
    expect(stats.workers[0]).toMatchObject({ id: 'w1', port: 9101, pid: 9101, state: 'up', active: 0, served: 0, failed: 0, restarts: 0, rssBytes: 9101 * 1024 });
    expect(stats.workers[0]!.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(stats.totals).toEqual({ 200: 0, 502: 0, 503: 0, 504: 0 });
    expect(stats.agent.pid).toBe(process.pid);
  });

  it('GET /lb/events streams a snapshot right away and then on every tick', async () => {
    const { contentType, events } = await readEvents(port, 3);
    expect(contentType).toMatch(/^text\/event-stream/);
    expect(events).toHaveLength(3);
    expect(events[2]!.at).toBeGreaterThan(events[0]!.at);
    expect(events[0]!.workers.map((w) => w.id)).toEqual(['w1', 'w2']);
  });

  it('POST /lb/workers/:id/kill takes the worker down, and the pool brings it back', async () => {
    const reply = await call(port, 'POST', '/lb/workers/w2/kill');
    expect(reply.status).toBe(202);
    expect(JSON.parse(reply.body)).toEqual({ killed: 'w2', pid: 9102 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(monitor.snapshot().workers[1]!.state).toBe('down');
    expect((await call(port, 'POST', '/lb/workers/w2/kill')).status).toBe(409);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(monitor.snapshot().workers[1]).toMatchObject({ state: 'up', restarts: 1 });
  });

  it('validates the kill route and refuses other sites', async () => {
    expect((await call(port, 'GET', '/lb/workers/w1/kill')).status).toBe(405);
    expect((await call(port, 'POST', '/lb/workers/w7/kill')).status).toBe(404);
    expect((await call(port, 'POST', '/lb/workers/w1/kill', { origin: 'https://evil.example' })).status).toBe(403);
    expect(monitor.snapshot().workers[0]!.state).toBe('up');
    // the dashboard calls from the agent's own origin
    expect((await call(port, 'POST', '/lb/workers/w1/kill', { origin: `http://127.0.0.1:${port}` })).status).toBe(202);
  });

  it('serves the dashboard page with a strict content security policy', async () => {
    const reply = await call(port, 'GET', '/lb/dashboard');
    expect(reply.status).toBe(200);
    expect(reply.headers['content-type']).toMatch(/^text\/html/);
    expect(reply.headers['content-security-policy']).toContain("connect-src 'self'");
    expect(reply.body).toContain('/lb/events');
    expect((await call(port, 'GET', '/lb')).headers.location).toBe('/lb/dashboard');
    expect((await call(port, 'GET', '/lb/nope')).status).toBe(404);
  });

  it('keeps the last memory reading when the OS cannot be asked', async () => {
    const readings: Array<Map<number, number> | undefined> = [new Map([[9101, 1000]]), undefined];
    const flaky = createMonitor(pool, { memoryIntervalMs: 10, readMemory: async () => readings.shift() });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(flaky.snapshot().workers[0]!.rssBytes).toBe(1000);
    flaky.close();
  });

  it('parses the memory column of tasklist whatever the locale', () => {
    const output = ['"whisper-server.exe","23076","Console","7","592,860 KB"', '"node.exe","4544","Console","7","48.120 KB"', 'INFO: garbage'].join('\r\n');
    expect(parseTasklist(output)).toEqual(
      new Map([
        [23076, 592860 * 1024],
        [4544, 48120 * 1024],
      ]),
    );
  });
});
