import { describe, expect, it, vi } from 'vitest';
import type { AudioCapture } from '../src/recognizers/capture.js';
import { concatChunks, downsample, encodeWav } from '../src/recognizers/wav.js';
import { agentAnswers, WhisperRecognizer } from '../src/recognizers/whisper.js';

const WAV = new Uint8Array([82, 73, 70, 70]);

function fakeCapture(over: Partial<AudioCapture> = {}) {
  const capture = {
    isSupported: vi.fn(() => true),
    enable: vi.fn(() => Promise.resolve()),
    begin: vi.fn(),
    end: vi.fn(() => Promise.resolve<Uint8Array | undefined>(WAV)),
    cancel: vi.fn(),
    disable: vi.fn(),
    ...over,
  };
  return capture;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });

function whisper(fetchFn: typeof fetch, capture: AudioCapture = fakeCapture()) {
  return new WhisperRecognizer({ agentUrl: 'http://127.0.0.1:8765', releaseDelayMs: 400, capture, fetchFn });
}

describe('WhisperRecognizer', () => {
  it('sends the WAV to /transcribe and returns the text', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(json({ text: ' caballo efe tres ', gated: false, ms: 2900 })));
    const outcome = await whisper(fetchFn).listen().release();
    expect(outcome.alternatives).toEqual([{ transcript: 'caballo efe tres' }]);
    expect(outcome.failure).toBeUndefined();
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:8765/transcribe');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'audio/wav' } });
    expect((init!.body as Blob).type).toBe('audio/wav');
    expect((init!.body as Blob).size).toBe(WAV.length);
  });

  it('records with the tail of the spike: its 250 ms plus the 400 ms of run B', async () => {
    const capture = fakeCapture();
    await whisper(vi.fn(() => Promise.resolve(json({ text: 'x' }))), capture).listen().release();
    expect(capture.begin).toHaveBeenCalledTimes(1);
    expect(capture.end).toHaveBeenCalledWith(400);
  });

  it.each([
    ['too-quiet', 'too-quiet'],
    ['too-short', 'too-short'],
  ])('reports a clip stopped by the agent for being %s as a silence', async (reason, gate) => {
    const outcome = await whisper(vi.fn(() => Promise.resolve(json({ text: '', gated: true, reason })))).listen().release();
    expect(outcome).toMatchObject({ alternatives: [], failure: 'no-speech', gate });
  });

  it('treats an empty text as a silence', async () => {
    const outcome = await whisper(vi.fn(() => Promise.resolve(json({ text: '  ', gated: false })))).listen().release();
    expect(outcome).toMatchObject({ alternatives: [], failure: 'no-speech' });
    expect(outcome.gate).toBeUndefined();
  });

  it('does not call the agent when nothing was recorded', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const outcome = await whisper(fetchFn, fakeCapture({ end: vi.fn(() => Promise.resolve(undefined)) })).listen().release();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(outcome.failure).toBe('no-speech');
  });

  it('reads Retry-After from a 503', async () => {
    const outcome = await whisper(vi.fn(() => Promise.resolve(json({ error: 'ocupado' }, 503, { 'Retry-After': '7' })))).listen().release();
    expect(outcome).toMatchObject({ failure: 'busy', retryAfterSeconds: 7 });
  });

  it('accepts a 503 without a usable Retry-After', async () => {
    const outcome = await whisper(vi.fn(() => Promise.resolve(json({ error: 'ocupado' }, 503)))).listen().release();
    expect(outcome.failure).toBe('busy');
    expect(outcome.retryAfterSeconds).toBeUndefined();
  });

  it('reports a network failure or a CORS refusal, without rejecting', async () => {
    const outcome = await whisper(vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))).listen().release();
    expect(outcome.failure).toBe('agent-unreachable');
  });

  it.each([[413], [415], [500], [502]])('reports a %i as a failure', async (status) => {
    const outcome = await whisper(vi.fn(() => Promise.resolve(json({ error: 'x' }, status)))).listen().release();
    expect(outcome.failure).toBe('other');
  });

  it('reports an answer that is not JSON as a failure', async () => {
    const outcome = await whisper(vi.fn(() => Promise.resolve(new Response('<html>')))).listen().release();
    expect(outcome.failure).toBe('other');
  });

  it('reports a refused microphone, without calling the agent', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const outcome = await whisper(fetchFn, fakeCapture({ enable: vi.fn(() => Promise.reject(new Error('NotAllowedError'))) })).listen().release();
    expect(outcome.failure).toBe('not-allowed');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('does not start recording if it was aborted while asking for the microphone', async () => {
    const capture = fakeCapture();
    const session = whisper(vi.fn(), capture).listen();
    session.abort();
    await Promise.resolve();
    await Promise.resolve();
    expect(capture.cancel).toHaveBeenCalledTimes(1);
    expect(capture.begin).not.toHaveBeenCalled();
  });

  it('knows when the browser cannot record, and closes the microphone when replaced', () => {
    const capture = fakeCapture({ isSupported: vi.fn(() => false) });
    const speech = whisper(vi.fn(), capture);
    expect(speech.isAvailable()).toBe(false);
    speech.dispose();
    expect(capture.disable).toHaveBeenCalledTimes(1);
  });
});

describe('agentAnswers', () => {
  it('is true only when /health says ok', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(json({ ok: true })));
    await expect(agentAnswers('http://127.0.0.1:8765', fetchFn)).resolves.toBe(true);
    expect(fetchFn.mock.calls[0]![0]).toBe('http://127.0.0.1:8765/health');
    await expect(agentAnswers('http://a', vi.fn(() => Promise.resolve(json({ ok: false }))))).resolves.toBe(false);
    await expect(agentAnswers('http://a', vi.fn(() => Promise.resolve(json({}, 500))))).resolves.toBe(false);
    await expect(agentAnswers('http://a', vi.fn(() => Promise.reject(new TypeError('blocked'))))).resolves.toBe(false);
  });
});

describe('the WAV', () => {
  it('is 16-bit mono PCM at the given rate', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]), 16000);
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
  });

  it('joins the chunks and lowers the rate', () => {
    expect([...concatChunks([new Float32Array([1]), new Float32Array([2, 3])])]).toEqual([1, 2, 3]);
    expect(downsample(new Float32Array(48), 48000, 16000)).toHaveLength(16);
  });
});
