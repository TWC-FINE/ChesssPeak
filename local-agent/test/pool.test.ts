import { afterEach, describe, expect, it } from 'vitest';
import { PoolError, WorkerPool, type PoolOptions, type Transcription, type WorkerHandle } from '../src/pool.js';
import { LeastConnections } from '../src/strategies.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface FakeHandle extends WorkerHandle {
  crash(): void;
  stopped: boolean;
}

function fakeHandle(port: number): FakeHandle {
  let exit!: () => void;
  const exited = new Promise<void>((resolve) => (exit = resolve));
  const handle: FakeHandle = {
    url: `http://fake:${port}`,
    pid: port,
    exited,
    stopped: false,
    stop: async () => {
      handle.stopped = true;
      exit();
    },
    killNow: () => exit(),
    crash: () => exit(),
  };
  return handle;
}

let pools: WorkerPool[] = [];
afterEach(async () => {
  await Promise.all(pools.map((pool) => pool.stop()));
  pools = [];
});

function makePool(overrides: Partial<PoolOptions> & { delayMs?: number } = {}) {
  const handles = new Map<number, FakeHandle>();
  const { delayMs = 30, ...rest } = overrides;
  const pool = new WorkerPool({
    size: 3,
    basePort: 9001,
    strategy: new LeastConnections(),
    launch: async (port) => {
      const handle = fakeHandle(port);
      handles.set(port, handle);
      return handle;
    },
    probe: async () => true,
    send: async (): Promise<Transcription> => {
      await sleep(delayMs);
      return { text: 'e cuatro', ms: delayMs };
    },
    healthIntervalMs: 10,
    backoffInitialMs: 20,
    ...rest,
  });
  pools.push(pool);
  return { pool, handles };
}

const wav = new Uint8Array(4);
const state = (pool: WorkerPool, id: string) => pool.stats().workers.find((w) => w.id === id)!;

describe('WorkerPool', () => {
  it('starts one worker per port and spreads concurrent requests over them', async () => {
    const { pool } = makePool();
    await pool.start();
    expect(pool.stats().workers.map((w) => [w.id, w.port, w.state])).toEqual([
      ['w1', 9001, 'up'],
      ['w2', 9002, 'up'],
      ['w3', 9003, 'up'],
    ]);
    const results = await Promise.all([pool.transcribe(wav), pool.transcribe(wav), pool.transcribe(wav)]);
    expect(new Set(results.map((r) => r.worker))).toEqual(new Set(['w1', 'w2', 'w3']));
  });

  it('queues requests while every worker is busy and answers 503 when the queue is full', async () => {
    const { pool } = makePool({ size: 1, queueMax: 1, delayMs: 100 });
    await pool.start();
    const inFlight = pool.transcribe(wav);
    const queued = pool.transcribe(wav);
    const rejected = await pool.transcribe(wav).catch((error: unknown) => error);
    expect(rejected).toBeInstanceOf(PoolError);
    expect(rejected).toMatchObject({ status: 503 });
    expect((rejected as PoolError).retryAfterSeconds).toBeGreaterThan(0);
    await expect(Promise.all([inFlight, queued])).resolves.toHaveLength(2);
  });

  it('answers 504 past the timeout, but keeps the worker busy until it really finishes', async () => {
    const { pool } = makePool({ size: 1, timeoutMs: 40, delayMs: 150 });
    await pool.start();
    await expect(pool.transcribe(wav)).rejects.toMatchObject({ status: 504 });
    expect(state(pool, 'w1').active).toBe(1);
    await sleep(150);
    expect(state(pool, 'w1').active).toBe(0);
  });

  it('takes a crashed worker out of rotation and restarts it after a backoff', async () => {
    const { pool, handles } = makePool({ size: 2, backoffInitialMs: 150 });
    await pool.start();
    handles.get(9001)!.crash();
    await sleep(0);
    expect(state(pool, 'w1').state).toBe('down');
    const results = await Promise.all([pool.transcribe(wav), pool.transcribe(wav)]);
    expect(results.every((r) => r.worker === 'w2')).toBe(true);
    await sleep(150);
    expect(state(pool, 'w1')).toMatchObject({ state: 'up', restarts: 1 });
  });

  it('marks a worker down after consecutive failed health checks and replaces its process', async () => {
    let healthy = true;
    const { pool, handles } = makePool({ size: 1, failuresToDown: 2, probe: async () => healthy });
    await pool.start();
    const first = handles.get(9001)!;
    healthy = false;
    await sleep(40);
    expect(first.stopped).toBe(true);
    healthy = true;
    await sleep(80);
    expect(state(pool, 'w1').state).toBe('up');
    expect(handles.get(9001)).not.toBe(first);
  });

  it('retries once on another worker when one cannot be reached', async () => {
    const { pool } = makePool({
      size: 2,
      send: async (url) => {
        if (url.endsWith(':9001')) throw new TypeError('fetch failed');
        return { text: 'e cuatro', ms: 1 };
      },
    });
    await pool.start();
    const results = await Promise.all([pool.transcribe(wav), pool.transcribe(wav)]);
    expect(results.every((r) => r.worker === 'w2')).toBe(true);
    expect(state(pool, 'w1').state).not.toBe('up');
  });

  it('answers 503 right away when no worker is up', async () => {
    const { pool, handles } = makePool({ size: 1, backoffInitialMs: 10_000 });
    await pool.start();
    handles.get(9001)!.crash();
    await sleep(0);
    await expect(pool.transcribe(wav)).rejects.toMatchObject({ status: 503 });
  });

  it('kills a worker on demand, then restarts it like any crash', async () => {
    const { pool, handles } = makePool({ size: 2 });
    await pool.start();
    expect(pool.killWorker('w9')).toBe('unknown');
    expect(pool.killWorker('w1')).toEqual({ pid: 9001 });
    await sleep(0);
    expect(state(pool, 'w1')).toMatchObject({ state: 'down', uptimeSeconds: null });
    expect(state(pool, 'w1').nextRestartInMs).toBeGreaterThanOrEqual(0);
    expect(pool.killWorker('w1')).toBe('not-up');
    await sleep(60);
    expect(state(pool, 'w1')).toMatchObject({ state: 'up', restarts: 1, nextRestartInMs: null });
    expect(handles.get(9001)).toBeDefined();
  });

  it('counts every answer by status and keeps the latest requests', async () => {
    const { pool } = makePool({ size: 1, queueMax: 0, timeoutMs: 1000 });
    await pool.start();
    const ok = pool.transcribe(wav);
    await expect(pool.transcribe(wav)).rejects.toMatchObject({ status: 503 });
    await ok;
    const stats = pool.stats();
    expect(stats.totals).toEqual({ 200: 1, 502: 0, 503: 1, 504: 0 });
    expect(stats.recent.map((r) => [r.status, r.worker])).toEqual([
      [200, 'w1'],
      [503, null],
    ]);
  });

  it('fails to start if no worker comes up, and stops every process on stop()', async () => {
    const failing = makePool({ size: 2, launch: async () => Promise.reject(new Error('port busy')) });
    await expect(failing.pool.start()).rejects.toThrow(/port busy/);

    const { pool, handles } = makePool();
    await pool.start();
    await pool.stop();
    expect([...handles.values()].every((h) => h.stopped)).toBe(true);
    await expect(pool.transcribe(wav)).rejects.toMatchObject({ status: 503 });
  });
});
