import type { AttemptRecord, ResultsFile } from '@chessspeak/voice-parser';
import { describe, expect, it } from 'vitest';
import quiet from '../../results/2026-11-01-webspeech-ambientetranquiloreal.json';
import noisy from '../../results/2026-11-01-webspeech-ruido.json';
import { isTruncated, summarizeTruncation } from '../src/truncated.js';

describe('isTruncated', () => {
  it('accepts a proper prefix, also with an unfinished last word', () => {
    expect(isTruncated('Torre F.', 'torre efe de uno')).toBe(true);
    expect(isTruncated('B 7 b 8 corona.', 'be siete be ocho corona a dama')).toBe(true);
    expect(isTruncated('Caballo b cu.', 'caballo be cuatro')).toBe(true);
    expect(isTruncated('B 7 toma a 8 corona a Tor.', 'be siete toma a ocho corona a torre')).toBe(true);
  });

  it('rejects complete, longer, unrelated and word-fused texts', () => {
    expect(isTruncated('Caballo b cuatro.', 'caballo be cuatro')).toBe(false);
    expect(isTruncated('Caballo de cuatro.', 'caballo be cuatro')).toBe(false);
    expect(isTruncated('Torrea de.', 'torre a de uno')).toBe(false);
    expect(isTruncated('Alfilma.', 'alfil toma efe tres')).toBe(false);
    expect(isTruncated('En Roque cor.', 'enroque corto')).toBe(false);
    expect(isTruncated('Thor.', 'peón de cinco')).toBe(false);
    expect(isTruncated('', 'peón e cuatro')).toBe(false);
    expect(isTruncated('peón e cuatro por favor', 'peón e cuatro')).toBe(false);
  });
});

// The real run A files: the reference figures of docs/spike-run-b.md.
describe('run A, real files', () => {
  const attempts = [...(quiet as unknown as ResultsFile).attempts, ...(noisy as unknown as ResultsFile).attempts] as AttemptRecord[];
  const parser = (quiet as unknown as ResultsFile).meta.parser;
  const summary = summarizeTruncation(attempts, parser);

  it('counts 6 truncated attempts out of 78: 4 failures and 2 correct', () => {
    expect(summary.valid).toBe(78);
    expect(summary.truncated).toBe(6);
    expect(summary.truncatedFailed).toBe(4);
    expect(summary.truncatedCorrect).toBe(2);
  });

  it('lists exactly the six attempts, all in the quiet block', () => {
    expect(summary.truncatedAttempts.map((t) => t.id).sort()).toEqual([
      'test-quiet:p05-03:r1',
      'test-quiet:p08-02:r1',
      'test-quiet:p08-02:r2',
      'test-quiet:p08-02:r3',
      'test-quiet:p09-02:r3',
      'test-quiet:p09-03:r1',
    ]);
    expect(summary.byCondition.quiet.truncated).toBe(6);
    expect(summary.byCondition.noisy.truncated).toBe(0);
  });

  it('has 34 failures in total and a control of 20 (every noisy failure, none truncated)', () => {
    expect(summary.byCondition.quiet.failed + summary.byCondition.noisy.failed).toBe(34);
    expect(summary.byCondition.noisy.failed).toBe(20);
    expect(summary.control).toBe(20);
    expect(summary.byCondition.quiet.control).toBe(10);
  });
});
