import { LitElement, html } from 'lit';
import type { HistoryContext } from '@chessspeak/shared';
import ownCss from './styles.css?inline';

// Light DOM means the styles are global: inject them once.
const STYLE_ID = 'csh-styles';
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = ownCss;
  document.head.append(style);
}

/** Placeholder: shows the context it receives through the `context` property. */
export class MfHistory extends LitElement {
  static override properties = { context: { attribute: false } };
  declare context: HistoryContext | undefined;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.dispatchEvent(new CustomEvent('cs:mf-ready', { bubbles: true, detail: { v: 1, name: 'mf-history' } }));
  }

  protected override render() {
    const context = this.context;
    return html`<div class="csh-root">
      <h2 class="csh-title">mf-history</h2>
      <p class="csh-info">partida: ${context?.gameId ?? "sin partida"} · jugadas: ${context?.moves?.join(" ") || "—"}</p>
    </div>`;
  }
}

if (!customElements.get('mf-history')) customElements.define('mf-history', MfHistory);

declare global {
  interface HTMLElementTagNameMap {
    'mf-history': MfHistory;
  }
}
