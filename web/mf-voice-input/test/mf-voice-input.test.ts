import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { CsEventName, VoiceInputContext } from '@chessspeak/shared';

type VoiceElement = HTMLElement & { context?: VoiceInputContext; updateComplete: Promise<boolean> };

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

async function mount(gameId: string | null = 'g1'): Promise<VoiceElement> {
  const element = document.createElement('mf-voice-input') as VoiceElement;
  element.context = { v: 1, gameId, lang: 'es-CO', recognizer: 'text', agentUrl: null };
  document.body.append(element);
  elements.push(element);
  await element.updateComplete;
  return element;
}

async function position(element: VoiceElement, over: object = {}): Promise<void> {
  document.dispatchEvent(new CustomEvent('cs:position', { detail: { v: 1, gameId: 'g1', fen: START, plyCount: 0, turn: 'white', yourColor: 'white', ...over } }));
  await element.updateComplete;
}

async function type(element: VoiceElement, text: string): Promise<void> {
  const form = element.querySelector('form')!;
  (form.elements.namedItem('move') as HTMLInputElement).value = text;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await element.updateComplete;
}

const click = async (element: VoiceElement, action: string): Promise<void> => {
  element.querySelector<HTMLButtonElement>(`[data-action=${action}]`)!.click();
  await element.updateComplete;
};
const inputOf = (element: VoiceElement) => element.querySelector('input')!;

describe('<mf-voice-input>', () => {
  it('registers its tag', () => {
    expect(customElements.get('mf-voice-input')).toBeDefined();
  });

  it('receives its context through the context property and renders in light DOM', async () => {
    const element = document.createElement('mf-voice-input') as HTMLElement & { context?: VoiceInputContext; updateComplete: Promise<boolean> };
    document.body.append(element);
    element.context = { v: 1, gameId: 'g', lang: 'es-CO', recognizer: 'webspeech', agentUrl: null };
    await element.updateComplete;
    expect(element.shadowRoot).toBeNull();
    expect(element.textContent).toContain('es-CO');
    // the default release delay comes from shared (ADR 5)
    expect(element.textContent).toContain('400 ms');
    element.context = { v: 1, gameId: 'g', lang: 'es-CO', recognizer: 'webspeech', agentUrl: null, releaseDelayMs: 250 };
    await element.updateComplete;
    expect(element.textContent).toContain('250 ms');
    element.remove();
  });
});

describe('when the box can be used', () => {
  it('is disabled until a position arrives', async () => {
    const element = await mount();
    expect(inputOf(element).disabled).toBe(true);
    await position(element);
    expect(inputOf(element).disabled).toBe(false);
  });

  it('is disabled while it is not your turn', async () => {
    const element = await mount();
    await position(element, { turn: 'black' });
    expect(inputOf(element).disabled).toBe(true);
  });

  it('ignores the position of another game', async () => {
    const element = await mount();
    await position(element, { gameId: 'other' });
    expect(inputOf(element).disabled).toBe(true);
  });

  it('is disabled when the game ends, dropping a pending candidate', async () => {
    const cancelled = listen('cs:move-cancelled');
    const element = await mount();
    await position(element);
    await type(element, 'peón e cuatro');
    document.dispatchEvent(new CustomEvent('cs:game-ended', { detail: { v: 1, gameId: 'g1', result: '1-0', termination: 'resignation' } }));
    await element.updateComplete;
    expect(inputOf(element).disabled).toBe(true);
    expect(cancelled).toEqual([{ v: 1, gameId: 'g1', ply: 1, reason: 'game-ended' }]);
  });
});

describe('text → parser → candidate → confirmation', () => {
  it('proposes the move and does not confirm it by itself (RF8)', async () => {
    const candidates = listen('cs:move-candidate');
    const confirmed = listen('cs:move-confirmed');
    const element = await mount();
    await position(element);
    await type(element, 'caballo efe tres');

    expect(candidates).toEqual([{ v: 1, gameId: 'g1', ply: 1, uci: 'g1f3', san: 'Nf3', source: 'text' }]);
    expect(confirmed).toEqual([]);
    expect(element.textContent).toContain('Nf3');
    expect(inputOf(element).value).toBe('');
  });

  it('confirms with the button', async () => {
    const confirmed = listen('cs:move-confirmed');
    const element = await mount();
    await position(element);
    await type(element, 'caballo efe tres');
    await click(element, 'confirm');
    expect(confirmed).toEqual([{ v: 1, gameId: 'g1', ply: 1, uci: 'g1f3', source: 'text' }]);
    expect(element.querySelector('[data-candidate]')).toBeNull();
  });

  it('confirms by writing «sí»', async () => {
    const confirmed = listen('cs:move-confirmed');
    const element = await mount();
    await position(element);
    await type(element, 'caballo efe tres');
    await type(element, 'sí');
    expect(confirmed).toHaveLength(1);
  });

  it.each([['no'], ['cancelar']])('cancels by writing «%s»', async (word) => {
    const cancelled = listen('cs:move-cancelled');
    const confirmed = listen('cs:move-confirmed');
    const element = await mount();
    await position(element);
    await type(element, 'caballo efe tres');
    await type(element, word);
    expect(cancelled).toEqual([{ v: 1, gameId: 'g1', ply: 1, reason: 'user' }]);
    expect(confirmed).toEqual([]);
  });

  it('cancels with the button', async () => {
    const cancelled = listen('cs:move-cancelled');
    const element = await mount();
    await position(element);
    await type(element, 'caballo efe tres');
    await click(element, 'cancel');
    expect(cancelled).toHaveLength(1);
  });

  it('replaces the candidate when another move is written', async () => {
    const candidates = listen('cs:move-candidate');
    const cancelled = listen('cs:move-cancelled');
    const element = await mount();
    await position(element);
    await type(element, 'caballo efe tres');
    await type(element, 'peón e cuatro');
    expect(cancelled).toHaveLength(1);
    expect(candidates.map((c) => c.uci)).toEqual(['g1f3', 'e2e4']);
  });

  it('proposes nothing for text it does not understand', async () => {
    const candidates = listen('cs:move-candidate');
    const element = await mount();
    await position(element);
    await type(element, 'hola qué tal');
    expect(candidates).toEqual([]);
    expect(element.querySelector('[role=status]')?.textContent).toContain('No entendí');
  });

  it('does not confirm when there is nothing to confirm', async () => {
    const confirmed = listen('cs:move-confirmed');
    const element = await mount();
    await position(element);
    await type(element, 'sí');
    expect(confirmed).toEqual([]);
    expect(element.querySelector('[role=status]')?.textContent).toContain('ninguna jugada');
  });

  it('uses the current position to resolve the text', async () => {
    const candidates = listen('cs:move-candidate');
    const element = await mount();
    await position(element, { fen: AFTER_E4, plyCount: 1, turn: 'black', yourColor: 'black' });
    await type(element, 'peón e cinco');
    expect(candidates).toEqual([{ v: 1, gameId: 'g1', ply: 2, uci: 'e7e5', san: 'e5', source: 'text' }]);
  });

  it('drops a candidate when the position changes under it', async () => {
    const cancelled = listen('cs:move-cancelled');
    const element = await mount();
    await position(element);
    await type(element, 'peón e cuatro');
    await position(element, { fen: AFTER_E4, plyCount: 1, turn: 'black' });
    expect(cancelled).toEqual([{ v: 1, gameId: 'g1', ply: 1, reason: 'position-changed' }]);
    expect(element.querySelector('[data-candidate]')).toBeNull();
  });

  it('keeps the candidate when the same position is announced again', async () => {
    const cancelled = listen('cs:move-cancelled');
    const element = await mount();
    await position(element);
    await type(element, 'peón e cuatro');
    await position(element);
    expect(cancelled).toEqual([]);
    expect(element.querySelector('[data-candidate]')).not.toBeNull();
  });
});
