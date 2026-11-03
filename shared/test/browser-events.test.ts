import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RELEASE_DELAY_MS,
  START_FEN,
  csEventSchemas,
  gameContextSchema,
  historyContextSchema,
  releaseDelayOf,
  voiceInputContextSchema,
} from '../src/index.js';

const base = { v: 1, gameId: 'g1' } as const;

describe('cs:* events (v1)', () => {
  it('has exactly the events of the contract', () => {
    expect(Object.keys(csEventSchemas).sort()).toEqual(
      [
        'cs:game-ended',
        'cs:mf-ready',
        'cs:move-applied',
        'cs:move-cancelled',
        'cs:move-candidate',
        'cs:move-confirmed',
        'cs:position',
        'cs:voice-attempt',
        'cs:voice-status',
      ].sort(),
    );
  });

  it('requires v: 1 on every event', () => {
    expect(csEventSchemas['cs:mf-ready'].safeParse({ v: 1, name: 'mf-game' }).success).toBe(true);
    expect(csEventSchemas['cs:mf-ready'].safeParse({ v: 2, name: 'mf-game' }).success).toBe(false);
    expect(csEventSchemas['cs:mf-ready'].safeParse({ name: 'mf-game' }).success).toBe(false);
    expect(csEventSchemas['cs:mf-ready'].safeParse({ v: 1, name: 'mf-other' }).success).toBe(false);
  });

  it('cs:position carries only the FEN and the turn data, ply 0 at the start', () => {
    const position = { ...base, fen: START_FEN, ply: 0, turn: 'white', yourColor: 'white' };
    expect(csEventSchemas['cs:position'].safeParse(position).success).toBe(true);
    expect(csEventSchemas['cs:position'].safeParse({ ...position, ply: -1 }).success).toBe(false);
    expect('legalMoves' in csEventSchemas['cs:position'].parse({ ...position, legalMoves: ['e2e4'] })).toBe(false);
  });

  it('validates the move flow events', () => {
    expect(csEventSchemas['cs:move-candidate'].safeParse({ ...base, ply: 1, uci: 'g1f3', san: 'Nf3', source: 'voice' }).success).toBe(true);
    expect(csEventSchemas['cs:move-candidate'].safeParse({ ...base, ply: 1, uci: 'g1f9', san: 'Nf3', source: 'voice' }).success).toBe(false);
    expect(csEventSchemas['cs:move-confirmed'].safeParse({ ...base, ply: 1, uci: 'g1f3', source: 'text' }).success).toBe(true);
    expect(csEventSchemas['cs:move-confirmed'].safeParse({ ...base, ply: 0, uci: 'g1f3', source: 'text' }).success).toBe(false);
    expect(csEventSchemas['cs:move-cancelled'].safeParse({ ...base, ply: 1, reason: 'user' }).success).toBe(true);
    expect(csEventSchemas['cs:move-cancelled'].safeParse({ ...base, ply: 1, reason: 'bored' }).success).toBe(false);
    expect(csEventSchemas['cs:move-applied'].safeParse({ ...base, ply: 1, uci: 'e2e4', san: 'e4', fen: START_FEN }).success).toBe(true);
    expect(csEventSchemas['cs:game-ended'].safeParse({ ...base, result: '1/2-1/2', termination: 'stalemate' }).success).toBe(true);
  });

  it('validates the voice events; the attempt inside follows voice:attempt', () => {
    expect(csEventSchemas['cs:voice-status'].safeParse({ v: 1, state: 'listening' }).success).toBe(true);
    expect(csEventSchemas['cs:voice-status'].safeParse({ v: 1, state: 'sleeping' }).success).toBe(false);
    expect(csEventSchemas['cs:voice-attempt'].safeParse({ v: 1, attempt: { gameId: 'g1', player: 'x' } }).success).toBe(false);
  });
});

describe('contexts (v1)', () => {
  it('validates the three contexts', () => {
    expect(gameContextSchema.safeParse({ v: 1, gameId: null, orientation: 'white' }).success).toBe(true);
    expect(gameContextSchema.safeParse({ v: 1, gameId: null, orientation: 'green' }).success).toBe(false);
    expect(voiceInputContextSchema.safeParse({ v: 1, gameId: 'g', lang: 'es-CO', recognizer: 'webspeech', agentUrl: null }).success).toBe(true);
    expect(voiceInputContextSchema.safeParse({ v: 1, gameId: 'g', lang: 'es-CO', recognizer: 'webspeech', agentUrl: 'no es url' }).success).toBe(false);
    expect(historyContextSchema.safeParse({ v: 1, gameId: 'g' }).success).toBe(true);
  });

  it('takes the release delay from shared unless the context overrides it', () => {
    expect(DEFAULT_RELEASE_DELAY_MS).toBe(400);
    expect(releaseDelayOf(undefined)).toBe(400);
    expect(releaseDelayOf({})).toBe(400);
    expect(releaseDelayOf({ releaseDelayMs: 250 })).toBe(250);
  });
});
