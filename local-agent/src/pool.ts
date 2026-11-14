import { constants } from 'node:os';
import type { BalancingStrategy } from './strategies.js';
import { intervalFor, portOf } from './url-worker.js';

/** A running worker process, as the pool sees it. */
export interface WorkerHandle {
  readonly url: string;
  readonly pid: number | undefined;
  /** Resolves when the process is gone. */
  readonly exited: Promise<void>;
  stop(): Promise<void>;
  /** Synchronous best effort, for the 'exit' event. */
  killNow(): void;
}

export interface Transcription {
  text: string;
  ms: number;
}

export interface PoolOptions {
  /** Process mode: how many workers. In URL mode the number of URLs decides it. */
  size: number;
  /** Process mode: the first worker's port; the others follow it. */
  basePort?: number;
  strategy: BalancingStrategy;
  /** Process mode: starts a worker on a port and resolves once it is ready. */
  launch?(port: number): Promise<WorkerHandle>;
  /** URL mode: one worker per URL, already running elsewhere (url-worker.ts). Replaces basePort and launch. */
  urls?: readonly string[];
  /** URL mode: resolves once the URL answers its health check. */
  connect?(url: string): Promise<WorkerHandle>;
  /** URL mode: consecutive failed connections before the pool stops trying; restoring the worker starts again. */
  reconnectMax?: number;
  probe(url: string): Promise<boolean>;
  send(url: string, wav: Uint8Array): Promise<Transcription>;
  /** Requests in flight per worker; whisper-server runs one inference at a time. */
  workerConcurrency?: number;
  /** Requests waiting for a free worker before the pool answers 503. */
  queueMax?: number;
  /** From arrival to answer; past it the pool answers 504. */
  timeoutMs?: number;
  /** In URL mode, raised to 15 s for URLs that leave the machine. */
  healthIntervalMs?: number;
  /** Consecutive failed probes before a worker is marked down. */
  failuresToDown?: number;
  /** In URL mode, raised to 15 s for URLs that leave the machine. */
  backoffInitialMs?: number;
  backoffMaxMs?: number;
}

/** isolated: out of rotation on purpose (failure demo); not probed, not restarted, its requests in flight finish. */
export type WorkerState = 'starting' | 'up' | 'down' | 'isolated';

export interface WorkerStats {
  id: string;
  port: number;
  /** The worker's base URL; null in process mode while no process is up. */
  url: string | null;
  pid: number | undefined;
  state: WorkerState;
  active: number;
  served: number;
  failed: number;
  restarts: number;
  /** Seconds since the current process came up; null while it is not up. */
  uptimeSeconds: number | null;
  /** Time left before the next restart attempt; null when none is scheduled. */
  nextRestartInMs: number | null;
  probeIntervalMs: number;
  /** Median round trip of its last answered requests; null before the first one. */
  latencyMs: number | null;
}

/** How the gateway answered: 200, 503 (no worker or queue full), 504 (timeout) or 502 (worker error). */
export type Outcome = 200 | 502 | 503 | 504;

export interface RecentRequest {
  at: number;
  worker: string | null;
  status: Outcome;
  ms: number;
}

export interface PoolStats {
  /** process: the pool starts and owns whisper-server processes (ADR 10). url: it connects to WHISPER_URLS. */
  mode: 'process' | 'url';
  strategy: string;
  workerConcurrency: number;
  queued: number;
  queueMax: number;
  timeoutMs: number;
  /** URL mode: reconnections per round; restoring a worker gives it a new round. Null in process mode (no limit). */
  reconnectMax: number | null;
  totals: Record<Outcome, number>;
  /** Newest first. */
  recent: RecentRequest[];
  workers: WorkerStats[];
}

const RECENT_MAX = 30;
const LATENCY_SAMPLES = 10;

export class PoolError extends Error {
  constructor(
    readonly status: 503 | 504,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

interface Worker {
  readonly id: string;
  readonly port: number;
  /** URL mode only: the configured URL. */
  readonly target: string | undefined;
  readonly probeIntervalMs: number;
  readonly backoffInitialMs: number;
  state: WorkerState;
  handle: WorkerHandle | undefined;
  active: number;
  served: number;
  failed: number;
  restarts: number;
  healthFailures: number;
  connectFailures: number;
  /** URL mode: reconnectMax failures in a row; it waits for a restore. */
  gaveUp: boolean;
  probing: boolean;
  lastProbeAt: number;
  upSince: number;
  restartDelayMs: number;
  restartTimer: NodeJS.Timeout | undefined;
  restartAt: number | undefined;
  latencies: number[];
}

interface Job {
  readonly wav: Uint8Array;
  readonly arrivedAt: number;
  /** The worker it was last sent to, so a 504 on an in-flight request is attributed to it. */
  worker: string | null;
  retried: boolean;
  settled: boolean;
  timer: NodeJS.Timeout | undefined;
  resolve(result: Transcription & { worker: string }): void;
  reject(error: Error): void;
}

const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'].filter((signal) => signal in constants.signals);

export class WorkerPool {
  private readonly workers: Worker[];
  private readonly queue: Job[] = [];
  private readonly mode: 'process' | 'url';
  private readonly concurrency: number;
  private readonly queueMax: number;
  private readonly timeoutMs: number;
  private readonly healthIntervalMs: number;
  private readonly failuresToDown: number;
  private readonly backoffMaxMs: number;
  private readonly reconnectMax: number;
  private healthTimer: NodeJS.Timeout | undefined;
  private stopping = false;
  private readonly totals: Record<Outcome, number> = { 200: 0, 502: 0, 503: 0, 504: 0 };
  private readonly recent: RecentRequest[] = [];

  constructor(private readonly options: PoolOptions) {
    this.mode = options.urls === undefined ? 'process' : 'url';
    if (this.mode === 'url') {
      if (options.urls!.length === 0) throw new Error('WHISPER_URLS está vacía');
      if (options.connect === undefined) throw new Error('El modo URLs necesita connect');
    } else {
      if (!Number.isInteger(options.size) || options.size < 1) throw new Error('LB_WORKERS debe ser un entero ≥ 1');
      if (options.launch === undefined || options.basePort === undefined) throw new Error('El modo procesos necesita basePort y launch');
    }
    const size = options.urls?.length ?? options.size;
    this.concurrency = options.workerConcurrency ?? 1;
    this.queueMax = options.queueMax ?? size * 4;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.healthIntervalMs = options.healthIntervalMs ?? 1000;
    this.failuresToDown = options.failuresToDown ?? 3;
    this.backoffMaxMs = options.backoffMaxMs ?? 30_000;
    this.reconnectMax = this.mode === 'url' ? (options.reconnectMax ?? 10) : Infinity;
    const backoffInitialMs = options.backoffInitialMs ?? 1000;
    this.workers = Array.from({ length: size }, (_, i) => {
      const target = options.urls?.[i];
      return {
        id: `w${i + 1}`,
        port: target === undefined ? options.basePort! + i : portOf(target),
        target,
        // the 15 s floor applies to the URLs we were given; process mode only ever talks to its own children
        probeIntervalMs: target === undefined ? this.healthIntervalMs : intervalFor(target, this.healthIntervalMs),
        backoffInitialMs: target === undefined ? backoffInitialMs : Math.min(intervalFor(target, backoffInitialMs), this.backoffMaxMs),
        state: 'down' as WorkerState,
        handle: undefined,
        active: 0,
        served: 0,
        failed: 0,
        restarts: 0,
        healthFailures: 0,
        connectFailures: 0,
        gaveUp: false,
        probing: false,
        lastProbeAt: 0,
        upSince: 0,
        restartDelayMs: 0,
        restartTimer: undefined,
        restartAt: undefined,
        latencies: [],
      };
    });
    for (const worker of this.workers) worker.restartDelayMs = worker.backoffInitialMs;
  }

  get strategyName(): string {
    return this.options.strategy.name;
  }

  /** Launches every worker; fails only if none of them comes up (the others keep retrying). */
  async start(): Promise<void> {
    const errors = await Promise.all(this.workers.map((worker) => this.launch(worker)));
    if (this.workers.every((worker) => worker.state !== 'up')) {
      await this.stop();
      throw new Error(`Ningún worker arrancó: ${errors.filter(Boolean).join(' · ')}`);
    }
    this.healthTimer = setInterval(() => this.checkHealth(), this.healthIntervalMs);
  }

  /**
   * Kills every worker when the agent stops: graceful on signals, synchronous on 'exit'.
   * A hard kill of the agent runs none of this; the guard of each worker covers that case (guard.ts).
   */
  installShutdownHooks(beforeExit: () => void = () => undefined): void {
    process.once('exit', () => this.killAllNow());
    for (const signal of SHUTDOWN_SIGNALS) {
      process.once(signal, () => {
        beforeExit();
        void this.stop().finally(() => process.exit(0));
      });
    }
  }

  transcribe(wav: Uint8Array): Promise<Transcription & { worker: string }> {
    const refuse = (message: string, retryAfter?: number): Promise<never> => {
      this.record(503, null, 0);
      return Promise.reject(new PoolError(503, message, retryAfter));
    };
    if (this.stopping) return refuse('El agente se está deteniendo');
    if (!this.workers.some((worker) => worker.state === 'up')) return refuse('No hay ningún worker disponible', this.retryAfterSeconds());
    // the limit is on requests that would have to wait: with a free worker nothing waits
    if (this.queue.length >= this.queueMax && this.freeWorkers().length === 0) return refuse('Cola llena', this.retryAfterSeconds());
    return new Promise((resolve, reject) => {
      const job: Job = { wav, arrivedAt: Date.now(), worker: null, retried: false, settled: false, timer: undefined, resolve, reject };
      job.timer = setTimeout(() => {
        const queued = this.queue.indexOf(job);
        if (queued !== -1) this.queue.splice(queued, 1);
        this.settle(job, new PoolError(504, `Sin respuesta en ${this.timeoutMs / 1000} s`));
      }, this.timeoutMs);
      this.queue.push(job);
      this.drain();
    });
  }

  stats(): PoolStats {
    const now = Date.now();
    return {
      mode: this.mode,
      strategy: this.options.strategy.name,
      workerConcurrency: this.concurrency,
      queued: this.queue.length,
      queueMax: this.queueMax,
      timeoutMs: this.timeoutMs,
      reconnectMax: Number.isFinite(this.reconnectMax) ? this.reconnectMax : null,
      totals: { ...this.totals },
      recent: [...this.recent],
      workers: this.workers.map((worker) => ({
        id: worker.id,
        port: worker.port,
        url: worker.target ?? worker.handle?.url ?? null,
        pid: worker.handle?.pid,
        state: worker.state,
        active: worker.active,
        served: worker.served,
        failed: worker.failed,
        restarts: worker.restarts,
        uptimeSeconds: worker.state === 'up' ? Math.round((now - worker.upSince) / 1000) : null,
        nextRestartInMs: worker.restartAt === undefined ? null : Math.max(0, worker.restartAt - now),
        probeIntervalMs: worker.probeIntervalMs,
        latencyMs: median(worker.latencies),
      })),
    };
  }

  /**
   * Kills a worker's process at once, as a crash would (for the failure demo): the pool notices the exit,
   * takes it out of rotation and restarts it with the usual backoff. URL mode has no process: use isolate.
   */
  killWorker(id: string): { pid: number | undefined } | 'unknown' | 'not-up' | 'unsupported' {
    const worker = this.workers.find((candidate) => candidate.id === id);
    if (worker === undefined) return 'unknown';
    if (this.mode === 'url') return 'unsupported';
    if (worker.state !== 'up' || worker.handle === undefined) return 'not-up';
    const { pid } = worker.handle;
    worker.handle.killNow();
    return { pid };
  }

  /** Takes a worker out of rotation on purpose. Requests already on it finish; nothing probes or restarts it. */
  isolateWorker(id: string): 'isolated' | 'unknown' | 'already' {
    const worker = this.workers.find((candidate) => candidate.id === id);
    if (worker === undefined) return 'unknown';
    if (worker.state === 'isolated') return 'already';
    worker.state = 'isolated';
    clearTimeout(worker.restartTimer);
    worker.restartTimer = undefined;
    worker.restartAt = undefined;
    return 'isolated';
  }

  /**
   * Puts back an isolated worker, or one that ran out of reconnections: one health check, then into rotation,
   * or down with the usual backoff.
   */
  restoreWorker(id: string): 'restored' | 'unknown' | 'not-isolated' {
    const worker = this.workers.find((candidate) => candidate.id === id);
    if (worker === undefined) return 'unknown';
    if (worker.state !== 'isolated' && !worker.gaveUp) return 'not-isolated';
    worker.gaveUp = false;
    worker.restartDelayMs = worker.backoffInitialMs;
    worker.connectFailures = 0;
    worker.healthFailures = 0;
    const handle = worker.handle;
    if (handle === undefined) {
      void this.launch(worker);
      return 'restored';
    }
    worker.state = 'starting';
    void this.options.probe(handle.url).then((ok) => {
      // isolated again, or replaced, while the check was running
      if (worker.state !== 'starting' || worker.handle !== handle) return;
      if (!ok) return this.markDown(worker);
      worker.state = 'up';
      worker.upSince = Date.now();
      this.drain();
    });
    return 'restored';
  }

  async stop(): Promise<void> {
    this.stopping = true;
    clearInterval(this.healthTimer);
    for (const worker of this.workers) clearTimeout(worker.restartTimer);
    for (const job of this.queue.splice(0)) this.settle(job, new PoolError(503, 'El agente se está deteniendo'));
    await Promise.all(this.workers.map((worker) => worker.handle?.stop()));
  }

  killAllNow(): void {
    for (const worker of this.workers) worker.handle?.killNow();
  }

  private async launch(worker: Worker): Promise<string | undefined> {
    worker.state = 'starting';
    try {
      const handle = worker.target === undefined ? await this.options.launch!(worker.port) : await this.options.connect!(worker.target);
      if (this.stopping) {
        await handle.stop();
        return undefined;
      }
      worker.handle = handle;
      worker.connectFailures = 0;
      void handle.exited.then(() => {
        // only the current process of this worker counts; an old one we replaced is ignored
        if (worker.handle !== handle) return;
        worker.handle = undefined;
        this.markDown(worker);
      });
      // isolated while it was starting: it stays out until restored
      if ((worker.state as WorkerState) === 'isolated') return undefined;
      worker.state = 'up';
      worker.healthFailures = 0;
      worker.upSince = Date.now();
      this.drain();
      return undefined;
    } catch (error) {
      const message = `${worker.id}: ${(error as Error).message}`;
      if ((worker.state as WorkerState) === 'isolated') return message;
      worker.state = 'down';
      worker.connectFailures++;
      // URL mode never retries without limit: after reconnectMax failures it waits for a restore
      if (worker.connectFailures < this.reconnectMax) this.scheduleRestart(worker);
      else worker.gaveUp = true;
      return message;
    }
  }

  /** Takes the worker out of rotation, makes sure its process is gone and schedules a restart. */
  private markDown(worker: Worker): void {
    if (worker.state === 'down') return;
    const handle = worker.handle;
    worker.handle = undefined;
    // an isolated worker stays isolated; restoring it reconnects, since its handle is gone
    if (worker.state === 'isolated') {
      void handle?.stop();
      return;
    }
    worker.state = 'down';
    void (handle?.stop() ?? Promise.resolve()).then(() => this.scheduleRestart(worker));
  }

  private scheduleRestart(worker: Worker): void {
    if (this.stopping) return;
    const delay = worker.restartDelayMs;
    worker.restartDelayMs = Math.min(delay * 2, this.backoffMaxMs);
    worker.restartAt = Date.now() + delay;
    worker.restartTimer = setTimeout(() => {
      worker.restartAt = undefined;
      if (worker.state === 'isolated') return;
      worker.restarts++;
      void this.launch(worker);
    }, delay);
  }

  private checkHealth(): void {
    const now = Date.now();
    for (const worker of this.workers) {
      if (worker.state !== 'up' || worker.probing) continue;
      // only URLs that leave the machine probe less often than the timer ticks
      if (worker.probeIntervalMs > this.healthIntervalMs && now - worker.lastProbeAt < worker.probeIntervalMs) continue;
      // a worker that stayed up for a while starts its backoff again from the beginning
      if (now - worker.upSince > this.backoffMaxMs) worker.restartDelayMs = worker.backoffInitialMs;
      worker.probing = true;
      worker.lastProbeAt = now;
      const handle = worker.handle!;
      void this.options.probe(handle.url).then((ok) => {
        worker.probing = false;
        if (worker.state !== 'up' || worker.handle !== handle) return;
        worker.healthFailures = ok ? 0 : worker.healthFailures + 1;
        if (worker.healthFailures >= this.failuresToDown) this.markDown(worker);
      });
    }
  }

  private drain(): void {
    while (this.queue.length > 0) {
      const worker = this.options.strategy.pick(this.freeWorkers());
      if (worker === undefined) return;
      this.run(worker, this.queue.shift()!);
    }
  }

  private freeWorkers(): Worker[] {
    return this.workers.filter((worker) => worker.state === 'up' && worker.active < this.concurrency);
  }

  private run(worker: Worker, job: Job): void {
    const url = worker.handle!.url;
    job.worker = worker.id;
    worker.active++;
    this.options
      .send(url, job.wav)
      .then(
        (result) => {
          worker.served++;
          worker.latencies.push(result.ms);
          if (worker.latencies.length > LATENCY_SAMPLES) worker.latencies.shift();
          this.settle(job, { ...result, worker: worker.id });
        },
        (error: unknown) => {
          worker.failed++;
          // fetch rejects with TypeError when it cannot reach the worker: take it out and retry once elsewhere
          if (error instanceof TypeError) {
            this.markDown(worker);
            if (!job.retried && !job.settled) {
              job.retried = true;
              this.queue.unshift(job);
              return;
            }
          }
          this.settle(job, error as Error);
        },
      )
      .finally(() => {
        // the slot is freed when the worker really finishes, even if the client already got a 504
        worker.active--;
        this.drain();
      });
  }

  private settle(job: Job, outcome: (Transcription & { worker: string }) | Error): void {
    if (job.settled) return;
    job.settled = true;
    clearTimeout(job.timer);
    const status: Outcome = outcome instanceof PoolError ? outcome.status : outcome instanceof Error ? 502 : 200;
    this.record(status, job.worker, Date.now() - job.arrivedAt);
    if (outcome instanceof Error) job.reject(outcome);
    else job.resolve(outcome);
  }

  private record(status: Outcome, worker: string | null, ms: number): void {
    this.totals[status]++;
    this.recent.unshift({ at: Date.now(), worker, status, ms });
    if (this.recent.length > RECENT_MAX) this.recent.pop();
  }

  private retryAfterSeconds(): number {
    return Math.max(1, Math.ceil(this.timeoutMs / 1000 / 3));
  }
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2);
}
