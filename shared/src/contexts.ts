import { z } from 'zod';

/** DRAFT of the contexts the shell injects through `el.context`. Not the v0 contract (part 0c). */
export const gameContextSchema = z.object({
  v: z.literal(1),
  gameId: z.string().min(1).nullable(),
  /** Position shown by `<mf-game>`; the standard starting position when absent. */
  fen: z.string().min(1).optional(),
  orientation: z.enum(['white', 'black']),
});
export type GameContext = z.infer<typeof gameContextSchema>;

export const voiceInputContextSchema = z.object({
  v: z.literal(1),
  lang: z.string().min(1),
  recognizer: z.enum(['webspeech', 'whisper', 'text', 'fake']),
  releaseDelayMs: z.number().int().nonnegative(),
});
export type VoiceInputContext = z.infer<typeof voiceInputContextSchema>;

export const historyContextSchema = z.object({
  v: z.literal(1),
  gameId: z.string().min(1).nullable(),
  moves: z.array(z.string()),
});
export type HistoryContext = z.infer<typeof historyContextSchema>;

/** Standard starting position. */
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
