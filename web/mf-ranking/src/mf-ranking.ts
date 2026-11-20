import { LitElement, html } from 'lit';
import { CS_EVENT_INIT, rankingResponseSchema, type CsEventDetail, type RankingContext, type RankingResponse } from '@chessspeak/shared';
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

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/**
 * The Elo ranking of the finished games. It reads the public GET /ranking by itself (no socket, no token) and
 * reloads each time the shell marks it `active`, so the table is fresh whenever the route is opened.
 */
export class MfRanking extends LitElement {
  static override properties = { context: { attribute: false } };
  declare context: RankingContext | undefined;

  private state: State = { name: 'idle' };
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
    if (active && !this.wasActive) void this.load();
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
                <td class="csr-player">${entry.displayName}</td>
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

  protected override render() {
    return html`<div class="csr-root">
      <div class="csr-head">
        <h2 class="csr-title">Ranking</h2>
        <span class="csr-sub">Elo de las partidas terminadas</span>
        <button type="button" class="csr-refresh" ?disabled=${this.state.name === 'loading'} @click=${() => void this.load()}>Actualizar</button>
      </div>
      ${this.renderBody()}
    </div>`;
  }
}

if (!customElements.get('mf-ranking')) customElements.define('mf-ranking', MfRanking);

declare global {
  interface HTMLElementTagNameMap {
    'mf-ranking': MfRanking;
  }
}
