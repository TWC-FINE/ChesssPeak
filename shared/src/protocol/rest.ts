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
