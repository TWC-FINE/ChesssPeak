import type { Listening, RecognitionFailure, RecognitionOutcome, SpeechRecognizer } from './recognizer.js';

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
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** The same request as the spike, so that the capture resembles what was measured. Only the first alternative is resolved (ADR 5). */
const MAX_ALTERNATIVES = 5;
/** A recognizer that never ends must not leave the button stuck on «Reconociendo…». */
const NEVER_ENDS_MS = 10_000;

const FAILURES: Record<string, RecognitionFailure> = {
  'no-speech': 'no-speech',
  aborted: 'aborted',
  'not-allowed': 'not-allowed',
  'service-not-allowed': 'not-allowed',
  'audio-capture': 'not-allowed',
  network: 'network',
};

function constructorOf(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/**
 * Web Speech API, the default recognizer (ADR 5). It waits `releaseDelayMs` between releasing the button and calling
 * stop(): that delay is a product requirement measured in the spike. It starts from spike/web-speech/src/recognizer.ts.
 */
export class WebSpeechRecognizer implements SpeechRecognizer {
  readonly name = 'webspeech';
  private readonly lang: string;
  private readonly releaseDelayMs: number;

  constructor(options: { lang: string; releaseDelayMs: number }) {
    this.lang = options.lang;
    this.releaseDelayMs = options.releaseDelayMs;
  }

  isAvailable(): boolean {
    return constructorOf() !== undefined;
  }

  listen(): Listening {
    const Ctor = constructorOf();
    if (Ctor === undefined) {
      return { release: () => Promise.resolve({ alternatives: [], recognitionMs: 0, failure: 'unavailable' }), abort: () => undefined };
    }

    const recognition = new Ctor();
    recognition.lang = this.lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = MAX_ALTERNATIVES;

    let alternatives: RecognitionOutcome['alternatives'] = [];
    let failure: RecognitionFailure | undefined;
    let resultAt: number | undefined;
    let ended = false;
    let releasedAt: number | undefined;
    let finish: ((outcome: RecognitionOutcome) => void) | undefined;
    let neverEnds: ReturnType<typeof setTimeout> | undefined;

    // Chrome and Edge end a non-continuous recognition by themselves after a pause, so it is only over
    // once the button has been released AND the recognizer has ended.
    const settle = (): void => {
      if (!ended || releasedAt === undefined || finish === undefined) return;
      clearTimeout(neverEnds);
      const outcome: RecognitionOutcome = { alternatives, recognitionMs: Math.max(0, (resultAt ?? performance.now()) - releasedAt) };
      if (failure !== undefined) outcome.failure = failure;
      finish(outcome);
      finish = undefined;
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
        const joined = segments.map((segment) => segment[0]!.transcript.trim()).join(' ');
        const confidence = segments.reduce((sum, segment) => sum + segment[0]!.confidence, 0) / segments.length;
        list.push({ transcript: joined, confidence });
      }
      for (let i = 0; i < first.length; i++) list.push({ transcript: first[i]!.transcript, confidence: first[i]!.confidence });
      alternatives = list;
    };
    recognition.onerror = (event) => {
      failure = FAILURES[event.error] ?? 'other';
    };
    recognition.onend = () => {
      ended = true;
      settle();
    };

    try {
      recognition.start();
    } catch {
      failure = 'other';
      ended = true;
    }

    return {
      release: () =>
        new Promise((resolve) => {
          finish = resolve;
          releasedAt = performance.now();
          if (ended) {
            settle();
            return;
          }
          setTimeout(() => {
            try {
              recognition.stop();
            } catch {
              // already stopped
            }
          }, this.releaseDelayMs);
          neverEnds = setTimeout(() => {
            failure ??= 'other';
            ended = true;
            settle();
          }, this.releaseDelayMs + NEVER_ENDS_MS);
        }),
      abort: () => {
        clearTimeout(neverEnds);
        try {
          recognition.abort();
        } catch {
          // already stopped
        }
      },
    };
  }
}
