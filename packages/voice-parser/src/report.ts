import {
  checkCriteria,
  evaluate,
  formatRate,
  nbestVerdict,
  type Report,
  type SplitFilter,
} from './metrics.js';
import type { AttemptRecord, Condition, ResultsFile } from './results.js';
import type { ResolveOptions } from './types.js';

export interface NamedResults {
  name: string;
  results: ResultsFile;
}

/** Why a results file must not be used as evidence, or undefined if it can be. */
export function fakeReason(name: string, results: ResultsFile): string | undefined {
  if (/\.fake\.json$/i.test(name)) return `${name}: el nombre termina en .fake.json`;
  if (results.meta.fake === true) return `${name}: meta.fake es true`;
  if (results.meta.sessionId.startsWith('fake')) return `${name}: la sesión empieza por "fake"`;
  return undefined;
}

export function decisionText(report: Report): string {
  const checks = checkCriteria(report);
  if (report.valid === 0 || checks.some((c) => c.status === 'sin datos')) {
    return 'Faltan datos para decidir.';
  }
  const failed = checks.filter((c) => c.status === 'no cumple');
  const falseAcceptance =
    report.falseAcceptance.count > 0
      ? ' La falsa aceptación distinta de cero no se compensa con otras métricas.'
      : '';
  if (failed.length === 0) {
    return 'Se cumplen todos los umbrales: se sigue con Web Speech por defecto.';
  }
  const topOne = report.topOne.value;
  if (topOne < 0.7) {
    return `Acierto top-1 < 70 %: revisar el enfoque (Whisper por defecto o modo coordenadas/OTAN) y registrar un ADR.${falseAcceptance}`;
  }
  if (topOne < 0.85) {
    return `Acierto top-1 entre 70 % y 85 %: reforzar alias y modo coordenadas y volver a medir con un test nuevo.${falseAcceptance}`;
  }
  return `Acierto ≥ 85 % pero fallan: ${failed.map((c) => c.name).join(', ')}. No se da por cumplido: corregir la causa y volver a medir con un test nuevo.${falseAcceptance}`;
}

const CONDITIONS: Condition[] = ['quiet', 'noisy'];

function row(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

/** Markdown with every number computed from the given results files. */
export function buildReport(
  files: NamedResults[],
  options: { split: SplitFilter; parser?: ResolveOptions },
): string {
  const attempts: AttemptRecord[] = files.flatMap((f) => f.results.attempts);
  const parser = options.parser ?? files[0]?.results.meta.parser ?? {};
  const nbest = evaluate(attempts, { split: options.split, mode: 'nbest', parser });
  const top1 = evaluate(attempts, { split: options.split, mode: 'top1', parser });
  const verdict = nbestVerdict(nbest, top1);
  const selected = verdict.adopt ? nbest : top1;
  const lines: string[] = [];

  lines.push(`Split evaluado: **${options.split}**. Modo elegido: **${verdict.adopt ? 'N-best' : 'solo la primera alternativa'}**.`);
  lines.push('');
  lines.push('**Archivos de resultados usados**', '');
  lines.push(row(['Archivo', 'Sesión', 'Idioma', 'Intentos']), row(['---', '---', '---', '---']));
  for (const f of files) {
    lines.push(row([f.name, f.results.meta.sessionId, f.results.meta.lang, String(f.results.attempts.length)]));
  }
  lines.push('');
  lines.push(
    `Parámetros del parser: ${JSON.stringify({ ...parser })}. Intentos válidos (V): ${selected.valid}.`,
    '',
  );

  lines.push('**Criterios** (ver [spike-criteria.md](spike-criteria.md))', '');
  lines.push(row(['Métrica', 'Umbral', 'Medido', 'Estado']), row(['---', '---', '---', '---']));
  for (const c of checkCriteria(selected)) lines.push(row([c.name, c.threshold, c.measured, c.status]));
  lines.push('');

  lines.push('**Comparación del N-best**', '');
  lines.push(row(['Modo', 'Acierto top-1', 'Aceptación errónea', 'Ambigüedad', 'Nomatch']), row(['---', '---', '---', '---', '---']));
  for (const [label, r] of [['Solo primera alternativa', top1], ['N-best (hasta 5)', nbest]] as const) {
    lines.push(row([label, formatRate(r.topOne), formatRate(r.wrongAcceptance), formatRate(r.ambiguity), formatRate(r.nomatch)]));
  }
  lines.push('');
  lines.push(
    `Ganancia del N-best: ${Number.isNaN(verdict.gainPoints) ? 'n/d' : verdict.gainPoints.toFixed(1)} puntos. ${verdict.adopt ? 'Se adopta' : 'No se adopta'}: ${verdict.reason}.`,
    '',
  );

  lines.push('**Por condición** (informativo; no decide por separado)', '');
  lines.push(row(['Condición', 'Intentos V', 'Acierto top-1', 'Aceptación errónea', 'Ambigüedad', 'Nomatch']), row(['---', '---', '---', '---', '---', '---']));
  for (const condition of CONDITIONS) {
    const r = evaluate(attempts, { split: options.split, mode: verdict.adopt ? 'nbest' : 'top1', parser, condition });
    lines.push(row([condition, String(r.valid), formatRate(r.topOne), formatRate(r.wrongAcceptance), formatRate(r.ambiguity), formatRate(r.nomatch)]));
  }
  lines.push('');
  lines.push(`Comandos reconocidos (informativo): ${formatRate(selected.commands)}.`, '');
  lines.push(`**Decisión según la regla del spike:** ${decisionText(selected)}`);
  return lines.join('\n');
}
