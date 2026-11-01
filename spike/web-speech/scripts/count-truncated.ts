import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { ResultsFile } from '@chessspeak/voice-parser';
import { RUN_B_MAX_TRUNCATED, summarizeTruncation } from '../src/truncated.js';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Uso: pnpm count-truncated <resultados.json...>   (los archivos de UNA sola corrida; test tranquilo y con ruido)');
  process.exit(2);
}

// pnpm runs scripts from the package folder; INIT_CWD is where the command was typed
const invokedFrom = process.env.INIT_CWD ?? process.cwd();
const loaded = files.map((path) => JSON.parse(readFileSync(resolve(invokedFrom, path), 'utf8')) as ResultsFile & { meta: { run?: string } });

const runs = new Set(loaded.flatMap((f) => f.attempts.map((a) => (a as { run?: string }).run ?? f.meta.run ?? 'A')));
const run = runs.size === 1 ? [...runs][0]! : '?';
if (runs.size > 1) console.log(`AVISO: hay varias corridas en estos archivos (${[...runs].join(', ')}); pásalos por separado.`);

const first = loaded[0]!;
const summary = summarizeTruncation(
  loaded.flatMap((f) => f.attempts),
  first.meta.parser,
);

console.log(`Archivos: ${files.map((f) => basename(f)).join(', ')}`);
console.log(`Corrida ${run} · intentos válidos (V): ${summary.valid} · parámetros del parser: ${JSON.stringify(first.meta.parser)}`);
console.log(`Truncados: ${summary.truncated} de ${summary.valid} (${summary.truncatedFailed} fallos, ${summary.truncatedCorrect} aciertos)`);
for (const condition of ['quiet', 'noisy'] as const) {
  const c = summary.byCondition[condition];
  console.log(`  ${condition}: ${c.truncated} truncados de ${c.valid} · fallos ${c.failed} · fallos no truncados ${c.control}`);
}
console.log(`Control (fallos con ruido que no son truncados): ${summary.control}`);
for (const t of summary.truncatedAttempts) {
  console.log(`  ${t.id} | dijo «${t.spoken}» | reconoció «${t.recognized}» | ${t.correct ? 'acierto' : 'fallo'}`);
}
if (run === 'B') {
  console.log(
    `\nRegla de docs/spike-run-b.md: B necesita como máximo ${RUN_B_MAX_TRUNCATED} truncados de 78 -> ${summary.truncated <= RUN_B_MAX_TRUNCATED ? 'CUMPLE' : 'NO CUMPLE'} (comprobación de que no es azar; no es la prueba principal).`,
  );
}
