// Smoke test of web/dist in a headless Chrome or Edge (no dependencies; talks CDP over Node's WebSocket).
// Usage: pnpm build:web && pnpm smoke:web        (not part of pnpm verify; set CHROME_PATH to pick a browser)
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'web', 'dist');

function findBrowser() {
  const env = process.env;
  const candidates = [
    env.CHROME_PATH,
    ...[env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]
      .filter(Boolean)
      .flatMap((base) => [join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'), join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe')]),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
  return candidates.find((path) => path && existsSync(path));
}

const browserPath = findBrowser();
if (browserPath === undefined) {
  console.error('smoke:web: no encontré Chrome ni Edge. Instala uno de los dos o define la variable CHROME_PATH con la ruta del ejecutable.');
  process.exit(2);
}
if (!existsSync(join(dist, 'index.html'))) {
  console.error('smoke:web: no existe web/dist/index.html. Ejecuta primero: pnpm build:web');
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomPort = () => 20000 + Math.floor(Math.random() * 20000);

function kill(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGKILL');
}

async function waitFor(check, what, timeout = 10000) {
  const limit = Date.now() + timeout;
  for (;;) {
    try {
      const value = await check();
      if (value) return value;
    } catch {
      // not ready yet
    }
    if (Date.now() > limit) throw new Error(`tiempo agotado esperando: ${what}`);
    await sleep(100);
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let nextId = 0;
    const pending = new Map();
    const listeners = [];
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined && pending.has(message.id)) {
        const { resolve: ok, reject: fail } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) fail(new Error(message.error.message));
        else ok(message.result);
      } else if (message.method) {
        for (const listener of listeners) listener(message);
      }
    };
    ws.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((ok, fail) => {
            const id = ++nextId;
            pending.set(id, { resolve: ok, reject: fail });
            ws.send(JSON.stringify({ id, method, params }));
          }),
        on: (listener) => listeners.push(listener),
        close: () => ws.close(),
      });
    ws.onerror = () => reject(new Error('no se pudo abrir el WebSocket de depuración'));
  });
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const servePort = randomPort();
const debugPort = randomPort();
const profile = mkdtempSync(join(tmpdir(), 'chessspeak-smoke-'));
const base = `http://127.0.0.1:${servePort}`;
const server = spawn(process.execPath, [join(root, 'scripts', 'serve-web.mjs')], {
  env: { ...process.env, SERVE_WEB_PORT: String(servePort) },
  stdio: 'ignore',
});
const browser = spawn(
  browserPath,
  [`--headless=new`, `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1280,900', 'about:blank'],
  { stdio: 'ignore' },
);

let page;
try {
  console.log(`smoke:web con ${browserPath}\nservidor ${base}`);
  await waitFor(() => fetch(`${base}/index.html`).then((r) => r.ok), 'el servidor estático');
  const version = await waitFor(() => fetch(`http://127.0.0.1:${debugPort}/json/version`).then((r) => r.json()), 'el navegador');
  console.log(`navegador: ${version.Browser}`);
  const targets = await waitFor(() => fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) => r.json()).then((list) => list.filter((t) => t.type === 'page')), 'una pestaña');
  page = await connect(targets[0].webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  await page.send('Network.setCacheDisabled', { cacheDisabled: true });

  const consoleErrors = [];
  const foreignRequests = [];
  page.on((message) => {
    if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.requestWillBeSent') {
      const url = message.params.request.url;
      if (!url.startsWith(base) && !url.startsWith('data:') && !url.startsWith('about:')) foreignRequests.push(url);
    }
  });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  const open = async (url) => {
    await page.send('Page.navigate', { url: 'about:blank' });
    await sleep(100);
    await page.send('Page.navigate', { url });
    await waitFor(() => evaluate('document.readyState === "complete" && location.href !== "about:blank"'), `cargar ${url}`);
  };
  const boardOf = (selector) =>
    `(() => { const el = document.querySelector('${selector}'); return el ? { pieces: el.querySelectorAll('cg-board piece').length, wrap: !!el.querySelector('.cg-wrap'), manipulable: !!el.querySelector('.cg-wrap.manipulable'), art: el.querySelector('cg-board piece') ? getComputedStyle(el.querySelector('cg-board piece')).backgroundImage.startsWith('url("data:') : false, shadow: !!el.shadowRoot } : null; })()`;

  // 1. the shell with all three microfrontends
  await open(`${base}/index.html#/game/demo`);
  await waitFor(() => evaluate('document.documentElement.dataset.shellReady === "true"'), 'el shell listo');
  const tags = await evaluate('["mf-game","mf-voice-input","mf-history"].map((t) => !!customElements.get(t))');
  check('el shell registra <mf-game>, <mf-voice-input> y <mf-history>', tags.every(Boolean), JSON.stringify(tags));
  await waitFor(() => evaluate(`document.querySelectorAll('mf-game cg-board piece').length > 0`), 'el tablero');
  const board = await evaluate(boardOf('mf-game'));
  check('<mf-game> pinta un tablero chessground con 32 piezas', board?.pieces === 32, `piezas: ${board?.pieces}`);
  check('el tablero está en modo viewOnly (no manipulable) y sin Shadow DOM', board?.wrap === true && board?.manipulable === false && board?.shadow === false);
  check('las piezas vienen embebidas (data URI), no de un archivo externo', board?.art === true);
  const injected = await evaluate(`({ game: document.querySelector('mf-game').context?.gameId, voice: document.querySelector('mf-voice-input').textContent, history: document.querySelector('mf-history').textContent })`);
  check('el shell inyecta el contexto simulado por el.context', injected.game === 'demo' && injected.voice.includes('es-CO') && injected.voice.includes('400 ms') && injected.history.includes('demo'));
  await evaluate(`location.hash = '#/'`);
  await waitFor(() => evaluate(`document.querySelector('mf-game').textContent.includes('sin partida')`), 'el cambio de ruta');
  check('el router por hash actualiza el contexto (#/ sin partida)', true);

  // 2. each standalone page works on its own
  const standalone = [
    ['mf-game', async () => (await evaluate(boardOf('mf-game')))?.pieces === 32],
    ['mf-voice-input', async () => evaluate(`document.querySelector('mf-voice-input').textContent.includes('es-CO')`)],
    ['mf-history', async () => evaluate(`document.querySelector('mf-history').textContent.includes('e2e4')`)],
  ];
  for (const [tag, ready] of standalone) {
    await open(`${base}/standalone/${tag}/index.html`);
    let ok = false;
    try {
      ok = await waitFor(ready, `la página standalone de ${tag}`);
    } catch {
      ok = false;
    }
    const logged = await evaluate(`document.getElementById('log')?.textContent.includes('cs:mf-ready') ?? false`);
    check(`la página standalone de <${tag}> funciona sola`, ok === true && logged === true);
  }

  // 3. fallback: a microfrontend that does not load must not break the others
  await page.send('Network.setBlockedURLs', { urls: ['*mf-history.js*'] });
  await open(`${base}/index.html#/game/demo`);
  await waitFor(() => evaluate('document.documentElement.dataset.shellReady === "true"'), 'el shell listo con un microfrontend caído');
  const notice = await evaluate(`document.querySelector('[data-unavailable="mf-history"]')?.textContent ?? null`);
  check('si <mf-history> no carga, el shell avisa «mf-history no disponible»', notice === 'mf-history no disponible', String(notice));
  const others = await evaluate(boardOf('mf-game'));
  const voiceOk = await evaluate(`!!customElements.get('mf-voice-input') && document.querySelector('mf-voice-input') !== null`);
  check('los demás microfrontends siguen funcionando', others?.pieces === 32 && voiceOk === true);
  await page.send('Network.setBlockedURLs', { urls: [] });

  check('no hubo peticiones a hosts externos', foreignRequests.length === 0, foreignRequests.join(', '));
  check('no hubo excepciones en la página', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (error) {
  check('la prueba terminó sin errores', false, error.message);
} finally {
  page?.close();
  kill(browser);
  kill(server);
  await sleep(1000);
  // Windows can keep the browser profile locked for a moment: a leftover temp folder must not change the result
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (error) {
    console.log(`aviso: no se pudo borrar ${profile} (${error.code})`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(failed.length === 0 ? `\nOK: ${results.length} comprobaciones.` : `\nFALLÓ: ${failed.length} de ${results.length} comprobaciones.`);
process.exit(failed.length === 0 ? 0 : 1);
