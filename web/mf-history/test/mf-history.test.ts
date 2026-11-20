import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { HistoryContext } from '@chessspeak/shared';

type HistoryElement = HTMLElement & { context?: HistoryContext; updateComplete: Promise<boolean>; pgn(now?: Date): string };

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

describe('<mf-history> PGN export', () => {
  const ended = async (element: HistoryElement, result: string, gameId = 'g1') => {
    document.dispatchEvent(new CustomEvent('cs:game-ended', { detail: { v: 1, gameId, result, termination: 'checkmate' } }));
    await element.updateComplete;
  };
  const movetext = (element: HistoryElement) => element.pgn(new Date(2026, 10, 20)).split('\n\n')[1]!.trim();
  const button = (element: HistoryElement, action: string) => element.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);

  it('offers the export only once there are moves', async () => {
    const element = await mount();
    expect(button(element, 'copy-pgn')).toBeNull();
    await applied(element, 1, 'e4');
    expect(button(element, 'copy-pgn')?.textContent).toBe('Copiar PGN');
    expect(button(element, 'download-pgn')?.textContent).toBe('Descargar .pgn');
  });

  it('writes the moves so far and the result once the game ends', async () => {
    const element = await mount();
    await applied(element, 1, 'f3');
    await applied(element, 2, 'e5');
    expect(movetext(element)).toBe('1. f3 e5 *');
    await applied(element, 3, 'g4');
    await applied(element, 4, 'Qh4#');
    await ended(element, '0-1');
    expect(movetext(element)).toBe('1. f3 e5 2. g4 Qh4# 0-1');
  });

  it('stops at the first move that has not arrived', async () => {
    const element = await mount();
    await applied(element, 1, 'e4');
    await applied(element, 3, 'Nf3');
    expect(movetext(element)).toBe('1. e4 *');
  });

  it('ignores the end of another game, and forgets the result with the game', async () => {
    const element = await mount();
    await applied(element, 1, 'e4');
    await ended(element, '1-0', 'other');
    expect(movetext(element)).toBe('1. e4 *');
    await ended(element, '1-0');
    element.context = { v: 1, gameId: 'g2' };
    await applied(element, 1, 'd4', 'g2');
    expect(movetext(element)).toBe('1. d4 *');
  });

  it('copies the PGN and says so, or points to the download when it cannot', async () => {
    const element = await mount();
    await applied(element, 1, 'e4');
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => void copied.push(text) } });
    button(element, 'copy-pgn')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await element.updateComplete;
    expect(copied[0]).toContain('1. e4 *');
    expect(element.querySelector('[role="status"]')?.textContent).toBe('PGN copiado.');

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => Promise.reject(new Error('denied')) } });
    button(element, 'copy-pgn')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await element.updateComplete;
    expect(element.querySelector('[role="status"]')?.textContent).toContain('No se pudo copiar');
  });

  it('downloads a .pgn file named after the date', async () => {
    const element = await mount();
    await applied(element, 1, 'e4');
    const names: string[] = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      names.push(this.download);
    };
    try {
      button(element, 'download-pgn')!.click();
    } finally {
      HTMLAnchorElement.prototype.click = click;
    }
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^chessspeak-\d{4}-\d{2}-\d{2}\.pgn$/);
  });
});

describe('<mf-history> review of a finished game', () => {
  const ended = async (element: HistoryElement) => {
    document.dispatchEvent(new CustomEvent('cs:game-ended', { detail: { v: 1, gameId: 'g1', result: '1-0', termination: 'resignation' } }));
    await element.updateComplete;
  };
  const press = async (element: HistoryElement, selector: string) => {
    element.querySelector<HTMLButtonElement>(selector)!.click();
    await element.updateComplete;
  };
  const reviews: unknown[] = [];
  const onReview = (event: Event) => void reviews.push((event as CustomEvent).detail);

  afterEach(() => {
    document.removeEventListener('cs:review', onReview);
    reviews.length = 0;
  });

  async function finished(): Promise<HistoryElement> {
    document.addEventListener('cs:review', onReview);
    const element = await mount();
    for (const [ply, san] of [[1, 'e4'], [2, 'e5'], [3, 'Nf3']] as const) await applied(element, ply, san);
    return element;
  }

  it('offers nothing while the game is being played', async () => {
    const element = await finished();
    expect(element.querySelector('[data-action="review-back"]')).toBeNull();
    expect(element.querySelector('button.csh-san')).toBeNull();
  });

  it('opens the position of a move, and of the one before or after it', async () => {
    const element = await finished();
    await ended(element);
    expect(element.querySelector('.csh-review-note')?.textContent).toContain('Toca una jugada');
    await press(element, 'button[data-ply="1"]');
    expect(element.querySelector('[data-current]')?.textContent).toBe('e4');
    expect(element.querySelector('[data-last]')).toBeNull();
    expect(element.querySelector('.csh-review-note')?.textContent).toBe('Jugada 1 de 3');
    await press(element, '[data-action="review-back"]');
    expect(element.querySelector<HTMLButtonElement>('[data-action="review-start"]')?.disabled).toBe(true);
    await press(element, '[data-action="review-forward"]');
    await press(element, '[data-action="review-forward"]');
    await press(element, '[data-action="review-forward"]');
    expect(reviews).toEqual([1, 0, 1, 2, null].map((ply) => ({ v: 1, gameId: 'g1', ply })));
    expect(element.querySelector('[data-last]')?.textContent).toBe('Nf3');
    expect(element.querySelector<HTMLButtonElement>('[data-action="review-end"]')?.disabled).toBe(true);
  });

  it('goes back to the final position from the last move or the end button', async () => {
    const element = await finished();
    await ended(element);
    await press(element, '[data-action="review-start"]');
    await press(element, '[data-action="review-end"]');
    await press(element, 'button[data-ply="2"]');
    await press(element, 'button[data-ply="3"]');
    expect(reviews.map((detail) => (detail as { ply: number | null }).ply)).toEqual([0, null, 2, null]);
  });

  it('starts at the final position again in another game', async () => {
    const element = await finished();
    await ended(element);
    await press(element, 'button[data-ply="1"]');
    element.context = { v: 1, gameId: 'g2' };
    await element.updateComplete;
    element.context = { v: 1, gameId: 'g1' };
    await element.updateComplete;
    expect(element.querySelector('[data-current]')).toBeNull();
    expect(element.querySelector('.csh-review')).toBeNull();
  });
});
