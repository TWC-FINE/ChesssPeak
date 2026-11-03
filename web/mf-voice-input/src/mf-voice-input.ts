import { LitElement, html } from 'lit';
import type { VoiceInputContext } from '@chessspeak/shared';
import ownCss from './styles.css?inline';

// Light DOM means the styles are global: inject them once.
const STYLE_ID = 'csv-styles';
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = ownCss;
  document.head.append(style);
}

/** Placeholder: shows the context it receives through the `context` property. */
export class MfVoiceInput extends LitElement {
  static override properties = { context: { attribute: false } };
  declare context: VoiceInputContext | undefined;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.dispatchEvent(new CustomEvent('cs:mf-ready', { bubbles: true, detail: { v: 1, name: 'mf-voice-input' } }));
  }

  protected override render() {
    const context = this.context;
    return html`<div class="csv-root">
      <h2 class="csv-title">mf-voice-input</h2>
      <p class="csv-info">idioma: ${context?.lang ?? "—"} · reconocedor: ${context?.recognizer ?? "—"} · retardo al soltar: ${context?.releaseDelayMs ?? "—"} ms</p>
    </div>`;
  }
}

if (!customElements.get('mf-voice-input')) customElements.define('mf-voice-input', MfVoiceInput);

declare global {
  interface HTMLElementTagNameMap {
    'mf-voice-input': MfVoiceInput;
  }
}
