import { z } from 'zod';
import { identitySchema } from '../identity.js';
import { gameIdSchema } from './common.js';

// REST. Requests (client → server) are .strict(); responses are not (see docs/contract-versioning.md).

/** POST /auth/guest */
export const guestAuthRequestSchema = z.object({ displayName: z.string().trim().min(1).max(24) }).strict();
export type GuestAuthRequest = z.infer<typeof guestAuthRequestSchema>;

/** Response of POST /auth/guest. The display name lives only inside `identity`. */
export const guestAuthResponseSchema = z.object({ token: z.string().min(1), identity: identitySchema });
export type GuestAuthResponse = z.infer<typeof guestAuthResponseSchema>;

/** POST /games (Authorization: Bearer <token>). `color` is the creator's seat; `random` is drawn by the server. */
export const createGameRequestSchema = z.object({ color: z.enum(['white', 'black', 'random']).optional() }).strict();
export type CreateGameRequest = z.infer<typeof createGameRequestSchema>;

export const createGameResponseSchema = z.object({ gameId: gameIdSchema });
export type CreateGameResponse = z.infer<typeof createGameResponseSchema>;

/** Elo every player starts with. */
export const INITIAL_RATING = 1200;

/** One row of GET /ranking. Players are grouped by display name, since guests get a new guestId at every sign-in. */
export const rankingEntrySchema = z.object({
  /** 1 for the best rating; players with the same rating share it. */
  rank: z.number().int().min(1),
  displayName: z.string().min(1).max(24),
  rating: z.number().int(),
  games: z.number().int().min(1),
  wins: z.number().int().min(0),
  draws: z.number().int().min(0),
  losses: z.number().int().min(0),
});
export type RankingEntry = z.infer<typeof rankingEntrySchema>;

/** Response of GET /ranking (public, no token): the top players, best first. */
export const rankingResponseSchema = z.object({
  entries: z.array(rankingEntrySchema),
  /** Finished games the ratings come from. */
  gamesRated: z.number().int().min(0),
});
export type RankingResponse = z.infer<typeof rankingResponseSchema>;
