import { describe, expect, it } from 'vitest';
import { legalMovesWithForms, positionFromFen, resolve, weightedDistance } from '../src/index.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const TWO_ROOKS = '6k1/8/8/8/8/8/8/R4RK1 w - - 0 1';
const TWO_KNIGHTS = 'rnbqkb1r/ppp1pppp/5n2/3p4/3P4/5N2/PPP1PPPP/RNBQKB1R w KQkq - 2 3';
const CASTLE_BOTH = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
const PROMOTION = '7k/4P3/8/8/8/8/8/6K1 w - - 0 1';

const say = (fen: string, ...transcripts: string[]) =>
  resolve(fen, transcripts.map((transcript) => ({ transcript })));

describe('legalMovesWithForms', () => {
  it('lists the 20 legal moves of the start position', () => {
    expect(legalMovesWithForms(positionFromFen(START))).toHaveLength(20);
  });

  it('writes castling as king-two-squares UCI', () => {
    const ucis = legalMovesWithForms(positionFromFen(CASTLE_BOTH)).map((m) => m.uci);
    expect(ucis).toContain('e1g1');
    expect(ucis).toContain('e1c1');
    expect(ucis).not.toContain('e1h1');
  });
});

describe('weightedDistance', () => {
  it('is zero for equal phrases and cheap for rhyming letters', () => {
    expect(weightedDistance(['e', '4'], ['e', '4'])).toBe(0);
    expect(weightedDistance(['d', '4'], ['b', '4'])).toBeLessThan(0.5);
    expect(weightedDistance(['d', '4'], ['f', '4'])).toBe(1);
  });
});

describe('resolve: moves', () => {
  it('resolves a pawn move with and without the piece word', () => {
    expect(say(START, 'peón e cuatro')).toMatchObject({ kind: 'move', uci: 'e2e4' });
    expect(say(START, 'e4')).toMatchObject({ kind: 'move', uci: 'e2e4' });
  });

  it('resolves piece moves and letter aliases', () => {
    expect(say(START, 'caballo efe tres')).toMatchObject({ kind: 'move', uci: 'g1f3' });
    expect(say(START, 'caballo a f tres')).toMatchObject({ kind: 'move', uci: 'g1f3' });
  });

  it('resolves coordinates', () => {
    expect(say(START, 'be dos be tres')).toMatchObject({ kind: 'move', uci: 'b2b3' });
    expect(say(START, 'e2e4')).toMatchObject({ kind: 'move', uci: 'e2e4' });
  });

  it('survives a rhyming letter confusion', () => {
    // d3 is not reachable by any knight, but c3 rhymes with it and is
    expect(say(START, 'caballo de tres')).toMatchObject({ kind: 'move', uci: 'b1c3' });
  });

  it('resolves castling in both directions', () => {
    expect(say(CASTLE_BOTH, 'enroque corto')).toMatchObject({ kind: 'move', uci: 'e1g1' });
    expect(say(CASTLE_BOTH, 'enroque largo')).toMatchObject({ kind: 'move', uci: 'e1c1' });
  });

  it('resolves promotions and asks for the piece when it is missing', () => {
    expect(say(PROMOTION, 'e ocho corona a dama')).toMatchObject({ kind: 'move', uci: 'e7e8q' });
    expect(say(PROMOTION, 'e ocho corona a caballo')).toMatchObject({ kind: 'move', uci: 'e7e8n' });
    expect(say(PROMOTION, 'e ocho corona').kind).toBe('ambiguous');
  });
});

describe('resolve: disambiguation', () => {
  it('uses the file hint when two pieces can go to the same square', () => {
    expect(say(TWO_KNIGHTS, 'caballo be de dos')).toMatchObject({ kind: 'move', uci: 'b1d2' });
    expect(say(TWO_KNIGHTS, 'caballo efe de dos')).toMatchObject({ kind: 'move', uci: 'f3d2' });
  });

  it('flags the move as ambiguous when the hint is missing', () => {
    const result = say(TWO_KNIGHTS, 'caballo de dos');
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect(result.candidates.map((c) => c.uci).sort()).toEqual(['b1d2', 'f3d2']);
    }
  });

  it('keeps the file "a" as a hint instead of dropping it as a filler', () => {
    expect(say(TWO_ROOKS, 'torre a de uno')).toMatchObject({ kind: 'move', uci: 'a1d1' });
    expect(say(TWO_ROOKS, 'torre efe de uno')).toMatchObject({ kind: 'move', uci: 'f1d1' });
    expect(say(TWO_ROOKS, 'torre de uno').kind).toBe('ambiguous');
  });
});

describe('resolve: nomatch and commands', () => {
  it('rejects speech that is not a move', () => {
    expect(say(START, 'hola buenos días a todos').kind).toBe('nomatch');
    expect(say(START, 'me voy a tomar un café').kind).toBe('nomatch');
  });

  it('rejects an illegal move instead of guessing', () => {
    expect(say(START, 'torre h cinco').kind).toBe('nomatch');
  });

  it('returns nomatch for empty recognition', () => {
    expect(resolve(START, []).kind).toBe('nomatch');
    expect(say(START, '', '   ').kind).toBe('nomatch');
  });

  it('recognizes commands', () => {
    expect(say(START, 'sí')).toEqual({ kind: 'command', command: 'yes' });
    expect(say(START, 'no')).toEqual({ kind: 'command', command: 'no' });
    expect(say(START, 'cancelar')).toEqual({ kind: 'command', command: 'cancel' });
  });
});

describe('resolve: garbled and filler words', () => {
  it('ignores filler words around the move', () => {
    expect(say(START, 'pues caballo efe tres por favor')).toMatchObject({ kind: 'move', uci: 'g1f3' });
  });

  it('does not drop a garbled piece name and accept the pawn move instead', () => {
    // "cavayo" is a mangled "caballo": f3 by a pawn would be a wrong acceptance
    expect(say(START, 'cavayo fe tres')).toMatchObject({ kind: 'move', uci: 'g1f3' });
  });
});

describe('resolve: N-best and options', () => {
  it('uses a later alternative when the first one is garbage', () => {
    const alternatives = [{ transcript: 'cavayo fe tres' }, { transcript: 'caballo efe tres' }];
    expect(resolve(START, alternatives)).toMatchObject({ kind: 'move', uci: 'g1f3' });
  });

  it('can ignore the extra alternatives', () => {
    const alternatives = [{ transcript: 'buenas tardes' }, { transcript: 'caballo efe tres' }];
    expect(resolve(START, alternatives.slice(0, 1)).kind).toBe('nomatch');
    expect(resolve(START, alternatives).kind).toBe('move');
  });

  it('honors threshold and margin', () => {
    const heard = [{ transcript: 'caballo de tres' }];
    expect(resolve(START, heard, { threshold: 0.2 }).kind).toBe('nomatch');
    expect(resolve(START, heard, { margin: 1 }).kind).toBe('ambiguous');
  });

  it('understands the NATO alphabet only when enabled', () => {
    const phrase = [{ transcript: 'caballo foxtrot tres' }];
    expect(resolve(START, phrase, { nato: true })).toMatchObject({ kind: 'move', uci: 'g1f3' });
  });
});
