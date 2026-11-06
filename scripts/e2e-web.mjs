// End-to-end test of a game between two guests, in a real Edge or Chrome driven over CDP (no dependencies).
// It clicks and types like a person, and saves screenshots.
//   docker compose up -d && pnpm e2e:web         (not part of pnpm verify; not a measurement: it times nothing)
// Uses only the local _test databases, and refuses anything else. Set BROWSER_PATH to pick a browser, and
// E2E_OUT for the screenshots. It leaves web/dist built against a temporary port: run pnpm build:web afterwards.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomPort = () => 20000 + Math.floor(Math.random() * 20000);

function localTestUrl(name) {
  const raw = process.env[name];
  if (!raw) throw new Error(`Falta ${name} en .env (ejecuta: pnpm env:init)`);
  const url = new URL(raw);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error(`${name} no apunta a esta máquina`);
  if (!url.pathname.endsWith('_test')) throw new Error(`${name} no usa una base _test`);
  return raw;
}

function findBrowser() {
  const { BROWSER_PATH, PROGRAMFILES, LOCALAPPDATA } = process.env;
  const programFiles86 = process.env['PROGRAMFILES(X86)'];
  return [
    BROWSER_PATH,
    ...[programFiles86, PROGRAMFILES, LOCALAPPDATA].filter(Boolean).flatMap((base) => [join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), join(base, 'Google', 'Chrome', 'Application', 'chrome.exe')]),
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
  ].find((path) => path && existsSync(path));
}

function run(command, cwd, env) {
  const result = spawnSync(command, { cwd, env, stdio: 'inherit', shell: true });
  if (result.status !== 0) throw new Error(`falló: ${command}`);
}

function kill(child) {
  if (child === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGKILL');
}

async function waitFor(check, what, timeout = 15000) {
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

function cdp(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let nextId = 0;
    const pending = new Map();
    const listeners = [];
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined && pending.has(message.id)) {
        const { ok, fail } = pending.get(message.id);
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
            pending.set(id, { ok, fail });
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

const debugPort = randomPort();
const webPort = randomPort();
const apiPort = randomPort();
const web = `http://127.0.0.1:${webPort}`;
const api = `http://127.0.0.1:${apiPort}`;
const out = process.env.E2E_OUT ?? mkdtempSync(join(tmpdir(), 'chessspeak-e2e-'));
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'chessspeak-e2e-profile-'));
const serverEnv = {
  ...process.env,
  DATABASE_URL: localTestUrl('DATABASE_URL_TEST'),
  MONGO_URI: localTestUrl('MONGO_URI_TEST'),
  PORT: String(apiPort),
  CORS_ORIGINS: web,
};

const startServer = () => spawn(process.execPath, ['dist/main.js'], { cwd: join(root, 'server'), env: serverEnv, stdio: 'ignore' });
const apiUp = () => fetch(`${api}/health`).then((r) => r.ok);

let server;
let browser;
let staticServer;
let exitCode = 1;

/** One tab: its own sessionStorage, so its own guest. */
async function openTab(label) {
  const { targetId } = await browserApi.send('Target.createTarget', { url: 'about:blank' });
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) => r.json());
  const page = await cdp(targets.find((t) => t.id === targetId).webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const exceptions = [];
  page.on((message) => {
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  const text = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
  const tab = {
    label,
    exceptions,
    evaluate,
    text,
    open: async (url) => {
      await page.send('Page.navigate', { url });
      await waitFor(() => evaluate('document.documentElement.dataset.shellReady === "true"'), `${label}: cargar la página`);
    },
    reload: async () => {
      await page.send('Page.reload');
      await sleep(300);
      await waitFor(() => evaluate('document.documentElement.dataset.shellReady === "true"'), `${label}: recargar`);
    },
    click: async (selector) => {
      const box = await waitFor(() => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`), `${label}: ${selector}`);
      for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    },
    type: async (selector, value) => {
      await waitFor(() => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled) return false; el.focus(); return true; })()`), `${label}: ${selector}`);
      await page.send('Input.insertText', { text: value });
      const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r' };
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    },
    until: (selector, wanted) => waitFor(async () => (await text(selector)).includes(wanted), `${label}: «${wanted}» en ${selector}`),
    fen: () => evaluate(`document.querySelector('mf-game').state?.fen ?? null`),
    pieces: () => evaluate(`document.querySelectorAll('mf-game cg-board piece').length`),
    // chessground draws arrows in requestAnimationFrame, which does not run in a background tab
    arrows: async () => {
      await page.send('Page.bringToFront');
      return evaluate(`document.querySelectorAll('mf-game svg.cg-shapes line').length`);
    },
    orientedBlack: () => evaluate(`document.querySelector('mf-game .cg-wrap')?.classList.contains('orientation-black') ?? false`),
    inputEnabled: () => evaluate(`!(document.querySelector('mf-voice-input input')?.disabled ?? true)`),
    shot: async (name) => {
      await page.send('Page.bringToFront');
      await sleep(250);
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(out, `${name}.png`), Buffer.from(data, 'base64'));
      console.log(`  captura: ${name}.png`);
    },
    close: () => page.close(),
  };
  return tab;
}

let browserApi;
const STATUS = 'mf-game .csg-status';
const PLAYERS = 'mf-game .csg-players';
const MOVE_BOX = 'mf-voice-input input';

async function playMove(mover, observer, phrase, san, fen) {
  await mover.type(MOVE_BOX, phrase);
  await mover.until('mf-voice-input [data-candidate]', san);
  await mover.click('mf-voice-input [data-action=confirm]');
  await waitFor(async () => (await mover.fen()) === fen && (await observer.fen()) === fen, `${san} en los dos tableros`);
}

try {
  const browserPath = findBrowser();
  if (browserPath === undefined) throw new Error('no encontré Edge ni Chrome; define BROWSER_PATH');

  run('pnpm --filter @chessspeak/server build', root, process.env);
  run('pnpm exec prisma migrate deploy', join(root, 'server'), serverEnv);
  run('pnpm build:web', root, { ...process.env, PUBLIC_API_URL: api });

  server = startServer();
  await waitFor(apiUp, 'el servidor');
  staticServer = spawn(process.execPath, [join(root, 'scripts', 'serve-web.mjs')], { env: { ...process.env, SERVE_WEB_PORT: String(webPort) }, stdio: 'ignore' });
  await waitFor(() => fetch(`${web}/index.html`).then((r) => r.ok), 'el servidor estático');
  browser = spawn(browserPath, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  const version = await waitFor(() => fetch(`http://127.0.0.1:${debugPort}/json/version`).then((r) => r.json()), 'el navegador');
  console.log(`navegador: ${version.Browser} (sin interfaz)\ncapturas en: ${out}\n`);
  browserApi = await cdp(version.webSocketDebuggerUrl);

  const white = await openTab('Ana');
  const black = await openTab('Luis');

  // 1. sign in and create a game
  await white.open(`${web}/index.html#/`);
  await white.shot('01-entrar');
  await white.type('#cs-session input', 'Ana');
  await white.until('#cs-session', 'conectado');
  await white.click('[data-action=create-white]');
  await white.until(STATUS, 'Esperando al otro jugador');
  const invite = await white.text('[data-invite]');
  const gameId = invite.split('/').pop();
  check('Ana entra y crea una partida, que espera al otro jugador', /^[0-9a-f-]{36}$/.test(gameId), `partida ${gameId}`);
  await white.shot('02-esperando-rival');

  // 2. the other guest joins with the link
  await black.open(invite);
  check('Sin sesión, el enlace pide un nombre', (await black.text('#cs-session')).includes('Tu nombre'));
  await black.type('#cs-session input', 'Luis');
  await black.until(STATUS, 'Juegas con negras');
  await white.until(STATUS, 'Te toca');
  check('Luis entra con el enlace y le toca negras', (await black.text(PLAYERS)).includes('negras: Luis'));
  check('Cada uno ve el tablero desde su lado', (await black.orientedBlack()) === true && (await white.orientedBlack()) === false);
  check('Las dos partidas tienen 32 piezas', (await white.pieces()) === 32 && (await black.pieces()) === 32);
  check('Luis no puede escribir: no es su turno', (await black.inputEnabled()) === false);
  await black.shot('03-negras-entra');

  // 3. text the parser does not understand moves nothing
  const start = await white.fen();
  await white.type(MOVE_BOX, 'hola qué tal');
  await white.until('mf-voice-input [role=status]', 'No entendí');
  check('Un texto incomprensible no propone jugada', (await white.evaluate(`document.querySelector('mf-voice-input [data-candidate]') === null`)) && (await white.fen()) === start);

  // 4. a move needs an explicit confirmation
  await white.type(MOVE_BOX, 'peón efe tres');
  await white.until('mf-voice-input [data-candidate]', 'f3');
  await waitFor(async () => (await white.arrows()) > 0, 'la flecha en el tablero');
  check('La jugada propuesta dibuja una flecha y aún no se juega', (await white.fen()) === start && (await black.fen()) === start);
  await white.shot('04-flecha-por-confirmar');
  await white.click('mf-voice-input [data-action=confirm]');
  const afterF3 = 'rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1';
  await waitFor(async () => (await white.fen()) === afterF3 && (await black.fen()) === afterF3, 'f3 en los dos tableros');
  check('Tras confirmar, la jugada llega a los dos tableros', true);
  check('La flecha desaparece al jugarse', (await white.arrows()) === 0);
  check('Ana ya no puede escribir, y Luis sí', (await white.inputEnabled()) === false && (await black.inputEnabled()) === true);

  // 5. cancelling plays nothing
  await black.type(MOVE_BOX, 'peón e cinco');
  await black.until('mf-voice-input [data-candidate]', 'e5');
  await black.click('mf-voice-input [data-action=cancel]');
  await waitFor(async () => (await black.arrows()) === 0, 'que se borre la flecha');
  check('Cancelar no juega nada y borra la flecha', (await white.fen()) === afterF3 && (await black.fen()) === afterF3);

  await playMove(black, white, 'peón e cinco', 'e5', 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2');

  // 6. confirming by writing
  await white.type(MOVE_BOX, 'peón ge cuatro');
  await white.until('mf-voice-input [data-candidate]', 'g4');
  await white.type(MOVE_BOX, 'sí');
  const afterG4 = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';
  await waitFor(async () => (await white.fen()) === afterG4 && (await black.fen()) === afterG4, 'g4 en los dos tableros');
  check('También se confirma escribiendo «sí»', true);

  // 7. reloading the tab keeps the seat and the moves
  await black.reload();
  await black.until(STATUS, 'Juegas con negras');
  check('Luis recarga la pestaña: mismo asiento y todas las jugadas', (await black.fen()) === afterG4);
  await white.until(PLAYERS, 'negras: Luis');
  check('Ana lo ve conectado de nuevo', !(await white.text(PLAYERS)).includes('desconectado'));
  await black.shot('05-negras-tras-recargar');

  // 8. the server restarts in the middle of the game
  await sleep(500); // write-behind: let the queue finish, since a dying server can lose what is pending (ADR 7)
  kill(server);
  await white.until('#cs-session', 'sin conexión');
  check('Con el servidor caído, la página lo dice', true);
  await white.shot('06-servidor-caido');
  server = startServer();
  await waitFor(apiUp, 'el servidor de nuevo');
  await white.until('#cs-session', 'conectado');
  await black.until('#cs-session', 'conectado');
  await waitFor(async () => (await white.fen()) === afterG4 && (await black.fen()) === afterG4, 'la partida tras el reinicio');
  check('El servidor se reinicia y los dos vuelven solos a la misma partida', true);

  // 9. a third identity gets no seat
  const third = await openTab('Eva');
  await third.open(invite);
  await third.type('#cs-session input', 'Eva');
  await third.until('mf-game [role=alert]', 'No puedes hacer eso');
  check('Una tercera persona no consigue asiento', (await third.inputEnabled()) === false);
  await third.shot('07-tercera-persona');

  // 10. checkmate
  await black.type(MOVE_BOX, 'dama hache cuatro');
  await black.until('mf-voice-input [data-candidate]', 'Qh4');
  await black.click('mf-voice-input [data-action=confirm]');
  await white.until(STATUS, '0-1 (jaque mate)');
  await black.until(STATUS, '0-1 (jaque mate)');
  check('Jaque mate: los dos ven el resultado', true);
  check('Nadie puede seguir escribiendo', (await white.inputEnabled()) === false && (await black.inputEnabled()) === false);
  await white.shot('08-final-blancas');
  await black.shot('09-final-negras');

  // 11. the result is still there after reloading
  await white.reload();
  await white.until(STATUS, '0-1 (jaque mate)');
  check('Tras recargar, el resultado sigue ahí', true);

  const exceptions = [white, black, third].flatMap((tab) => tab.exceptions.map((text) => `${tab.label}: ${text}`));
  check('No hubo excepciones en ninguna página', exceptions.length === 0, exceptions.join(' | '));
  console.log(`\npartida=${gameId}`);
  exitCode = results.every((r) => r.ok) ? 0 : 1;
} catch (error) {
  check('la prueba terminó sin errores', false, error.message);
} finally {
  browserApi?.close();
  kill(browser);
  kill(staticServer);
  kill(server);
  await sleep(1000);
  // Windows can keep the browser profile locked for a moment: a leftover temp folder must not change the result
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (error) {
    console.log(`aviso: no se pudo borrar ${profile} (${error.code})`);
  }
}

const passed = results.filter((r) => r.ok).length;
console.log(`\ne2e:web: ${passed} de ${results.length}`);
process.exit(exitCode);
