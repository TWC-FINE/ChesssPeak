// Builds the whole web into web/dist: shell (index.html, shell.js, shell.css, config.js),
// one bundle per microfrontend (mf/) and the standalone development pages (standalone/).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shell = join(root, 'web', 'shell');
const dist = join(root, 'web', 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// 1. the three microfrontends (bundle + standalone page each)
const mf = spawnSync('pnpm --filter "./web/mf-*" build', { cwd: root, stdio: 'inherit', shell: true });
if (mf.status !== 0) {
  console.error('build:web: falló la compilación de un microfrontend.');
  process.exit(mf.status ?? 1);
}

// 2. the shell
await build({
  entryPoints: { shell: join(shell, 'src', 'main.ts'), 'shell-css': join(shell, 'src', 'shell.css') },
  outdir: dist,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  logLevel: 'warning',
});
cpSync(join(dist, 'shell-css.css'), join(dist, 'shell.css'));
rmSync(join(dist, 'shell-css.css'));
cpSync(join(shell, 'index.html'), join(dist, 'index.html'));

// 3. config.js from the shell .env (public values only; falls back to .env.example)
const envFile = [join(shell, '.env'), join(shell, '.env.example')].find((file) => existsSync(file));
const config = {};
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const match = /^\s*(PUBLIC_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (match) config[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
}
writeFileSync(join(dist, 'config.js'), `window.CS_CONFIG = ${JSON.stringify(config, null, 2)};\n`);

console.log(`build:web listo en ${dist} (config de ${envFile.replace(root, '.')})`);
