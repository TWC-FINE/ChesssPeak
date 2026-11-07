import type { Recognizer } from '@chessspeak/shared';

/** Why a recognition gave no text. A silence is `no-speech`, and it still counts as an attempt. */
export type RecognitionFailure = 'no-speech' | 'aborted' | 'not-allowed' | 'network' | 'unavailable' | 'busy' | 'agent-unreachable' | 'other';

export interface RecognitionOutcome {
  alternatives: { transcript: string; confidence?: number }[];
  /** From releasing the button to having the text, including any delay of the recognizer. */
  recognitionMs: number;
  failure?: RecognitionFailure;
  /** Why the local agent did not transcribe a clip, which then counts as a silence. */
  gate?: 'too-short' | 'too-quiet';
  /** With `busy`: how long the local agent asks to wait. */
  retryAfterSeconds?: number;
}

/** One push-to-talk utterance, started by SpeechRecognizer.listen(). */
export interface Listening {
  /** The button was released. Never rejects: a problem comes back as `failure`. */
  release(): Promise<RecognitionOutcome>;
  /** Stop without a result, for example when the page loses focus. */
  abort(): void;
}

/** Strategy of ADR 5: adding a recognizer touches neither the parser nor the server. */
export interface SpeechRecognizer {
  readonly name: Exclude<Recognizer, 'text'>;
  isAvailable(): boolean;
  listen(): Listening;
  /** Releases what it holds, such as the microphone, when another recognizer takes over. */
  dispose?(): void;
}
