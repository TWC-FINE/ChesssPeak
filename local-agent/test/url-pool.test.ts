import { createServer, request, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createMonitor, type Monitor } from '../src/monitor.js';
import { WorkerPool, type PoolOptions, type WorkerHandle } from '../src/pool.js';
import { agentConfigFromEnv, createAgent } from '../src/server.js';
import { LeastConnections } from '../src/strategies.js';
import { connectUrlWorker, intervalFor, isLoopback, parseWorkerUrls, REMOTE_MIN_INTERVAL_MS } from '../src/url-worker.js';
import { probeHealth, transcribeWith } from '../src/whisper-process.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const wav = new Uint8Array(4);

/** A whisper-server stand-in: /health and /inference, with knobs for the tests. */
interface FakeWhisper {
  url: string;
  healthy: boolean;
  delayMs: number;
  healthHits: number;
  /** Stops listening and drops every connection, as a container that dies. */
  crash(): Promise<void>;
}

const servers: Array<() => Promise<void>> = [];
let pools: WorkerPool[] = [];
afterEach(async () => {
  await Promise.all(pools.map((pool) => pool.stop()));
  pools = [];
  await Promise.all(servers.splice(0).map((close) => close()));
});

async function fakeWhisper(): Promise<FakeWhisper> {
  const sockets = new Set<Socket>();
  let open = true;
  const server: Server = createServer((req, res) => {
    if (req.url === '/health') {
      fake.healthHits++;
      res.writeHead(fake.healthy ? 200 : 503).end();
      return;
    }
    if (req.url === '/inference' && req.method === 'POST') {
      req.resume();
      req.on('end', () =>
        setTimeout(() => {
          if (!res.destroyed) res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ text: 'e cuatro' }));
        }, fake.delayMs),
      );
      return;
    }
    res.writeHead(404).end();
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const close = async (): Promise<void> => {
    if (!open) return;
    open = false;
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  servers.push(close);
  const fake: FakeWhisper = {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    healthy: true,
    delayMs: 20,
    healthHits: 0,
    crash: close,
  };
  return fake;
}

function urlPool(urls: string[], overrides: Partial<PoolOptions> = {}): WorkerPool {
  const probe = (url: string) => probeHealth(url, 300);
  const pool = new WorkerPool({
    size: urls.length,
    urls,
    strategy: new LeastConnections(),
    connect: (url) => connectUrlWorker(url, { probe, readyTimeoutMs: 2000, intervalMs: 20 }),
    probe,
    send: (url, body) => transcribeWith(url, body),
    healthIntervalMs: 20,
    backoffInitialMs: 20,
    ...overrides,
  });
  pools.push(pool);
  return pool;
}

const state = (pool: WorkerPool, id: string) => pool.stats().workers.find((w) => w.id === id)!;

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

function remoteHandle(url: string): WorkerHandle {
  return { url, pid: undefined, exited: new Promise<void>(() => undefined), stop: async () => undefined, killNow: () => undefined };
}

describe('URL mode of the pool', () => {
  it('connects to every URL once its /health answers, with no process behind it', async () => {
    const [a, b] = await Promise.all([fakeWhisper(), fakeWhisper()]);
    a!.healthy = false;
    setTimeout(() => (a!.healthy = true), 100);
    const pool = urlPool([a!.url, b!.url]);
    await pool.start();
    const stats = pool.stats();
    expect(stats.mode).toBe('url');
    expect(stats.workers.map((w) => [w.id, w.url, w.state, w.pid])).toEqual([
      ['w1', a!.url, 'up', undefined],
      ['w2', b!.url, 'up', undefined],
    ]);
    expect(stats.workers[0]!.port).toBe(Number(new URL(a!.url).port));
    expect(a!.healthHits).toBeGreaterThan(1);
  });

  it('finds a dead worker through the failed request and retries that request once on another', async () => {
    const [a, b] = await Promise.all([fakeWhisper(), fakeWhisper()]);
    const pool = urlPool([a!.url, b!.url], { backoffInitialMs: 10_000 });
    await pool.start();
    await a!.crash();
    const results = await Promise.all([pool.transcribe(wav), pool.transcribe(wav)]);
    expect(results.map((r) => r.worker)).toEqual(['w2', 'w2']);
    expect(state(pool, 'w1').state).toBe('down');
    expect(state(pool, 'w1').failed).toBe(1);
    expect(pool.stats().totals).toEqual({ 200: 2, 502: 0, 503: 0, 504: 0 });
  });

  it('takes out a worker that stops answering /health, and reconnects it when it answers again', async () => {
    const [a, b] = await Promise.all([fakeWhisper(), fakeWhisper()]);
    const pool = urlPool([a!.url, b!.url], { failuresToDown: 2 });
    await pool.start();
    a!.healthy = false;
    await sleep(120);
    expect(state(pool, 'w1').state).not.toBe('up');
    a!.healthy = true;
    await sleep(200);
    expect(state(pool, 'w1')).toMatchObject({ state: 'up' });
    expect(state(pool, 'w1').restarts).toBeGreaterThanOrEqual(1);
  });

  it('lets the request in flight finish on an isolated worker, sends the rest elsewhere, and takes it back on restore', async () => {
    const [a, b] = await Promise.all([fakeWhisper(), fakeWhisper()]);
    a!.delayMs = 150;
    b!.delayMs = 150;
    // health probes still on their way when the worker is isolated, per URL
    const inFlight = new Map<string, number>();
    const pool = urlPool([a!.url, b!.url], {
      probe: async (url) => {
        inFlight.set(url, (inFlight.get(url) ?? 0) + 1);
        try {
          return await probeHealth(url, 300);
        } finally {
          inFlight.set(url, inFlight.get(url)! - 1);
        }
      },
    });
    await pool.start();

    const first = pool.transcribe(wav);
    await sleep(20);
    const busy = pool.stats().workers.find((w) => w.active === 1)!;
    const other = busy.id === 'w1' ? 'w2' : 'w1';
    expect(pool.isolateWorker(busy.id)).toBe('isolated');
    expect(pool.isolateWorker(busy.id)).toBe('already');
    // a probe sent just before isolating may still land: wait until none is in flight, then count
    const busyUrl = busy.id === 'w1' ? a!.url : b!.url;
    while ((inFlight.get(busyUrl) ?? 0) > 0) await sleep(5);
    const hitsWhenIsolated = (busy.id === 'w1' ? a! : b!).healthHits;

    const later = await Promise.all([pool.transcribe(wav), pool.transcribe(wav)]);
    expect(later.map((r) => r.worker)).toEqual([other, other]);
    await expect(first).resolves.toMatchObject({ worker: busy.id, text: 'e cuatro' });
    expect(state(pool, busy.id)).toMatchObject({ state: 'isolated', served: 1, active: 0 });
    // nothing probes an isolated worker
    expect((busy.id === 'w1' ? a! : b!).healthHits).toBe(hitsWhenIsolated);
    expect(pool.stats().totals[200]).toBe(3);

    expect(pool.restoreWorker(other)).toBe('not-isolated');
    expect(pool.restoreWorker(busy.id)).toBe('restored');
    await sleep(50);
    expect(state(pool, busy.id).state).toBe('up');
    const both = await Promise.all([pool.transcribe(wav), pool.transcribe(wav)]);
    expect(new Set(both.map((r) => r.worker))).toEqual(new Set(['w1', 'w2']));
  });

  it('never probes or reconnects a URL that leaves the machine more often than every 15 s', async () => {
    const local = await fakeWhisper();
    const remote = 'https://whisper.example.com';
    let remoteProbes = 0;
    let localProbes = 0;
    const pool = urlPool([remote, local.url], {
      connect: async (url) => remoteHandle(url),
      probe: async (url) => {
        if (url === remote) remoteProbes++;
        else localProbes++;
        return true;
      },
      send: async (url) => {
        if (url === remote) throw new TypeError('fetch failed');
        return { text: 'e cuatro', ms: 1 };
      },
    });
    await pool.start();
    await sleep(200);
    expect(state(pool, 'w1').probeIntervalMs).toBe(REMOTE_MIN_INTERVAL_MS);
    expect(state(pool, 'w2').probeIntervalMs).toBe(20);
    expect(remoteProbes).toBe(1);
    expect(localProbes).toBeGreaterThan(4);

    // the remote fails a request: its first reconnection waits at least 15 s, not the configured 20 ms
    await Promise.all([pool.transcribe(wav), pool.transcribe(wav)]);
    expect(state(pool, 'w1').state).toBe('down');
    expect(state(pool, 'w1').nextRestartInMs).toBeGreaterThan(REMOTE_MIN_INTERVAL_MS - 1000);
  });

  it('stops reconnecting after reconnectMax failed attempts, until the worker is restored', async () => {
    const [a, gone] = await Promise.all([fakeWhisper(), fakeWhisper()]);
    await gone!.crash();
    let attempts = 0;
    const probe = (url: string) => probeHealth(url, 300);
    const pool = urlPool([a!.url, gone!.url], {
      reconnectMax: 3,
      backoffInitialMs: 10,
      backoffMaxMs: 20,
      connect: (url) => {
        if (url === gone!.url) attempts++;
        return connectUrlWorker(url, { probe, readyTimeoutMs: 30, intervalMs: 10 });
      },
    });
    await pool.start();
    await sleep(400);
    expect(attempts).toBe(3);
    expect(state(pool, 'w2')).toMatchObject({ state: 'down', nextRestartInMs: null });
    await sleep(200);
    expect(attempts).toBe(3);

    // restoring gives it another full round of reconnectMax attempts, and then it stops again
    expect(pool.restoreWorker('w2')).toBe('restored');
    await sleep(400);
    expect(attempts).toBe(6);
    await sleep(200);
    expect(attempts).toBe(6);
  });

  it('has no process to kill', async () => {
    const a = await fakeWhisper();
    const pool = urlPool([a.url]);
    await pool.start();
    expect(pool.killWorker('w1')).toBe('unsupported');
    expect(pool.killWorker('w9')).toBe('unknown');
    expect(state(pool, 'w1').state).toBe('up');
  });
});

describe('monitor routes in URL mode', () => {
  let monitor: Monitor | undefined;
  let agent: Server | undefined;
  afterEach(async () => {
    monitor?.close();
    if (agent !== undefined) await new Promise<void>((resolve) => agent!.close(() => resolve()));
    monitor = undefined;
    agent = undefined;
  });

  function call(port: number, path: string) {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, method: 'POST', path, headers: { host: `127.0.0.1:${port}` } }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  it('answers 409 to kill, and 202, 409 or 404 to isolate and restore', async () => {
    const [a, b] = await Promise.all([fakeWhisper(), fakeWhisper()]);
    const pool = urlPool([a!.url, b!.url]);
    await pool.start();
    monitor = createMonitor(pool, { readMemory: async () => new Map() });
    const port = await freePort();
    // the agent checks the Host header against its configured port, so it needs the real one up front
    agent = createAgent({ ...agentConfigFromEnv({}), port }, { info: () => ({}), transcribe: (body) => pool.transcribe(body) }, monitor.routes);
    await new Promise<void>((resolve) => agent!.listen(port, '127.0.0.1', resolve));

    const kill = await call(port, '/lb/workers/w1/kill');
    expect(kill.status).toBe(409);
    expect(JSON.parse(kill.body).error).toMatch(/aislar/);
    expect((await call(port, '/lb/workers/w2/isolate')).status).toBe(202);
    expect((await call(port, '/lb/workers/w2/isolate')).status).toBe(409);
    expect(monitor.snapshot().workers[1]!.state).toBe('isolated');
    expect((await call(port, '/lb/workers/w1/restore')).status).toBe(409);
    expect((await call(port, '/lb/workers/w7/isolate')).status).toBe(404);
    expect((await call(port, '/lb/workers/w2/restore')).status).toBe(202);
    await sleep(50);
    expect(monitor.snapshot().workers[1]!.state).toBe('up');
  });
});

describe('WHISPER_URLS and intervals', () => {
  it('accepts http on loopback and https anywhere, as origins', () => {
    expect(parseWorkerUrls(' http://127.0.0.1:18101 ,http://localhost:18102/, https://whisper.example.com')).toEqual([
      'http://127.0.0.1:18101',
      'http://localhost:18102',
      'https://whisper.example.com',
    ]);
  });

  it.each([
    ['', /vacía/],
    ['http://whisper.example.com', /https/],
    ['ftp://127.0.0.1:1', /http/],
    ['https://user:secret@whisper.example.com', /usuario/],
    ['http://127.0.0.1:18101/inference', /solo esquema/],
    ['http://127.0.0.1:18101,http://127.0.0.1:18101/', /repetida/],
    ['not a url', /válida/],
  ])('refuses %j', (value, message) => {
    expect(() => parseWorkerUrls(value)).toThrow(message);
  });

  it('treats localhost, 127.0.0.0/8 and ::1 as loopback, and floors every other URL at 15 s', () => {
    expect(['http://localhost:1', 'http://127.0.0.1:1', 'http://127.4.5.6:1', 'http://[::1]:1'].every(isLoopback)).toBe(true);
    expect(isLoopback('https://whisper.example.com')).toBe(false);
    expect(isLoopback('https://127.0.0.1.example.com')).toBe(false);
    expect(intervalFor('http://127.0.0.1:1', 1000)).toBe(1000);
    expect(intervalFor('https://whisper.example.com', 1000)).toBe(15_000);
    expect(intervalFor('https://whisper.example.com', 30_000)).toBe(30_000);
  });

  it('gives up connecting at its deadline', async () => {
    let probes = 0;
    const started = Date.now();
    await expect(
      connectUrlWorker('http://127.0.0.1:1', {
        probe: async () => (probes++, false),
        readyTimeoutMs: 100,
        intervalMs: 20,
      }),
    ).rejects.toThrow(/no respondió/);
    expect(Date.now() - started).toBeLessThan(500);
    expect(probes).toBeGreaterThan(1);
  });
});
