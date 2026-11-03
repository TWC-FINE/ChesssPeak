import { beforeAll, describe, expect, it } from 'vitest';
import type { VoiceInputContext } from '@chessspeak/shared';

beforeAll(async () => {
  await import('../src/mf-voice-input.js');
});

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
  });
});
