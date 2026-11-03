import { resolve, type ResolveOptions, type ResultsFile } from '@chessspeak/voice-parser';
import { evaluate, formatRate, type SplitFilter } from '@chessspeak/voice-parser/src/metrics.js';
import { buildReport, fakeReason } from '@chessspeak/voice-parser/src/report.js';
import type { GateConfig } from './gate.js';

export interface WhisperRun {
  name: string;
  results: ResultsFile;
  gated: number;
  sent: number;
}

export const WHISPER_START = '<!-- whisper:start -->';
export const WHISPER_END = '<!-- whisper:end -->';

/** Reasons why this benchmark must NOT be written into docs/spike-results.md. */
export function writeRefusals(runs: WhisperRun[], split: SplitFilter, clipNames: string[]): string[] {
  const reasons: string[] = [];
  if (split !== 'test') reasons.push('solo se escribe el split test (el que decide)');
  for (const run of runs) {
    const reason = fakeReason(run.name, run.results);
    if (reason !== undefined) reasons.push(reason);
  }
  const fakeClips = clipNames.filter((name) => /\.fake\./i.test(name));
  if (fakeClips.length > 0) reasons.push(`hay clips sintéticos (.fake.wav): ${fakeClips.slice(0, 3).join(', ')}…`);
  return reasons;
}

function nonSpeechSummary(run: WhisperRun, parser: ResolveOptions): string {
  const clips = run.results.attempts.filter((a) => a.condition === 'silence' || a.condition === 'noise');
  const gated = clips.filter((a) => a.error?.startsWith('below-gate')).length;
  const accepted = clips.filter((a) => {
    const kind = resolve(a.fen, a.alternatives, parser).kind;
    return kind === 'move' || kind === 'command';
  }).length;
  return `${clips.length} | ${gated} | ${clips.length - gated} | ${accepted}`;
}

/** Markdown with every number computed from the benchmark results. */
export function buildWhisperReport(
  runs: WhisperRun[],
  options: { split: SplitFilter; parser: ResolveOptions; gate: GateConfig; tag: string },
): string {
  const lines: string[] = [];
  lines.push(
    `whisper.cpp **${options.tag}**, idioma \`es\`. Puerta fija antes de transcribir: duración ≥ ${options.gate.minDurationMs} ms y volumen RMS ≥ ${options.gate.minRmsDbfs} dBFS. Split evaluado: **${options.split}**.`,
    '',
    '**Resumen por configuración** (sin N-best: Whisper devuelve una sola alternativa)',
    '',
    '| Configuración | Intentos V | Acierto top-1 | Aceptación errónea | Ambigüedad | Nomatch | Latencia p50 / p95 | Silencio+ruido: falsas aceptaciones |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const run of runs) {
    const r = evaluate(run.results.attempts, { split: options.split, mode: 'top1', parser: options.parser });
    const latency = r.latency ? `${(r.latency.p50 / 1000).toFixed(2)} s / ${(r.latency.p95 / 1000).toFixed(2)} s (n=${r.latency.n})` : 'n/d';
    lines.push(
      `| ${run.results.meta.userAgent} | ${r.valid} | ${formatRate(r.topOne)} | ${formatRate(r.wrongAcceptance)} | ${formatRate(r.ambiguity)} | ${formatRate(r.nomatch)} | ${latency} | ${r.falseAcceptance.count}/${r.falseAcceptance.total} |`,
    );
  }
  lines.push(
    '',
    '**Clips de silencio y ruido (sin habla)**',
    '',
    '| Configuración | Clips | Frenados por la puerta | Enviados a Whisper | Acabaron en jugada o comando aceptado |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const run of runs) lines.push(`| ${run.results.meta.userAgent} | ${nonSpeechSummary(run, options.parser)} |`);
  lines.push(
    '',
    '**Clips en total**',
    '',
    '| Configuración | Clips | Frenados por la puerta | Enviados a Whisper |',
    '| --- | --- | --- | --- |',
  );
  for (const run of runs) {
    lines.push(`| ${run.results.meta.userAgent} | ${run.results.attempts.length} | ${run.gated} | ${run.sent} |`);
  }
  lines.push('', 'La latencia de Whisper es optimista: mide solo la inferencia del clip ya grabado más el parser, sin grabación ni transporte HTTP (ver [spike-notes.md](spike-notes.md)).', '');

  for (const run of runs) {
    lines.push(`### ${run.results.meta.userAgent}`, '', buildReport([{ name: run.name, results: run.results }], { split: options.split, parser: options.parser }), '');
  }
  return lines.join('\n');
}

/** Replace what is between two markers, keeping the markers. */
export function replaceBlock(doc: string, start: string, end: string, body: string): string {
  const from = doc.indexOf(start);
  const to = doc.indexOf(end);
  if (from === -1 || to === -1 || to < from) throw new Error(`Faltan los marcadores ${start} / ${end}`);
  return `${doc.slice(0, from)}${start}\n\n${body}\n\n${end}${doc.slice(to + end.length)}`;
}
