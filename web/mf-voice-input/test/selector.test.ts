import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceInputContext } from '@chessspeak/shared';
import { FakeRecognizer } from '../src/recognizers/fake.js';
import type { SpeechRecognizer } from '../src/recognizers/recognizer.js';

type VoiceElement = HTMLElement & { context?: VoiceInputContext; speech?: SpeechRecognizer; updateComplete: Promise<boolean> };

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AGENT = 'http://127.0.0.1:8765';
const globals = globalThis as unknown as { AudioContext?: unknown; AudioWorkletNode?: unknown };
const elements: VoiceElement[] = [];
const speechWindow = window as unknown as { SpeechRecognition?: unknown };
let fetchMock: ReturnType<typeof vi.fn>;

class SilentRecognition {
  start(): void {}
  stop(): void {}
  abort(): void {}
}

beforeAll(async () => {
  await import('../src/mf-voice-input.js');
});

beforeEach(() => {
  speechWindow.SpeechRecognition = SilentRecognition;
  fetchMock = vi.fn(() => Promise.resolve(new Response('{"ok":true}')));
  vi.stubGlobal('fetch', fetchMock);
  // what WhisperRecognizer looks for; the capture itself is tested in the e2e
  globals.AudioContext = class {};
  globals.AudioWorkletNode = class {};
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true });
});

afterEach(() => {
  for (const element of elements.splice(0)) element.remove();
  delete speechWindow.SpeechRecognition;
  delete globals.AudioContext;
  delete globals.AudioWorkletNode;
  vi.unstubAllGlobals();
});

async function mount(agentUrl: string | null = AGENT, recognizer: VoiceInputContext['recognizer'] = 'webspeech'): Promise<VoiceElement> {
  const element = document.createElement('mf-voice-input') as VoiceElement;
  element.context = { v: 1, gameId: 'g1', lang: 'es-CO', recognizer, agentUrl };
  document.body.append(element);
  elements.push(element);
  await element.updateComplete;
  return element;
}

const opener = (element: VoiceElement) => element.querySelector<HTMLButtonElement>('[data-action=choose-recognizer]');
const whisperOption = (element: VoiceElement) => element.querySelector<HTMLInputElement>('input[value=whisper]');

async function open(element: VoiceElement): Promise<void> {
  opener(element)!.click();
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve));
  await element.updateComplete;
}

async function chooseWhisper(element: VoiceElement): Promise<void> {
  const option = whisperOption(element)!;
  option.checked = true;
  option.dispatchEvent(new Event('change', { bubbles: true }));
  await element.updateComplete;
}

describe('the recognizer selector', () => {
  it('does not appear without PUBLIC_AGENT_URL', async () => {
    const element = await mount(null);
    expect(opener(element)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not appear when the context only uses the text box', async () => {
    expect(opener(await mount(AGENT, 'text'))).toBeNull();
  });

  it('does not ask the agent until it is opened', async () => {
    const element = await mount();
    await new Promise((resolve) => setTimeout(resolve));
    expect(opener(element)).not.toBeNull();
    expect(opener(element)!.textContent).toContain('Web Speech');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks /health once on opening, and not on closing', async () => {
    const element = await mount();
    await open(element);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(`${AGENT}/health`);
    opener(element)!.click();
    await element.updateComplete;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks again each time it is opened, since the agent may have started', async () => {
    const element = await mount();
    await open(element);
    opener(element)!.click();
    await element.updateComplete;
    await open(element);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('declares the latency of Whisper', async () => {
    const element = await mount();
    await open(element);
    const latency = element.querySelector('[data-whisper-latency]')!.textContent;
    expect(latency).toContain('2,91 s');
    expect(latency).toContain('3,06 s');
    expect(latency).toContain('solo de inferencia');
  });

  it('offers Whisper when the agent answers', async () => {
    const element = await mount();
    await open(element);
    expect(whisperOption(element)!.disabled).toBe(false);
    expect(element.querySelector('[data-agent-state]')!.textContent).toContain('disponible');
  });

  it('does not offer Whisper when the agent does not answer, and says why', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('blocked')));
    const element = await mount();
    await open(element);
    expect(whisperOption(element)!.disabled).toBe(true);
    expect(element.querySelector('[data-agent-down]')!.textContent).toContain(AGENT);
  });

  it('changes the recognizer when Whisper is chosen, and keeps Web Speech by default', async () => {
    const element = await mount();
    expect(element.querySelector('.csv-root > .csv-info')!.textContent).toContain('webspeech');
    await open(element);
    await chooseWhisper(element);
    expect(opener(element)!.textContent).toContain('Whisper local');
    expect(element.querySelector('.csv-root > .csv-info')!.textContent).toContain('whisper');
    expect(element.querySelector('[data-action=talk]')).not.toBeNull();
  });

  it('keeps the choice when the shell sends a new context', async () => {
    const element = await mount();
    await open(element);
    await chooseWhisper(element);
    element.context = { v: 1, gameId: 'g1', lang: 'es-CO', recognizer: 'webspeech', agentUrl: AGENT };
    await element.updateComplete;
    expect(opener(element)!.textContent).toContain('Whisper local');
  });

  it('cannot be changed while listening', async () => {
    const element = await mount();
    document.dispatchEvent(new CustomEvent('cs:position', { detail: { v: 1, gameId: 'g1', fen: START, plyCount: 0, turn: 'white', yourColor: 'white' } }));
    await element.updateComplete;
    element.querySelector('[data-action=talk]')!.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    await element.updateComplete;
    expect(opener(element)!.disabled).toBe(true);
  });
});

describe('the messages of the local agent', () => {
  async function outcomeOf(prepare: (fake: FakeRecognizer) => void) {
    const fake = new FakeRecognizer();
    prepare(fake);
    const element = document.createElement('mf-voice-input') as VoiceElement;
    element.context = { v: 1, gameId: 'g1', lang: 'es-CO', recognizer: 'fake', agentUrl: null };
    element.speech = fake;
    document.body.append(element);
    elements.push(element);
    await element.updateComplete;
    document.dispatchEvent(new CustomEvent('cs:position', { detail: { v: 1, gameId: 'g1', fen: START, plyCount: 0, turn: 'white', yourColor: 'white' } }));
    await element.updateComplete;
    const talk = element.querySelector('[data-action=talk]')!;
    talk.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    await element.updateComplete;
    element.querySelector('[data-action=talk]')!.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve));
    await element.updateComplete;
    return element.querySelector('[role=status]')!.textContent;
  }

  it('asks to wait what Retry-After says', async () => {
    const message = await outcomeOf((fake) => fake.answer({ alternatives: [], recognitionMs: 0, failure: 'busy', retryAfterSeconds: 7 }));
    expect(message).toContain('ocupado');
    expect(message).toContain('7 s');
  });

  it('asks to wait a little without Retry-After', async () => {
    expect(await outcomeOf((fake) => fake.answer({ alternatives: [], recognitionMs: 0, failure: 'busy' }))).toContain('unos segundos');
  });

  it('explains an unreachable agent, including a browser that blocks it', async () => {
    const message = await outcomeOf((fake) => fake.answer({ alternatives: [], recognitionMs: 0, failure: 'agent-unreachable' }));
    expect(message).toContain('agente local');
    expect(message).toContain('web pública');
  });

  it('asks to speak closer after a clip too quiet', async () => {
    expect(await outcomeOf((fake) => fake.answer({ alternatives: [], recognitionMs: 0, failure: 'no-speech', gate: 'too-quiet' }))).toContain('más cerca');
  });

  it('asks to hold the button after a clip too short', async () => {
    expect(await outcomeOf((fake) => fake.answer({ alternatives: [], recognitionMs: 0, failure: 'no-speech', gate: 'too-short' }))).toContain('Mantén pulsado');
  });
});
