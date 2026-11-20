import { LitElement, html } from 'lit';
import { CS_EVENT_INIT, type CsEventDetail, type HistoryContext } from '@chessspeak/shared';
import { pgnFileName, toPgn } from './pgn.js';
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
type GameEnded = CsEventDetail<'cs:game-ended'>;

/**
 * The moves of the game, numbered and in SAN. It only hears cs:move-applied: <mf-game> announces each move as it is
 * played and all of them again after a (re)join, so a move is kept once per ply.
 */
export class MfHistory extends LitElement {
  static override properties = { context: { attribute: false } };
  declare context: HistoryContext | undefined;

  private moves = new Map<number, AppliedMove>();
  private shownGame: string | null | undefined;
  private result: GameEnded['result'] | undefined;
  private copyNote = '';

  private readonly onMoveApplied = (event: Event): void => {
    const detail = (event as CustomEvent<AppliedMove>).detail;
    if (detail.gameId !== this.context?.gameId) return;
    this.forgetAnotherGame();
    this.moves.set(detail.ply, detail);
    this.requestUpdate();
  };

  private readonly onGameEnded = (event: Event): void => {
    const detail = (event as CustomEvent<GameEnded>).detail;
    if (detail.gameId !== this.context?.gameId) return;
    this.forgetAnotherGame();
    this.result = detail.result;
    this.requestUpdate();
  };

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('cs:move-applied', this.onMoveApplied);
    document.addEventListener('cs:game-ended', this.onGameEnded);
    const detail: CsEventDetail<'cs:mf-ready'> = { v: 1, name: 'mf-history' };
    this.dispatchEvent(new CustomEvent('cs:mf-ready', { ...CS_EVENT_INIT, detail }));
  }

  override disconnectedCallback(): void {
    document.removeEventListener('cs:move-applied', this.onMoveApplied);
    document.removeEventListener('cs:game-ended', this.onGameEnded);
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
    this.result = undefined;
    this.copyNote = '';
  }

  /** The game so far in PGN, up to the first ply that has not arrived yet. */
  pgn(now = new Date()): string {
    const sans: string[] = [];
    for (let ply = 1; this.moves.has(ply); ply++) sans.push(this.moves.get(ply)!.san);
    return toPgn(sans, this.result, now);
  }

  private async copyPgn(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pgn());
      this.copyNote = 'PGN copiado.';
    } catch {
      this.copyNote = 'No se pudo copiar: usa «Descargar».';
    }
    this.requestUpdate();
  }

  private downloadPgn(): void {
    const now = new Date();
    const url = URL.createObjectURL(new Blob([this.pgn(now)], { type: 'application/x-chess-pgn' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = pgnFileName(now);
    link.click();
    URL.revokeObjectURL(url);
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
        : html`<div class="csh-cols" aria-hidden="true">
              <span></span>
              <span><i class="csh-dot csh-dot-white"></i>Blancas</span>
              <span><i class="csh-dot csh-dot-black"></i>Negras</span>
            </div>
            <ol class="csh-moves" aria-label="Jugadas de la partida">
            ${rows.map((number) => {
              const whitePly = number * 2 - 1;
              const blackPly = number * 2;
              return html`<li class="csh-row">
                <span class="csh-number">${number}.</span>
                ${this.renderMove(whitePly, lastPly)}
                ${blackPly <= lastPly ? this.renderMove(blackPly, lastPly) : ''}
              </li>`;
            })}
          </ol>
          <div class="csh-export">
            <button type="button" data-action="copy-pgn" @click=${() => void this.copyPgn()}>Copiar PGN</button>
            <button type="button" data-action="download-pgn" @click=${() => this.downloadPgn()}>Descargar .pgn</button>
            ${this.copyNote === '' ? '' : html`<span class="csh-export-note" role="status">${this.copyNote}</span>`}
          </div>`}
    </div>`;
  }
}

if (!customElements.get('mf-history')) customElements.define('mf-history', MfHistory);

declare global {
  interface HTMLElementTagNameMap {
    'mf-history': MfHistory;
  }
}
