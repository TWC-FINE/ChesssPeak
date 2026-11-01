import type { RecognitionOutcome } from './session.js';

interface SpeechAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechResult {
  length: number;
  [index: number]: SpeechAlternative;
}
interface SpeechResultEvent {
  results: { length: number; [index: number]: SpeechResult };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function constructorOf(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const isWebSpeechAvailable = (): boolean => constructorOf() !== undefined;

export interface ListeningSession {
  /**
   * Call when the button is released. Resolves when the recognizer is done.
   * `stopDelayMs` waits that long before asking the recognizer to stop (run B).
   */
  release(stopDelayMs?: number): Promise<RecognitionOutcome>;
  /** Cancel without a result (e.g. the page lost focus). */
  abort(): void;
}

/**
 * One push-to-talk utterance. Chrome ends a non-continuous recognition by itself
 * after a pause, so the outcome is finalized only once the button has been
 * released AND the recognizer has ended.
 */
export function listen(
  options: { lang: string; maxAlternatives: number },
  onStarted: () => void,
): ListeningSession {
  const Ctor = constructorOf();
  if (Ctor === undefined) throw new Error('Este navegador no tiene Web Speech API. Usa Chrome o Edge.');

  const pressedAt = performance.now();
  const recognition = new Ctor();
  recognition.lang = options.lang;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = options.maxAlternatives;

  let alternatives: RecognitionOutcome['alternatives'] = [];
  let error: string | undefined;
  let resultAt: number | undefined;
  let startupMs: number | undefined;
  let ended = false;
  let releasedAt: number | undefined;
  let finish: ((outcome: RecognitionOutcome) => void) | undefined;

  const settle = (): void => {
    if (!ended || releasedAt === undefined || finish === undefined) return;
    const outcome: RecognitionOutcome = {
      alternatives,
      releasedAt,
      resultAt: resultAt ?? performance.now(),
    };
    if (startupMs !== undefined) outcome.startupMs = startupMs;
    if (error !== undefined) outcome.error = error;
    finish(outcome);
  };

  recognition.onstart = () => {
    startupMs = performance.now() - pressedAt;
    onStarted();
  };
  recognition.onresult = (event) => {
    resultAt = performance.now();
    const segments: SpeechResult[] = [];
    for (let i = 0; i < event.results.length; i++) segments.push(event.results[i]!);
    const first = segments[0];
    if (first === undefined) return;
    const list: RecognitionOutcome['alternatives'] = [];
    if (segments.length > 1) {
      // rare: the recognizer split the utterance; glue the best of each segment
      const joined = segments.map((s) => s[0]!.transcript.trim()).join(' ');
      const confidence = segments.reduce((sum, s) => sum + s[0]!.confidence, 0) / segments.length;
      list.push({ transcript: joined, confidence });
    }
    for (let i = 0; i < first.length; i++) {
      list.push({ transcript: first[i]!.transcript, confidence: first[i]!.confidence });
    }
    alternatives = list;
  };
  recognition.onerror = (event) => {
    error = event.error;
  };
  recognition.onend = () => {
    ended = true;
    resultAt ??= performance.now();
    settle();
  };

  recognition.start();

  return {
    release(stopDelayMs = 0): Promise<RecognitionOutcome> {
      return new Promise((resolve) => {
        finish = resolve;
        releasedAt = performance.now();
        const stop = (): void => {
          try {
            recognition.stop();
          } catch {
            // already stopped
          }
        };
        if (stopDelayMs > 0) setTimeout(stop, stopDelayMs);
        else stop();
        settle();
      });
    },
    abort(): void {
      try {
        recognition.abort();
      } catch {
        // already stopped
      }
    },
  };
}
