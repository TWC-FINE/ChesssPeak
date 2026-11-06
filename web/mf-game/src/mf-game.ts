import { LitElement, html } from 'lit';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import {
  CS_EVENT_INIT,
  START_FEN,
  type CsEventDetail,
  type CsEventName,
  type GameContext,
  type GameEnd,
  type GameError,
  type GameErrorCode,
  type GameMoved,
  type GameSocket,
  type GameState,
} from '@chessspeak/shared';
import baseCss from 'chessground/assets/chessground.base.css?inline';
import brownCss from 'chessground/assets/chessground.brown.css?inline';
import piecesCss from 'chessground/assets/chessground.cburnett.css?inline';
import { fensAfter, turnOf } from './replay.js';
import ownCss from './styles.css?inline';

// Light DOM means the styles are global: inject them once.
const STYLE_ID = 'csg-styles';
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [baseCss, brownCss, piecesCss, ownCss].join('\n');
  document.head.append(style);
}

/** The interface decides the text from the code; game:error.message is only for debugging (docs/protocol.md §7). */
const ERROR_TEXT: Record<GameErrorCode, string> = {
  not_your_turn: 'No es tu turno.',
  illegal: 'Esa jugada no es legal en esta posición.',
  stale_ply: 'La posición cambió. Vuelve a intentarlo.',
  unauthorized: 'No puedes hacer eso en esta partida.',
  not_found: 'No se encontró la partida.',
};

const COLOR_TEXT = { white: 'blancas', black: 'negras' } as const;

const END_TEXT: Record<GameEnd['termination'], string> = {
  checkmate: 'jaque mate',
  stalemate: 'ahogado',
  insufficient_material: 'material insuficiente',
  resignation: 'abandono voluntario',
  abandonment: 'desconexión',
  aborted: 'partida cancelada',
  threefold_repetition: 'triple repetición',
  fifty_moves: 'regla de las 50 jugadas',
};

const squares = (uci: string): [Key, Key] => [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key];

/** Board of the game (chessground, view only). Shows what the server says through the socket of its context. */
export class MfGame extends LitElement {
  static override properties = { context: { attribute: false } };
  declare context: GameContext | undefined;

  private ground: Api | undefined;
  private synced: GameContext | undefined;
  private socket: GameSocket | null = null;
  private state: GameState | undefined;
  private lastUci: string | undefined;
  private end: GameEnd | undefined;
  private arrow: string | undefined;
  private error = '';

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('cs:move-candidate', this.onCandidate);
    document.addEventListener('cs:move-cancelled', this.onCancelled);
    document.addEventListener('cs:move-confirmed', this.onConfirmed);
    const detail: CsEventDetail<'cs:mf-ready'> = { v: 1, name: 'mf-game' };
    this.dispatchEvent(new CustomEvent('cs:mf-ready', { ...CS_EVENT_INIT, detail }));
  }

  override disconnectedCallback(): void {
    document.removeEventListener('cs:move-candidate', this.onCandidate);
    document.removeEventListener('cs:move-cancelled', this.onCancelled);
    document.removeEventListener('cs:move-confirmed', this.onConfirmed);
    this.useSocket(null);
    this.synced = undefined;
    this.ground?.destroy();
    this.ground = undefined;
    super.disconnectedCallback();
  }

  /** Every new context object asks for the state: that is how a reconnection recovers the game. */
  protected override willUpdate(): void {
    const context = this.context;
    if (context === this.synced) return;
    if (context?.gameId !== this.synced?.gameId) this.resetGame();
    this.synced = context;
    this.useSocket(context?.socket ?? null);
    if (this.socket !== null && context?.gameId != null) this.socket.emit('game:join', { gameId: context.gameId });
  }

  protected override render() {
    const context = this.context;
    return html`<div class="csg-root">
      <div class="csg-board"></div>
      <p class="csg-info">partida: ${context?.gameId ?? 'sin partida'} · orientación: ${this.orientation()}</p>
      ${this.renderStatus()}
      ${this.error === '' ? '' : html`<p class="csg-error" role="alert">${this.error}</p>`}
    </div>`;
  }

  private renderStatus() {
    const state = this.state;
    if (state === undefined) return this.context?.gameId != null && this.socket === null ? html`<p class="csg-status">Sin conexión con la partida.</p>` : '';
    const player = (color: 'white' | 'black') => {
      const seat = state.seats[color];
      if (seat === null) return `${COLOR_TEXT[color]}: libre`;
      return `${COLOR_TEXT[color]}: ${seat.displayName}${seat.connected ? '' : ' (desconectado)'}`;
    };
    return html`<p class="csg-players">${player('white')} · ${player('black')}</p>
      <p class="csg-status" data-status=${state.status}>${this.statusText(state)}</p>`;
  }

  private statusText(state: GameState): string {
    if (this.end !== undefined) return `Partida terminada: ${this.end.result} (${END_TEXT[this.end.termination]}).`;
    if (state.status === 'waiting') return 'Esperando al otro jugador.';
    const you = state.yourColor === 'spectator' ? '' : `Juegas con ${COLOR_TEXT[state.yourColor]}. `;
    return `${you}${state.turn === state.yourColor ? 'Te toca.' : `Le toca a ${COLOR_TEXT[state.turn]}.`}`;
  }

  protected override updated(): void {
    const host = this.querySelector<HTMLElement>('.csg-board');
    if (host === null) return;
    const config = {
      fen: this.state?.fen ?? START_FEN,
      orientation: this.orientation(),
      turnColor: this.state?.turn ?? 'white',
      lastMove: this.lastUci === undefined ? undefined : squares(this.lastUci),
      viewOnly: true,
    } as const;
    if (this.ground === undefined) this.ground = Chessground(host, config);
    else this.ground.set(config);
    if (this.arrow === undefined) {
      this.ground.setAutoShapes([]);
    } else {
      const [orig, dest] = squares(this.arrow);
      this.ground.setAutoShapes([{ orig, dest, brush: 'green' }]);
    }
  }

  private orientation(): 'white' | 'black' {
    const yours = this.state?.yourColor;
    return yours === 'white' || yours === 'black' ? yours : (this.context?.orientation ?? 'white');
  }

  private resetGame(): void {
    this.state = undefined;
    this.lastUci = undefined;
    this.end = undefined;
    this.arrow = undefined;
    this.error = '';
  }

  private useSocket(socket: GameSocket | null): void {
    if (socket === this.socket) return;
    this.socket?.off('game:state', this.onState);
    this.socket?.off('game:moved', this.onMoved);
    this.socket?.off('game:end', this.onEnd);
    this.socket?.off('game:error', this.onError);
    socket?.on('game:state', this.onState);
    socket?.on('game:moved', this.onMoved);
    socket?.on('game:end', this.onEnd);
    socket?.on('game:error', this.onError);
    this.socket = socket;
  }

  private emitEvent<K extends CsEventName>(name: K, detail: CsEventDetail<K>): void {
    this.dispatchEvent(new CustomEvent(name, { ...CS_EVENT_INIT, detail }));
  }

  private announcePosition(state: GameState): void {
    this.emitEvent('cs:position', { v: 1, gameId: state.gameId, fen: state.fen, plyCount: state.plyCount, turn: state.turn, yourColor: state.yourColor });
  }

  private readonly onState = (state: GameState): void => {
    if (state.gameId !== this.context?.gameId) return;
    this.state = state;
    this.lastUci = state.moves.at(-1)?.uci;
    this.error = '';
    const fens = fensAfter(state.moves);
    state.moves.forEach((move, index) => {
      const fen = fens[index];
      if (fen !== undefined) this.emitEvent('cs:move-applied', { v: 1, gameId: state.gameId, ply: move.ply, uci: move.uci, san: move.san, fen });
    });
    this.announcePosition(state);
    this.requestUpdate();
  };

  private readonly onMoved = (moved: GameMoved): void => {
    const state = this.state;
    if (state === undefined || moved.gameId !== state.gameId || moved.ply <= state.plyCount) return;
    if (moved.ply !== state.plyCount + 1) {
      // a move was missed: ask for the whole state instead of showing a wrong position
      this.socket?.emit('game:join', { gameId: state.gameId });
      return;
    }
    this.state = {
      ...state,
      fen: moved.fen,
      plyCount: moved.ply,
      turn: turnOf(moved.fen),
      moves: [...state.moves, { ply: moved.ply, uci: moved.uci, san: moved.san }],
    };
    this.lastUci = moved.uci;
    this.arrow = undefined;
    this.error = '';
    this.emitEvent('cs:move-applied', { v: 1, gameId: moved.gameId, ply: moved.ply, uci: moved.uci, san: moved.san, fen: moved.fen });
    this.announcePosition(this.state);
    this.requestUpdate();
  };

  private readonly onEnd = (end: GameEnd): void => {
    if (end.gameId !== this.context?.gameId) return;
    this.end = end;
    this.arrow = undefined;
    if (this.state !== undefined) this.state = { ...this.state, status: end.termination === 'aborted' ? 'aborted' : 'finished' };
    this.emitEvent('cs:game-ended', { v: 1, gameId: end.gameId, result: end.result, termination: end.termination });
    this.requestUpdate();
  };

  private readonly onError = (error: GameError): void => {
    this.error = ERROR_TEXT[error.code];
    this.arrow = undefined;
    this.requestUpdate();
  };

  private readonly onCandidate = (event: Event): void => {
    const { gameId, uci } = (event as CustomEvent<CsEventDetail<'cs:move-candidate'>>).detail;
    if (gameId !== this.context?.gameId) return;
    this.arrow = uci;
    this.error = '';
    this.requestUpdate();
  };

  private readonly onCancelled = (event: Event): void => {
    if ((event as CustomEvent<CsEventDetail<'cs:move-cancelled'>>).detail.gameId !== this.context?.gameId) return;
    this.arrow = undefined;
    this.requestUpdate();
  };

  private readonly onConfirmed = (event: Event): void => {
    const { gameId, uci, ply } = (event as CustomEvent<CsEventDetail<'cs:move-confirmed'>>).detail;
    if (gameId !== this.context?.gameId) return;
    if (this.socket === null) {
      this.error = 'Sin conexión: la jugada no se envió.';
      this.arrow = undefined;
      this.requestUpdate();
      return;
    }
    this.socket.emit('game:move', { gameId, uci, ply });
  };
}

if (!customElements.get('mf-game')) customElements.define('mf-game', MfGame);

declare global {
  interface HTMLElementTagNameMap {
    'mf-game': MfGame;
  }
}
