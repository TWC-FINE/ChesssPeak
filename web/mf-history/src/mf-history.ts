import { LitElement, html } from 'lit';
import { CS_EVENT_INIT, type CsEventDetail, type HistoryContext } from '@chessspeak/shared';
import ownCss from './styles.css?inline';

// Light DOM means the styles are global: inject them once.
const STYLE_ID = 'csh-styles';
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = ownCss;
  document.head.append(style);
}

/** Placeholder: shows its context and the moves it hears through cs:move-applied (idempotent by ply). */
export class MfHistory extends LitElement {
  static override properties = { context: { attribute: false } };
  declare context: HistoryContext | undefined;

  private moves = new Map<number, CsEventDetail<'cs:move-applied'>>();
  private readonly onMoveApplied = (event: Event): void => {
    const detail = (event as CustomEvent<CsEventDetail<'cs:move-applied'>>).detail;
    const gameId = this.context?.gameId;
    if (gameId !== undefined && gameId !== null && detail.gameId !== gameId) return;
    this.moves.set(detail.ply, detail);
    this.requestUpdate();
  };

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('cs:move-applied', this.onMoveApplied);
    const detail: CsEventDetail<'cs:mf-ready'> = { v: 1, name: 'mf-history' };
    this.dispatchEvent(new CustomEvent('cs:mf-ready', { ...CS_EVENT_INIT, detail }));
  }

  override disconnectedCallback(): void {
    document.removeEventListener('cs:move-applied', this.onMoveApplied);
    super.disconnectedCallback();
  }

  protected override render() {
    const context = this.context;
    return html`<div class="csh-root">
      <h2 class="csh-title">mf-history</h2>
      <p class="csh-info">partida: ${context?.gameId ?? "sin partida"} · jugadas: ${[...this.moves.values()].sort((a, b) => a.ply - b.ply).map((m) => m.uci).join(" ") || "—"}</p>
    </div>`;
  }
}

if (!customElements.get('mf-history')) customElements.define('mf-history', MfHistory);

declare global {
  interface HTMLElementTagNameMap {
    'mf-history': MfHistory;
  }
}
