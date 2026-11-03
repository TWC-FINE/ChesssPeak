import { beforeAll, describe, expect, it } from 'vitest';
import type { HistoryContext } from '@chessspeak/shared';

beforeAll(async () => {
  await import('../src/mf-history.js');
});

describe('<mf-history>', () => {
  it('registers its tag', () => {
    expect(customElements.get('mf-history')).toBeDefined();
  });

  it('receives its context through the context property and renders in light DOM', async () => {
    const element = document.createElement('mf-history') as HTMLElement & { context?: HistoryContext; updateComplete: Promise<boolean> };
    document.body.append(element);
    element.context = { v: 1, gameId: 'demo' };
    await element.updateComplete;
    expect(element.shadowRoot).toBeNull();
    expect(element.textContent).toContain('demo');
  });

  it('lists the moves it hears through cs:move-applied, once per ply and only for its game', async () => {
    const element = document.querySelector('mf-history') as HTMLElement & { updateComplete: Promise<boolean> };
    const applied = (gameId: string, ply: number, uci: string) =>
      document.dispatchEvent(new CustomEvent('cs:move-applied', { detail: { v: 1, gameId, ply, uci, san: uci, fen: 'x' } }));
    applied('demo', 1, 'e2e4');
    applied('demo', 1, 'e2e4');
    applied('demo', 2, 'e7e5');
    applied('other', 3, 'g1f3');
    await element.updateComplete;
    expect(element.textContent).toContain('e2e4 e7e5');
    expect(element.textContent).not.toContain('g1f3');
  });
});
