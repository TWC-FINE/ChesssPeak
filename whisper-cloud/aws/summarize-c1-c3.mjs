// C1 and C3 of the EC2 addendum (docs/whisper-cloud-criteria.md, section 6) from the benchmark logs of the
// repetitions. It only reads: node whisper-cloud/aws/summarize-c1-c3.mjs <log-r1.txt> <log-r2.txt> <log-r3.txt>
// C1: p95 of the WORST repetition, with the bands of the 12 November addendum (≤ 7.5 s pass; ≤ 9.0 s not
// conclusive; more, cut). C3: top-1 ≥ 68/78 in EVERY repetition.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Uso: node whisper-cloud/aws/summarize-c1-c3.mjs <registro-r1.txt> [<registro-r2.txt> ...]');
  process.exit(2);
}

const C3_MIN = 68;
const rows = files.map((file) => {
  const text = readFileSync(file, 'utf8');
  // the first data row after the "Resumen por configuración" header: | config | V | top-1 | ... | p50 / p95 | ...
  const header = text.split('\n').findIndex((line) => line.startsWith('| Configuración | Intentos V |'));
  const row = header === -1 ? undefined : text.split('\n')[header + 2];
  const cells = row?.split('|').map((cell) => cell.trim());
  const top1 = /\((\d+)\/(\d+);/.exec(cells?.[3] ?? '');
  const latency = /([\d.]+) s \/ ([\d.]+) s/.exec(cells?.[7] ?? '');
  if (top1 === null || latency === null) {
    console.error(`${basename(file)}: no encuentro la tabla «Resumen por configuración»`);
    process.exit(1);
  }
  return { file: basename(file), hits: Number(top1[1]), valid: Number(top1[2]), p50: Number(latency[1]), p95: Number(latency[2]) };
});

for (const r of rows) console.log(`${r.file}: top-1 ${r.hits}/${r.valid} · p50 ${r.p50} s · p95 ${r.p95} s`);

const worst = Math.max(...rows.map((r) => r.p95));
const c1 = worst <= 7.5 ? 'PASA' : worst <= 9.0 ? 'NO CONCLUYENTE (se decide midiendo en el gateway)' : 'SE RECORTA LA NUBE';
const c3 = rows.every((r) => r.valid === 78 && r.hits >= C3_MIN);
console.log(`C1: p95 de la peor repetición ${worst} s -> ${c1}`);
console.log(`C3: top-1 >= ${C3_MIN}/78 en cada repetición -> ${c3 ? 'CUMPLE' : 'NO CUMPLE'}`);
if (rows.length !== 3) console.log(`Aviso: el criterio pide 3 repeticiones y hay ${rows.length}.`);
