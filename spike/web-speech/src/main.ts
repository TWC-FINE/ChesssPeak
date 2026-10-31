import corpusJson from '@chessspeak/voice-parser/corpus/corpus-v0.json';
import {
  DEFAULT_OPTIONS,
  resolve,
  type Alternative,
  type AttemptRecord,
  type Corpus,
  type Resolution,
  type ResolveOptions,
} from '@chessspeak/voice-parser';
import { renderBoard, sideToMove } from './board.js';
import { isWebSpeechAvailable, listen, type ListeningSession } from './recognizer.js';
import { canPickDirectory, pickDirectory, Recorder, saveWav } from './recorder.js';
import {
  BLOCK_LABEL,
  BLOCK_ORDER,
  buildAttempt,
  buildBlocks,
  nextTrial,
  progress,
  type BlockId,
  type Trial,
} from './session.js';
import {
  clearSession,
  downloadJson,
  loadSession,
  newSession,
  saveSession,
  toResultsFile,
  type StoredSession,
} from './store.js';
import { wavFileName } from './wav.js';

const corpus = corpusJson as unknown as Corpus;
const blocks = buildBlocks(corpus);

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Missing #${id}`);
  return found as T;
}

const esc = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const ui = {
  lang: el<HTMLInputElement>('lang'),
  maxAlt: el<HTMLInputElement>('max-alt'),
  speaker: el<HTMLInputElement>('speaker'),
  threshold: el<HTMLInputElement>('threshold'),
  margin: el<HTMLInputElement>('margin'),
  rankPenalty: el<HTMLInputElement>('rank-penalty'),
  nato: el<HTMLInputElement>('nato'),
  pickDir: el<HTMLButtonElement>('pick-dir'),
  dirStatus: el<HTMLElement>('dir-status'),
  record: el<HTMLInputElement>('record'),
  recordOnly: el<HTMLInputElement>('record-only'),
  block: el<HTMLSelectElement>('block'),
  blockProgress: el<HTMLElement>('block-progress'),
  corpusControls: el<HTMLElement>('corpus-controls'),
  freeControls: el<HTMLElement>('free-controls'),
  freePosition: el<HTMLSelectElement>('free-position'),
  customFen: el<HTMLInputElement>('custom-fen'),
  trialInfo: el<HTMLElement>('trial-info'),
  expected: el<HTMLElement>('expected'),
  hint: el<HTMLElement>('condition-hint'),
  board: el<HTMLElement>('board-host'),
  fenText: el<HTMLElement>('fen-text'),
  talk: el<HTMLButtonElement>('talk'),
  status: el<HTMLElement>('status'),
  result: el<HTMLElement>('result'),
  discard: el<HTMLButtonElement>('discard'),
  exportBtn: el<HTMLButtonElement>('export'),
  reset: el<HTMLButtonElement>('reset'),
  sessionInfo: el<HTMLElement>('session-info'),
  logBody: el<HTMLTableSectionElement>('log').querySelector('tbody')!,
  warning: el<HTMLElement>('browser-warning'),
};

let session: StoredSession = loadSession() ?? newSession();
let mode: 'corpus' | 'free' = 'corpus';
let currentBlock: BlockId = 'dev-quiet';
let listening: ListeningSession | undefined;
let busy = false;
const recorder = new Recorder();
let directory: Awaited<ReturnType<typeof pickDirectory>> | undefined;

// ---------- parser options ----------

ui.threshold.value = String(DEFAULT_OPTIONS.threshold);
ui.margin.value = String(DEFAULT_OPTIONS.margin);
ui.rankPenalty.value = String(DEFAULT_OPTIONS.rankPenalty);

function parserOptions(): Required<ResolveOptions> {
  return {
    threshold: Number(ui.threshold.value),
    margin: Number(ui.margin.value),
    rankPenalty: Number(ui.rankPenalty.value),
    nato: ui.nato.checked,
  };
}

// ---------- current trial ----------

function doneIds(): Set<string> {
  return new Set(ui.recordOnly.checked ? session.recordedOnly : session.attempts.map((a) => a.id));
}

function freeFen(): string {
  const custom = ui.customFen.value.trim();
  return custom !== '' ? custom : (corpus.positions.find((p) => p.id === ui.freePosition.value)?.fen ?? corpus.positions[0]!.fen);
}

function currentTrial(): Trial | undefined {
  return mode === 'corpus' ? nextTrial(blocks, currentBlock, doneIds()) : undefined;
}

const CONDITION_HINT: Record<string, string> = {
  quiet: 'Ambiente tranquilo.',
  noisy: 'Con ruido de fondo (TV, música o conversación a volumen realista). Habla a volumen normal, sin gritar.',
  silence: 'NO digas nada. Mantén el botón unos 2 segundos en ambiente tranquilo y suéltalo.',
  noise: 'NO hables. Mantén el botón unos 2 segundos con el ruido de fondo puesto y suéltalo.',
};

function renderTrial(): void {
  refreshBlockSelect();
  const trial = currentTrial();
  if (mode === 'free') {
    ui.trialInfo.textContent = 'Modo libre: nada se guarda.';
    ui.expected.textContent = 'Di una jugada';
    ui.hint.textContent = '';
    const fen = freeFen();
    ui.board.innerHTML = renderBoard(fen);
    ui.fenText.textContent = `${fen} · mueven las ${sideToMove(fen)}`;
    return;
  }
  if (trial === undefined) {
    ui.trialInfo.textContent = `${BLOCK_LABEL[currentBlock]}: bloque completo.`;
    ui.expected.textContent = '✔ Bloque completo';
    ui.hint.textContent = 'Elige otro bloque o exporta los resultados.';
    ui.board.innerHTML = '';
    ui.fenText.textContent = '';
    return;
  }
  const { done, total } = progress(blocks, currentBlock, doneIds());
  ui.trialInfo.textContent = `${BLOCK_LABEL[currentBlock]} · intento ${done + 1} de ${total} · repetición ${trial.repetition} de ${trial.repetitions}${trial.phrase ? ` · ${trial.phrase.id}` : ''}`;
  ui.expected.textContent = trial.phrase ? `«${trial.phrase.spoken}»` : '(no hables)';
  ui.hint.textContent = CONDITION_HINT[trial.condition] ?? '';
  ui.board.innerHTML = renderBoard(trial.fen);
  ui.fenText.textContent = `${trial.fen} · mueven las ${sideToMove(trial.fen)}`;
}

function refreshBlockSelect(): void {
  const selected = currentBlock;
  const ids = doneIds();
  ui.block.innerHTML = BLOCK_ORDER.map((id) => {
    const p = progress(blocks, id, ids);
    return `<option value="${id}"${id === selected ? ' selected' : ''}>${esc(BLOCK_LABEL[id])} (${p.done}/${p.total})</option>`;
  }).join('');
  const p = progress(blocks, selected, ids);
  ui.blockProgress.textContent = `${p.done}/${p.total}`;
}

// ---------- result display ----------

function describe(res: Resolution): string {
  switch (res.kind) {
    case 'move':
      return `jugada <b>${esc(res.san)}</b> (${res.uci}) d=${res.distance.toFixed(2)}`;
    case 'ambiguous':
      return `ambigua: ${res.candidates.map((c) => esc(c.san)).join(' / ')}`;
    case 'nomatch': {
      const best = res.candidates[0];
      return best ? `sin coincidencia (más cercana ${esc(best.san)} d=${best.distance.toFixed(2)})` : 'sin coincidencia';
    }
    case 'command':
      return `comando: ${res.command}`;
  }
}

function isCorrect(res: Resolution, attempt: AttemptRecord): boolean {
  if (attempt.expectedOutcome === 'move') return res.kind === 'move' && res.uci === attempt.expectedUci;
  if (attempt.expectedOutcome === 'command') return res.kind === 'command' && res.command === attempt.expectedCommand;
  return res.kind === 'nomatch';
}

function mark(ok: boolean | undefined): string {
  return ok === undefined ? '' : ok ? ' <span class="ok">✓</span>' : ' <span class="bad">✗</span>';
}

function renderResult(alternatives: Alternative[], fen: string, attempt: AttemptRecord | undefined, error: string | undefined): void {
  const opts = parserOptions();
  const top1 = resolve(fen, alternatives.slice(0, 1), opts);
  const nbest = resolve(fen, alternatives, opts);
  const list = alternatives.length === 0
    ? '<p class="muted">El reconocedor no devolvió texto.</p>'
    : `<ul class="alts">${alternatives
        .map((a) => `<li>${esc(a.transcript)} <span class="muted">(${a.confidence === undefined ? '?' : a.confidence.toFixed(2)})</span></li>`)
        .join('')}</ul>`;
  const latency = attempt?.latency
    ? `<p>Latencia: reconocimiento ${attempt.latency.recognitionMs} ms + parser ${attempt.latency.resolveMs} ms = <b>${attempt.latency.totalMs} ms</b></p>`
    : '';
  ui.result.className = '';
  ui.result.innerHTML = `
    ${error ? `<p class="warn">Error del reconocedor: ${esc(error)}</p>` : ''}
    ${list}
    <p>Solo primera alternativa: ${describe(top1)}${mark(attempt && isCorrect(top1, attempt))}</p>
    <p>Con N-best: ${describe(nbest)}${mark(attempt && isCorrect(nbest, attempt))}</p>
    ${latency}`;
}

function renderLog(): void {
  const opts = parserOptions();
  const rows = session.attempts.slice(-12).reverse().map((a) => {
    const t1 = resolve(a.fen, a.alternatives.slice(0, 1), opts);
    const nb = resolve(a.fen, a.alternatives, opts);
    return `<tr><td>${esc(a.id)}</td><td>${esc(a.spoken ?? '—')}</td><td>${esc(a.alternatives[0]?.transcript ?? a.error ?? '—')}</td><td>${t1.kind}${mark(isCorrect(t1, a))}</td><td>${nb.kind}${mark(isCorrect(nb, a))}</td><td>${a.latency?.totalMs ?? '—'}</td></tr>`;
  });
  ui.logBody.innerHTML = rows.join('');
  ui.sessionInfo.textContent = `Sesión ${session.sessionId} · ${session.attempts.length} intentos guardados`;
}

function setStatus(text: string): void {
  ui.status.textContent = text;
}

// ---------- push to talk ----------

// Errors that say nothing about the speech: the attempt is not recorded.
const NOT_RECORDED = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'aborted', 'language-not-supported']);

async function startListening(): Promise<void> {
  if (busy || listening !== undefined) return;
  const trial = currentTrial();
  if (mode === 'corpus' && trial === undefined) {
    setStatus('Este bloque ya está completo.');
    return;
  }
  const recording = ui.record.checked && recorder.enabled && directory !== undefined;
  if (recording) recorder.begin();
  if (ui.recordOnly.checked) {
    listening = { release: () => Promise.reject(new Error('record-only')), abort: () => undefined };
    ui.talk.classList.add('listening');
    setStatus('Grabando (solo audio)…');
    return;
  }
  try {
    listening = listen({ lang: ui.lang.value.trim() || 'es-CO', maxAlternatives: Number(ui.maxAlt.value) || 5 }, () =>
      setStatus('Escuchando… habla ahora.'),
    );
  } catch (error) {
    setStatus(String(error));
    return;
  }
  ui.talk.classList.add('listening');
  setStatus('Iniciando micrófono…');
}

async function stopListening(): Promise<void> {
  const session_ = listening;
  if (session_ === undefined || busy) return;
  listening = undefined;
  busy = true;
  ui.talk.classList.remove('listening');
  setStatus('Procesando…');
  const trial = currentTrial();
  const recording = ui.record.checked && recorder.enabled && directory !== undefined;
  try {
    if (ui.recordOnly.checked) {
      await finishRecordOnly(trial, recording);
      return;
    }
    const [outcome, wav] = await Promise.all([session_.release(), recording ? recorder.end() : Promise.resolve(undefined)]);

    const t0 = performance.now();
    renderResult(outcome.alternatives, trial?.fen ?? freeFen(), undefined, outcome.error);
    const resolveMs = performance.now() - t0;

    if (mode === 'free' || trial === undefined) {
      setStatus('Listo (modo libre: no se guarda).');
      return;
    }
    if (outcome.error !== undefined && NOT_RECORDED.has(outcome.error)) {
      setStatus(`Intento NO guardado: error del reconocedor «${outcome.error}». Revisa permisos del micrófono, red o idioma y repite.`);
      return;
    }
    let audioFile: string | undefined;
    if (wav !== undefined && directory !== undefined) {
      const name = wavFileName(trial.phrase?.id ?? null, trial.condition, trial.repetition);
      try {
        await saveWav(directory, name, wav.wav);
        audioFile = name;
      } catch (error) {
        setStatus(`No se pudo guardar el WAV: ${String(error)}`);
      }
    }
    const attempt = buildAttempt(trial, outcome, resolveMs, audioFile);
    session.attempts.push(attempt);
    saveSession(session);
    renderResult(attempt.alternatives, attempt.fen, attempt, attempt.error);
    renderLog();
    renderTrial();
    setStatus(`Guardado ${attempt.id}.`);
  } catch (error) {
    setStatus(`Error: ${String(error)}`);
  } finally {
    busy = false;
  }
}

async function finishRecordOnly(trial: Trial | undefined, recording: boolean): Promise<void> {
  const wav = recording ? await recorder.end() : undefined;
  if (trial === undefined || wav === undefined || directory === undefined) {
    setStatus('No se grabó nada (¿elegiste carpeta y activaste «Grabar WAV»?).');
    return;
  }
  const name = wavFileName(trial.phrase?.id ?? null, trial.condition, trial.repetition);
  await saveWav(directory, name, wav.wav);
  session.recordedOnly.push(trial.id);
  saveSession(session);
  setStatus(`Audio guardado: ${name} (${wav.durationMs} ms).`);
  renderTrial();
}

// ---------- wiring ----------

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    ? target.type === 'text' || target.type === 'number'
    : target instanceof HTMLTextAreaElement;
}

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat || isTyping(event.target)) return;
  event.preventDefault();
  void startListening();
});
window.addEventListener('keyup', (event) => {
  if (event.code !== 'Space' || isTyping(event.target)) return;
  event.preventDefault();
  void stopListening();
});
ui.talk.addEventListener('pointerdown', () => void startListening());
window.addEventListener('pointerup', () => void stopListening());
window.addEventListener('blur', () => {
  // a lost key-up would leave the microphone open
  if (listening !== undefined && !busy) {
    listening.abort();
    listening = undefined;
    ui.talk.classList.remove('listening');
    setStatus('Se perdió el foco: intento cancelado.');
  }
});

ui.block.addEventListener('change', () => {
  currentBlock = ui.block.value as BlockId;
  ui.block.blur();
  renderTrial();
});

document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((radio) =>
  radio.addEventListener('change', () => {
    mode = radio.value as 'corpus' | 'free';
    ui.corpusControls.hidden = mode !== 'corpus';
    ui.freeControls.hidden = mode !== 'free';
    radio.blur();
    renderTrial();
  }),
);

ui.freePosition.innerHTML = corpus.positions
  .map((p) => `<option value="${p.id}">${esc(p.id)} · ${esc(p.description)}</option>`)
  .join('');
ui.freePosition.addEventListener('change', () => {
  ui.freePosition.blur();
  renderTrial();
});
ui.customFen.addEventListener('input', renderTrial);

ui.pickDir.disabled = !canPickDirectory();
ui.pickDir.addEventListener('click', async () => {
  try {
    directory = await pickDirectory();
    await recorder.enable();
    ui.record.checked = true;
    ui.dirStatus.textContent = 'Carpeta lista y micrófono de grabación activo.';
  } catch (error) {
    ui.dirStatus.textContent = `No se pudo activar la grabación: ${String(error)}`;
    directory = undefined;
  }
});
ui.recordOnly.addEventListener('change', () => {
  ui.recordOnly.blur();
  renderTrial();
});

ui.discard.addEventListener('click', () => {
  const last = session.attempts.pop();
  if (last === undefined) return;
  const blockId = last.id.split(':')[0] as BlockId;
  if (BLOCK_ORDER.includes(blockId)) currentBlock = blockId;
  saveSession(session);
  renderLog();
  renderTrial();
  setStatus(`Descartado ${last.id}. Repítelo. (El WAV, si existía, se sobrescribe al repetir.)`);
});

ui.exportBtn.addEventListener('click', () => {
  const opts = parserOptions();
  const speaker = ui.speaker.value.trim();
  const file = toResultsFile(session, {
    lang: ui.lang.value.trim() || 'es-CO',
    maxAlternatives: Number(ui.maxAlt.value) || 5,
    corpusVersion: corpus.version,
    parser: opts,
    userAgent: navigator.userAgent,
    ...(speaker !== '' ? { speaker } : {}),
  });
  downloadJson(`webspeech-${session.sessionId}.json`, file);
  setStatus('Exportado. Mueve el archivo a spike/results/.');
});

ui.reset.addEventListener('click', () => {
  if (!confirm('¿Empezar una sesión nueva? Exporta antes si no quieres perder los intentos.')) return;
  clearSession();
  session = newSession();
  saveSession(session);
  currentBlock = 'dev-quiet';
  ui.result.textContent = 'Aún no hay intentos.';
  renderLog();
  renderTrial();
});

if (!isWebSpeechAvailable()) {
  ui.warning.hidden = false;
  ui.warning.textContent = 'Este navegador no tiene Web Speech API. Usa Chrome o Edge (en http://127.0.0.1:5500).';
}

renderLog();
renderTrial();
if (session.attempts.length > 0) setStatus(`Sesión restaurada: ${session.attempts.length} intentos.`);
