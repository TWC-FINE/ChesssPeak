import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { kindOf, percentile, runLoad, runStep, summarize, type RequestResult } from '../src/load.js';

const wav = new Uint8Array(64);

/** A fake agent: answers 200 after `delayMs` while at most `capacity` requests are in flight, 503 beyond that. */
async function fakeAgent(capacity: number, delayMs = 20) {
  let inFlight = 0;
  let peak = 0;
  const server: Server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      if (inFlight >= capacity) {
        res.writeHead(503, { 'retry-after': '1' });
        res.end('{}');
        return;
      }
      inFlight++;
      peak = Math.max(peak, inFlight);
      setTimeout(() => {
        inFlight--;
        res.writeHead(200, { 'x-worker': `w${(peak % 2) + 1}` });
        res.end('{"text":"e cuatro"}');
      }, delayMs);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  servers.push(server);
  return { url: `http://127.0.0.1:${port}/transcribe`, peak: () => peak };
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

const ok = (ms: number, worker = 'w1'): RequestResult => ({ kind: '200', status: 200, ms, worker });

describe('load generator', () => {
  it('uses the nearest-rank percentile of the spike metrics', () => {
    expect(percentile([900, 1000, 1100, 1200, 1300, 1500, 2000], 50)).toBe(1200);
    expect(percentile([900, 1000, 1100, 1200, 1300, 1500, 2000], 95)).toBe(2000);
    expect(percentile([], 50)).toBeNull();
  });

  it('classifies answers by status', () => {
    expect([200, 503, 504, 502, null].map((status) => kindOf(status))).toEqual(['200', '503', '504', 'other', 'error']);
  });

  it('summarizes a step: rps, percentiles of the 200s, counts, error rate and share per worker', () => {
    const results: RequestResult[] = [ok(100), ok(200, 'w2'), ok(300), { kind: '503', status: 503, ms: 2, worker: null }];
    const step = summarize(4, results, 2000, 0.05);
    expect(step).toMatchObject({
      concurrency: 4,
      requests: 4,
      rps: 2,
      okRps: 1.5,
      counts: { '200': 3, '503': 1, '504': 0, other: 0, error: 0 },
      errorRate: 0.25,
      latencyMs: { p50: 200, p95: 300, max: 300, mean: 200 },
      workers: { w1: 2, w2: 1 },
      broken: true,
    });
    expect(summarize(1, [ok(100)], 100, 0.05).broken).toBe(false);
  });

  it('keeps exactly the step concurrency in flight', async () => {
    const agent = await fakeAgent(100);
    const { results } = await runStep({ url: agent.url, wav, requestTimeoutMs: 5000 }, 4, 12);
    expect(results).toHaveLength(12);
    expect(agent.peak()).toBe(4);
  });

  it('stops at the first step over the error threshold and reports the breaking point', async () => {
    const agent = await fakeAgent(3);
    const seen: number[] = [];
    let idleWaits = 0;
    const report = await runLoad({
      url: agent.url,
      wav,
      steps: [1, 2, 4, 8, 16],
      requestsPerStep: 8,
      maxErrorRate: 0.05,
      requestTimeoutMs: 5000,
      warmup: 1,
      waitIdle: async () => {
        idleWaits++;
      },
      onStep: (step) => seen.push(step.concurrency),
    });
    expect(seen).toEqual([1, 2, 4]);
    expect(report.breakingPoint).toBe(4);
    expect(report.maxStableConcurrency).toBe(2);
    expect(report.steps[2]!.counts['503']).toBeGreaterThan(0);
    // after the warm-up and after each step that held
    expect(idleWaits).toBe(3);
  });

  it('sends at least as many requests as the concurrency, so the step really reaches it', async () => {
    const agent = await fakeAgent(100);
    const report = await runLoad({ url: agent.url, wav, steps: [6], requestsPerStep: 2, maxErrorRate: 0.05, requestTimeoutMs: 5000, warmup: 0 });
    expect(report.steps[0]!.requests).toBe(6);
    expect(agent.peak()).toBe(6);
  });

  it('counts a request with no HTTP answer as an error', async () => {
    const step = await runStep({ url: 'http://127.0.0.1:9/transcribe', wav, requestTimeoutMs: 2000 }, 1, 1);
    expect(step.results[0]).toMatchObject({ kind: 'error', status: null });
  });
});
