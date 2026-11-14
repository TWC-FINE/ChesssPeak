import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { DEFAULT_OPTIONS, type ResolveOptions } from '@chessspeak/voice-parser';
import type { SplitFilter } from '@chessspeak/voice-parser/src/metrics.js';
import { loadCorpus, resultsFileName, runConfig, toResultsFile, type ConfigResult, type ConfigSpec } from '../src/benchmark.js';
import { listClips } from '../src/clips.js';
import { loadEnv, repoRoot } from '../src/env.js';
import { gateFromEnv } from '../src/gate.js';
import { CHESS_PROMPT } from '../src/prompt.js';
import {
  buildWhisperReport,
  replaceBlock,
  WHISPER_END,
  WHISPER_START,
  writeRefusals,
  type WhisperRun,
} from '../src/whisper-report.js';

const USAGE = `Uso: pnpm --filter @chessspeak/spike-whisper-local benchmark [opciones]

  --wav-dir <carpeta>      carpeta con los WAV del arnés (por defecto: spike/recordings/)
  --out-dir <carpeta>      dónde dejar los JSON de resultados (por defecto: spike/results/)
  --models base,small      modelos a probar (por defecto: base,small)
  --prompt on|off|both     prompt de vocabulario de ajedrez (por defecto: both)
  --split test|dev|all     split a evaluar (por defecto: test)
  --threshold <n> --margin <n> --rank-penalty <n>   parámetros del parser (por defecto los del código)
  --min-duration-ms <n> --min-rms-dbfs <n>          puerta (por defecto: .env, 300 ms y -50 dBFS)
  --write-results          escribe el informe en docs/spike-results.md (solo test y nunca con datos sintéticos)
  --url <http://host:puerto>  mide un whisper-server ya encendido (la imagen de whisper-cloud/ con docker run);
                           exige un solo modelo en --models, el de la imagen, y --prompt on, porque la imagen lo fija
  --label <texto>          se añade al nombre del JSON y a la descripción, p. ej. docker-cpus2-r1
`;

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

const invokedFrom = process.env.INIT_CWD ?? process.cwd();
const root = repoRoot();
const env = loadEnv();

const args = process.argv.slice(2);
const flags = new Map<string, string>();
let write = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === '--write-results') write = true;
  else if (arg.startsWith('--')) {
    const value = args[++i];
    if (value === undefined) fail(`${arg} necesita un valor\n\n${USAGE}`);
    flags.set(arg, value);
  } else fail(USAGE);
}
const num = (flag: string): number | undefined => {
  const raw = flags.get(flag);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (Number.isNaN(value)) fail(`${flag} necesita un número`);
  return value;
};

const wavDir = resolvePath(invokedFrom, flags.get('--wav-dir') ?? join(root, 'spike/recordings'));
const outDir = resolvePath(invokedFrom, flags.get('--out-dir') ?? join(root, 'spike/results'));
const split = (flags.get('--split') ?? 'test') as SplitFilter;
if (!['test', 'dev', 'all'].includes(split)) fail('--split: test, dev o all');
const models = (flags.get('--models') ?? 'base,small').split(',') as ('base' | 'small')[];
const promptMode = flags.get('--prompt') ?? 'both';
if (!['on', 'off', 'both'].includes(promptMode)) fail('--prompt: on, off o both');

const parser: Required<ResolveOptions> = {
  ...DEFAULT_OPTIONS,
  ...(num('--threshold') !== undefined ? { threshold: num('--threshold')! } : {}),
  ...(num('--margin') !== undefined ? { margin: num('--margin')! } : {}),
  ...(num('--rank-penalty') !== undefined ? { rankPenalty: num('--rank-penalty')! } : {}),
};
const gate = {
  ...gateFromEnv(env),
  ...(num('--min-duration-ms') !== undefined ? { minDurationMs: num('--min-duration-ms')! } : {}),
  ...(num('--min-rms-dbfs') !== undefined ? { minRmsDbfs: num('--min-rms-dbfs')! } : {}),
};

let clipList;
try {
  clipList = listClips(wavDir);
} catch {
  fail(
    `No encuentro la carpeta de WAV: ${wavDir}\n` +
      'Los WAV que descarga el navegador hay que moverlos ahí (ver spike/whisper-local/README.md).',
  );
}
const { clips, ignored } = clipList;
if (clips.length === 0) fail(`No hay clips con nombre válido en ${wavDir}`);
if (ignored.length > 0) console.warn(`Ignorados (nombre no reconocido): ${ignored.join(', ')}`);

const url = flags.get('--url');
const label = flags.get('--label');
if (label !== undefined && !/^[\w.-]+$/.test(label)) fail('--label: solo letras, números, punto, guion y guion bajo');
if (url !== undefined) {
  if (!/^https?:\/\/[^/]+$/.test(url)) fail('--url: http://host:puerto, sin ruta');
  if (models.length !== 1) fail('--url necesita un solo modelo en --models: el de la imagen');
  if (promptMode !== 'on') fail('--url necesita --prompt on: la imagen arranca siempre con el prompt de ajedrez');
  if (write) fail('--write-results no se usa con --url: docs/spike-results.md es la medición del spike');
}
const serverPath = env.WHISPER_SERVER_PATH ?? '';
if (url === undefined && !serverPath) fail('Falta WHISPER_SERVER_PATH en .env: ejecuta primero el script download.');

const specs: ConfigSpec[] = models.flatMap((model) => {
  const out: ConfigSpec[] = [];
  if (promptMode !== 'off') out.push({ model, prompt: CHESS_PROMPT });
  if (promptMode !== 'on') out.push({ model, prompt: undefined });
  return out;
});

const corpus = loadCorpus();
const localTag = /whisper[\\/]([^\\/]+)[\\/]/.exec(serverPath)?.[1] ?? 'desconocido';
const tag = url === undefined ? localTag : `d1be6fd (imagen Linux en ${url})${label === undefined ? '' : ` · ${label}`}`;
const anyFake = clips.some((clip) => clip.fake);
const port = Number(env.WHISPER_INTERNAL_PORT) || 8791;

console.log(`${clips.length} clips en ${wavDir}; puerta ${gate.minDurationMs} ms / ${gate.minRmsDbfs} dBFS; ${specs.length} configuraciones.`);
if (anyFake) console.warn('⚠ Hay clips sintéticos (.fake.wav): los resultados se marcan como falsos.');

mkdirSync(outDir, { recursive: true });
const runs: WhisperRun[] = [];
for (const spec of specs) {
  const configName = `${spec.model}${spec.prompt === undefined ? ' sin prompt' : ' con prompt'}`;
  console.log(`\n[${configName}]`);
  const result: ConfigResult = await runConfig(spec, clips, {
    serverPath,
    modelPaths: { base: env.WHISPER_MODEL_BASE ?? '', small: env.WHISPER_MODEL_SMALL ?? '' },
    language: env.WHISPER_LANGUAGE || 'es',
    port,
    ...(url !== undefined ? { url } : {}),
    gate,
    parser,
    corpus,
    readClip: (clip) => new Uint8Array(readFileSync(join(wavDir, clip.file))),
    onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
  });
  process.stdout.write('\n');
  if (result.skipped.length > 0) console.warn(`  sin frase en el corpus, omitidos: ${result.skipped.join(', ')}`);

  const file = toResultsFile(result, { tag, corpusVersion: corpus.version, parser, gate, fake: anyFake });
  const stamp = new Date().toISOString().slice(0, 10);
  const name = resultsFileName(stamp, spec, label, anyFake);
  writeFileSync(join(outDir, name), `${JSON.stringify(file, null, 2)}\n`);
  console.log(`  guardado ${join(outDir, name)}`);
  runs.push({ name, results: file, gated: result.gated, sent: result.sent });
}

const report = buildWhisperReport(runs, { split, parser, gate, tag });
if (anyFake) console.log('\n> **DATOS SINTÉTICOS — no usar como evidencia**');
console.log(`\n${report}`);

if (write) {
  const refusals = writeRefusals(runs, split, clips.map((c) => c.file));
  if (refusals.length > 0) fail(`\nMe niego a escribir docs/spike-results.md:\n  - ${refusals.join('\n  - ')}`);
  const docPath = join(root, 'docs/spike-results.md');
  const stamp = new Date().toISOString();
  const body = `_Generado por \`benchmark --write-results\` el ${stamp}._\n\n${report}`;
  writeFileSync(docPath, replaceBlock(readFileSync(docPath, 'utf8'), WHISPER_START, WHISPER_END, body));
  console.error(`\nEscrito en ${docPath}`);
}
