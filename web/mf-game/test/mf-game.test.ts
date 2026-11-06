import { beforeAll, describe, expect, it } from 'vitest';
import type { GameContext } from '@chessspeak/shared';

beforeAll(async () => {
  await import('../src/mf-game.js');
});

describe('<mf-game>', () => {
  it('registers its tag', () => {
    expect(customElements.get('mf-game')).toBeDefined();
  });

  it('receives its context through the context property and renders in light DOM', async () => {
    const element = document.createElement('mf-game') as HTMLElement & { context?: GameContext; updateComplete: Promise<boolean> };
    document.body.append(element);
    element.context = { v: 1, gameId: 'abc', orientation: 'black', socket: null };
    await element.updateComplete;
    expect(element.shadowRoot).toBeNull();
    expect(element.textContent).toContain('abc');
    expect(element.querySelector('.csg-board')).not.toBeNull();
  });
});
