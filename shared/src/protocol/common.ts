import { z } from 'zod';

/** Version of the contract (socket, REST and browser events). See docs/contract-versioning.md. */
export const PROTOCOL_VERSION = 1;

/** A move in UCI: from square, to square and an optional promotion piece (e2e4, e7e8q). */
export const uciSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, 'UCI mal formada');

/** Half-move number: the first move of white is ply 1. */
export const plySchema = z.number().int().min(1);

export const gameIdSchema = z.string().min(1).max(64);
export const fenSchema = z.string().min(1);

export const colorSchema = z.enum(['white', 'black']);
export type Color = z.infer<typeof colorSchema>;

/** `spectator` is RESERVED: not used in v1 (a third identity that joins is rejected). */
export const playerViewSchema = z.enum(['white', 'black', 'spectator']);
export type PlayerView = z.infer<typeof playerViewSchema>;

/** Mirrors the statuses planned for Postgres `games`. */
export const gameStatusSchema = z.enum(['waiting', 'active', 'finished', 'aborted']);
export type GameStatus = z.infer<typeof gameStatusSchema>;

/** `*` only for an aborted game. */
export const gameResultSchema = z.enum(['1-0', '0-1', '1/2-1/2', '*']);
export type GameResult = z.infer<typeof gameResultSchema>;

/** `threefold_repetition` and `fifty_moves` are RESERVED: not detected in v1. */
export const terminationSchema = z.enum([
  'checkmate',
  'stalemate',
  'insufficient_material',
  'resignation',
  'abandonment',
  'aborted',
  'threefold_repetition',
  'fifty_moves',
]);
export type Termination = z.infer<typeof terminationSchema>;

/** Members of the enums above that v1 does not emit yet. */
export const RESERVED_IN_V1 = {
  playerView: ['spectator'],
  termination: ['threefold_repetition', 'fifty_moves'],
} as const;
