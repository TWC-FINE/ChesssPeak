import { readConfig, timeoutMs } from './config.js';
import { loadMicrofrontend } from './loader.js';
import { mockContext } from './mocks.js';
import { gameIdOf, parseRoute, type Route } from './router.js';

const TAGS = ['mf-game', 'mf-voice-input', 'mf-history'] as const;
const config = readConfig();
const mounted = new Map<string, HTMLElement>();

function describeRoute(route: Route): string {
  if (route.name === 'home') return 'Inicio (sin partida)';
  if (route.name === 'game') return `Partida ${route.id}`;
  return `Ruta desconocida: ${route.hash}`;
}

function render(): void {
  const route = parseRoute(location.hash);
  const routeLabel = document.getElementById('cs-route');
  if (routeLabel !== null) routeLabel.textContent = describeRoute(route);
  const gameId = gameIdOf(route);
  for (const [tag, element] of mounted) {
    (element as HTMLElement & { context?: unknown }).context = mockContext(tag, gameId, config.PUBLIC_AGENT_URL || null);
  }
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
render();
// Each microfrontend loads on its own: one failing never blocks the others.
void Promise.all(TAGS.map(mount)).then(() => {
  document.documentElement.dataset.shellReady = 'true';
});
