import { ApiError, createGame, signIn } from './api.js';
import { readConfig, timeoutMs } from './config.js';
import { connect, type GameConnection } from './connection.js';
import { contextFor } from './contexts.js';
import { loadMicrofrontend } from './loader.js';
import { gameIdOf, parseRoute, type Route } from './router.js';
import { renderSessionBar } from './session-bar.js';
import { clearSession, loadSession, saveSession } from './session.js';
import { forwardVoiceAttempts } from './telemetry.js';

const TAGS = ['mf-game', 'mf-voice-input', 'mf-history'] as const;
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

function describeRoute(route: Route): string {
  if (route.name === 'home') return 'Inicio (sin partida)';
  if (route.name === 'game') return `Partida ${route.id}`;
  return `Ruta desconocida: ${route.hash}`;
}

function failure(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Algo salió mal. Inténtalo de nuevo.';
}

function render(): void {
  const route = parseRoute(location.hash);
  const routeLabel = document.getElementById('cs-route');
  if (routeLabel !== null) routeLabel.textContent = describeRoute(route);
  const gameId = gameIdOf(route);

  const bar = document.getElementById('cs-session');
  if (bar !== null) {
    renderSessionBar(bar, { displayName: session?.identity.displayName ?? null, gameId, online, inviteUrl: location.href, message }, { signIn: enter, createGame: startGame, signOut: leave });
  }
  for (const [tag, element] of mounted) {
    // every new context object makes <mf-game> ask the server for the state, which a reconnection needs
    (element as HTMLElement & { context?: unknown }).context = contextFor(tag, gameId, config.PUBLIC_AGENT_URL || null, online ? connection : null);
  }
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

function startGame(color: 'white' | 'black' | 'random'): void {
  if (session === null) return;
  createGame(config.PUBLIC_API_URL, session.token, color).then(
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
forwardVoiceAttempts(document, () => connection);
render();
// Each microfrontend loads on its own: one failing never blocks the others.
void Promise.all(TAGS.map(mount)).then(() => {
  document.documentElement.dataset.shellReady = 'true';
  // only now: a position sent before <mf-voice-input> is listening would be lost
  openConnection();
});
