import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkCriteria, evaluate, nbestVerdict } from '../src/metrics.js';
import { buildReport, fakeReason } from '../src/report.js';
import type { ResultsFile } from '../src/results.js';
import { percentile, wilson } from '../src/stats.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../test-fixtures/sample.fake.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as ResultsFile;

describe('stats', () => {
  it('computes nearest-rank percentiles', () => {
    expect(percentile([900, 1000, 1100, 1200, 1300, 1500, 2000], 50)).toBe(1200);
    expect(percentile([900, 1000, 1100, 1200, 1300, 1500, 2000], 95)).toBe(2000);
    expect(percentile([], 50)).toBeUndefined();
  });

  it('computes a Wilson interval', () => {
    const [low, high] = wilson(8, 10);
    expect(low).toBeCloseTo(0.49, 2);
    expect(high).toBeCloseTo(0.94, 2);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});

describe('evaluate (on the fake fixture)', () => {
  const nbest = evaluate(fixture.attempts, { split: 'test', mode: 'nbest' });
  const top1 = evaluate(fixture.attempts, { split: 'test', mode: 'top1' });

  it('counts the valid set V: moves spoken in quiet or noisy, in the split', () => {
    expect(nbest.valid).toBe(8);
  });

  it('computes the outcome rates with the N-best', () => {
    expect(nbest.topOne).toMatchObject({ count: 4, total: 8 });
    expect(nbest.wrongAcceptance).toMatchObject({ count: 1, total: 8 });
    expect(nbest.ambiguity).toMatchObject({ count: 1, total: 8 });
    expect(nbest.nomatch).toMatchObject({ count: 2, total: 8 });
  });

  it('computes the rates with only the first alternative', () => {
    expect(top1.topOne).toMatchObject({ count: 3, total: 8 });
    expect(top1.nomatch).toMatchObject({ count: 3, total: 8 });
  });

  it('computes latency percentiles over attempts that have a latency', () => {
    expect(nbest.latency).toEqual({ n: 7, p50: 1200, p95: 2000 });
  });

  it('counts false acceptances over noise phrases, silence and noise trials', () => {
    expect(nbest.falseAcceptance).toMatchObject({ count: 1, total: 3 });
  });

  it('keeps silence/noise trials out of the dev split', () => {
    const dev = evaluate(fixture.attempts, { split: 'dev', mode: 'nbest' });
    expect(dev.valid).toBe(1);
    expect(dev.falseAcceptance.total).toBe(0);
  });

  it('reports commands separately', () => {
    expect(nbest.commands).toMatchObject({ count: 1, total: 1 });
  });

  it('filters by condition', () => {
    const noisy = evaluate(fixture.attempts, { split: 'test', mode: 'nbest', condition: 'noisy' });
    expect(noisy.valid).toBe(3);
  });
});

describe('N-best verdict and criteria', () => {
  const nbest = evaluate(fixture.attempts, { split: 'test', mode: 'nbest' });
  const top1 = evaluate(fixture.attempts, { split: 'test', mode: 'top1' });

  it('adopts the N-best only with +5 points and no extra wrong acceptance', () => {
    const verdict = nbestVerdict(nbest, top1);
    expect(verdict.gainPoints).toBeCloseTo(12.5, 5);
    expect(verdict.adopt).toBe(true);
  });

  it('does not adopt it when wrong acceptances grow', () => {
    const worse = { ...nbest, wrongAcceptance: { ...nbest.wrongAcceptance, count: 5 } };
    expect(nbestVerdict(worse, top1).adopt).toBe(false);
  });

  it('flags the fake data as failing the thresholds', () => {
    const statuses = Object.fromEntries(checkCriteria(nbest).map((c) => [c.name, c.status]));
    expect(statuses['Acierto top-1']).toBe('no cumple');
    expect(statuses['Silencio / ruido']).toBe('no cumple');
    expect(statuses['Latencia p50']).toBe('cumple');
  });

  it('reports "sin datos" when there is nothing to evaluate', () => {
    const empty = evaluate([], { split: 'test', mode: 'nbest' });
    expect(checkCriteria(empty).every((c) => c.status === 'sin datos')).toBe(true);
  });
});

describe('fake data guard', () => {
  it('detects fake files by name, flag and session', () => {
    expect(fakeReason('sample.fake.json', { ...fixture, meta: { ...fixture.meta, fake: false, sessionId: 's' } })).toMatch(/fake\.json/);
    expect(fakeReason('real.json', { ...fixture, meta: { ...fixture.meta, sessionId: 's' } })).toMatch(/meta\.fake/);
    expect(fakeReason('real.json', { ...fixture, meta: { ...fixture.meta, fake: false } })).toMatch(/sesión/);
    expect(fakeReason('real.json', { ...fixture, meta: { ...fixture.meta, fake: false, sessionId: 's1' } })).toBeUndefined();
  });

  it('renders a report with the computed numbers', () => {
    const report = buildReport([{ name: 'sample.fake.json', results: fixture }], { split: 'test' });
    expect(report).toContain('N-best');
    expect(report).toContain('4/8');
  });
});

describe('scripts/metrics.ts', () => {
  const script = resolve(here, '../scripts/metrics.ts');
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', script, ...args], { encoding: 'utf8', cwd: resolve(here, '..') });

  it('prints a report for fake data with a warning banner', () => {
    const out = execFileSync(process.execPath, ['--import', 'tsx', script, fixturePath], {
      encoding: 'utf8',
      cwd: resolve(here, '..'),
    });
    expect(out).toContain('DATOS SINTÉTICOS');
  });

  it('refuses to write fake data into docs/spike-results.md', () => {
    const before = readFileSync(resolve(here, '../../../docs/spike-results.md'), 'utf8');
    const result = run(fixturePath, '--write-results');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('datos sintéticos');
    expect(readFileSync(resolve(here, '../../../docs/spike-results.md'), 'utf8')).toBe(before);
  });
});
