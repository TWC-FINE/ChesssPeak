import { BrowserCapture, type AudioCapture } from './capture.js';
import type { Listening, RecognitionFailure, RecognitionOutcome, SpeechRecognizer } from './recognizer.js';

const REQUEST_TIMEOUT_MS = 30_000;
const HEALTH_TIMEOUT_MS = 2000;

type Fetch = typeof fetch;

interface TranscribeResponse {
  text?: string;
  gated?: boolean;
  reason?: string;
}

/**
 * Local Whisper through local-agent, the alternative of ADR 5 and the local module of the project. The agent applies
 * the chess prompt and the volume and duration gate. The audio goes to 127.0.0.1 and is not stored anywhere.
 */
export class WhisperRecognizer implements SpeechRecognizer {
  readonly name = 'whisper';
  private readonly agentUrl: string;
  private readonly releaseDelayMs: number;
  private readonly capture: AudioCapture;
  private readonly fetchFn: Fetch;

  constructor(options: { agentUrl: string; releaseDelayMs: number; capture?: AudioCapture; fetchFn?: Fetch }) {
    this.agentUrl = options.agentUrl;
    this.releaseDelayMs = options.releaseDelayMs;
    this.capture = options.capture ?? new BrowserCapture();
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  }

  isAvailable(): boolean {
    return this.capture.isSupported();
  }

  dispose(): void {
    this.capture.disable();
  }

  listen(): Listening {
    let aborted = false;
    // the first time, this is where the browser asks for the microphone
    const ready = this.capture.enable().then(
      (): RecognitionFailure | undefined => {
        if (!aborted) this.capture.begin();
        return undefined;
      },
      (): RecognitionFailure => 'not-allowed',
    );
    return {
      release: async () => {
        const releasedAt = performance.now();
        const failure = await ready;
        if (failure !== undefined) return { alternatives: [], recognitionMs: 0, failure };
        const wav = await this.capture.end(this.releaseDelayMs);
        if (wav === undefined) return { alternatives: [], recognitionMs: performance.now() - releasedAt, failure: 'no-speech' };
        return this.transcribe(wav, releasedAt);
      },
      abort: () => {
        aborted = true;
        this.capture.cancel();
      },
    };
  }

  private async transcribe(wav: Uint8Array, releasedAt: number): Promise<RecognitionOutcome> {
    const elapsed = (): number => performance.now() - releasedAt;
    let response: Response;
    try {
      response = await this.fetchFn(`${this.agentUrl}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav' },
        body: new Blob([wav.slice()], { type: 'audio/wav' }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      // a network failure and a CORS refusal look the same from a page
      return { alternatives: [], recognitionMs: elapsed(), failure: 'agent-unreachable' };
    }
    if (response.status === 503) {
      const outcome: RecognitionOutcome = { alternatives: [], recognitionMs: elapsed(), failure: 'busy' };
      const retryAfter = Number(response.headers.get('Retry-After'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) outcome.retryAfterSeconds = retryAfter;
      return outcome;
    }
    if (!response.ok) return { alternatives: [], recognitionMs: elapsed(), failure: 'other' };

    let body: TranscribeResponse;
    try {
      body = (await response.json()) as TranscribeResponse;
    } catch {
      return { alternatives: [], recognitionMs: elapsed(), failure: 'other' };
    }
    if (body.gated === true) {
      const outcome: RecognitionOutcome = { alternatives: [], recognitionMs: elapsed(), failure: 'no-speech' };
      if (body.reason === 'too-short' || body.reason === 'too-quiet') outcome.gate = body.reason;
      return outcome;
    }
    const text = (body.text ?? '').trim();
    if (text === '') return { alternatives: [], recognitionMs: elapsed(), failure: 'no-speech' };
    return { alternatives: [{ transcript: text }], recognitionMs: elapsed() };
  }
}

/** Whether the local agent answers. Only called when the selector is opened: from a public page it can trigger a browser prompt. */
export async function agentAnswers(agentUrl: string, fetchFn: Fetch = (input, init) => fetch(input, init)): Promise<boolean> {
  try {
    const response = await fetchFn(`${agentUrl}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: unknown };
    return body.ok === true;
  } catch {
    return false;
  }
}
