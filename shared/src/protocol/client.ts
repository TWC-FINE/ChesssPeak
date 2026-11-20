import { z } from 'zod';
import { fenSchema, gameIdSchema, plySchema, uciSchema } from './common.js';

// Client → server. Every schema is .strict(): an unknown field (color, userId, player...) is rejected.
// The identity of the sender is decided by the server from the token, never read from a payload.

export const gameJoinSchema = z.object({ gameId: gameIdSchema }).strict();
export type GameJoin = z.infer<typeof gameJoinSchema>;

export const gameMoveSchema = z
  .object({
    gameId: gameIdSchema,
    uci: uciSchema,
    /** Ply of the move being made; the server answers `stale_ply` if it does not match. */
    ply: plySchema,
  })
  .strict();
export type GameMove = z.infer<typeof gameMoveSchema>;

export const gameResignSchema = z.object({ gameId: gameIdSchema }).strict();
export type GameResign = z.infer<typeof gameResignSchema>;

/** Offers a draw. Sent while the rival's offer is pending, it accepts that offer instead. */
export const gameDrawOfferSchema = z.object({ gameId: gameIdSchema }).strict();
export type GameDrawOffer = z.infer<typeof gameDrawOfferSchema>;

/** Answers the rival's pending offer: `accept: true` ends the game in a draw by agreement. */
export const gameDrawAnswerSchema = z.object({ gameId: gameIdSchema, accept: z.boolean() }).strict();
export type GameDrawAnswer = z.infer<typeof gameDrawAnswerSchema>;

export const recognizerSchema = z.enum(['webspeech', 'whisper', 'text', 'fake']);
export type Recognizer = z.infer<typeof recognizerSchema>;

export const voiceOutcomeSchema = z.enum(['move', 'ambiguous', 'nomatch', 'command']);
export type VoiceOutcome = z.infer<typeof voiceOutcomeSchema>;

/**
 * One recognition attempt (telemetry, `voice_attempts` in Mongo). No audio.
 * `player` and `createdAt` are NOT here: the server sets both.
 */
export const voiceAttemptSchema = z
  .object({
    gameId: gameIdSchema,
    ply: plySchema,
    fen: fenSchema,
    lang: z.string().min(2).max(16),
    recognizer: recognizerSchema,
    alternatives: z
      .array(z.object({ transcript: z.string(), confidence: z.number().min(0).max(1).optional() }).strict())
      .max(10),
    transcript: z.string(),
    normalized: z.string(),
    candidates: z.array(z.object({ uci: uciSchema, score: z.number() }).strict()).max(3),
    resolvedUci: uciSchema.nullable(),
    /** Only in evaluation sessions. */
    expectedUci: uciSchema.optional(),
    outcome: voiceOutcomeSchema,
    accepted: z.boolean(),
    tryIndex: z.number().int().min(1),
    latency: z
      .object({
        recognitionMs: z.number().nonnegative(),
        resolveMs: z.number().nonnegative(),
        totalMs: z.number().nonnegative(),
      })
      .strict(),
    session: z.string().min(1).max(64),
  })
  .strict();
export type VoiceAttemptPayload = z.infer<typeof voiceAttemptSchema>;

/**
 * Offers a rematch once the game is finished: a new game with the colors swapped. Sent while the rival's offer is
 * pending, it accepts that offer instead.
 */
export const gameRematchOfferSchema = z.object({ gameId: gameIdSchema }).strict();
export type GameRematchOffer = z.infer<typeof gameRematchOfferSchema>;

/** Answers the rival's pending rematch offer: `accept: true` creates the new game. */
export const gameRematchAnswerSchema = z.object({ gameId: gameIdSchema, accept: z.boolean() }).strict();
export type GameRematchAnswer = z.infer<typeof gameRematchAnswerSchema>;

export const clientEventSchemas = {
  'game:join': gameJoinSchema,
  'game:move': gameMoveSchema,
  'game:resign': gameResignSchema,
  'game:draw-offer': gameDrawOfferSchema,
  'game:draw-answer': gameDrawAnswerSchema,
  'game:rematch-offer': gameRematchOfferSchema,
  'game:rematch-answer': gameRematchAnswerSchema,
  'voice:attempt': voiceAttemptSchema,
} as const;
export type ClientEventName = keyof typeof clientEventSchemas;
