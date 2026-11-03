import { describe, expect, it } from 'vitest';
import { START_FEN, csEventSchemas, gameContextSchema, historyContextSchema, voiceInputContextSchema } from '../src/index.js';

describe('draft browser events and contexts', () => {
  it('versions every event with v: 1', () => {
    expect(csEventSchemas['cs:mf-ready'].safeParse({ v: 1, name: 'mf-game' }).success).toBe(true);
    expect(csEventSchemas['cs:mf-ready'].safeParse({ v: 2, name: 'mf-game' }).success).toBe(false);
    expect(csEventSchemas['cs:route-changed'].safeParse({ v: 1, route: '/game/abc', gameId: 'abc' }).success).toBe(true);
  });

  it('validates the three contexts', () => {
    expect(gameContextSchema.safeParse({ v: 1, gameId: null, orientation: 'white' }).success).toBe(true);
    expect(voiceInputContextSchema.safeParse({ v: 1, lang: 'es-CO', recognizer: 'webspeech', releaseDelayMs: 400 }).success).toBe(true);
    expect(historyContextSchema.safeParse({ v: 1, gameId: 'g', moves: ['e2e4'] }).success).toBe(true);
    expect(gameContextSchema.safeParse({ v: 1, gameId: null, orientation: 'green' }).success).toBe(false);
  });

  it('exposes the starting position', () => {
    expect(START_FEN.startsWith('rnbqkbnr/pppppppp')).toBe(true);
  });
});
