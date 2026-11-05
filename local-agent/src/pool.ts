import { constants } from 'node:os';
import type { BalancingStrategy } from './strategies.js';

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
  size: number;
  basePort: number;
  strategy: BalancingStrategy;
  /** Starts a worker on a port and resolves once it is ready. */
  launch(port: number): Promise<WorkerHandle>;
  probe(url: string): Promise<boolean>;
  send(url: string, wav: Uint8Array): Promise<Transcription>;
  /** Requests in flight per worker; whisper-server runs one inference at a time. */
  workerConcurrency?: number;
  /** Requests waiting for a free worker before the pool answers 503. */
  queueMax?: number;
  /** From arrival to answer; past it the pool answers 504. */
  timeoutMs?: number;
  healthIntervalMs?: number;
  /** Consecutive failed probes before a worker is marked down. */
  failuresToDown?: number;
  backoffInitialMs?: number;
  backoffMaxMs?: number;
}

export type WorkerState = 'starting' | 'up' | 'down';

export interface WorkerStats {
  id: string;
  port: number;
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
  strategy: string;
  workerConcurrency: number;
  queued: number;
  queueMax: number;
  timeoutMs: number;
  totals: Record<Outcome, number>;
  /** Newest first. */
  recent: RecentRequest[];
  workers: WorkerStats[];
}

const RECENT_MAX = 30;

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
  state: WorkerState;
  handle: WorkerHandle | undefined;
  active: number;
  served: number;
  failed: number;
  restarts: number;
  healthFailures: number;
  probing: boolean;
  upSince: number;
  restartDelayMs: number;
  restartTimer: NodeJS.Timeout | undefined;
  restartAt: number | undefined;
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
  private readonly concurrency: number;
  private readonly queueMax: number;
  private readonly timeoutMs: number;
  private readonly failuresToDown: number;
  private readonly backoffInitialMs: number;
  private readonly backoffMaxMs: number;
  private healthTimer: NodeJS.Timeout | undefined;
  private stopping = false;
  private readonly totals: Record<Outcome, number> = { 200: 0, 502: 0, 503: 0, 504: 0 };
  private readonly recent: RecentRequest[] = [];

  constructor(private readonly options: PoolOptions) {
    if (!Number.isInteger(options.size) || options.size < 1) throw new Error('LB_WORKERS debe ser un entero ≥ 1');
    this.concurrency = options.workerConcurrency ?? 1;
    this.queueMax = options.queueMax ?? options.size * 4;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.failuresToDown = options.failuresToDown ?? 3;
    this.backoffInitialMs = options.backoffInitialMs ?? 1000;
    this.backoffMaxMs = options.backoffMaxMs ?? 30_000;
    this.workers = Array.from({ length: options.size }, (_, i) => ({
      id: `w${i + 1}`,
      port: options.basePort + i,
      state: 'down' as WorkerState,
      handle: undefined,
      active: 0,
      served: 0,
      failed: 0,
      restarts: 0,
      healthFailures: 0,
      probing: false,
      upSince: 0,
      restartDelayMs: this.backoffInitialMs,
      restartTimer: undefined,
      restartAt: undefined,
    }));
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
    this.healthTimer = setInterval(() => this.checkHealth(), this.options.healthIntervalMs ?? 1000);
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
      strategy: this.options.strategy.name,
      workerConcurrency: this.concurrency,
      queued: this.queue.length,
      queueMax: this.queueMax,
      timeoutMs: this.timeoutMs,
      totals: { ...this.totals },
      recent: [...this.recent],
      workers: this.workers.map((worker) => ({
        id: worker.id,
        port: worker.port,
        pid: worker.handle?.pid,
        state: worker.state,
        active: worker.active,
        served: worker.served,
        failed: worker.failed,
        restarts: worker.restarts,
        uptimeSeconds: worker.state === 'up' ? Math.round((now - worker.upSince) / 1000) : null,
        nextRestartInMs: worker.restartAt === undefined ? null : Math.max(0, worker.restartAt - now),
      })),
    };
  }

  /**
   * Kills a worker's process at once, as a crash would (for the failure demo): the pool notices the exit,
   * takes it out of rotation and restarts it with the usual backoff.
   */
  killWorker(id: string): { pid: number | undefined } | 'unknown' | 'not-up' {
    const worker = this.workers.find((candidate) => candidate.id === id);
    if (worker === undefined) return 'unknown';
    if (worker.state !== 'up' || worker.handle === undefined) return 'not-up';
    const { pid } = worker.handle;
    worker.handle.killNow();
    return { pid };
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
      const handle = await this.options.launch(worker.port);
      if (this.stopping) {
        await handle.stop();
        return undefined;
      }
      worker.handle = handle;
      worker.state = 'up';
      worker.healthFailures = 0;
      worker.upSince = Date.now();
      void handle.exited.then(() => {
        // only the current process of this worker counts; an old one we replaced is ignored
        if (worker.handle !== handle) return;
        worker.handle = undefined;
        this.markDown(worker);
      });
      this.drain();
      return undefined;
    } catch (error) {
      worker.state = 'down';
      this.scheduleRestart(worker);
      return `${worker.id}: ${(error as Error).message}`;
    }
  }

  /** Takes the worker out of rotation, makes sure its process is gone and schedules a restart. */
  private markDown(worker: Worker): void {
    if (worker.state === 'down') return;
    worker.state = 'down';
    const handle = worker.handle;
    worker.handle = undefined;
    void (handle?.stop() ?? Promise.resolve()).then(() => this.scheduleRestart(worker));
  }

  private scheduleRestart(worker: Worker): void {
    if (this.stopping) return;
    const delay = worker.restartDelayMs;
    worker.restartDelayMs = Math.min(delay * 2, this.backoffMaxMs);
    worker.restartAt = Date.now() + delay;
    worker.restartTimer = setTimeout(() => {
      worker.restartAt = undefined;
      worker.restarts++;
      void this.launch(worker);
    }, delay);
  }

  private checkHealth(): void {
    for (const worker of this.workers) {
      if (worker.state !== 'up' || worker.probing) continue;
      // a worker that stayed up for a while starts its backoff again from the beginning
      if (Date.now() - worker.upSince > this.backoffMaxMs) worker.restartDelayMs = this.backoffInitialMs;
      worker.probing = true;
      const url = worker.handle!.url;
      void this.options.probe(url).then((ok) => {
        worker.probing = false;
        if (worker.state !== 'up') return;
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
