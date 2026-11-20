import { z } from 'zod';
import { identitySchema } from '../identity.js';
import { colorSchema, gameIdSchema, terminationSchema } from './common.js';

// REST. Requests (client → server) are .strict(); responses are not (see docs/contract-versioning.md).

/** POST /auth/guest */
export const guestAuthRequestSchema = z.object({ displayName: z.string().trim().min(1).max(24) }).strict();
export type GuestAuthRequest = z.infer<typeof guestAuthRequestSchema>;

/** Response of POST /auth/guest. The display name lives only inside `identity`. */
export const guestAuthResponseSchema = z.object({ token: z.string().min(1), identity: identitySchema });
export type GuestAuthResponse = z.infer<typeof guestAuthResponseSchema>;

/** Minutes on each player's clock that a game can be created with. */
export const CLOCK_MINUTES = [3, 5, 10] as const;

/**
 * POST /games (Authorization: Bearer <token>). `color` is the creator's seat; `random` is drawn by the server.
 * `clockMinutes` gives each player that much time; without it the game has no clock.
 */
export const createGameRequestSchema = z
  .object({
    color: z.enum(['white', 'black', 'random']).optional(),
    clockMinutes: z.union([z.literal(CLOCK_MINUTES[0]), z.literal(CLOCK_MINUTES[1]), z.literal(CLOCK_MINUTES[2])]).optional(),
  })
  .strict();
export type CreateGameRequest = z.infer<typeof createGameRequestSchema>;

export const createGameResponseSchema = z.object({ gameId: gameIdSchema });
export type CreateGameResponse = z.infer<typeof createGameResponseSchema>;

/** Most games GET /games/open returns. */
export const OPEN_GAMES_LIMIT = 20;
/** A waiting game older than this is left out of GET /games/open: its creator has most likely gone. */
export const OPEN_GAME_MAX_AGE_MS = 30 * 60_000;

/** One game of GET /games/open: created, and waiting for a rival. */
export const openGameSchema = z.object({
  gameId: gameIdSchema,
  creator: z.string().min(1).max(24),
  /** The seat the creator took; whoever joins gets the other one. */
  creatorColor: colorSchema,
  /** Milliseconds on each clock; absent for a game without a clock. */
  clockMs: z.number().int().min(1).optional(),
  /** ISO 8601. */
  createdAt: z.string().datetime({ offset: true }),
});
export type OpenGame = z.infer<typeof openGameSchema>;

/** Response of GET /games/open (public, no token): newest first, at most OPEN_GAMES_LIMIT. */
export const openGamesResponseSchema = z.object({ games: z.array(openGameSchema) });
export type OpenGamesResponse = z.infer<typeof openGamesResponseSchema>;

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

/** Most recent games GET /ranking/:displayName returns. */
export const PROFILE_GAMES = 20;

/** The `:displayName` of GET /ranking/:displayName, once decoded from the path. */
export const profileNameSchema = z.string().trim().min(1).max(24);

/** One game of a player profile, seen from that player. */
export const profileGameSchema = z.object({
  gameId: gameIdSchema,
  color: colorSchema,
  opponent: z.string().min(1).max(24),
  /** From this player's side. */
  outcome: z.enum(['win', 'draw', 'loss']),
  termination: terminationSchema.nullable(),
  /** ISO 8601; null for a game finished before the server saved the date. */
  finishedAt: z.string().datetime({ offset: true }).nullable(),
  /** Elo right after this game, and how much it moved. */
  rating: z.number().int(),
  ratingChange: z.number().int(),
});
export type ProfileGame = z.infer<typeof profileGameSchema>;

/**
 * Response of GET /ranking/:displayName (public, no token). 404 when that name has no rated game.
 * `entry` is the player's row of the whole ranking, not only of the top shown by GET /ranking.
 */
export const profileResponseSchema = z.object({
  entry: rankingEntrySchema,
  /** Most recent first, at most PROFILE_GAMES. */
  games: z.array(profileGameSchema),
  /** Elo after each rated game, oldest first, from INITIAL_RATING before the first one. */
  ratingHistory: z.array(z.number().int()).min(1),
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;
