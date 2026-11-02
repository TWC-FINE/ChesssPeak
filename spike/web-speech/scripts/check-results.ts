import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { checkRunFiles, type CheckFile } from '../src/check.js';

const args = process.argv.slice(2);
const expectAt = args.indexOf('--expect');
const expect = expectAt >= 0 ? (args[expectAt + 1] ?? '').split(',').filter((block) => block !== '') : undefined;
if (expect !== undefined && expect.length === 0) {
  console.error('--expect necesita bloques separados por comas, p. ej. --expect test-quiet,silence');
  process.exit(2);
}
const files = args.filter((_, i) => expectAt < 0 || (i !== expectAt && i !== expectAt + 1));
if (files.length === 0) {
  console.error('Uso: pnpm check-results <resultados.json...> [--expect test-quiet,silence]   (los archivos de UNA sola corrida y UN solo navegador)');
  process.exit(2);
}

// pnpm runs scripts from the package folder; INIT_CWD is where the command was typed
const invokedFrom = process.env.INIT_CWD ?? process.cwd();
const loaded: CheckFile[] = files.map((path) => {
  const json = JSON.parse(readFileSync(resolve(invokedFrom, path), 'utf8')) as Omit<CheckFile, 'name'>;
  return { name: basename(path), ...json };
});

const report = checkRunFiles(loaded, expect === undefined ? {} : { expect });
for (const line of report.info) console.log(line);
for (const warning of report.warnings) console.log(`AVISO: ${warning}`);
for (const error of report.errors) console.log(`ERROR: ${error}`);
if (report.ok) {
  console.log(
    report.run === 'B'
      ? '\nOK. Calcula con: pnpm metrics <estos mismos archivos>   (SIN --write-results: escribiría encima del informe de la corrida A)'
      : '\nOK. Calcula con: pnpm metrics <estos mismos archivos>',
  );
}
process.exit(report.ok ? 0 : 1);
