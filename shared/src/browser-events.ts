import { z } from 'zod';
import { voiceAttemptSchema } from './protocol/client.js';
import {
  colorSchema,
  fenSchema,
  gameIdSchema,
  gameResultSchema,
  playerViewSchema,
  plySchema,
  terminationSchema,
  uciSchema,
} from './protocol/common.js';

/**
 * Browser events between the shell and the microfrontends (prefix `cs:`), contract v1.
 * Dispatched from the emitting element with CS_EVENT_INIT (browser.ts; they bubble up) and listened on `document`.
 * Not strict: a listener ignores fields it does not know (additive changes only within v1).
 * Who emits and who listens: docs/protocol.md.
 */
const v = z.literal(1);

export const mfNameSchema = z.enum(['mf-game', 'mf-voice-input', 'mf-history']);
export type MfName = z.infer<typeof mfNameSchema>;

/** Where the confirmed or proposed move comes from. */
export const moveSourceSchema = z.enum(['voice', 'text']);

export const csEventSchemas = {
  /** A microfrontend registered its tag and is ready to receive `el.context`. Emitter: each mf. */
  'cs:mf-ready': z.object({ v, name: mfNameSchema }),
  /** Current position, after every change. Only the FEN: no lists of legal moves. Emitter: mf-game. */
  'cs:position': z.object({
    v,
    gameId: gameIdSchema,
    fen: fenSchema,
    /** Half-moves played so far; 0 at the starting position. The next move is ply `plyCount + 1`. */
    plyCount: z.number().int().min(0),
    turn: colorSchema,
    yourColor: playerViewSchema,
  }),
  /** A resolved move waiting for confirmation (mf-game draws the arrow). Emitter: mf-voice-input. */
  'cs:move-candidate': z.object({ v, gameId: gameIdSchema, ply: plySchema, uci: uciSchema, san: z.string().min(1), source: moveSourceSchema }),
  /** The player confirmed the candidate (voice "sí" or button). Emitter: mf-voice-input. mf-game sends game:move. */
  'cs:move-confirmed': z.object({ v, gameId: gameIdSchema, ply: plySchema, uci: uciSchema, source: moveSourceSchema }),
  /** The candidate was dropped. Emitter: mf-voice-input. */
  'cs:move-cancelled': z.object({ v, gameId: gameIdSchema, ply: plySchema, reason: z.enum(['user', 'position-changed', 'game-ended']) }),
  /**
   * A move is part of the game (from game:moved, or each move of game:state on (re)join).
   * Listeners must be idempotent by `ply`. Emitter: mf-game.
   */
  'cs:move-applied': z.object({ v, gameId: gameIdSchema, ply: plySchema, uci: uciSchema, san: z.string().min(1), fen: fenSchema }),
  /** State of the voice input, for the rest of the page. Emitter: mf-voice-input. */
  'cs:voice-status': z.object({
    v,
    state: z.enum(['idle', 'listening', 'processing', 'awaiting-confirmation', 'unavailable', 'error']),
    message: z.string().optional(),
  }),
  /** Telemetry of one attempt; the shell forwards it as voice:attempt. Emitter: mf-voice-input. */
  'cs:voice-attempt': z.object({ v, attempt: voiceAttemptSchema }),
  /** The game is over. Emitter: mf-game. */
  'cs:game-ended': z.object({ v, gameId: gameIdSchema, result: gameResultSchema, termination: terminationSchema }),
} as const;

export type CsEventName = keyof typeof csEventSchemas;
export type CsEventDetail<K extends CsEventName> = z.infer<(typeof csEventSchemas)[K]>;
