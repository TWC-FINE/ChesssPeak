import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SplitFilter } from '../src/metrics.js';
import { buildReport, fakeReason, type NamedResults } from '../src/report.js';
import type { ResultsFile } from '../src/results.js';
import type { ResolveOptions } from '../src/types.js';

const USAGE = `Uso: pnpm metrics <resultados.json...> [opciones]

  --split test|dev|all     split a evaluar (por defecto: test, el que decide)
  --threshold <n>          umbral del parser (por defecto: el del archivo)
  --margin <n>             margen del parser
  --rank-penalty <n>       penalización por posición en el N-best
  --nato                   aceptar el alfabeto OTAN
  --write-results          escribe el informe en docs/spike-results.md
                           (solo con --split test y nunca con datos sintéticos)
`;

const RESULTS_DOC = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../../docs/spike-results.md');
const START = '<!-- results:start -->';
const END = '<!-- results:end -->';

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const files: string[] = [];
  let split: SplitFilter = 'test';
  let write = false;
  const parser: ResolveOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = (): number => {
      const value = Number(argv[++i]);
      if (Number.isNaN(value)) fail(`${arg} necesita un número`);
      return value;
    };
    if (arg === '--split') {
      const value = argv[++i];
      if (value !== 'test' && value !== 'dev' && value !== 'all') fail('--split: test, dev o all');
      split = value as SplitFilter;
    } else if (arg === '--threshold') parser.threshold = next();
    else if (arg === '--margin') parser.margin = next();
    else if (arg === '--rank-penalty') parser.rankPenalty = next();
    else if (arg === '--nato') parser.nato = true;
    else if (arg === '--write-results') write = true;
    else if (arg.startsWith('--')) fail(`Opción desconocida: ${arg}\n\n${USAGE}`);
    else files.push(arg);
  }
  return { files, split, write, parser };
}

const { files, split, write, parser } = parseArgs(process.argv.slice(2));
if (files.length === 0) fail(USAGE);

// pnpm runs scripts from the package folder; INIT_CWD is where the command was typed
const invokedFrom = process.env.INIT_CWD ?? process.cwd();

const loaded: NamedResults[] = files.map((path) => ({
  name: basename(path),
  results: JSON.parse(readFileSync(resolvePath(invokedFrom, path), 'utf8')) as ResultsFile,
}));

const fakes = loaded.map((f) => fakeReason(f.name, f.results)).filter((r): r is string => r !== undefined);

if (write) {
  if (fakes.length > 0) {
    fail(`Me niego a escribir docs/spike-results.md con datos sintéticos:\n  - ${fakes.join('\n  - ')}`);
  }
  if (split !== 'test') fail('--write-results solo se permite con --split test (el que decide).');
}

const overrides = Object.keys(parser).length > 0 ? parser : undefined;
const report = buildReport(loaded, { split, parser: overrides });

if (fakes.length > 0) {
  console.log(`> **DATOS SINTÉTICOS — no usar como evidencia**\n> ${fakes.join('\n> ')}\n`);
}
console.log(report);

if (write) {
  const doc = readFileSync(RESULTS_DOC, 'utf8');
  const from = doc.indexOf(START);
  const to = doc.indexOf(END);
  if (from === -1 || to === -1 || to < from) fail(`Faltan los marcadores ${START} / ${END} en ${RESULTS_DOC}`);
  const stamp = new Date().toISOString();
  const body = `${START}\n\n_Generado por \`pnpm metrics --write-results\` el ${stamp}._\n\n${report}\n\n${END}`;
  writeFileSync(RESULTS_DOC, doc.slice(0, from) + body + doc.slice(to + END.length));
  console.error(`\nEscrito en ${RESULTS_DOC}`);
}
