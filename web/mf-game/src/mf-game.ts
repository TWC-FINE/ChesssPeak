import { LitElement, html } from 'lit';
import { Chessground } from 'chessground';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import type { Api } from 'chessground/api';
import type { Key } from 'chessground/types';
import {
  CS_EVENT_INIT,
  type Clock,
  START_FEN,
  type CsEventDetail,
  type CsEventName,
  type GameContext,
  type GameDraw,
  type GameRematch,
  type GameEnd,
  type GameError,
  type GameErrorCode,
  type GameMoved,
  type GameReaction,
  type GameSocket,
  type GameState,
  REACTION_COOLDOWN_MS,
  type Reaction,
} from '@chessspeak/shared';
import baseCss from 'chessground/assets/chessground.base.css?inline';
import brownCss from 'chessground/assets/chessground.brown.css?inline';
import piecesCss from 'chessground/assets/chessground.cburnett.css?inline';
import { fensAfter, turnOf } from './replay.js';
import { saveSoundPreference, soundPreference, webAudioSound, type MoveSound } from './sound.js';
import { browserSpeaker, readoutPreference, saveReadoutPreference, spokenSan, type MoveSpeaker } from './speech.js';
import ownCss from './styles.css?inline';

// Light DOM means the styles are global: inject them once.
const STYLE_ID = 'csg-styles';
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [baseCss, brownCss, piecesCss, ownCss].join('\n');
  document.head.append(style);
}

/** The text of each quick reaction: the contract only carries its name. */
export const REACTION_TEXT: Record<Reaction, string> = {
  hello: '¡Hola!',
  'good-luck': '¡Suerte!',
  'well-played': '¡Bien jugado!',
  oops: '¡Uy!',
  thanks: '¡Gracias!',
  'good-game': '¡Buena partida!',
};
/** How long a reaction stays on screen. */
export const REACTION_SHOWN_MS = 4000;

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
  agreement: 'tablas de mutuo acuerdo',
  timeout: 'se acabó el tiempo',
};

const squares = (uci: string): [Key, Key] => [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key];

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;
const START_COUNT = { q: 1, r: 2, b: 2, n: 2, p: 8 } as const;
const ROLE_NAME = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' } as const;
type Letter = keyof typeof START_COUNT;
type Side = 'white' | 'black';

/** Pieces each side has taken, strongest first, from what is missing on the board (a promotion can hide one). */
export function capturedBy(fen: string): Record<Side, string[]> {
  const placement = [...(fen.split(' ')[0] ?? '')];
  const taken: Record<Side, string[]> = { white: [], black: [] };
  for (const letter of Object.keys(START_COUNT) as Letter[]) {
    const blackLeft = placement.filter((char) => char === letter).length;
    const whiteLeft = placement.filter((char) => char === letter.toUpperCase()).length;
    for (let count = blackLeft; count < START_COUNT[letter]; count++) taken.white.push(ROLE_NAME[letter]);
    for (let count = whiteLeft; count < START_COUNT[letter]; count++) taken.black.push(ROLE_NAME[letter]);
  }
  return taken;
}

/** Usual piece values; the king does not count. */
const PIECE_VALUE: Record<string, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 };

/**
 * White's material minus black's, from the pieces on the board (so a promotion counts as the new piece).
 * Positive when white is ahead, negative when black is.
 */
export function materialBalance(fen: string): number {
  let balance = 0;
  for (const char of fen.split(' ')[0] ?? '') {
    const value = PIECE_VALUE[char.toLowerCase()];
    if (value !== undefined) balance += char === char.toLowerCase() ? -value : value;
  }
  return balance;
}

/** Below this, a clock is shown as running low. */
export const LOW_TIME_MS = 20_000;

/** A clock as m:ss, rounding up: it shows 0:00 only once the time is really over. */
export function formatClock(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Whether the side to move is in check. Only for display: the server decides the rules. */
export function inCheck(fen: string): boolean {
  try {
    return Chess.fromSetup(parseFen(fen).unwrap()).unwrap().isCheck();
  } catch {
    return false;
  }
}

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
  /** Set when the rival declined this player's draw offer, until the next move. */
  private drawDeclined = false;
  /** Set when the rival declined this player's rematch offer. */
  private rematchDeclined = false;
  /** Only this browser's view: "Girar tablero" shows the other side, the game does not change. */
  private flipped = false;
  /** The last clock from the server and when it arrived; the running one counts down from there between messages. */
  private clock: { value: Clock; receivedAt: number } | undefined;
  private ticker: ReturnType<typeof setInterval> | undefined;
  /** What plays the sounds; a test replaces it. */
  sound: MoveSound = webAudioSound();
  /** Kept in this browser, for every game. */
  private soundOn = soundPreference();
  /** What reads the moves aloud; a test replaces it. */
  speaker: MoveSpeaker = browserSpeaker();
  /** Kept in this browser too: whether the moves of the rival are read aloud. */
  private readoutOn = readoutPreference();
  /** The ply shown while a finished game is reviewed (cs:review); undefined is the position of the game. */
  private reviewPly: number | undefined;
  /** The last reaction heard, while it is on screen. */
  private reaction: { text: string; mine: boolean } | undefined;
  private reactionTimer: ReturnType<typeof setTimeout> | undefined;
  /** Until when the reaction buttons rest, as the server drops what comes sooner. */
  private reactionsRestUntil = 0;
  private restTimer: ReturnType<typeof setTimeout> | undefined;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('cs:move-candidate', this.onCandidate);
    document.addEventListener('cs:move-cancelled', this.onCancelled);
    document.addEventListener('cs:move-confirmed', this.onConfirmed);
    document.addEventListener('cs:review', this.onReview);
    const detail: CsEventDetail<'cs:mf-ready'> = { v: 1, name: 'mf-game' };
    this.dispatchEvent(new CustomEvent('cs:mf-ready', { ...CS_EVENT_INIT, detail }));
  }

  override disconnectedCallback(): void {
    document.removeEventListener('cs:move-candidate', this.onCandidate);
    document.removeEventListener('cs:move-cancelled', this.onCancelled);
    document.removeEventListener('cs:move-confirmed', this.onConfirmed);
    document.removeEventListener('cs:review', this.onReview);
    this.useSocket(null);
    this.stopTicking();
    this.clearReaction();
    clearTimeout(this.restTimer);
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
    const fen = this.shownFen();
    const files = this.orientation() === 'white' ? [...FILES] : [...FILES].reverse();
    const ranks = this.orientation() === 'white' ? [...RANKS].reverse() : [...RANKS];
    const coord = (text: string, kind: string, row: number, column: number) =>
      html`<span class="csg-coord csg-${kind}" style="grid-area: ${row} / ${column}">${text}</span>`;
    return html`<div class="csg-root">
      <div class="csg-toolbar">
        ${this.renderTurn(fen)}
        ${this.renderClocks()}
        <button type="button" class="csg-toggle csg-sound" data-action="toggle-sound" aria-pressed=${String(this.soundOn)} title=${this.soundOn ? 'Quitar el sonido de las jugadas' : 'Poner el sonido de las jugadas'} @click=${this.toggleSound}>
          Sonido
        </button>
        <button type="button" class="csg-toggle csg-readout" data-action="toggle-readout" aria-pressed=${String(this.readoutOn)} title=${this.readoutOn ? 'Dejar de leer en voz alta las jugadas del rival' : 'Leer en voz alta las jugadas del rival'} @click=${this.toggleReadout}>
          Leer jugadas
        </button>
        <button type="button" class="csg-flip" data-action="flip" aria-pressed=${String(this.flipped)} @click=${this.flip}>Girar tablero</button>
      </div>
      <div class="csg-card">
        <div class="csg-frame">
          ${files.map((file, index) => coord(file, 'file', 1, index + 2))}
          ${files.map((file, index) => coord(file, 'file', 10, index + 2))}
          ${ranks.map((rank, index) => coord(rank, 'rank', index + 2, 1))}
          ${ranks.map((rank, index) => coord(rank, 'rank', index + 2, 10))}
          <div class="csg-board"></div>
        </div>
      </div>
      ${this.renderTrays(fen)}
      ${this.renderReview()}
      <p class="csg-info">partida: ${context?.gameId ?? 'sin partida'} · orientación: ${this.orientation()}</p>
      ${this.renderStatus()}
      ${this.renderDraw()}
      ${this.renderRematch()}
      ${this.renderReactions()}
      ${this.error === '' ? '' : html`<p class="csg-error" role="alert">${this.error}</p>`}
    </div>`;
  }

  private renderTurn(fen: string) {
    const turn = this.reviewPly === undefined ? (this.state?.turn ?? 'white') : turnOf(fen);
    return html`<span class="csg-turn" data-turn=${turn}>
      <span class="csg-turn-dot" aria-hidden="true"></span>Turno: ${turn === 'white' ? 'Blancas' : 'Negras'}
      ${inCheck(fen) ? html`<span class="csg-check">Jaque</span>` : ''}
    </span>`;
  }

  /** Only in a game with a clock. The server decides when time is over; this only shows it going down. */
  private renderClocks() {
    if (this.clock === undefined) return '';
    const { value, receivedAt } = this.clock;
    const left = (color: Side) => (value.running === color ? value[`${color}Ms`] - (Date.now() - receivedAt) : value[`${color}Ms`]);
    const chip = (color: Side) => {
      const ms = left(color);
      return html`<span class="csg-clock" data-color=${color} ?data-running=${value.running === color} ?data-low=${ms < LOW_TIME_MS}>
        ${COLOR_TEXT[color]} <b>${formatClock(ms)}</b>
      </span>`;
    };
    const increment = value.incrementMs === undefined ? '' : html`<span class="csg-increment" title="Incremento por jugada">+${Math.round(value.incrementMs / 1000)} s</span>`;
    return html`<span class="csg-clocks" role="timer" aria-label="Reloj">${chip('white')}${chip('black')}${increment}</span>`;
  }

  /** The pieces are drawn by chessground's piece set, which only applies inside .cg-wrap. */
  private renderTrays(fen: string) {
    const taken = capturedBy(fen);
    const balance = materialBalance(fen);
    const tray = (by: Side, label: string) => {
      const color = by === 'white' ? 'black' : 'white';
      const ahead = by === 'white' ? balance : -balance;
      return html`<div class="csg-tray cg-wrap" data-by=${by}>
        <span class="csg-tray-label">${label}</span>
        <span class="csg-tray-pieces">
          ${taken[by].length === 0 ? html`<span class="csg-tray-empty">Ninguna</span>` : taken[by].map((role) => html`<piece class="${role} ${color}"></piece>`)}
        </span>
        ${ahead > 0 ? html`<span class="csg-material" title="Ventaja de material">+${ahead}</span>` : ''}
      </div>`;
    };
    return html`<div class="csg-trays">${tray('white', 'Capturadas por blancas')}${tray('black', 'Capturadas por negras')}</div>`;
  }

  private readonly toggleSound = (): void => {
    this.soundOn = !this.soundOn;
    saveSoundPreference(this.soundOn);
    this.requestUpdate();
  };

  private readonly toggleReadout = (): void => {
    this.readoutOn = !this.readoutOn;
    saveReadoutPreference(this.readoutOn);
    this.requestUpdate();
  };

  /** The moves of the rival are read aloud; a spectator hears them all. Never the player's own: they just said it. */
  private readAloud(mover: 'white' | 'black', san: string): void {
    if (this.readoutOn && this.state?.yourColor !== mover) this.speaker.say(spokenSan(san));
  }

  private beep(kind: 'move' | 'capture' | 'end'): void {
    if (this.soundOn) this.sound.play(kind);
  }

  private readonly flip = (): void => {
    this.flipped = !this.flipped;
    this.requestUpdate();
  };

  private renderStatus() {
    const state = this.state;
    if (state === undefined) return this.context?.gameId != null && this.socket === null ? html`<p class="csg-status">Sin conexión con la partida.</p>` : '';
    const player = (color: 'white' | 'black') => {
      const seat = state.seats[color];
      if (seat === null) return `${COLOR_TEXT[color]}: libre`;
      return `${COLOR_TEXT[color]}: ${seat.displayName}${seat.connected ? '' : ' (desconectado)'}`;
    };
    const watching = state.spectators === undefined ? '' : ` · ${state.spectators} ${state.spectators === 1 ? 'espectador' : 'espectadores'}`;
    return html`<p class="csg-players">${player('white')} · ${player('black')}${watching}</p>
      <p class="csg-status" data-status=${state.status}>${this.statusText(state)}</p>`;
  }

  /** Offer, wait or answer: only a seated player of an active game sees it. */
  private renderDraw() {
    const state = this.state;
    if (state === undefined || this.end !== undefined || state.status !== 'active' || state.yourColor === 'spectator') return '';
    if (state.drawOffer === undefined) {
      return html`<div class="csg-draw">
        <button type="button" data-action="offer-draw" @click=${this.offerDraw}>Ofrecer tablas</button>
        ${this.drawDeclined ? html`<span class="csg-draw-note">Tu rival rechazó las tablas.</span>` : ''}
      </div>`;
    }
    if (state.drawOffer === state.yourColor) return html`<div class="csg-draw"><span class="csg-draw-note">Ofreciste tablas. Esperando respuesta.</span></div>`;
    return html`<div class="csg-draw" role="status">
      <span class="csg-draw-note">Tu rival ofrece tablas.</span>
      <button type="button" data-action="accept-draw" @click=${this.acceptDraw}>Aceptar</button>
      <button type="button" data-action="decline-draw" @click=${this.declineDraw}>Rechazar</button>
    </div>`;
  }

  /** Once the game is finished: offer a rematch, wait, answer it, or go to the one both accepted. */
  /** Buttons for the players; the reaction heard, for everybody in the game. */
  private renderReactions() {
    const state = this.state;
    if (state === undefined) return '';
    const seated = state.yourColor !== 'spectator' && (state.status === 'active' || state.status === 'finished');
    const resting = Date.now() < this.reactionsRestUntil;
    const heard = this.reaction === undefined ? '' : html`<p class="csg-reaction" role="status" ?data-mine=${this.reaction.mine}>${this.reaction.text}</p>`;
    if (!seated) return heard;
    return html`<div class="csg-reactions" aria-label="Reacciones rápidas">
        ${(Object.keys(REACTION_TEXT) as Reaction[]).map(
          (reaction) =>
            html`<button type="button" data-reaction=${reaction} ?disabled=${resting} @click=${() => this.sendReaction(reaction)}>${REACTION_TEXT[reaction]}</button>`,
        )}
      </div>
      ${heard}`;
  }

  private sendReaction(reaction: Reaction): void {
    const gameId = this.state?.gameId;
    if (this.socket === null || gameId === undefined || Date.now() < this.reactionsRestUntil) return;
    this.socket.emit('game:react', { gameId, reaction });
    this.reactionsRestUntil = Date.now() + REACTION_COOLDOWN_MS;
    clearTimeout(this.restTimer);
    this.restTimer = setTimeout(() => this.requestUpdate(), REACTION_COOLDOWN_MS);
    this.requestUpdate();
  }

  private clearReaction(): void {
    clearTimeout(this.reactionTimer);
    this.reactionTimer = undefined;
    this.reaction = undefined;
  }

  private renderRematch() {
    const state = this.state;
    if (state === undefined || this.end === undefined || state.status !== 'finished' || state.yourColor === 'spectator') return '';
    const nextGameId = state.nextGameId;
    if (nextGameId !== undefined) {
      return html`<div class="csg-rematch">
        <button type="button" data-action="open-rematch" @click=${() => this.openGame(nextGameId)}>Ir a la revancha</button>
      </div>`;
    }
    if (state.rematchOffer === undefined) {
      return html`<div class="csg-rematch">
        <button type="button" data-action="offer-rematch" @click=${this.offerRematch}>Revancha</button>
        ${this.rematchDeclined ? html`<span class="csg-draw-note">Tu rival rechazó la revancha.</span>` : ''}
      </div>`;
    }
    if (state.rematchOffer === state.yourColor) {
      return html`<div class="csg-rematch"><span class="csg-draw-note">Pediste la revancha. Esperando respuesta.</span></div>`;
    }
    return html`<div class="csg-rematch" role="status">
      <span class="csg-draw-note">Tu rival quiere la revancha, con los colores invertidos.</span>
      <button type="button" data-action="accept-rematch" @click=${this.acceptRematch}>Aceptar</button>
      <button type="button" data-action="decline-rematch" @click=${this.declineRematch}>Rechazar</button>
    </div>`;
  }

  private readonly offerRematch = (): void => this.sendDraw((socket, gameId) => socket.emit('game:rematch-offer', { gameId }));
  private readonly acceptRematch = (): void => this.sendDraw((socket, gameId) => socket.emit('game:rematch-answer', { gameId, accept: true }));
  private readonly declineRematch = (): void => this.sendDraw((socket, gameId) => socket.emit('game:rematch-answer', { gameId, accept: false }));

  /** The shell owns the route: it opens the game and gives this element its new context. */
  private openGame(gameId: string): void {
    this.emitEvent('cs:open-game', { v: 1, gameId });
  }

  private readonly offerDraw = (): void => this.sendDraw((socket, gameId) => socket.emit('game:draw-offer', { gameId }));
  private readonly acceptDraw = (): void => this.sendDraw((socket, gameId) => socket.emit('game:draw-answer', { gameId, accept: true }));
  private readonly declineDraw = (): void => this.sendDraw((socket, gameId) => socket.emit('game:draw-answer', { gameId, accept: false }));

  private sendDraw(send: (socket: GameSocket, gameId: string) => void): void {
    const gameId = this.state?.gameId;
    if (gameId === undefined) return;
    if (this.socket === null) {
      this.error = 'Sin conexión: no se envió.';
      this.requestUpdate();
      return;
    }
    send(this.socket, gameId);
  }

  private statusText(state: GameState): string {
    if (this.end !== undefined) return `Partida terminada: ${this.end.result} (${END_TEXT[this.end.termination]}).`;
    if (state.status === 'waiting') return 'Esperando al otro jugador.';
    const you = state.yourColor === 'spectator' ? 'Miras la partida. ' : `Juegas con ${COLOR_TEXT[state.yourColor]}. `;
    return `${you}${state.turn === state.yourColor ? 'Te toca.' : `Le toca a ${COLOR_TEXT[state.turn]}.`}`;
  }

  protected override updated(): void {
    if (this.clock?.value.running != null && this.end === undefined) this.startTicking();
    else this.stopTicking();
    const host = this.querySelector<HTMLElement>('.csg-board');
    if (host === null) return;
    const fen = this.shownFen();
    const lastUci = this.reviewPly === undefined ? this.lastUci : this.state?.moves[this.reviewPly - 1]?.uci;
    const config = {
      fen,
      orientation: this.orientation(),
      turnColor: this.reviewPly === undefined ? (this.state?.turn ?? 'white') : turnOf(fen),
      lastMove: lastUci === undefined ? undefined : squares(lastUci),
      check: inCheck(fen),
      coordinates: false,
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

  /** The position on the board: the game's, or the one after the reviewed ply. */
  private shownFen(): string {
    const fen = this.state?.fen ?? START_FEN;
    if (this.reviewPly === undefined || this.state === undefined) return fen;
    if (this.reviewPly === 0) return START_FEN;
    return fensAfter(this.state.moves)[this.reviewPly - 1] ?? fen;
  }

  private renderReview() {
    if (this.reviewPly === undefined || this.state === undefined) return '';
    const total = this.state.moves.length;
    const where = this.reviewPly === 0 ? 'la posición inicial' : `la jugada ${this.reviewPly} de ${total}`;
    return html`<p class="csg-review" role="status">Repasando ${where}. La partida terminó en la jugada ${total}.</p>`;
  }

  private orientation(): 'white' | 'black' {
    const yours = this.state?.yourColor;
    const side = yours === 'white' || yours === 'black' ? yours : (this.context?.orientation ?? 'white');
    if (!this.flipped) return side;
    return side === 'white' ? 'black' : 'white';
  }

  private startTicking(): void {
    this.ticker ??= setInterval(() => this.requestUpdate(), 250);
  }

  private stopTicking(): void {
    clearInterval(this.ticker);
    this.ticker = undefined;
  }

  private setClock(clock: Clock | undefined): void {
    this.clock = clock === undefined ? undefined : { value: clock, receivedAt: Date.now() };
  }

  private resetGame(): void {
    this.state = undefined;
    this.clock = undefined;
    this.lastUci = undefined;
    this.end = undefined;
    this.arrow = undefined;
    this.reviewPly = undefined;
    this.clearReaction();
    this.error = '';
    this.drawDeclined = false;
    this.rematchDeclined = false;
    this.flipped = false;
  }

  private useSocket(socket: GameSocket | null): void {
    if (socket === this.socket) return;
    this.socket?.off('game:state', this.onState);
    this.socket?.off('game:moved', this.onMoved);
    this.socket?.off('game:end', this.onEnd);
    this.socket?.off('game:draw', this.onDraw);
    this.socket?.off('game:rematch', this.onRematch);
    this.socket?.off('game:reaction', this.onReaction);
    this.socket?.off('game:error', this.onError);
    socket?.on('game:state', this.onState);
    socket?.on('game:moved', this.onMoved);
    socket?.on('game:end', this.onEnd);
    socket?.on('game:draw', this.onDraw);
    socket?.on('game:rematch', this.onRematch);
    socket?.on('game:reaction', this.onReaction);
    socket?.on('game:error', this.onError);
    this.socket = socket;
  }

  private emitEvent<K extends CsEventName>(name: K, detail: CsEventDetail<K>): void {
    this.dispatchEvent(new CustomEvent(name, { ...CS_EVENT_INIT, detail }));
  }

  private announcePosition(state: GameState): void {
    this.emitEvent('cs:position', { v: 1, gameId: state.gameId, fen: state.fen, plyCount: state.plyCount, turn: state.turn, yourColor: state.yourColor, status: state.status });
  }

  private readonly onState = (state: GameState): void => {
    if (state.gameId !== this.context?.gameId) return;
    this.state = state;
    this.setClock(state.clock);
    this.lastUci = state.moves.at(-1)?.uci;
    this.error = '';
    // CONTRACT: the FEN of each move is recalculated here because game:state does not carry it, and cs:move-applied
    // needs it. This may change with the contract review: if game:state starts carrying it, drop fensAfter.
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
    const mover = state.turn;
    // a move withdraws the pending draw offer (docs/protocol.md §7)
    const { drawOffer: _withdrawn, ...rest } = state;
    this.state = {
      ...rest,
      fen: moved.fen,
      plyCount: moved.ply,
      turn: turnOf(moved.fen),
      moves: [...state.moves, { ply: moved.ply, uci: moved.uci, san: moved.san }],
    };
    if (moved.clock !== undefined) this.setClock(moved.clock);
    this.lastUci = moved.uci;
    this.arrow = undefined;
    this.error = '';
    this.drawDeclined = false;
    this.emitEvent('cs:move-applied', { v: 1, gameId: moved.gameId, ply: moved.ply, uci: moved.uci, san: moved.san, fen: moved.fen });
    this.announcePosition(this.state);
    // only a move that arrives live sounds: loading the state of a game is silent
    this.beep(moved.san.includes('x') ? 'capture' : 'move');
    this.readAloud(mover, moved.san);
    this.requestUpdate();
  };

  private readonly onEnd = (end: GameEnd): void => {
    if (end.gameId !== this.context?.gameId) return;
    // whoever comes back to a finished game learns the result again: that is not news
    if (this.end === undefined && this.state?.status === 'active') this.beep('end');
    this.end = end;
    this.arrow = undefined;
    this.freezeClock(end);
    if (this.state !== undefined) this.state = { ...this.state, status: end.termination === 'aborted' ? 'aborted' : 'finished' };
    this.emitEvent('cs:game-ended', { v: 1, gameId: end.gameId, result: end.result, termination: end.termination });
    this.requestUpdate();
  };

  /** The clocks stop where they were; the one that ran out shows zero. */
  private freezeClock(end: GameEnd): void {
    const clock = this.clock;
    if (clock === undefined || clock.value.running === null) return;
    const running = clock.value.running;
    const key = `${running}Ms` as const;
    const left = end.termination === 'timeout' ? 0 : Math.max(0, clock.value[key] - (Date.now() - clock.receivedAt));
    this.setClock({ ...clock.value, [key]: left, running: null });
  }

  private readonly onDraw = (draw: GameDraw): void => {
    const state = this.state;
    if (state === undefined || draw.gameId !== state.gameId) return;
    this.drawDeclined = draw.offeredBy === null && state.drawOffer === state.yourColor;
    const { drawOffer: _previous, ...rest } = state;
    this.state = draw.offeredBy === null ? rest : { ...rest, drawOffer: draw.offeredBy };
    this.error = '';
    this.requestUpdate();
  };

  /** A rematch both accepted opens right away for both players; an old one, found on rejoin, waits for the button. */
  private readonly onReaction = (reaction: GameReaction): void => {
    const state = this.state;
    if (state === undefined || reaction.gameId !== state.gameId) return;
    const mine = reaction.from === state.yourColor;
    const who = mine ? 'Tú' : (state.seats[reaction.from]?.displayName ?? COLOR_TEXT[reaction.from]);
    this.clearReaction();
    this.reaction = { text: `${who}: ${REACTION_TEXT[reaction.reaction]}`, mine };
    this.reactionTimer = setTimeout(() => {
      this.clearReaction();
      this.requestUpdate();
    }, REACTION_SHOWN_MS);
    this.requestUpdate();
  };

  private readonly onRematch = (rematch: GameRematch): void => {
    const state = this.state;
    if (state === undefined || rematch.gameId !== state.gameId) return;
    this.rematchDeclined = rematch.offeredBy === null && rematch.nextGameId === undefined && state.rematchOffer === state.yourColor;
    const { rematchOffer: _previous, ...rest } = state;
    this.state = {
      ...rest,
      ...(rematch.offeredBy === null ? {} : { rematchOffer: rematch.offeredBy }),
      ...(rematch.nextGameId === undefined ? {} : { nextGameId: rematch.nextGameId }),
    };
    this.error = '';
    this.requestUpdate();
    if (rematch.nextGameId !== undefined) this.openGame(rematch.nextGameId);
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

  /** Only a finished game is reviewed: a live board always shows the game. */
  private readonly onReview = (event: Event): void => {
    const { gameId, ply } = (event as CustomEvent<CsEventDetail<'cs:review'>>).detail;
    if (gameId !== this.context?.gameId || this.end === undefined || this.state === undefined) return;
    this.reviewPly = ply === null || ply >= this.state.moves.length ? undefined : ply;
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
