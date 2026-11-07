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

type AppliedMove = CsEventDetail<'cs:move-applied'>;

/**
 * The moves of the game, numbered and in SAN. It only hears cs:move-applied: <mf-game> announces each move as it is
 * played and all of them again after a (re)join, so a move is kept once per ply.
 */
export class MfHistory extends LitElement {
  static override properties = { context: { attribute: false } };
  declare context: HistoryContext | undefined;

  private moves = new Map<number, AppliedMove>();
  private shownGame: string | null | undefined;

  private readonly onMoveApplied = (event: Event): void => {
    const detail = (event as CustomEvent<AppliedMove>).detail;
    if (detail.gameId !== this.context?.gameId) return;
    this.forgetAnotherGame();
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

  protected override willUpdate(): void {
    this.forgetAnotherGame();
  }

  protected override updated(): void {
    // the last move stays in sight in a long game
    const list = this.querySelector('.csh-moves');
    if (list !== null) list.scrollTop = list.scrollHeight;
  }

  private forgetAnotherGame(): void {
    const gameId = this.context?.gameId;
    if (gameId === this.shownGame) return;
    this.shownGame = gameId;
    this.moves.clear();
  }

  private renderMove(ply: number, lastPly: number) {
    const move = this.moves.get(ply);
    if (move === undefined) return html`<span class="csh-san">…</span>`;
    return html`<span class="csh-san" data-ply=${ply} ?data-last=${ply === lastPly}>${move.san}</span>`;
  }

  protected override render() {
    const lastPly = Math.max(0, ...this.moves.keys());
    const rows = Array.from({ length: Math.ceil(lastPly / 2) }, (_, index) => index + 1);
    return html`<div class="csh-root">
      <h2 class="csh-title">Jugadas</h2>
      ${lastPly === 0
        ? html`<p class="csh-info">${this.context?.gameId == null ? 'Sin partida.' : 'Aún no hay jugadas.'}</p>`
        : html`<ol class="csh-moves" aria-label="Jugadas de la partida">
            ${rows.map((number) => {
              const whitePly = number * 2 - 1;
              const blackPly = number * 2;
              return html`<li class="csh-row">
                <span class="csh-number">${number}.</span>
                ${this.renderMove(whitePly, lastPly)}
                ${blackPly <= lastPly ? this.renderMove(blackPly, lastPly) : ''}
              </li>`;
            })}
          </ol>`}
    </div>`;
  }
}

if (!customElements.get('mf-history')) customElements.define('mf-history', MfHistory);

declare global {
  interface HTMLElementTagNameMap {
    'mf-history': MfHistory;
  }
}
