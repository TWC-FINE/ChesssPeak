// Load generator: sends the same WAV to the agent in steps of rising concurrency and measures each step.
// The CLI is scripts/load.ts; this module has no side effects so it can be tested against a fake server.

export interface LoadOptions {
  url: string;
  wav: Uint8Array;
  /** Concurrency of each step, e.g. [1, 2, 4, 8, 16]. */
  steps: number[];
  /** Requests sent in every step; a step never sends fewer than its concurrency, or it would not reach it. */
  requestsPerStep: number;
  /** Above this share of non-200 answers the step counts as the breaking point and the run stops. */
  maxErrorRate: number;
  /** Client-side limit per request, so a hung agent cannot hang the run. */
  requestTimeoutMs: number;
  /** Requests sent (and discarded) before the first step, so model warm-up does not count. */
  warmup: number;
  /** Called between steps until the agent has drained (queue empty, nothing in flight). */
  waitIdle?: () => Promise<void>;
  onStep?: (step: StepResult) => void;
}

/** 'error' is a request that got no HTTP answer at all (refused, reset, client timeout). */
export type ResultKind = '200' | '503' | '504' | 'other' | 'error';

export interface RequestResult {
  kind: ResultKind;
  status: number | null;
  ms: number;
  worker: string | null;
}

export interface StepResult {
  concurrency: number;
  requests: number;
  durationMs: number;
  /** Answered requests (any status) per second of wall time. */
  rps: number;
  /** Successful (200) requests per second: the throughput that matters. */
  okRps: number;
  counts: Record<ResultKind, number>;
  errorRate: number;
  /** Latency percentiles of the 200 answers (fast 503 rejections would make them look better than they are). */
  latencyMs: { p50: number | null; p95: number | null; max: number | null; mean: number | null };
  /** Latency of every answer, whatever its status. */
  allLatencyMs: { p50: number | null; p95: number | null };
  /** 200 answers per worker, from the X-Worker header. */
  workers: Record<string, number>;
  broken: boolean;
}

export interface LoadReport {
  steps: StepResult[];
  /** Concurrency of the first step over the error threshold; null if the agent held every step. */
  breakingPoint: number | null;
  /** Highest concurrency that stayed under the threshold; null if even the first step broke. */
  maxStableConcurrency: number | null;
}

/** Nearest-rank percentile, the same definition as packages/voice-parser/src/stats.ts so figures compare. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

export function kindOf(status: number | null): ResultKind {
  if (status === null) return 'error';
  if (status === 200) return '200';
  if (status === 503) return '503';
  if (status === 504) return '504';
  return 'other';
}

export function summarize(concurrency: number, results: RequestResult[], durationMs: number, maxErrorRate: number): StepResult {
  const counts: Record<ResultKind, number> = { '200': 0, '503': 0, '504': 0, other: 0, error: 0 };
  const workers: Record<string, number> = {};
  for (const result of results) {
    counts[result.kind]++;
    if (result.kind === '200' && result.worker !== null) workers[result.worker] = (workers[result.worker] ?? 0) + 1;
  }
  const ok = results.filter((result) => result.kind === '200').map((result) => result.ms);
  const answered = results.filter((result) => result.kind !== 'error').length;
  const seconds = durationMs / 1000;
  const errorRate = results.length === 0 ? 0 : (results.length - counts['200']) / results.length;
  const round = (value: number | null): number | null => (value === null ? null : Math.round(value));
  return {
    concurrency,
    requests: results.length,
    durationMs: Math.round(durationMs),
    rps: seconds > 0 ? Math.round((answered / seconds) * 100) / 100 : 0,
    okRps: seconds > 0 ? Math.round((counts['200'] / seconds) * 100) / 100 : 0,
    counts,
    errorRate: Math.round(errorRate * 10_000) / 10_000,
    latencyMs: {
      p50: round(percentile(ok, 50)),
      p95: round(percentile(ok, 95)),
      max: ok.length === 0 ? null : Math.round(Math.max(...ok)),
      mean: ok.length === 0 ? null : Math.round(ok.reduce((sum, ms) => sum + ms, 0) / ok.length),
    },
    allLatencyMs: {
      p50: round(percentile(results.map((r) => r.ms), 50)),
      p95: round(percentile(results.map((r) => r.ms), 95)),
    },
    workers,
    broken: errorRate > maxErrorRate,
  };
}

export async function sendOne(url: string, wav: Uint8Array, timeoutMs: number): Promise<RequestResult> {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: wav as Uint8Array<ArrayBuffer>,
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.arrayBuffer();
    return { kind: kindOf(response.status), status: response.status, ms: performance.now() - started, worker: response.headers.get('x-worker') };
  } catch {
    return { kind: 'error', status: null, ms: performance.now() - started, worker: null };
  }
}

/** Sends `total` requests keeping exactly `concurrency` of them in flight until the last one. */
export async function runStep(options: Pick<LoadOptions, 'url' | 'wav' | 'requestTimeoutMs'>, concurrency: number, total: number): Promise<{ results: RequestResult[]; durationMs: number }> {
  const results: RequestResult[] = [];
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < total) {
      next++;
      results.push(await sendOne(options.url, options.wav, options.requestTimeoutMs));
    }
  };
  const started = performance.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, lane));
  return { results, durationMs: performance.now() - started };
}

export async function runLoad(options: LoadOptions): Promise<LoadReport> {
  if (options.warmup > 0) {
    await runStep(options, options.warmup, options.warmup);
    await options.waitIdle?.();
  }
  const steps: StepResult[] = [];
  for (const concurrency of options.steps) {
    const { results, durationMs } = await runStep(options, concurrency, Math.max(options.requestsPerStep, concurrency));
    const step = summarize(concurrency, results, durationMs, options.maxErrorRate);
    steps.push(step);
    options.onStep?.(step);
    if (step.broken) break;
    // a 504 leaves its worker busy until Whisper finishes: let the agent drain so steps do not overlap
    await options.waitIdle?.();
  }
  const broken = steps.find((step) => step.broken);
  const stable = steps.filter((step) => !step.broken);
  return {
    steps,
    breakingPoint: broken?.concurrency ?? null,
    maxStableConcurrency: stable.length === 0 ? null : stable[stable.length - 1]!.concurrency,
  };
}
