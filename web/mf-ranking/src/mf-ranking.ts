import { LitElement, html } from 'lit';
import {
  CS_EVENT_INIT,
  profileResponseSchema,
  rankingResponseSchema,
  type CsEventDetail,
  type ProfileGame,
  type ProfileResponse,
  type RankingContext,
  type RankingResponse,
} from '@chessspeak/shared';
import ownCss from './styles.css?inline';

// Light DOM means the styles are global: inject them once.
const STYLE_ID = 'csr-styles';
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = ownCss;
  document.head.append(style);
}

type State =
  | { name: 'idle' }
  | { name: 'loading' }
  | { name: 'ready'; ranking: RankingResponse }
  | { name: 'error'; message: string };

/** The profile open over the ranking, if any. */
type ProfileState =
  | { name: 'loading'; displayName: string }
  | { name: 'ready'; profile: ProfileResponse }
  | { name: 'error'; displayName: string; message: string };

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

const OUTCOME_TEXT: Record<ProfileGame['outcome'], string> = { win: 'Ganó', draw: 'Tablas', loss: 'Perdió' };
const TERMINATION_TEXT: Record<NonNullable<ProfileGame['termination']>, string> = {
  checkmate: 'jaque mate',
  stalemate: 'ahogado',
  insufficient_material: 'material insuficiente',
  resignation: 'abandono',
  abandonment: 'desconexión',
  aborted: 'cancelada',
  threefold_repetition: 'triple repetición',
  fifty_moves: '50 jugadas',
  agreement: 'mutuo acuerdo',
  timeout: 'tiempo',
};

const signed = (value: number): string => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '±0');
const shortDate = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

/** The Elo after each game as a line, scaled to its own minimum and maximum. */
function sparkline(history: readonly number[]) {
  const width = 240;
  const height = 48;
  const low = Math.min(...history);
  const span = Math.max(...history) - low || 1;
  const step = history.length > 1 ? width / (history.length - 1) : 0;
  const points = history.map((rating, index) => `${(index * step).toFixed(1)},${(height - ((rating - low) / span) * height).toFixed(1)}`).join(' ');
  return html`<svg class="csr-spark" viewBox="-2 -2 ${width + 4} ${height + 4}" preserveAspectRatio="none" role="img" aria-label=${`Elo de ${history[0]} a ${history.at(-1)}`}>
    <polyline points=${points} fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" />
  </svg>`;
}

/**
 * The Elo ranking of the finished games. It reads the public GET /ranking by itself (no socket, no token) and
 * reloads each time the shell marks it `active`, so the table is fresh whenever the route is opened.
 */
export class MfRanking extends LitElement {
  static override properties = { context: { attribute: false } };
  declare context: RankingContext | undefined;

  private state: State = { name: 'idle' };
  private profile: ProfileState | undefined;
  private wasActive = false;
  /** Only the answer to the last request is shown. */
  private request = 0;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    const detail: CsEventDetail<'cs:mf-ready'> = { v: 1, name: 'mf-ranking' };
    this.dispatchEvent(new CustomEvent('cs:mf-ready', { ...CS_EVENT_INIT, detail }));
  }

  protected override willUpdate(): void {
    const active = this.context?.active === true;
    if (active && !this.wasActive) {
      this.profile = undefined;
      void this.load();
    }
    this.wasActive = active;
  }

  /** Asks the server again. Also the "Actualizar" button. */
  async load(): Promise<void> {
    const apiUrl = this.context?.apiUrl ?? null;
    const request = ++this.request;
    if (apiUrl === null) {
      this.show(request, { name: 'error', message: 'La web no tiene servidor configurado.' });
      return;
    }
    this.show(request, { name: 'loading' });
    let response: Response;
    try {
      response = await fetch(`${apiUrl.replace(/\/+$/, '')}/ranking`);
    } catch {
      this.show(request, { name: 'error', message: 'No se pudo conectar con el servidor.' });
      return;
    }
    if (!response.ok) {
      this.show(request, { name: 'error', message: `El servidor respondió con un error (${response.status}).` });
      return;
    }
    const parsed = rankingResponseSchema.safeParse(await response.json().catch(() => null));
    this.show(request, parsed.success ? { name: 'ready', ranking: parsed.data } : { name: 'error', message: 'El servidor envió un ranking que no se entiende.' });
  }

  /** Opens the profile of a player of the table. */
  async openProfile(displayName: string): Promise<void> {
    const apiUrl = this.context?.apiUrl ?? null;
    const request = ++this.request;
    if (apiUrl === null) return;
    this.showProfile(request, { name: 'loading', displayName });
    let response: Response;
    try {
      response = await fetch(`${apiUrl.replace(/\/+$/, '')}/ranking/${encodeURIComponent(displayName)}`);
    } catch {
      this.showProfile(request, { name: 'error', displayName, message: 'No se pudo conectar con el servidor.' });
      return;
    }
    if (!response.ok) {
      const message = response.status === 404 ? 'Este jugador aún no tiene partidas terminadas.' : `El servidor respondió con un error (${response.status}).`;
      this.showProfile(request, { name: 'error', displayName, message });
      return;
    }
    const parsed = profileResponseSchema.safeParse(await response.json().catch(() => null));
    this.showProfile(request, parsed.success ? { name: 'ready', profile: parsed.data } : { name: 'error', displayName, message: 'El servidor envió un perfil que no se entiende.' });
  }

  private closeProfile(): void {
    this.request++;
    this.profile = undefined;
    this.requestUpdate();
  }

  private showProfile(request: number, profile: ProfileState): void {
    if (request !== this.request) return;
    this.profile = profile;
    this.requestUpdate();
  }

  private show(request: number, state: State): void {
    if (request !== this.request) return;
    this.state = state;
    this.requestUpdate();
  }

  private renderBody() {
    const { state } = this;
    if (state.name === 'idle' || state.name === 'loading') return html`<p class="csr-info">Cargando el ranking…</p>`;
    if (state.name === 'error') return html`<p class="csr-info csr-error" role="alert">${state.message}</p>`;
    const { entries, gamesRated } = state.ranking;
    if (entries.length === 0) return html`<p class="csr-info">Aún no hay partidas terminadas. Juega una hasta el final para entrar al ranking.</p>`;
    return html`<div class="csr-scroll">
        <table class="csr-table">
          <thead>
            <tr>
              <th scope="col" class="csr-rank">#</th>
              <th scope="col">Jugador</th>
              <th scope="col" class="csr-num">Elo</th>
              <th scope="col" class="csr-num" title="Partidas jugadas">PJ</th>
              <th scope="col" class="csr-num" title="Ganadas">G</th>
              <th scope="col" class="csr-num" title="Tablas">E</th>
              <th scope="col" class="csr-num" title="Perdidas">P</th>
              <th scope="col" class="csr-num csr-wide">% victorias</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(
              (entry) => html`<tr data-rank=${entry.rank}>
                <td class="csr-rank">${entry.rank}</td>
                <td class="csr-player">
                  <button type="button" class="csr-player-link" data-player=${entry.displayName} title="Ver perfil" @click=${() => void this.openProfile(entry.displayName)}>${entry.displayName}</button>
                </td>
                <td class="csr-num csr-rating">${entry.rating}</td>
                <td class="csr-num">${entry.games}</td>
                <td class="csr-num">${entry.wins}</td>
                <td class="csr-num">${entry.draws}</td>
                <td class="csr-num">${entry.losses}</td>
                <td class="csr-num csr-wide">${Math.round((entry.wins * 100) / entry.games)} %</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
      <p class="csr-foot">Calculado con ${plural(gamesRated, 'partida terminada', 'partidas terminadas')}. Todos empiezan con 1200.</p>`;
  }

  private renderProfile(state: ProfileState) {
    const back = html`<button type="button" class="csr-back" data-action="back" @click=${() => this.closeProfile()}>← Volver al ranking</button>`;
    if (state.name === 'loading') return html`${back}<p class="csr-info">Cargando el perfil de ${state.displayName}…</p>`;
    if (state.name === 'error') return html`${back}<p class="csr-info csr-error" role="alert">${state.message}</p>`;
    const { entry, games, ratingHistory } = state.profile;
    const peak = Math.max(...ratingHistory);
    return html`${back}
      <div class="csr-profile">
        <h3 class="csr-profile-name">${entry.displayName}</h3>
        <dl class="csr-stats">
          <div><dt>Puesto</dt><dd>${entry.rank}</dd></div>
          <div><dt>Elo</dt><dd class="csr-rating">${entry.rating}</dd></div>
          <div><dt>Máximo</dt><dd>${peak}</dd></div>
          <div><dt>Balance</dt><dd>${entry.wins} G · ${entry.draws} E · ${entry.losses} P</dd></div>
        </dl>
        ${ratingHistory.length > 1 ? sparkline(ratingHistory) : ''}
      </div>
      <div class="csr-scroll">
        <table class="csr-table csr-games">
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Color</th>
              <th scope="col">Rival</th>
              <th scope="col">Resultado</th>
              <th scope="col" class="csr-wide">Cómo</th>
              <th scope="col" class="csr-num">Elo</th>
            </tr>
          </thead>
          <tbody>
            ${games.map(
              (game) => html`<tr data-outcome=${game.outcome}>
                <td>${shortDate(game.finishedAt)}</td>
                <td>${game.color === 'white' ? 'Blancas' : 'Negras'}</td>
                <td class="csr-player">${game.opponent}</td>
                <td class="csr-outcome">${OUTCOME_TEXT[game.outcome]}</td>
                <td class="csr-wide">${game.termination === null ? '—' : TERMINATION_TEXT[game.termination]}</td>
                <td class="csr-num">${game.rating} <span class="csr-change">${signed(game.ratingChange)}</span></td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
      <p class="csr-foot">Últimas ${plural(games.length, 'partida', 'partidas')} de ${plural(entry.games, 'puntuada', 'puntuadas')}.</p>`;
  }

  protected override render() {
    return html`<div class="csr-root">
      <div class="csr-head">
        <h2 class="csr-title">Ranking</h2>
        <span class="csr-sub">Elo de las partidas terminadas</span>
        <button type="button" class="csr-refresh" ?disabled=${this.state.name === 'loading'} @click=${() => void this.load()}>Actualizar</button>
      </div>
      ${this.profile === undefined ? this.renderBody() : this.renderProfile(this.profile)}
    </div>`;
  }
}

if (!customElements.get('mf-ranking')) customElements.define('mf-ranking', MfRanking);

declare global {
  interface HTMLElementTagNameMap {
    'mf-ranking': MfRanking;
  }
}
