import type { Listening, RecognitionOutcome, SpeechRecognizer } from './recognizer.js';

/** Answers with the phrases it was given, for tests and for working without a microphone. */
export class FakeRecognizer implements SpeechRecognizer {
  readonly name = 'fake';
  listened = 0;
  aborted = 0;
  private readonly outcomes: RecognitionOutcome[] = [];

  /** The next utterance recognizes this text; an empty one is a silence. */
  say(transcript: string, recognitionMs = 500): void {
    this.outcomes.push(transcript === '' ? { alternatives: [], recognitionMs, failure: 'no-speech' } : { alternatives: [{ transcript, confidence: 0.9 }], recognitionMs });
  }

  /** The next utterance fails. */
  fail(failure: NonNullable<RecognitionOutcome['failure']>): void {
    this.outcomes.push({ alternatives: [], recognitionMs: 0, failure });
  }

  isAvailable(): boolean {
    return true;
  }

  listen(): Listening {
    this.listened += 1;
    return {
      release: () => Promise.resolve(this.outcomes.shift() ?? { alternatives: [], recognitionMs: 0, failure: 'no-speech' }),
      abort: () => {
        this.aborted += 1;
      },
    };
  }
}
