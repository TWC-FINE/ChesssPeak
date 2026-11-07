import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { voiceAttemptSchema, type CsEventName, type VoiceAttemptPayload, type VoiceInputContext } from '@chessspeak/shared';
import { FakeRecognizer } from '../src/recognizers/fake.js';
import type { SpeechRecognizer } from '../src/recognizers/recognizer.js';

type VoiceElement = HTMLElement & { context?: VoiceInputContext; speech?: SpeechRecognizer; updateComplete: Promise<boolean> };

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const elements: VoiceElement[] = [];
const cleanups: Array<() => void> = [];

beforeAll(async () => {
  await import('../src/mf-voice-input.js');
});

afterEach(() => {
  for (const element of elements.splice(0)) element.remove();
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function listen(name: CsEventName) {
  const seen: Array<Record<string, unknown>> = [];
  const listener = (event: Event): void => void seen.push((event as CustomEvent).detail);
  document.addEventListener(name, listener);
  cleanups.push(() => document.removeEventListener(name, listener));
  return seen;
}

const attempts = () => {
  const seen = listen('cs:voice-attempt');
  return () => seen.map((detail) => detail.attempt as VoiceAttemptPayload);
};

async function mount(speech: SpeechRecognizer | null = new FakeRecognizer()): Promise<VoiceElement> {
  const element = document.createElement('mf-voice-input') as VoiceElement;
  element.context = { v: 1, gameId: 'g1', lang: 'es-CO', recognizer: 'fake', agentUrl: null };
  if (speech !== null) element.speech = speech;
  document.body.append(element);
  elements.push(element);
  await element.updateComplete;
  return element;
}

async function position(element: VoiceElement, over: object = {}): Promise<void> {
  document.dispatchEvent(new CustomEvent('cs:position', { detail: { v: 1, gameId: 'g1', fen: START, plyCount: 0, turn: 'white', yourColor: 'white', ...over } }));
  await element.updateComplete;
}

const button = (element: VoiceElement) => element.querySelector<HTMLButtonElement>('[data-action=talk]');

function press(element: VoiceElement): void {
  button(element)!.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
}

/** A whole utterance: press, release, and wait for the recognizer. */
async function speak(element: VoiceElement): Promise<void> {
  press(element);
  await element.updateComplete;
  button(element)!.dispatchEvent(new Event('pointerup', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve));
  await element.updateComplete;
}

async function says(element: VoiceElement, fake: FakeRecognizer, phrase: string): Promise<void> {
  fake.say(phrase);
  await speak(element);
}

const click = async (element: VoiceElement, action: string): Promise<void> => {
  element.querySelector<HTMLButtonElement>(`[data-action=${action}]`)!.click();
  await element.updateComplete;
};

async function ready() {
  const fake = new FakeRecognizer();
  const element = await mount(fake);
  await position(element);
  return { fake, element };
}

describe('the talk button', () => {
  it('does not appear without a recognizer, and the text box stays', async () => {
    const element = await mount(null);
    await position(element);
    expect(button(element)).toBeNull();
    expect(element.querySelector('input')).not.toBeNull();
  });

  it('keeps the text box next to it', async () => {
    const { element } = await ready();
    expect(button(element)).not.toBeNull();
    expect(element.querySelector('input')!.disabled).toBe(false);
  });

  it('is disabled while it is not your turn, and does not listen', async () => {
    const fake = new FakeRecognizer();
    const element = await mount(fake);
    await position(element, { turn: 'black' });
    expect(button(element)!.disabled).toBe(true);
    press(element);
    expect(fake.listened).toBe(0);
  });

  it('tells the page what it is doing', async () => {
    const statuses = listen('cs:voice-status');
    const { fake, element } = await ready();
    await says(element, fake, 'peón e cuatro');
    expect(statuses.map((status) => status.state)).toEqual(['listening', 'processing', 'awaiting-confirmation']);
  });

  it('stops without a result if the press is cancelled', async () => {
    const seen = attempts();
    const { fake, element } = await ready();
    press(element);
    button(element)!.dispatchEvent(new Event('pointercancel'));
    expect(fake.aborted).toBe(1);
    expect(seen()).toEqual([]);
  });

  it('stops without a result if the page loses focus', async () => {
    const seen = attempts();
    const { fake, element } = await ready();
    press(element);
    window.dispatchEvent(new Event('blur'));
    expect(fake.aborted).toBe(1);
    expect(seen()).toEqual([]);
  });

  it('works from the keyboard, ignoring the repeat of a held key', async () => {
    const candidates = listen('cs:move-candidate');
    const { fake, element } = await ready();
    fake.say('peón e cuatro');
    const key = (type: string, repeat = false) => button(element)!.dispatchEvent(new KeyboardEvent(type, { key: ' ', repeat, bubbles: true, cancelable: true }));
    key('keydown');
    key('keydown', true);
    key('keyup');
    await new Promise((resolve) => setTimeout(resolve));
    expect(fake.listened).toBe(1);
    expect(candidates).toHaveLength(1);
  });
});

describe('confirmation is mandatory (RF8)', () => {
  it('a spoken move is only proposed, with its source', async () => {
    const candidates = listen('cs:move-candidate');
    const confirmed = listen('cs:move-confirmed');
    const { fake, element } = await ready();
    await says(element, fake, 'caballo efe tres');
    expect(candidates).toEqual([{ v: 1, gameId: 'g1', ply: 1, uci: 'g1f3', san: 'Nf3', source: 'voice' }]);
    expect(confirmed).toEqual([]);
    expect(element.querySelector('[data-candidate]')!.textContent).toContain('Nf3');
  });

  it('saying «sí» confirms it', async () => {
    const confirmed = listen('cs:move-confirmed');
    const { fake, element } = await ready();
    await says(element, fake, 'caballo efe tres');
    await says(element, fake, 'sí');
    expect(confirmed).toEqual([{ v: 1, gameId: 'g1', ply: 1, uci: 'g1f3', source: 'voice' }]);
  });

  it('the button confirms it too', async () => {
    const confirmed = listen('cs:move-confirmed');
    const { fake, element } = await ready();
    await says(element, fake, 'caballo efe tres');
    await click(element, 'confirm');
    expect(confirmed).toEqual([{ v: 1, gameId: 'g1', ply: 1, uci: 'g1f3', source: 'voice' }]);
  });

  it.each([['no'], ['cancelar']])('saying «%s» plays nothing', async (word) => {
    const confirmed = listen('cs:move-confirmed');
    const cancelled = listen('cs:move-cancelled');
    const { fake, element } = await ready();
    await says(element, fake, 'caballo efe tres');
    await says(element, fake, word);
    expect(confirmed).toEqual([]);
    expect(cancelled).toEqual([{ v: 1, gameId: 'g1', ply: 1, reason: 'user' }]);
  });

  it('«sí» with nothing to confirm plays nothing', async () => {
    const confirmed = listen('cs:move-confirmed');
    const { fake, element } = await ready();
    await says(element, fake, 'sí');
    expect(confirmed).toEqual([]);
    expect(element.querySelector('[role=status]')!.textContent).toContain('ninguna jugada');
  });

  it('a misheard phrase keeps the move waiting and asks again, without playing it', async () => {
    const confirmed = listen('cs:move-confirmed');
    const cancelled = listen('cs:move-cancelled');
    const { fake, element } = await ready();
    await says(element, fake, 'caballo efe tres');
    await says(element, fake, 'hola qué tal');
    expect(confirmed).toEqual([]);
    expect(cancelled).toEqual([]);
    expect(element.querySelector('[data-candidate]')).not.toBeNull();
    expect(element.querySelector('[role=status]')!.textContent).toContain('No entendí');
  });

  it('a silence keeps the move waiting and says it heard nothing', async () => {
    const { fake, element } = await ready();
    await says(element, fake, 'caballo efe tres');
    await says(element, fake, '');
    expect(element.querySelector('[data-candidate]')).not.toBeNull();
    expect(element.querySelector('[role=status]')!.textContent).toContain('No te oí');
  });

  it('an ambiguous phrase proposes nothing', async () => {
    const candidates = listen('cs:move-candidate');
    const { fake, element } = await ready();
    await says(element, fake, 'caballo');
    expect(candidates).toEqual([]);
    expect(element.querySelector('[role=status]')).not.toBeNull();
  });
});

describe('the telemetry', () => {
  it('is not sent for a move until it is confirmed, and then with accepted: true', async () => {
    const seen = attempts();
    const { fake, element } = await ready();
    await says(element, fake, 'caballo efe tres');
    expect(seen()).toEqual([]);
    await click(element, 'confirm');
    expect(seen()).toHaveLength(1);
    expect(seen()[0]).toMatchObject({ gameId: 'g1', ply: 1, fen: START, lang: 'es-CO', recognizer: 'fake', transcript: 'caballo efe tres', normalized: 'caballo efe tres', resolvedUci: 'g1f3', outcome: 'move', accepted: true, tryIndex: 1, session: 'play' });
    expect(seen()[0]!.latency.recognitionMs).toBe(500);
    expect(seen()[0]!.latency.totalMs).toBeGreaterThanOrEqual(500);
  });

  it.each([
    ['the button', async (element: VoiceElement) => click(element, 'cancel')],
    ['a change of turn', async (element: VoiceElement) => position(element, { fen: AFTER_E4, plyCount: 1, turn: 'black' })],
    [
      'the end of the game',
      async (element: VoiceElement) => {
        document.dispatchEvent(new CustomEvent('cs:game-ended', { detail: { v: 1, gameId: 'g1', result: '1-0', termination: 'resignation' } }));
        await element.updateComplete;
      },
    ],
  ])('sends a dropped move with accepted: false: %s', async (_name, drop) => {
    const seen = attempts();
    const { fake, element } = await ready();
    await says(element, fake, 'caballo efe tres');
    await drop(element);
    expect(seen().map((attempt) => [attempt.outcome, attempt.accepted])).toEqual([['move', false]]);
  });

  it('sends a replaced move with accepted: false, and a new attempt for the second', async () => {
    const seen = attempts();
    const { fake, element } = await ready();
    await says(element, fake, 'caballo efe tres');
    await says(element, fake, 'peón e cuatro');
    await click(element, 'confirm');
    expect(seen().map((attempt) => [attempt.resolvedUci, attempt.accepted, attempt.tryIndex])).toEqual([
      ['g1f3', false, 1],
      ['e2e4', true, 2],
    ]);
  });

  it('sends a spoken move dropped from the text box with accepted: false', async () => {
    const seen = attempts();
    const { fake, element } = await ready();
    await says(element, fake, 'caballo efe tres');
    const form = element.querySelector('form')!;
    (form.elements.namedItem('move') as HTMLInputElement).value = 'cancelar';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(seen().map((attempt) => attempt.accepted)).toEqual([false]);
  });

  it('sends a silence, with an empty transcript', async () => {
    const seen = attempts();
    const { fake, element } = await ready();
    await says(element, fake, '');
    expect(seen()[0]).toMatchObject({ transcript: '', normalized: '', alternatives: [], candidates: [], resolvedUci: null, outcome: 'nomatch', accepted: false });
  });

  it('marks a spoken confirmation as accepted, and the rest of the commands as not', async () => {
    const seen = attempts();
    const { fake, element } = await ready();
    await says(element, fake, 'sí');
    await says(element, fake, 'caballo efe tres');
    await says(element, fake, 'no');
    await says(element, fake, 'caballo efe tres');
    await says(element, fake, 'sí');
    expect(seen().map((attempt) => [attempt.outcome, attempt.accepted])).toEqual([
      ['command', false],
      ['move', false],
      ['command', false],
      ['move', true],
      ['command', true],
    ]);
  });

  it('counts the tries of a ply and starts again on the next one', async () => {
    const seen = attempts();
    const { fake, element } = await ready();
    await says(element, fake, 'hola');
    await says(element, fake, 'qué tal');
    await position(element, { fen: AFTER_E4, plyCount: 1, turn: 'black', yourColor: 'black' });
    await says(element, fake, 'hola');
    expect(seen().map((attempt) => [attempt.ply, attempt.tryIndex])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ]);
  });

  it('measures a phrase recognized after the turn changed, and proposes nothing', async () => {
    const seen = attempts();
    const candidates = listen('cs:move-candidate');
    const { fake, element } = await ready();
    fake.say('caballo efe tres');
    press(element);
    await position(element, { fen: AFTER_E4, plyCount: 1, turn: 'black' });
    button(element)!.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve));
    expect(candidates).toEqual([]);
    expect(seen()[0]).toMatchObject({ fen: START, ply: 1, accepted: false });
  });

  it('sends nothing for what is written in the box', async () => {
    const seen = attempts();
    const { element } = await ready();
    const form = element.querySelector('form')!;
    (form.elements.namedItem('move') as HTMLInputElement).value = 'peón e cuatro';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await element.updateComplete;
    await click(element, 'confirm');
    expect(seen()).toEqual([]);
  });

  it('sends nothing, and explains, when the recognizer fails', async () => {
    const seen = attempts();
    const statuses = listen('cs:voice-status');
    const { fake, element } = await ready();
    fake.fail('not-allowed');
    await speak(element);
    expect(seen()).toEqual([]);
    expect(element.querySelector('[role=status]')!.textContent).toContain('micrófono');
    expect(statuses.at(-1)).toMatchObject({ state: 'error' });
  });

  it('always fits the contract, so the server does not drop it', async () => {
    const seen = attempts();
    const { fake, element } = await ready();
    await says(element, fake, 'caballo efe tres');
    await says(element, fake, 'sí');
    await position(element, { fen: AFTER_E4, plyCount: 1 });
    await says(element, fake, '');
    await says(element, fake, 'caballo');
    expect(seen().length).toBeGreaterThanOrEqual(4);
    for (const attempt of seen()) expect(voiceAttemptSchema.safeParse(attempt).success).toBe(true);
  });

  it('never carries audio', async () => {
    const seen = attempts();
    const { fake, element } = await ready();
    await says(element, fake, 'hola');
    expect(Object.keys(seen()[0]!).sort()).toEqual(['accepted', 'alternatives', 'candidates', 'fen', 'gameId', 'lang', 'latency', 'normalized', 'outcome', 'ply', 'recognizer', 'resolvedUci', 'session', 'transcript', 'tryIndex']);
  });
});

describe('a route change', () => {
  it('drops what was proposed in the previous game', async () => {
    const seen = attempts();
    const cancelled = listen('cs:move-cancelled');
    const { fake, element } = await ready();
    await says(element, fake, 'caballo efe tres');
    element.context = { v: 1, gameId: 'g2', lang: 'es-CO', recognizer: 'fake', agentUrl: null };
    await element.updateComplete;
    expect(cancelled).toEqual([{ v: 1, gameId: 'g1', ply: 1, reason: 'position-changed' }]);
    expect(seen().map((attempt) => [attempt.gameId, attempt.accepted])).toEqual([['g1', false]]);
    expect(element.querySelector('[data-candidate]')).toBeNull();
  });
});
