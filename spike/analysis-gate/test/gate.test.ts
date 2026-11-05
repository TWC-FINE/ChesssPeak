import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decide, median, percentile, type RunSummary, type Runs } from '../src/decision.js';
import { positionsFromPgn } from '../src/positions.js';
import { MATE_VALUE, parseBestMove, parseInfo, parseTasklist, toWhitePov } from '../src/uci.js';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('fixtures', () => {
  it('the measurement game is legal and has the 81 plies the criteria name', () => {
    const positions = positionsFromPgn(fixture('measurement-fischer-spassky-1972-g6.pgn'));
    expect(positions).toHaveLength(81);
    expect(positions.at(-1)?.san).toBe('Qf4');
  });

  it('the calibration game is legal and ends in the known mate', () => {
    const positions = positionsFromPgn(fixture('calibration-byrne-fischer-1956.pgn'));
    expect(positions).toHaveLength(82);
    expect(positions.at(-1)?.san).toBe('Rc2#');
  });

  it('rejects an illegal move', () => {
    expect(() => positionsFromPgn('1. e4 e5 2. Ke3 *')).toThrow(/ilegal/);
  });
});

describe('uci', () => {
  it('reads depth and score, ignoring other lines', () => {
    expect(parseInfo('info depth 18 seldepth 25 multipv 1 score cp -34 nodes 100 pv e2e4')).toEqual({ depth: 18, score: -34 });
    expect(parseInfo('info string NNUE evaluation using nn-abc.nnue')).toBeUndefined();
    expect(parseInfo('info depth 3 currmove e2e4 currmovenumber 1')).toBeUndefined();
  });

  it('turns mates into ±MATE_VALUE, with mate 0 as the side to move being mated', () => {
    expect(parseInfo('info depth 9 score mate 3 pv a1a2')?.score).toBe(MATE_VALUE);
    expect(parseInfo('info depth 9 score mate -3 pv a1a2')?.score).toBe(-MATE_VALUE);
    expect(parseInfo('info depth 0 score mate 0')?.score).toBe(-MATE_VALUE);
  });

  it('flips the score only when Black is to move', () => {
    expect(toWhitePov(40, '8/8/8/8/8/8/8/K6k w - - 0 1')).toBe(40);
    expect(toWhitePov(40, '8/8/8/8/8/8/8/K6k b - - 0 1')).toBe(-40);
    expect(Object.is(toWhitePov(0, '8/8/8/8/8/8/8/K6k b - - 0 1'), 0)).toBe(true);
  });

  it('reads bestmove, including a position with no moves', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestMove('bestmove (none)')).toBe('(none)');
    expect(parseBestMove('info depth 1')).toBeUndefined();
  });

  it('reads the localized memory column of tasklist', () => {
    const rss = parseTasklist('"stockfish.exe","4242","Console","1","123.456 KB"\r\n"stockfish.exe","4243","Console","1","1,000 K"');
    expect(rss.get(4242)).toBe(123_456 * 1024);
    expect(rss.get(4243)).toBe(1000 * 1024);
  });
});

describe('statistics', () => {
  it('median and nearest-rank percentile', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    expect(percentile([1, 2, 3, 4], 95)).toBe(4);
  });
});

describe('decide', () => {
  const run = (totalMs: number, evals: number[] = [0, 0, 0, 0]): RunSummary => ({ totalMs, evals });
  const runs = (c0: RunSummary[], c1: RunSummary[], c2: RunSummary[]): Runs => ({ C0: c0, C1: c1, C2: c2 });

  it('passes at exactly a 30 % reduction, with no overlap and matching evaluations', () => {
    const decision = decide(runs([run(100), run(100), run(100)], [run(70), run(70), run(70)], [run(90), run(90), run(90)]));
    expect(decision.best).toBe('C1');
    expect(decision.reduction).toBeCloseTo(0.3);
    expect(decision.passed).toBe(true);
  });

  it('fails below 30 %', () => {
    const decision = decide(runs([run(100), run(100), run(100)], [run(71), run(71), run(71)], [run(90), run(90), run(90)]));
    expect(decision.passes.reduction).toBe(false);
    expect(decision.passed).toBe(false);
  });

  it('fails when the ranges touch, even with a good median', () => {
    const decision = decide(runs([run(100), run(100), run(90)], [run(50), run(50), run(90)], [run(95), run(95), run(95)]));
    expect(decision.passes.reduction).toBe(true);
    expect(decision.noOverlap).toBe(false);
    expect(decision.passed).toBe(false);
  });

  it('only judges the fastest pool: a slower pool with better quality does not rescue it', () => {
    const bad = [500, 500, 500, 500];
    const decision = decide(runs([run(100), run(100), run(100)], [run(50, bad), run(50, bad), run(50, bad)], [run(60), run(60), run(60)]));
    expect(decision.best).toBe('C1');
    expect(decision.passes.quality).toBe(false);
    expect(decision.passed).toBe(false);
  });

  it('compares the median evaluation per position, so one odd repetition does not count', () => {
    const decision = decide(runs([run(100), run(100), run(100)], [run(50, [999, 0, 0, 0]), run(50), run(50)], [run(90), run(90), run(90)]));
    expect(decision.differing).toBe(0);
  });

  it('leaves out positions decided in both, but keeps those decided in only one', () => {
    const reference = [5000, 1000, 0, 0];
    const candidate = [1000, 0, 0, 0];
    const decision = decide(
      runs(
        [run(100, reference), run(100, reference), run(100, reference)],
        [run(50, candidate), run(50, candidate), run(50, candidate)],
        [run(90), run(90), run(90)],
      ),
    );
    expect(decision.comparable).toBe(3);
    expect(decision.differing).toBe(1);
  });

  it('a difference of exactly 50 cp does not count', () => {
    const candidate = [50, 0, 0, 0];
    const decision = decide(runs([run(100), run(100), run(100)], [run(50, candidate), run(50, candidate), run(50, candidate)], [run(90), run(90), run(90)]));
    expect(decision.differing).toBe(0);
  });
});
