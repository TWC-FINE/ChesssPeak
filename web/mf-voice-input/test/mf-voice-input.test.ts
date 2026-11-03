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
    element.context = { v: 1, lang: 'es-CO', recognizer: 'webspeech', releaseDelayMs: 400 };
    await element.updateComplete;
    expect(element.shadowRoot).toBeNull();
    expect(element.textContent).toContain('es-CO');
  });
});
