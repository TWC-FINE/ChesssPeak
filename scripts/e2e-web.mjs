// End-to-end test of a game between two guests, in a real Edge or Chrome driven over CDP (no dependencies).
// It clicks, types and holds the talk button like a person, and saves screenshots. The speech recognizer is fake.
//   docker compose up -d && pnpm e2e:web         (not part of pnpm verify; not a measurement: it times nothing)
// Uses only the local _test databases, and refuses anything else. Set BROWSER_PATH to pick a browser, and
// E2E_OUT for the screenshots. It leaves web/dist built against a temporary port: run pnpm build:web afterwards.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
const agentPort = randomPort();
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


/**
 * Replaces SpeechRecognition before the page loads: a headless browser cannot listen. Each stop() answers with the next
 * phrase of the queue, or with its error. It also keeps the time from the release to stop(), for the 400 ms of ADR 5.
 */
const FAKE_SPEECH = `
  window.__speech = { queue: [], started: 0, stopDelays: [], releasedAt: 0 };
  document.addEventListener('pointerup', () => { window.__speech.releasedAt = performance.now(); }, true);
  window.SpeechRecognition = class {
    start() { window.__speech.started += 1; }
    stop() {
      window.__speech.stopDelays.push(performance.now() - window.__speech.releasedAt);
      const next = window.__speech.queue.shift() ?? '';
      setTimeout(() => {
        if (typeof next === 'string' && next !== '') this.onresult?.({ results: [[{ transcript: next, confidence: 0.9 }]] });
        else this.onerror?.({ error: next.error ?? 'no-speech' });
        this.onend?.();
      }, 20);
    }
    abort() { this.onerror?.({ error: 'aborted' }); this.onend?.(); }
  };
`;
const NO_SPEECH = 'window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined;';

/** Answers like local-agent, without Whisper: each /transcribe takes the next answer of the queue. */
const fakeAgent = { health: 0, clips: [], answers: [], down: false };
const fakeAgentServer = createServer((req, res) => {
  const cors = { 'access-control-allow-origin': req.headers.origin ?? '*', 'access-control-expose-headers': 'Retry-After' };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...cors, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-allow-private-network': 'true' });
    res.end();
    return;
  }
  if (req.url === '/health') {
    fakeAgent.health += 1;
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    fakeAgent.clips.push({ type: req.headers['content-type'], origin: req.headers.origin, wav: Buffer.concat(chunks) });
    if (fakeAgent.down) {
      req.socket.destroy();
      return;
    }
    const answer = fakeAgent.answers.shift() ?? { body: { text: '', gated: false } };
    res.writeHead(answer.status ?? 200, { ...cors, 'content-type': 'application/json', ...(answer.headers ?? {}) });
    res.end(JSON.stringify(answer.body ?? {}));
  });
});

async function voiceAttempts(gameId) {
  const mongoose = createRequire(join(root, 'server', 'package.json'))('mongoose');
  const connection = await mongoose.createConnection(localTestUrl('MONGO_URI_TEST')).asPromise();
  try {
    return await connection.collection('voice_attempts').find({ gameId }).toArray();
  } finally {
    await connection.close();
  }
}

/** One tab: its own sessionStorage, so its own guest. */
async function openTab(label, { speech = true } = {}) {
  const { targetId } = await browserApi.send('Target.createTarget', { url: 'about:blank' });
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) => r.json());
  const page = await cdp(targets.find((t) => t.id === targetId).webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: speech ? FAKE_SPEECH : NO_SPEECH });
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
    talkEnabled: () => evaluate(`!(document.querySelector('mf-voice-input [data-action=talk]')?.disabled ?? true)`),
    stopDelays: () => evaluate('window.__speech.stopDelays'),
    history: async () => (await text('mf-history')).replace(/\s+/g, ' '),
    /** Holds the talk button with the fake microphone of the browser, and waits for the agent. */
    sayToAgent: async () => {
      const box = await waitFor(() => evaluate(`(() => { const el = document.querySelector('mf-voice-input [data-action=talk]'); if (!el || el.disabled) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`), `${label}: el botón para hablar`);
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await sleep(600);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await waitFor(() => evaluate(`document.querySelector('mf-voice-input [data-action=talk]')?.dataset.state === 'idle'`), `${label}: terminar de reconocer`);
    },
    /** Holds the talk button, says the phrase ('' is a silence, { error } a failure) and waits for the recognizer. */
    say: async (phrase) => {
      await evaluate(`window.__speech.queue.push(${JSON.stringify(phrase)})`);
      const started = await evaluate('window.__speech.started');
      const box = await waitFor(() => evaluate(`(() => { const el = document.querySelector('mf-voice-input [data-action=talk]'); if (!el || el.disabled) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`), `${label}: el botón para hablar`);
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await waitFor(async () => (await evaluate('window.__speech.started')) > started, `${label}: empezar a escuchar`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await waitFor(() => evaluate(`document.querySelector('mf-voice-input [data-action=talk]')?.dataset.state === 'idle'`), `${label}: terminar de reconocer`);
    },
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
  run('pnpm build:web', root, { ...process.env, PUBLIC_API_URL: api, PUBLIC_AGENT_URL: `http://127.0.0.1:${agentPort}` });
  await new Promise((resolve) => fakeAgentServer.listen(agentPort, '127.0.0.1', resolve));

  server = startServer();
  await waitFor(apiUp, 'el servidor');
  staticServer = spawn(process.execPath, [join(root, 'scripts', 'serve-web.mjs')], { env: { ...process.env, SERVE_WEB_PORT: String(webPort) }, stdio: 'ignore' });
  await waitFor(() => fetch(`${web}/index.html`).then((r) => r.ok), 'el servidor estático');
  browser = spawn(browserPath, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', 'about:blank'], { stdio: 'ignore' });
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
  await waitFor(async () => (await white.history()).includes('2. g4 Qh4'), 'el historial tras recargar');
  check('Tras recargar, el historial tiene las jugadas numeradas y sin repetir', (await white.history()).includes('1. f3 e5 2. g4 Qh4') && (await white.evaluate(`document.querySelectorAll('mf-history .csh-san').length`)) === 4);
  check('Los dos ven el mismo historial', (await black.history()).includes('1. f3 e5 2. g4 Qh4'));

  // 12. a whole game by voice, with a fake SpeechRecognition: this shows the flow, not the recognition
  await white.open(`${web}/index.html#/`);
  await white.click('[data-action=create-white]');
  await white.until(STATUS, 'Esperando al otro jugador');
  const voiceInvite = await white.text('[data-invite]');
  const voiceGameId = voiceInvite.split('/').pop();
  await black.open(voiceInvite);
  await black.until(STATUS, 'Juegas con negras');
  await white.until(STATUS, 'Te toca');
  check('Tras terminar una partida se puede jugar otra en la misma pestaña', (await white.inputEnabled()) === true);
  check('El historial se vacía al cambiar de partida', (await white.history()).includes('Aún no hay jugadas') && (await black.history()).includes('Aún no hay jugadas'));
  check('Hay botón para hablar, y sigue la caja de texto', (await white.talkEnabled()) === true && (await white.evaluate(`document.querySelector('mf-voice-input input') !== null`)));
  check('Luis no puede hablar: no es su turno', (await black.talkEnabled()) === false);

  const voiceStart = await white.fen();
  await white.say({ error: 'not-allowed' });
  await white.until('mf-voice-input [role=status]', 'micrófono');
  check('Sin permiso de micrófono lo dice, y no se mueve nada', (await white.fen()) === voiceStart);
  await white.say('');
  await white.until('mf-voice-input [role=status]', 'No te oí');
  await white.say('hola qué tal');
  await white.until('mf-voice-input [role=status]', 'No entendí');
  await white.say('caballo');
  await white.until('mf-voice-input [role=status]', 'No entendí');
  await white.say('sí');
  await white.until('mf-voice-input [role=status]', 'ninguna jugada');
  check('Un silencio, dos frases sin jugada clara y un «sí» de más no mueven nada', (await white.fen()) === voiceStart && (await black.fen()) === voiceStart);

  await white.say('peón efe tres');
  await white.until('mf-voice-input [data-candidate]', 'f3');
  await waitFor(async () => (await white.arrows()) > 0, 'la flecha de la jugada dicha');
  check('Una jugada dicha dibuja la flecha y no se juega sola', (await white.fen()) === voiceStart && (await black.fen()) === voiceStart);
  await white.shot('10-voz-por-confirmar');
  await white.say('no');
  await waitFor(async () => (await white.arrows()) === 0, 'que se borre la flecha tras «no»');
  check('Decir «no» no juega nada', (await white.fen()) === voiceStart);
  await white.say('peón efe tres');
  await white.until('mf-voice-input [data-candidate]', 'f3');
  await white.say('cancelar');
  await waitFor(async () => (await white.arrows()) === 0, 'que se borre la flecha tras «cancelar»');
  check('Decir «cancelar» no juega nada', (await white.fen()) === voiceStart);

  await white.say('peón efe tres');
  await white.until('mf-voice-input [data-candidate]', 'f3');
  await white.say('hola');
  await white.until('mf-voice-input [role=status]', 'No entendí');
  check('Una frase mal oída mantiene la jugada por confirmar', (await white.evaluate(`document.querySelector('mf-voice-input [data-candidate]') !== null`)) && (await white.fen()) === voiceStart);
  await white.say('sí');
  await waitFor(async () => (await white.fen()) === afterF3 && (await black.fen()) === afterF3, 'f3 dicha en los dos tableros');
  check('Decir «sí» juega la jugada en los dos tableros', true);

  await black.say('peón e cinco');
  await black.until('mf-voice-input [data-candidate]', 'e5');
  await black.click('mf-voice-input [data-action=confirm]');
  const afterE5 = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
  await waitFor(async () => (await white.fen()) === afterE5 && (await black.fen()) === afterE5, 'e5 dicha en los dos tableros');
  check('Una jugada dicha también se confirma con el botón', true);

  await white.say('peón ge cuatro');
  await white.until('mf-voice-input [data-candidate]', 'g4');
  await white.say('sí');
  await waitFor(async () => (await white.fen()) === afterG4 && (await black.fen()) === afterG4, 'g4 dicha en los dos tableros');
  await black.say('dama hache cuatro');
  await black.until('mf-voice-input [data-candidate]', 'Qh4');
  await black.say('sí');
  await white.until(STATUS, '0-1 (jaque mate)');
  await black.until(STATUS, '0-1 (jaque mate)');
  check('Partida completa por voz, hasta el jaque mate', true);
  check('El historial recoge la partida jugada por voz', (await white.history()).includes('1. f3 e5 2. g4 Qh4') && (await black.history()).includes('1. f3 e5 2. g4 Qh4'));
  check('Con la partida terminada ya no se puede hablar', (await white.talkEnabled()) === false && (await black.talkEnabled()) === false);
  await white.shot('11-voz-final');

  const delays = [...(await white.stopDelays()), ...(await black.stopDelays())];
  check('stop() nunca se llama antes de 400 ms tras soltar', delays.length > 0 && delays.every((delay) => delay >= 399), `${delays.length} frases`);

  // 13. the telemetry reached MongoDB
  const documents = await waitFor(async () => {
    const found = await voiceAttempts(voiceGameId);
    return found.length >= 16 ? found : null;
  }, 'los 16 intentos en voice_attempts');
  check('Llegan los 16 intentos a voice_attempts; el fallo de micrófono no cuenta', documents.length === 16, `${documents.length} documentos`);
  const accepted = documents.filter((document) => document.accepted);
  check('accepted: las 4 jugadas jugadas y los 3 «sí» que confirmaron', accepted.filter((document) => document.outcome === 'move').length === 4 && accepted.filter((document) => document.outcome === 'command').length === 3 && accepted.length === 7);
  check('Lo cancelado y lo mal oído también se registra, con accepted: false', documents.filter((document) => !document.accepted && document.outcome === 'move').length === 2 && documents.some((document) => document.transcript === '' && document.outcome === 'nomatch'));
  check('player lo pone el servidor: los dos invitados', new Set(documents.map((document) => document.player)).size === 2);
  check('Sin audio, en es-CO y con Web Speech', documents.every((document) => !('audio' in document) && document.lang === 'es-CO' && document.recognizer === 'webspeech' && document.session === 'play'));
  check('La latencia incluye los 400 ms', documents.filter((document) => document.transcript !== '').every((document) => document.latency.recognitionMs >= 399));

  // 14. a browser without Web Speech
  const noVoice = await openTab('Sin voz', { speech: false });
  await noVoice.open(`${web}/index.html#/`);
  await noVoice.until('mf-voice-input [data-voice-unavailable]', 'no tiene reconocimiento de voz');
  check('Sin Web Speech lo avisa, sin botón, y queda la caja de texto', (await noVoice.evaluate(`document.querySelector('mf-voice-input [data-action=talk]') === null && document.querySelector('mf-voice-input input') !== null`)));

  // 15. Whisper through a fake local agent, with the fake microphone of the browser
  check('Nadie consultó al agente antes de abrir el selector', fakeAgent.health === 0, `${fakeAgent.health} consultas`);
  await white.open(`${web}/index.html#/`);
  await white.click('[data-action=create-white]');
  await white.until(STATUS, 'Esperando al otro jugador');
  const whisperInvite = await white.text('[data-invite]');
  const whisperGameId = whisperInvite.split('/').pop();
  await black.open(whisperInvite);
  await black.until(STATUS, 'Juegas con negras');
  await white.until(STATUS, 'Te toca');
  await white.click('mf-voice-input [data-action=choose-recognizer]');
  await waitFor(() => white.evaluate(`document.querySelector('mf-voice-input [data-agent-state]')?.dataset.agentState === 'up'`), 'el agente disponible');
  check('Abrir el selector consulta al agente una vez', fakeAgent.health === 1, `${fakeAgent.health} consultas`);
  check('La latencia de Whisper está declarada en la interfaz', (await white.text('mf-voice-input [data-whisper-latency]')).includes('2,91 s'));
  await white.shot('12-selector-whisper');
  await white.click('mf-voice-input input[value=whisper]');
  await white.until('mf-voice-input [data-action=choose-recognizer]', 'Whisper local');

  const whisperStart = await white.fen();
  fakeAgent.answers.push({ body: { text: '', gated: true, reason: 'too-quiet' } });
  await white.sayToAgent();
  await white.until('mf-voice-input [role=status]', 'muy bajo');
  fakeAgent.answers.push({ body: { text: '', gated: true, reason: 'too-short' } });
  await white.sayToAgent();
  await white.until('mf-voice-input [role=status]', 'muy corta');
  check('Avisa de una frase muy baja o muy corta', (await white.fen()) === whisperStart);
  fakeAgent.answers.push({ status: 503, headers: { 'retry-after': '7' }, body: { error: 'ocupado' } });
  await white.sayToAgent();
  await white.until('mf-voice-input [role=status]', 'en 7 s');
  check('Con un 503 dice cuánto esperar, leyendo Retry-After', (await white.fen()) === whisperStart);
  // down for the whole utterance: the browser may retry a POST after a reset
  fakeAgent.down = true;
  await white.sayToAgent();
  await white.until('mf-voice-input [role=status]', 'No se pudo contactar');
  fakeAgent.down = false;
  check('Si el agente no responde lo dice, y no se mueve nada', (await white.fen()) === whisperStart);

  fakeAgent.answers.push({ body: { text: 'peón efe tres', gated: false, ms: 2900 } });
  await white.sayToAgent();
  await white.until('mf-voice-input [data-candidate]', 'f3');
  check('Una frase de Whisper se propone y no se juega sola', (await white.fen()) === whisperStart);
  fakeAgent.answers.push({ body: { text: 'sí', gated: false, ms: 2900 } });
  await white.sayToAgent();
  await waitFor(async () => (await white.fen()) === afterF3 && (await black.fen()) === afterF3, 'f3 con Whisper en los dos tableros');
  check('Decir «sí» por Whisper juega la jugada', true);

  const clip = fakeAgent.clips.at(-1);
  check('El agente recibe un WAV de 16 kHz con audio, desde el origen de la web', clip.type === 'audio/wav' && clip.origin === web && clip.wav.toString('latin1', 0, 4) === 'RIFF' && clip.wav.readUInt32LE(24) === 16000 && clip.wav.length > 44, `${clip.wav.length} bytes`);
  const whisperDocuments = await waitFor(async () => {
    const found = await voiceAttempts(whisperGameId);
    return found.length >= 4 ? found : null;
  }, 'los intentos de Whisper en voice_attempts');
  check('La telemetría dice whisper, sin los fallos del agente y sin audio', whisperDocuments.length === 4 && whisperDocuments.every((document) => document.recognizer === 'whisper' && !('audio' in document)) && whisperDocuments.filter((document) => document.accepted).length === 2, `${whisperDocuments.length} documentos`);

  const exceptions = [white, black, third, noVoice].flatMap((tab) => tab.exceptions.map((text) => `${tab.label}: ${text}`));
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
  fakeAgentServer.close();
  fakeAgentServer.closeAllConnections();
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
