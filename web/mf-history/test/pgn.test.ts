import { describe, expect, it } from 'vitest';
import { pgnDate, pgnFileName, toPgn } from '../src/pgn.js';

const date = new Date(2026, 10, 20, 15, 30);

describe('toPgn', () => {
  it('writes the seven tags and the numbered moves', () => {
    expect(toPgn(['f3', 'e5', 'g4', 'Qh4#'], '0-1', date)).toBe(
      [
        '[Event "ChessSpeak"]',
        '[Site "ChessSpeak"]',
        '[Date "2026.11.20"]',
        '[Round "-"]',
        '[White "?"]',
        '[Black "?"]',
        '[Result "0-1"]',
        '',
        '1. f3 e5 2. g4 Qh4# 0-1',
        '',
      ].join('\n'),
    );
  });

  it('ends with * while the game goes on, also with no moves', () => {
    expect(toPgn(['e4'], undefined, date)).toContain('[Result "*"]\n\n1. e4 *\n');
    expect(toPgn([], undefined, date).endsWith('\n\n*\n')).toBe(true);
  });

  it('wraps the moves before 80 characters', () => {
    const sans = Array.from({ length: 60 }, (_, index) => (index % 2 === 0 ? 'Nf3' : 'Nf6'));
    const moves = toPgn(sans, '1/2-1/2', date).split('\n\n')[1]!.trimEnd().split('\n');
    expect(moves.length).toBeGreaterThan(1);
    for (const line of moves) expect(line.length).toBeLessThan(80);
    expect(moves.join(' ').split(' ')).toHaveLength(30 + 60 + 1);
  });

  it('pads the date and names the file after it', () => {
    expect(pgnDate(new Date(2026, 0, 5))).toBe('2026.01.05');
    expect(pgnFileName(date)).toBe('chessspeak-2026-11-20.pgn');
  });
});
