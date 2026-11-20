import { z } from 'zod';
import {
  colorSchema,
  fenSchema,
  gameIdSchema,
  gameResultSchema,
  gameStatusSchema,
  playerViewSchema,
  plySchema,
  terminationSchema,
  uciSchema,
} from './common.js';

// Server → client. NOT strict on purpose: unknown fields are dropped, so an older client keeps
// working when v1 grows (additive changes only, see docs/contract-versioning.md).

export const moveRecordSchema = z.object({ ply: plySchema, uci: uciSchema, san: z.string().min(1) });
export type MoveRecord = z.infer<typeof moveRecordSchema>;

/**
 * The clocks of a game that has them, in milliseconds left, as the server counted them when it sent the message.
 * `running` is the color whose time is going down: null before the first move of white and once the game is over.
 * `incrementMs` is what each move adds to the clock of whoever played it; absent for a clock without an increment.
 */
export const clockSchema = z.object({
  initialMs: z.number().int().positive(),
  incrementMs: z.number().int().positive().optional(),
  whiteMs: z.number().int().min(0),
  blackMs: z.number().int().min(0),
  running: colorSchema.nullable(),
});
export type Clock = z.infer<typeof clockSchema>;

export const seatSchema = z.object({ displayName: z.string().min(1), connected: z.boolean() });
export type Seat = z.infer<typeof seatSchema>;

export const gameStateSchema = z.object({
  gameId: gameIdSchema,
  fen: fenSchema,
  moves: z.array(moveRecordSchema),
  /** Half-moves played so far; 0 at the starting position. The next `game:move` must carry ply `plyCount + 1`. */
  plyCount: z.number().int().min(0),
  status: gameStatusSchema,
  turn: colorSchema,
  seats: z.object({ white: seatSchema.nullable(), black: seatSchema.nullable() }),
  /** Seat of the receiver, decided by the server. */
  yourColor: playerViewSchema,
  /** Who offered a draw that is still unanswered; absent when there is none. Optional: added later in v1. */
  drawOffer: colorSchema.optional(),
  /** Once the game is finished: who offered a rematch that is still unanswered. Optional: added later in v1. */
  rematchOffer: colorSchema.optional(),
  /** The game of the rematch both players accepted. Optional: added later in v1. */
  nextGameId: gameIdSchema.optional(),
  /** Only in a game created with a clock. Optional: added later in v1. */
  clock: clockSchema.optional(),
  /** Identities watching without a seat; absent when there is none. Optional: added later in v1. */
  spectators: z.number().int().min(1).optional(),
});
export type GameState = z.infer<typeof gameStateSchema>;

export const gameMovedSchema = z.object({
  gameId: gameIdSchema,
  ply: plySchema,
  uci: uciSchema,
  san: z.string().min(1),
  fen: fenSchema,
  /** The clocks right after this move, in a game that has them. Optional: added later in v1. */
  clock: clockSchema.optional(),
});
export type GameMoved = z.infer<typeof gameMovedSchema>;

export const gameEndSchema = z.object({
  gameId: gameIdSchema,
  result: gameResultSchema,
  termination: terminationSchema,
});
export type GameEnd = z.infer<typeof gameEndSchema>;

/**
 * The pending draw offer changed: `offeredBy` is who offered, or null once it was declined. A move also withdraws it,
 * but that is not announced here: whoever receives `game:moved` drops the offer on their own.
 */
export const gameDrawSchema = z.object({ gameId: gameIdSchema, offeredBy: colorSchema.nullable() });
export type GameDraw = z.infer<typeof gameDrawSchema>;

/**
 * The rematch offer of a finished game changed: `offeredBy` is who offered, or null once it was declined or accepted.
 * `nextGameId` comes when both accepted: the new game, already active, with the colors swapped.
 */
export const gameRematchSchema = z.object({ gameId: gameIdSchema, offeredBy: colorSchema.nullable(), nextGameId: gameIdSchema.optional() });
export type GameRematch = z.infer<typeof gameRematchSchema>;

export const gameErrorCodeSchema = z.enum(['not_your_turn', 'illegal', 'stale_ply', 'unauthorized', 'not_found']);
export type GameErrorCode = z.infer<typeof gameErrorCodeSchema>;

export const gameErrorSchema = z.object({ code: gameErrorCodeSchema, message: z.string() });
export type GameError = z.infer<typeof gameErrorSchema>;

export const serverEventSchemas = {
  'game:state': gameStateSchema,
  'game:moved': gameMovedSchema,
  'game:end': gameEndSchema,
  'game:draw': gameDrawSchema,
  'game:rematch': gameRematchSchema,
  'game:error': gameErrorSchema,
} as const;
export type ServerEventName = keyof typeof serverEventSchemas;
