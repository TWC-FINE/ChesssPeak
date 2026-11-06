import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  PROTOCOL_VERSION,
  RESERVED_IN_V1,
  clientEventSchemas,
  createGameRequestSchema,
  createGameResponseSchema,
  gameEndSchema,
  gameErrorSchema,
  gameJoinSchema,
  gameMoveSchema,
  gameMovedSchema,
  gameResignSchema,
  gameStateSchema,
  guestAuthRequestSchema,
  guestAuthResponseSchema,
  serverEventSchemas,
  socketAuthSchema,
  uciSchema,
  voiceAttemptSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '../src/index.js';

const attempt = {
  gameId: 'g1',
  ply: 3,
  fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  lang: 'es-CO',
  recognizer: 'webspeech',
  alternatives: [{ transcript: 'Caballo F 3.', confidence: 0.9 }],
  transcript: 'Caballo F 3.',
  normalized: 'caballo f 3',
  candidates: [{ uci: 'g1f3', score: 0 }],
  resolvedUci: 'g1f3',
  outcome: 'move',
  accepted: true,
  tryIndex: 1,
  latency: { recognitionMs: 420, resolveMs: 3, totalMs: 571 },
  session: 's1',
} as const;

const state = {
  gameId: 'g1',
  fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  moves: [{ ply: 1, uci: 'e2e4', san: 'e4' }],
  plyCount: 1,
  status: 'active',
  turn: 'black',
  seats: { white: { displayName: 'Ana', connected: true }, black: null },
  yourColor: 'white',
} as const;

describe('version', () => {
  it('is 1 and the handshake carries it', () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(socketAuthSchema.safeParse({ token: 't', v: 1 }).success).toBe(true);
    expect(socketAuthSchema.safeParse({ token: 't', v: 2 }).success).toBe(false);
    expect(socketAuthSchema.safeParse({ token: 't' }).success).toBe(false);
  });
});

describe('client → server (strict)', () => {
  it('accepts well formed moves, including a promotion', () => {
    expect(gameMoveSchema.safeParse({ gameId: 'g1', uci: 'e2e4', ply: 1 }).success).toBe(true);
    expect(gameMoveSchema.safeParse({ gameId: 'g1', uci: 'e7e8q', ply: 9 }).success).toBe(true);
  });

  it('rejects a malformed UCI', () => {
    for (const uci of ['e2e9', 'i2e4', 'e2e4k', 'E2E4', 'e2-e4', 'e2e4qq', '']) {
      expect(uciSchema.safeParse(uci).success, uci).toBe(false);
    }
  });

  it('rejects ply 0, negative and fractional plies', () => {
    for (const ply of [0, -1, 1.5]) expect(gameMoveSchema.safeParse({ gameId: 'g1', uci: 'e2e4', ply }).success).toBe(false);
  });

  it('rejects identity fields that only the server may decide', () => {
    expect(gameMoveSchema.safeParse({ gameId: 'g1', uci: 'e2e4', ply: 1, color: 'white' }).success).toBe(false);
    expect(gameJoinSchema.safeParse({ gameId: 'g1', userId: 'u1' }).success).toBe(false);
    expect(gameResignSchema.safeParse({ gameId: 'g1', player: 'x' }).success).toBe(false);
    expect(voiceAttemptSchema.safeParse({ ...attempt, player: 'x' }).success).toBe(false);
    expect(voiceAttemptSchema.safeParse({ ...attempt, createdAt: '2026-11-02' }).success).toBe(false);
  });

  it('validates a voice attempt, nested objects included', () => {
    expect(voiceAttemptSchema.safeParse(attempt).success).toBe(true);
    expect(voiceAttemptSchema.safeParse({ ...attempt, resolvedUci: null, outcome: 'nomatch' }).success).toBe(true);
    expect(voiceAttemptSchema.safeParse({ ...attempt, expectedUci: 'g1f3' }).success).toBe(true);
    expect(voiceAttemptSchema.safeParse({ ...attempt, candidates: Array(4).fill({ uci: 'g1f3', score: 0 }) }).success).toBe(false);
    expect(voiceAttemptSchema.safeParse({ ...attempt, latency: { ...attempt.latency, extra: 1 } }).success).toBe(false);
    expect(voiceAttemptSchema.safeParse({ ...attempt, recognizer: 'siri' }).success).toBe(false);
    expect(voiceAttemptSchema.safeParse({ ...attempt, tryIndex: 0 }).success).toBe(false);
  });

  it('validates the REST requests', () => {
    expect(guestAuthRequestSchema.parse({ displayName: '  Ana ' }).displayName).toBe('Ana');
    expect(guestAuthRequestSchema.safeParse({ displayName: '' }).success).toBe(false);
    expect(guestAuthRequestSchema.safeParse({ displayName: 'x'.repeat(25) }).success).toBe(false);
    expect(guestAuthRequestSchema.safeParse({ displayName: 'Ana', guestId: 'g' }).success).toBe(false);
    expect(createGameRequestSchema.safeParse({}).success).toBe(true);
    expect(createGameRequestSchema.safeParse({ color: 'random' }).success).toBe(true);
    expect(createGameRequestSchema.safeParse({ color: 'green' }).success).toBe(false);
    expect(createGameRequestSchema.safeParse({ color: 'white', userId: 'u' }).success).toBe(false);
  });
});

describe('server → client (tolerant)', () => {
  it('accepts a full game state and drops unknown fields instead of failing', () => {
    expect(gameStateSchema.safeParse(state).success).toBe(true);
    const newer = gameStateSchema.parse({ ...state, clock: { white: 60 } });
    expect('clock' in newer).toBe(false);
  });

  it('counts half-moves with plyCount, 0 at the start and never negative', () => {
    expect(gameStateSchema.safeParse({ ...state, moves: [], plyCount: 0 }).success).toBe(true);
    expect(gameStateSchema.safeParse({ ...state, plyCount: -1 }).success).toBe(false);
    expect(gameStateSchema.safeParse({ ...state, plyCount: undefined }).success).toBe(false);
    // game:move carries the ply being made: plyCount + 1
    expect(gameMoveSchema.safeParse({ gameId: 'g1', uci: 'g8f6', ply: state.plyCount + 1 }).success).toBe(true);
  });

  it('uses the Postgres statuses and rejects the old names', () => {
    for (const status of ['waiting', 'active', 'finished', 'aborted']) expect(gameStateSchema.safeParse({ ...state, status }).success).toBe(true);
    for (const status of ['playing', 'ended']) expect(gameStateSchema.safeParse({ ...state, status }).success).toBe(false);
  });

  it('validates moved, end and error', () => {
    expect(gameMovedSchema.safeParse({ gameId: 'g1', ply: 1, uci: 'e2e4', san: 'e4', fen: state.fen }).success).toBe(true);
    expect(gameMovedSchema.safeParse({ gameId: 'g1', ply: 0, uci: 'e2e4', san: 'e4', fen: state.fen }).success).toBe(false);
    expect(gameEndSchema.safeParse({ gameId: 'g1', result: '1-0', termination: 'checkmate' }).success).toBe(true);
    expect(gameEndSchema.safeParse({ gameId: 'g1', result: '*', termination: 'aborted' }).success).toBe(true);
    expect(gameEndSchema.safeParse({ gameId: 'g1', result: '2-0', termination: 'checkmate' }).success).toBe(false);
    for (const code of ['not_your_turn', 'illegal', 'stale_ply', 'unauthorized', 'not_found']) {
      expect(gameErrorSchema.safeParse({ code, message: 'x' }).success).toBe(true);
    }
    expect(gameErrorSchema.safeParse({ code: 'boom', message: 'x' }).success).toBe(false);
  });

  it('validates the REST responses; the display name lives only in identity', () => {
    const response = guestAuthResponseSchema.parse({ token: 't', identity: { kind: 'guest', guestId: 'g', displayName: 'Ana' }, displayName: 'dup' });
    expect('displayName' in response).toBe(false);
    expect(response.identity.displayName).toBe('Ana');
    expect(createGameResponseSchema.safeParse({ gameId: 'g1' }).success).toBe(true);
  });

  it('marks the reserved values', () => {
    expect(RESERVED_IN_V1.playerView).toEqual(['spectator']);
    expect(RESERVED_IN_V1.termination).toEqual(['threefold_repetition', 'fifty_moves']);
  });
});

describe('types match the schemas', () => {
  it('Socket.IO generics take exactly the payloads of the schemas', () => {
    type ClientPayload<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];
    type ServerPayload<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>[0];
    expectTypeOf<ClientPayload<'game:join'>>().toEqualTypeOf<z.infer<(typeof clientEventSchemas)['game:join']>>();
    expectTypeOf<ClientPayload<'game:move'>>().toEqualTypeOf<z.infer<(typeof clientEventSchemas)['game:move']>>();
    expectTypeOf<ClientPayload<'game:resign'>>().toEqualTypeOf<z.infer<(typeof clientEventSchemas)['game:resign']>>();
    expectTypeOf<ClientPayload<'voice:attempt'>>().toEqualTypeOf<z.infer<(typeof clientEventSchemas)['voice:attempt']>>();
    expectTypeOf<ServerPayload<'game:state'>>().toEqualTypeOf<z.infer<(typeof serverEventSchemas)['game:state']>>();
    expectTypeOf<ServerPayload<'game:moved'>>().toEqualTypeOf<z.infer<(typeof serverEventSchemas)['game:moved']>>();
    expectTypeOf<ServerPayload<'game:end'>>().toEqualTypeOf<z.infer<(typeof serverEventSchemas)['game:end']>>();
    expectTypeOf<ServerPayload<'game:error'>>().toEqualTypeOf<z.infer<(typeof serverEventSchemas)['game:error']>>();
  });

  it('every event of the generics has a schema and vice versa', () => {
    expectTypeOf<keyof ClientToServerEvents>().toEqualTypeOf<keyof typeof clientEventSchemas>();
    expectTypeOf<keyof ServerToClientEvents>().toEqualTypeOf<keyof typeof serverEventSchemas>();
    expect(Object.keys(clientEventSchemas).sort()).toEqual(['game:join', 'game:move', 'game:resign', 'voice:attempt']);
    expect(Object.keys(serverEventSchemas).sort()).toEqual(['game:end', 'game:error', 'game:moved', 'game:state']);
  });
});
