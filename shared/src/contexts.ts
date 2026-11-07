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
});
export type VoiceInputContext = z.infer<typeof voiceInputContextSchema>;

export const historyContextSchema = z.object({
  v: z.literal(1),
  gameId: gameIdSchema.nullable(),
});
/** The moves arrive through cs:move-applied, not through the context. */
export type HistoryContext = z.infer<typeof historyContextSchema>;
