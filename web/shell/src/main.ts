import { ApiError, createGame, signIn } from './api.js';
import { readConfig, timeoutMs } from './config.js';
import { connect, type GameConnection } from './connection.js';
import { contextFor } from './contexts.js';
import { fetchOpenGames, renderLobby, type LobbyState } from './lobby.js';
import { loadMicrofrontend } from './loader.js';
import { followGameRequests } from './navigation.js';
import { gameIdOf, parseRoute, type Route } from './router.js';
import { renderSessionBar } from './session-bar.js';
import { clearSession, loadSession, saveSession } from './session.js';
import { forwardVoiceAttempts } from './telemetry.js';
import { followTurn } from './turn-title.js';
import { fetchVoiceSummary, renderVoiceSummary, type VoiceSummaryState } from './voice-summary.js';

const TAGS = ['mf-game', 'mf-voice-input', 'mf-history', 'mf-ranking'] as const;
/** How often the home route reads the open games again. */
const LOBBY_REFRESH_MS = 15_000;
const config = readConfig();
const mounted = new Map<string, HTMLElement>();

function tabStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

const storage = tabStorage();
let session = loadSession(storage);
let connection: GameConnection | null = null;
let online = false;
let message = '';
let lobby: LobbyState = { games: null, error: '' };
let lobbyTimer: ReturnType<typeof setInterval> | undefined;
/** Answers that arrive after a newer request are dropped. */
let lobbyRequest = 0;
let voiceSummary: VoiceSummaryState = { summary: null, error: '' };
let voiceRequest = 0;

function describeRoute(route: Route): string {
  if (route.name === 'home') return 'Inicio (sin partida)';
  // the start of the id is enough to tell games apart; the whole link is in the session bar
  if (route.name === 'game') return `Partida ${route.id.slice(0, 8)}`;
  if (route.name === 'ranking') return 'Ranking de jugadores';
  if (route.name === 'voice') return 'Telemetría de voz';
  return `Ruta desconocida: ${route.hash}`;
}

function failure(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Algo salió mal. Inténtalo de nuevo.';
}

function render(): void {
  const route = parseRoute(location.hash);
  const routeLabel = document.getElementById('cs-route');
  if (routeLabel !== null) routeLabel.textContent = describeRoute(route);
  const hash = location.hash === '' || location.hash === '#' ? '#/' : location.hash;
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.cs-nav a')) {
    if (link.getAttribute('href') === hash) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const gameId = gameIdOf(route);
  // the ranking takes the place of the board; the game microfrontends stay mounted underneath
  const main = document.getElementById('cs-main');
  if (main !== null) main.dataset.view = route.name === 'ranking' || route.name === 'voice' ? route.name : 'game';
  const ranking = { apiUrl: config.PUBLIC_API_URL || null, active: route.name === 'ranking' };
  showLobby(route.name === 'home');
  showVoiceSummary(route.name === 'voice');
  updateTitle();

  const bar = document.getElementById('cs-session');
  if (bar !== null) {
    renderSessionBar(bar, { displayName: session?.identity.displayName ?? null, gameId, online, inviteUrl: location.href, message }, { signIn: enter, createGame: startGame, signOut: leave });
  }
  for (const [tag, element] of mounted) {
    // every new context object makes <mf-game> ask the server for the state, which a reconnection needs
    (element as HTMLElement & { context?: unknown }).context = contextFor(tag, gameId, config.PUBLIC_AGENT_URL || null, online ? connection : null, ranking);
  }
}

function refreshLobby(): void {
  if (config.PUBLIC_API_URL === '') {
    lobby = { games: null, error: 'Falta PUBLIC_API_URL en la configuración de la web.' };
    drawLobby();
    return;
  }
  const request = ++lobbyRequest;
  fetchOpenGames(config.PUBLIC_API_URL).then(
    (games) => {
      if (request !== lobbyRequest) return;
      lobby = { games, error: '' };
      drawLobby();
    },
    (error: unknown) => {
      if (request !== lobbyRequest) return;
      lobby = { games: lobby.games, error: failure(error) };
      drawLobby();
    },
  );
}

function drawLobby(): void {
  const host = document.getElementById('cs-lobby');
  if (host !== null && !host.hidden) renderLobby(host, lobby, refreshLobby);
}

/** The lobby is only on the home route; it reads the list when the route opens and then every LOBBY_REFRESH_MS. */
function showLobby(visible: boolean): void {
  const host = document.getElementById('cs-lobby');
  if (host === null) return;
  const opening = visible && host.hidden;
  host.hidden = !visible;
  if (!visible) {
    clearInterval(lobbyTimer);
    lobbyTimer = undefined;
    return;
  }
  if (opening) {
    refreshLobby();
    lobbyTimer = setInterval(refreshLobby, LOBBY_REFRESH_MS);
  }
  drawLobby();
}

function refreshVoiceSummary(): void {
  if (config.PUBLIC_API_URL === '') {
    voiceSummary = { summary: null, error: 'Falta PUBLIC_API_URL en la configuración de la web.' };
    drawVoiceSummary();
    return;
  }
  const request = ++voiceRequest;
  fetchVoiceSummary(config.PUBLIC_API_URL).then(
    (summary) => {
      if (request !== voiceRequest) return;
      voiceSummary = { summary, error: '' };
      drawVoiceSummary();
    },
    (error: unknown) => {
      if (request !== voiceRequest) return;
      voiceSummary = { summary: voiceSummary.summary, error: failure(error) };
      drawVoiceSummary();
    },
  );
}

function drawVoiceSummary(): void {
  const host = document.getElementById('cs-voice');
  if (host !== null && !host.hidden) renderVoiceSummary(host, voiceSummary, refreshVoiceSummary);
}

/** The route #/voz reads the summary each time it opens; nothing polls it. */
function showVoiceSummary(visible: boolean): void {
  const host = document.getElementById('cs-voice');
  if (host === null) return;
  const opening = visible && host.hidden;
  host.hidden = !visible;
  if (opening) refreshVoiceSummary();
  if (visible) drawVoiceSummary();
}

function openConnection(): void {
  if (session === null || connection !== null || config.PUBLIC_API_URL === '') return;
  connection = connect(config.PUBLIC_API_URL, session.token, {
    up: () => {
      online = true;
      message = '';
      render();
    },
    down: () => {
      online = false;
      render();
    },
    refused: () => {
      forgetSession('Tu sesión ya no es válida. Vuelve a entrar.');
    },
  });
}

function forgetSession(text: string): void {
  connection?.disconnect();
  connection = null;
  online = false;
  session = null;
  clearSession(storage);
  message = text;
  render();
}

function enter(displayName: string): void {
  if (config.PUBLIC_API_URL === '') {
    message = 'Falta PUBLIC_API_URL en la configuración de la web.';
    render();
    return;
  }
  signIn(config.PUBLIC_API_URL, displayName).then(
    (created) => {
      session = created;
      saveSession(storage, created);
      message = '';
      openConnection();
      render();
    },
    (error: unknown) => {
      message = failure(error);
      render();
    },
  );
}

function startGame(color: 'white' | 'black' | 'random', clockMinutes: 3 | 5 | 10 | undefined): void {
  if (session === null) return;
  createGame(config.PUBLIC_API_URL, session.token, clockMinutes === undefined ? { color } : { color, clockMinutes }).then(
    (gameId) => {
      message = '';
      location.hash = `#/game/${gameId}`;
    },
    (error: unknown) => {
      message = failure(error);
      render();
    },
  );
}

function leave(): void {
  forgetSession('');
}

function showUnavailable(slot: Element, tag: string): void {
  const notice = document.createElement('p');
  notice.className = 'cs-unavailable';
  notice.dataset.unavailable = tag;
  notice.textContent = `${tag} no disponible`;
  slot.replaceChildren(notice);
}

async function mount(tag: (typeof TAGS)[number]): Promise<void> {
  const slot = document.querySelector(`[data-mf="${tag}"]`);
  if (slot === null) return;
  const ok = await loadMicrofrontend(tag, `./mf/${tag}.js`, timeoutMs(config));
  if (!ok) {
    showUnavailable(slot, tag);
    return;
  }
  const element = document.createElement(tag);
  mounted.set(tag, element);
  render();
  slot.replaceChildren(element);
}

window.addEventListener('hashchange', render);
followGameRequests(document, (hash) => {
  location.hash = hash;
});
forwardVoiceAttempts(document, () => connection);
const updateTitle = followTurn(document, () => gameIdOf(parseRoute(location.hash)), (title) => {
  document.title = title;
});
render();
// Each microfrontend loads on its own: one failing never blocks the others.
void Promise.all(TAGS.map(mount)).then(() => {
  document.documentElement.dataset.shellReady = 'true';
  // only now: a position sent before <mf-voice-input> is listening would be lost
  openConnection();
});
