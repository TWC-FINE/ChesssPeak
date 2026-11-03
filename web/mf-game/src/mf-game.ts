import { LitElement, html } from 'lit';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import { CS_EVENT_INIT, START_FEN, type CsEventDetail, type GameContext } from '@chessspeak/shared';
import baseCss from 'chessground/assets/chessground.base.css?inline';
import brownCss from 'chessground/assets/chessground.brown.css?inline';
import piecesCss from 'chessground/assets/chessground.cburnett.css?inline';
import ownCss from './styles.css?inline';

// Light DOM means the styles are global: inject them once.
const STYLE_ID = 'csg-styles';
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [baseCss, brownCss, piecesCss, ownCss].join('\n');
  document.head.append(style);
}

/** Board of the game (chessground, view only). Receives its data through the `context` property. */
export class MfGame extends LitElement {
  static override properties = { context: { attribute: false } };
  declare context: GameContext | undefined;

  private ground: Api | undefined;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    const detail: CsEventDetail<'cs:mf-ready'> = { v: 1, name: 'mf-game' };
    this.dispatchEvent(new CustomEvent('cs:mf-ready', { ...CS_EVENT_INIT, detail }));
  }

  override disconnectedCallback(): void {
    this.ground?.destroy();
    this.ground = undefined;
    super.disconnectedCallback();
  }

  protected override render() {
    const context = this.context;
    return html`<div class="csg-root">
      <div class="csg-board"></div>
      <p class="csg-info">partida: ${context?.gameId ?? 'sin partida'} · orientación: ${context?.orientation ?? 'white'}</p>
    </div>`;
  }

  protected override updated(): void {
    const host = this.querySelector<HTMLElement>('.csg-board');
    if (host === null) return;
    const config = {
      fen: START_FEN,
      orientation: this.context?.orientation ?? 'white',
      viewOnly: true,
    } as const;
    if (this.ground === undefined) this.ground = Chessground(host, config);
    else this.ground.set(config);
  }
}

if (!customElements.get('mf-game')) customElements.define('mf-game', MfGame);

declare global {
  interface HTMLElementTagNameMap {
    'mf-game': MfGame;
  }
}
