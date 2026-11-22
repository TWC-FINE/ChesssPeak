import { z } from 'zod';
import { recognizerSchema } from './protocol/client.js';
import { colorSchema, gameIdSchema } from './protocol/common.js';
import type { GameSocket } from './protocol/socket.js';

/**
 * Contexts the shell injects through `el.context`, contract v1.
 * Least privilege: only <mf-game> receives the socket; mf-voice-input and mf-history use cs:* events.
 */

export const gameContextSchema = z.object({
  v: z.literal(1),
  gameId: gameIdSchema.nullable(),
  orientation: colorSchema,
});
/** The socket is not serializable, so it is typed but not part of the schema. `null` before connecting. */
export type GameContext = z.infer<typeof gameContextSchema> & { socket: GameSocket | null };

export const voiceInputContextSchema = z.object({
  v: z.literal(1),
  gameId: gameIdSchema.nullable(),
  lang: z.string().min(2).max(16),
  recognizer: recognizerSchema,
  /** Overrides DEFAULT_RELEASE_DELAY_MS (voice.ts) when present. */
  releaseDelayMs: z.number().int().nonnegative().optional(),
  /** Local Whisper agent, e.g. http://127.0.0.1:8765; null when not available. */
  agentUrl: z.string().url().nullable(),
  /** Second agent, for Whisper on EC2 through SSH tunnels, e.g. http://127.0.0.1:8766. Absent or null: the choice is not offered. */
  cloudAgentUrl: z.string().url().nullable().optional(),
});
export type VoiceInputContext = z.infer<typeof voiceInputContextSchema>;

export const historyContextSchema = z.object({
  v: z.literal(1),
  gameId: gameIdSchema.nullable(),
});
/** The moves arrive through cs:move-applied, not through the context. */
export type HistoryContext = z.infer<typeof historyContextSchema>;

export const rankingContextSchema = z.object({
  v: z.literal(1),
  /** Server base URL, e.g. https://api.example.com; null when the web has none configured. */
  apiUrl: z.string().url().nullable(),
  /** True while the ranking is on screen. The element reloads it each time this turns true, not on every new context. */
  active: z.boolean(),
});
/** <mf-ranking> reads the public GET /ranking itself: it needs no socket and no token. */
export type RankingContext = z.infer<typeof rankingContextSchema>;
