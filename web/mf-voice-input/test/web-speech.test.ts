import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSpeechRecognizer } from '../src/recognizers/web-speech.js';
import { createRecognizer } from '../src/recognizers/create.js';

class FakeSpeechRecognition {
  static last: FakeSpeechRecognition;
  lang = '';
  continuous = true;
  interimResults = true;
  maxAlternatives = 0;
  started = 0;
  stopped = 0;
  aborted = 0;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeSpeechRecognition.last = this;
  }
  start(): void {
    this.started += 1;
  }
  stop(): void {
    this.stopped += 1;
  }
  abort(): void {
    this.aborted += 1;
  }
  hear(...segments: Array<Array<{ transcript: string; confidence: number }>>): void {
    this.onresult?.({ results: segments });
  }
}

const windowWithSpeech = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
const recognizer = (releaseDelayMs = 400) => new WebSpeechRecognizer({ lang: 'es-CO', releaseDelayMs });

beforeEach(() => {
  vi.useFakeTimers();
  windowWithSpeech.SpeechRecognition = FakeSpeechRecognition;
});

afterEach(() => {
  vi.useRealTimers();
  delete windowWithSpeech.SpeechRecognition;
  delete windowWithSpeech.webkitSpeechRecognition;
});

describe('WebSpeechRecognizer', () => {
  it('asks for es-CO, one final phrase and the same alternatives as the spike', () => {
    recognizer().listen();
    const { last } = FakeSpeechRecognition;
    expect(last).toMatchObject({ lang: 'es-CO', continuous: false, interimResults: false, maxAlternatives: 5, started: 1 });
  });

  it('does not call stop() until 400 ms after the release (ADR 5)', () => {
    const session = recognizer().listen();
    void session.release();
    const { last } = FakeSpeechRecognition;
    vi.advanceTimersByTime(399);
    expect(last.stopped).toBe(0);
    vi.advanceTimersByTime(1);
    expect(last.stopped).toBe(1);
  });

  it('takes the delay from its options', () => {
    const session = recognizer(250).listen();
    void session.release();
    vi.advanceTimersByTime(249);
    expect(FakeSpeechRecognition.last.stopped).toBe(0);
    vi.advanceTimersByTime(1);
    expect(FakeSpeechRecognition.last.stopped).toBe(1);
  });

  it('returns the alternatives and the time from the release to the result, delay included', async () => {
    const session = recognizer().listen();
    const outcome = session.release();
    const { last } = FakeSpeechRecognition;
    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(150);
    last.hear([
      { transcript: 'peón e cuatro', confidence: 0.9 },
      { transcript: 'peón de cuatro', confidence: 0.4 },
    ]);
    last.onend?.();
    await expect(outcome).resolves.toEqual({
      alternatives: [
        { transcript: 'peón e cuatro', confidence: 0.9 },
        { transcript: 'peón de cuatro', confidence: 0.4 },
      ],
      recognitionMs: 550,
    });
  });

  it('glues a phrase split in two segments', async () => {
    const session = recognizer().listen();
    const outcome = session.release();
    const { last } = FakeSpeechRecognition;
    last.hear([{ transcript: 'caballo ', confidence: 0.8 }], [{ transcript: ' efe tres', confidence: 0.6 }]);
    last.onend?.();
    const { alternatives } = await outcome;
    expect(alternatives[0]!.transcript).toBe('caballo efe tres');
    expect(alternatives[0]!.confidence).toBeCloseTo(0.7);
  });

  it('survives the release coming before anything was heard', async () => {
    const session = recognizer().listen();
    const outcome = session.release();
    const { last } = FakeSpeechRecognition;
    last.onerror?.({ error: 'no-speech' });
    last.onend?.();
    await expect(outcome).resolves.toMatchObject({ alternatives: [], failure: 'no-speech' });
  });

  it('waits for the release when the recognizer ends by itself first', async () => {
    const session = recognizer().listen();
    const { last } = FakeSpeechRecognition;
    last.hear([{ transcript: 'peón e cuatro', confidence: 0.9 }]);
    last.onend?.();
    vi.advanceTimersByTime(1000);
    const outcome = await session.release();
    expect(outcome.alternatives[0]!.transcript).toBe('peón e cuatro');
    expect(outcome.recognitionMs).toBe(0);
    expect(last.stopped).toBe(0);
  });

  it.each([
    ['no-speech', 'no-speech'],
    ['aborted', 'aborted'],
    ['not-allowed', 'not-allowed'],
    ['service-not-allowed', 'not-allowed'],
    ['audio-capture', 'not-allowed'],
    ['network', 'network'],
    ['language-not-supported', 'other'],
  ])('maps the error %s to %s', async (error, failure) => {
    const session = recognizer().listen();
    const outcome = session.release();
    const { last } = FakeSpeechRecognition;
    last.onerror?.({ error });
    last.onend?.();
    await expect(outcome).resolves.toMatchObject({ failure });
  });

  it('gives up on a recognizer that never ends', async () => {
    const session = recognizer().listen();
    const outcome = session.release();
    vi.advanceTimersByTime(10_400);
    await expect(outcome).resolves.toMatchObject({ alternatives: [], failure: 'other' });
  });

  it('reports a start that throws, without rejecting', async () => {
    const start = vi.spyOn(FakeSpeechRecognition.prototype, 'start').mockImplementation(() => {
      throw new Error('InvalidStateError');
    });
    const session = recognizer().listen();
    await expect(session.release()).resolves.toMatchObject({ failure: 'other' });
    start.mockRestore();
  });

  it('aborts the recognition', () => {
    recognizer().listen().abort();
    expect(FakeSpeechRecognition.last.aborted).toBe(1);
  });

  it('uses the prefixed name of Chrome and Edge', () => {
    delete windowWithSpeech.SpeechRecognition;
    windowWithSpeech.webkitSpeechRecognition = FakeSpeechRecognition;
    expect(recognizer().isAvailable()).toBe(true);
  });

  it('knows when the browser has no Web Speech', async () => {
    delete windowWithSpeech.SpeechRecognition;
    const speech = recognizer();
    expect(speech.isAvailable()).toBe(false);
    await expect(speech.listen().release()).resolves.toMatchObject({ failure: 'unavailable' });
  });
});

describe('createRecognizer', () => {
  it('builds Web Speech with the delay of shared by default, and nothing for the text box', () => {
    const context = { v: 1, gameId: null, lang: 'es-CO', agentUrl: null } as const;
    expect(createRecognizer({ ...context, recognizer: 'webspeech' })?.name).toBe('webspeech');
    expect(createRecognizer({ ...context, recognizer: 'text' })).toBeUndefined();
    expect(createRecognizer(undefined)).toBeUndefined();

    const session = createRecognizer({ ...context, recognizer: 'webspeech' })!.listen();
    void session.release();
    vi.advanceTimersByTime(399);
    expect(FakeSpeechRecognition.last.stopped).toBe(0);
    vi.advanceTimersByTime(1);
    expect(FakeSpeechRecognition.last.stopped).toBe(1);
  });
});
