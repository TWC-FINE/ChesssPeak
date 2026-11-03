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

export const seatSchema = z.object({ displayName: z.string().min(1), connected: z.boolean() });
export type Seat = z.infer<typeof seatSchema>;

export const gameStateSchema = z.object({
  gameId: gameIdSchema,
  fen: fenSchema,
  moves: z.array(moveRecordSchema),
  status: gameStatusSchema,
  turn: colorSchema,
  seats: z.object({ white: seatSchema.nullable(), black: seatSchema.nullable() }),
  /** Seat of the receiver, decided by the server. */
  yourColor: playerViewSchema,
});
export type GameState = z.infer<typeof gameStateSchema>;

export const gameMovedSchema = z.object({
  gameId: gameIdSchema,
  ply: plySchema,
  uci: uciSchema,
  san: z.string().min(1),
  fen: fenSchema,
});
export type GameMoved = z.infer<typeof gameMovedSchema>;

export const gameEndSchema = z.object({
  gameId: gameIdSchema,
  result: gameResultSchema,
  termination: terminationSchema,
});
export type GameEnd = z.infer<typeof gameEndSchema>;

export const gameErrorCodeSchema = z.enum(['not_your_turn', 'illegal', 'stale_ply', 'unauthorized', 'not_found']);
export type GameErrorCode = z.infer<typeof gameErrorCodeSchema>;

export const gameErrorSchema = z.object({ code: gameErrorCodeSchema, message: z.string() });
export type GameError = z.infer<typeof gameErrorSchema>;

export const serverEventSchemas = {
  'game:state': gameStateSchema,
  'game:moved': gameMovedSchema,
  'game:end': gameEndSchema,
  'game:error': gameErrorSchema,
} as const;
export type ServerEventName = keyof typeof serverEventSchemas;
