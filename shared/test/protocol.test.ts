import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  PROTOCOL_VERSION,
  RESERVED_IN_V1,
  clientEventSchemas,
  clockSchema,
  createGameRequestSchema as createGameRequest,
  createGameRequestSchema,
  createGameResponseSchema,
  gameDrawAnswerSchema,
  gameDrawOfferSchema,
  gameDrawSchema,
  gameEndSchema,
  gameErrorSchema,
  gameJoinSchema,
  gameMoveSchema,
  gameMovedSchema,
  gameResignSchema,
  gameStateSchema,
  guestAuthRequestSchema,
  guestAuthResponseSchema,
  INITIAL_RATING,
  CLOCK_MINUTES,
  PROFILE_GAMES,
  profileGameSchema,
  profileNameSchema,
  profileResponseSchema,
  rankingEntrySchema,
  rankingResponseSchema,
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
    expect(gameDrawOfferSchema.safeParse({ gameId: 'g1', color: 'white' }).success).toBe(false);
    expect(gameDrawAnswerSchema.safeParse({ gameId: 'g1', accept: true, player: 'x' }).success).toBe(false);
    expect(voiceAttemptSchema.safeParse({ ...attempt, player: 'x' }).success).toBe(false);
    expect(voiceAttemptSchema.safeParse({ ...attempt, createdAt: '2026-11-02' }).success).toBe(false);
  });

  it('validates the draw offer and its answer', () => {
    expect(gameDrawOfferSchema.safeParse({ gameId: 'g1' }).success).toBe(true);
    expect(gameDrawAnswerSchema.safeParse({ gameId: 'g1', accept: true }).success).toBe(true);
    expect(gameDrawAnswerSchema.safeParse({ gameId: 'g1', accept: false }).success).toBe(true);
    expect(gameDrawAnswerSchema.safeParse({ gameId: 'g1' }).success).toBe(false);
    expect(gameDrawAnswerSchema.safeParse({ gameId: 'g1', accept: 'yes' }).success).toBe(false);
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
    const newer = gameStateSchema.parse({ ...state, premoves: ['e7e5'] });
    expect('premoves' in newer).toBe(false);
  });

  it('carries a pending draw offer only when there is one', () => {
    expect(gameStateSchema.parse(state).drawOffer).toBeUndefined();
    expect(gameStateSchema.parse({ ...state, drawOffer: 'black' }).drawOffer).toBe('black');
    expect(gameStateSchema.safeParse({ ...state, drawOffer: 'spectator' }).success).toBe(false);
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
    expect(gameEndSchema.safeParse({ gameId: 'g1', result: '1/2-1/2', termination: 'agreement' }).success).toBe(true);
    expect(gameDrawSchema.safeParse({ gameId: 'g1', offeredBy: 'white' }).success).toBe(true);
    expect(gameDrawSchema.safeParse({ gameId: 'g1', offeredBy: null }).success).toBe(true);
    expect(gameDrawSchema.safeParse({ gameId: 'g1' }).success).toBe(false);
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

  it('validates the ranking and drops unknown fields', () => {
    const entry = { rank: 1, displayName: 'Ana', rating: 1220, games: 1, wins: 1, draws: 0, losses: 0 };
    expect(INITIAL_RATING).toBe(1200);
    expect(rankingResponseSchema.safeParse({ entries: [], gamesRated: 0 }).success).toBe(true);
    const parsed = rankingResponseSchema.parse({ entries: [{ ...entry, guestId: 'g' }], gamesRated: 1, generatedAt: 'x' });
    expect(parsed.entries[0]).toEqual(entry);
    expect('generatedAt' in parsed).toBe(false);
    expect(rankingEntrySchema.safeParse({ ...entry, rank: 0 }).success).toBe(false);
    expect(rankingEntrySchema.safeParse({ ...entry, games: 0 }).success).toBe(false);
    expect(rankingEntrySchema.safeParse({ ...entry, rating: 1220.5 }).success).toBe(false);
    expect(rankingEntrySchema.safeParse({ ...entry, displayName: '' }).success).toBe(false);
    expect(rankingResponseSchema.safeParse({ entries: [entry] }).success).toBe(false);
  });

  it('validates a player profile and drops unknown fields', () => {
    const entry = { rank: 2, displayName: 'Ana', rating: 1220, games: 1, wins: 1, draws: 0, losses: 0 };
    const game = {
      gameId: 'g1',
      color: 'white',
      opponent: 'Luis',
      outcome: 'win',
      termination: 'checkmate',
      finishedAt: '2026-11-20T18:00:00.000Z',
      rating: 1220,
      ratingChange: 20,
    };
    expect(PROFILE_GAMES).toBe(20);
    const parsed = profileResponseSchema.parse({ entry, games: [{ ...game, whiteGuestId: 'x' }], ratingHistory: [1200, 1220], extra: 1 });
    expect(parsed).toEqual({ entry, games: [game], ratingHistory: [1200, 1220] });
    expect(profileGameSchema.safeParse({ ...game, finishedAt: null, termination: null }).success).toBe(true);
    expect(profileGameSchema.safeParse({ ...game, outcome: 'won' }).success).toBe(false);
    expect(profileGameSchema.safeParse({ ...game, finishedAt: 'ayer' }).success).toBe(false);
    expect(profileGameSchema.safeParse({ ...game, ratingChange: 0.5 }).success).toBe(false);
    expect(profileResponseSchema.safeParse({ entry, games: [], ratingHistory: [] }).success).toBe(false);
  });

  it('trims the profile name and keeps it within the display name limits', () => {
    expect(profileNameSchema.parse('  Ana ')).toBe('Ana');
    expect(profileNameSchema.safeParse('   ').success).toBe(false);
    expect(profileNameSchema.safeParse('x'.repeat(25)).success).toBe(false);
  });

  it('validates the rematch events, strict from the client and tolerant from the server', () => {
    expect(clientEventSchemas['game:rematch-offer'].safeParse({ gameId: 'g1' }).success).toBe(true);
    expect(clientEventSchemas['game:rematch-offer'].safeParse({ gameId: 'g1', color: 'white' }).success).toBe(false);
    expect(clientEventSchemas['game:rematch-answer'].safeParse({ gameId: 'g1', accept: false }).success).toBe(true);
    expect(clientEventSchemas['game:rematch-answer'].safeParse({ gameId: 'g1' }).success).toBe(false);
    expect(clientEventSchemas['game:rematch-answer'].safeParse({ gameId: 'g1', accept: 'yes' }).success).toBe(false);

    const rematch = serverEventSchemas['game:rematch'];
    expect(rematch.safeParse({ gameId: 'g1', offeredBy: 'black' }).success).toBe(true);
    expect(rematch.safeParse({ gameId: 'g1', offeredBy: null, nextGameId: 'g2' }).success).toBe(true);
    expect(rematch.safeParse({ gameId: 'g1', offeredBy: 'red' }).success).toBe(false);
    expect(rematch.parse({ gameId: 'g1', offeredBy: null, extra: 1 })).toEqual({ gameId: 'g1', offeredBy: null });
  });

  it('takes the number of spectators of game:state only as a positive whole number', () => {
    const state = serverEventSchemas['game:state'];
    const base = {
      gameId: 'g1',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moves: [],
      plyCount: 0,
      status: 'active',
      turn: 'white',
      seats: { white: null, black: null },
      yourColor: 'spectator',
    };
    expect(state.safeParse(base).success).toBe(true);
    expect(state.parse({ ...base, spectators: 2 }).spectators).toBe(2);
    expect(state.safeParse({ ...base, spectators: 0 }).success).toBe(false);
    expect(state.safeParse({ ...base, spectators: 1.5 }).success).toBe(false);
  });

  it('keeps the rematch fields of game:state optional', () => {
    const state = serverEventSchemas['game:state'];
    const base = {
      gameId: 'g1',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      moves: [],
      plyCount: 0,
      status: 'finished',
      turn: 'white',
      seats: { white: null, black: null },
      yourColor: 'white',
    };
    expect(state.safeParse(base).success).toBe(true);
    expect(state.parse({ ...base, rematchOffer: 'white', nextGameId: 'g2' })).toMatchObject({ rematchOffer: 'white', nextGameId: 'g2' });
    expect(state.safeParse({ ...base, rematchOffer: 'nobody' }).success).toBe(false);
  });

  it('accepts a clock of 3, 5 or 10 minutes when creating a game, and nothing else', () => {
    expect(CLOCK_MINUTES).toEqual([3, 5, 10]);
    for (const clockMinutes of CLOCK_MINUTES) expect(createGameRequest.safeParse({ clockMinutes }).success).toBe(true);
    expect(createGameRequest.safeParse({ color: 'white' }).success).toBe(true);
    expect(createGameRequest.safeParse({ clockMinutes: 4 }).success).toBe(false);
    expect(createGameRequest.safeParse({ clockMinutes: '5' }).success).toBe(false);
    expect(createGameRequest.safeParse({ clockMs: 300000 }).success).toBe(false);
  });

  it('validates the clocks, in game:state and in game:moved, and the timeout', () => {
    const clock = { initialMs: 300000, whiteMs: 299000, blackMs: 300000, running: 'black' };
    expect(clockSchema.safeParse(clock).success).toBe(true);
    expect(clockSchema.safeParse({ ...clock, running: null }).success).toBe(true);
    expect(clockSchema.safeParse({ ...clock, whiteMs: -1 }).success).toBe(false);
    expect(clockSchema.safeParse({ ...clock, initialMs: 0 }).success).toBe(false);
    expect(clockSchema.safeParse({ ...clock, blackMs: 0.5 }).success).toBe(false);
    const moved = { gameId: 'g1', ply: 1, uci: 'e2e4', san: 'e4', fen: 'x' };
    expect(serverEventSchemas['game:moved'].safeParse(moved).success).toBe(true);
    expect(serverEventSchemas['game:moved'].parse({ ...moved, clock }).clock).toEqual(clock);
    expect(serverEventSchemas['game:end'].safeParse({ gameId: 'g1', result: '0-1', termination: 'timeout' }).success).toBe(true);
  });

  it('marks the reserved values', () => {
    expect(RESERVED_IN_V1.playerView).toEqual([]);
    expect(RESERVED_IN_V1.termination).toEqual([]);
  });
});

describe('types match the schemas', () => {
  it('Socket.IO generics take exactly the payloads of the schemas', () => {
    type ClientPayload<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];
    type ServerPayload<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>[0];
    expectTypeOf<ClientPayload<'game:join'>>().toEqualTypeOf<z.infer<(typeof clientEventSchemas)['game:join']>>();
    expectTypeOf<ClientPayload<'game:move'>>().toEqualTypeOf<z.infer<(typeof clientEventSchemas)['game:move']>>();
    expectTypeOf<ClientPayload<'game:resign'>>().toEqualTypeOf<z.infer<(typeof clientEventSchemas)['game:resign']>>();
    expectTypeOf<ClientPayload<'game:draw-offer'>>().toEqualTypeOf<z.infer<(typeof clientEventSchemas)['game:draw-offer']>>();
    expectTypeOf<ClientPayload<'game:draw-answer'>>().toEqualTypeOf<z.infer<(typeof clientEventSchemas)['game:draw-answer']>>();
    expectTypeOf<ClientPayload<'game:rematch-offer'>>().toEqualTypeOf<z.infer<(typeof clientEventSchemas)['game:rematch-offer']>>();
    expectTypeOf<ClientPayload<'game:rematch-answer'>>().toEqualTypeOf<z.infer<(typeof clientEventSchemas)['game:rematch-answer']>>();
    expectTypeOf<ClientPayload<'voice:attempt'>>().toEqualTypeOf<z.infer<(typeof clientEventSchemas)['voice:attempt']>>();
    expectTypeOf<ServerPayload<'game:state'>>().toEqualTypeOf<z.infer<(typeof serverEventSchemas)['game:state']>>();
    expectTypeOf<ServerPayload<'game:moved'>>().toEqualTypeOf<z.infer<(typeof serverEventSchemas)['game:moved']>>();
    expectTypeOf<ServerPayload<'game:end'>>().toEqualTypeOf<z.infer<(typeof serverEventSchemas)['game:end']>>();
    expectTypeOf<ServerPayload<'game:draw'>>().toEqualTypeOf<z.infer<(typeof serverEventSchemas)['game:draw']>>();
    expectTypeOf<ServerPayload<'game:rematch'>>().toEqualTypeOf<z.infer<(typeof serverEventSchemas)['game:rematch']>>();
    expectTypeOf<ServerPayload<'game:error'>>().toEqualTypeOf<z.infer<(typeof serverEventSchemas)['game:error']>>();
  });

  it('every event of the generics has a schema and vice versa', () => {
    expectTypeOf<keyof ClientToServerEvents>().toEqualTypeOf<keyof typeof clientEventSchemas>();
    expectTypeOf<keyof ServerToClientEvents>().toEqualTypeOf<keyof typeof serverEventSchemas>();
    expect(Object.keys(clientEventSchemas).sort()).toEqual(['game:draw-answer', 'game:draw-offer', 'game:join', 'game:move', 'game:rematch-answer', 'game:rematch-offer', 'game:resign', 'voice:attempt']);
    expect(Object.keys(serverEventSchemas).sort()).toEqual(['game:draw', 'game:end', 'game:error', 'game:moved', 'game:rematch', 'game:state']);
  });
});
