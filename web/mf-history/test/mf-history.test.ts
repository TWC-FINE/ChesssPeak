import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { HistoryContext } from '@chessspeak/shared';

type HistoryElement = HTMLElement & { context?: HistoryContext; updateComplete: Promise<boolean> };

const elements: HistoryElement[] = [];

beforeAll(async () => {
  await import('../src/mf-history.js');
});

afterEach(() => {
  for (const element of elements.splice(0)) element.remove();
});

async function mount(gameId: string | null = 'g1'): Promise<HistoryElement> {
  const element = document.createElement('mf-history') as HistoryElement;
  element.context = { v: 1, gameId };
  document.body.append(element);
  elements.push(element);
  await element.updateComplete;
  return element;
}

async function applied(element: HistoryElement, ply: number, san: string, gameId = 'g1'): Promise<void> {
  document.dispatchEvent(new CustomEvent('cs:move-applied', { detail: { v: 1, gameId, ply, uci: 'e2e4', san, fen: 'x' } }));
  await element.updateComplete;
}

const rows = (element: HistoryElement) => [...element.querySelectorAll('.csh-row')].map((row) => (row.textContent ?? '').replace(/\s+/g, ' ').trim());

describe('<mf-history>', () => {
  it('registers its tag and renders in light DOM', async () => {
    expect(customElements.get('mf-history')).toBeDefined();
    const element = await mount();
    expect(element.shadowRoot).toBeNull();
  });

  it('says when there is no game, and when no move was played yet', async () => {
    expect((await mount(null)).textContent).toContain('Sin partida');
    expect((await mount('g1')).textContent).toContain('Aún no hay jugadas');
  });

  it('numbers the moves in pairs and shows them in SAN', async () => {
    const element = await mount();
    await applied(element, 1, 'f3');
    await applied(element, 2, 'e5');
    await applied(element, 3, 'g4');
    await applied(element, 4, 'Qh4#');
    expect(rows(element)).toEqual(['1. f3 e5', '2. g4 Qh4#']);
    expect(element.textContent).not.toContain('e2e4');
    expect(element.textContent).not.toContain('Aún no hay jugadas');
  });

  it('shows an unfinished pair with the move of white alone', async () => {
    const element = await mount();
    await applied(element, 1, 'e4');
    expect(rows(element)).toEqual(['1. e4']);
  });

  it('keeps a move once per ply, as the announcements repeat after a (re)join', async () => {
    const element = await mount();
    await applied(element, 1, 'e4');
    await applied(element, 2, 'e5');
    await applied(element, 1, 'e4');
    await applied(element, 2, 'e5');
    expect(rows(element)).toEqual(['1. e4 e5']);
  });

  it('orders the moves by ply, whatever the order they arrive in', async () => {
    const element = await mount();
    await applied(element, 2, 'e5');
    await applied(element, 1, 'e4');
    expect(rows(element)).toEqual(['1. e4 e5']);
  });

  it('marks a missing move instead of moving the others to the wrong side', async () => {
    const element = await mount();
    await applied(element, 2, 'e5');
    expect(rows(element)).toEqual(['1. … e5']);
  });

  it('marks only the last move', async () => {
    const element = await mount();
    await applied(element, 1, 'e4');
    await applied(element, 2, 'e5');
    expect([...element.querySelectorAll('[data-last]')].map((move) => move.textContent)).toEqual(['e5']);
  });

  it('ignores the moves of another game', async () => {
    const element = await mount();
    await applied(element, 1, 'Nf3', 'other');
    expect(rows(element)).toEqual([]);
    expect(element.textContent).not.toContain('Nf3');
  });

  it('ignores every move when there is no game', async () => {
    const element = await mount(null);
    await applied(element, 1, 'Nf3');
    expect(rows(element)).toEqual([]);
  });

  it('empties when the game changes', async () => {
    const element = await mount();
    await applied(element, 1, 'e4');
    element.context = { v: 1, gameId: 'g2' };
    await element.updateComplete;
    expect(rows(element)).toEqual([]);
    expect(element.textContent).toContain('Aún no hay jugadas');
  });

  it('keeps the first move of a new game announced right after the context changes', async () => {
    const element = await mount();
    await applied(element, 1, 'e4');
    element.context = { v: 1, gameId: 'g2' };
    await applied(element, 1, 'd4', 'g2');
    expect(rows(element)).toEqual(['1. d4']);
  });

  it('keeps the moves when the shell sends a new context for the same game', async () => {
    const element = await mount();
    await applied(element, 1, 'e4');
    element.context = { v: 1, gameId: 'g1' };
    await element.updateComplete;
    expect(rows(element)).toEqual(['1. e4']);
  });

  it('stops listening when it is removed', async () => {
    const element = await mount();
    element.remove();
    await applied(element, 1, 'e4');
    expect(rows(element)).toEqual([]);
  });
});
