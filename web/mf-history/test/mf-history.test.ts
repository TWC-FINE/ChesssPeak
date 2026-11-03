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
    element.context = { v: 1, gameId: 'demo', moves: ['e2e4', 'e7e5'] };
    await element.updateComplete;
    expect(element.shadowRoot).toBeNull();
    expect(element.textContent).toContain('e2e4');
  });
});
