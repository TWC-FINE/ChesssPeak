import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

// Pinned in docs/analysis-criteria.md, section 3.
const TAG = 'sf_19';
const ASSET = 'stockfish-windows-x86-64-universal.zip';
const SHA256 = '3c8bf1f9ea66a09350a40df4f632288285ac206d99f33ab5842c408fc30b48a7';
const URL_ = `https://github.com/official-stockfish/Stockfish/releases/download/${TAG}/${ASSET}`;

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const target = join(root, 'stockfish', TAG);
const zip = join(root, 'stockfish', 'downloads', ASSET);

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

if (existsSync(target) && readdirSync(target).length > 0) {
  console.log(`Stockfish ${TAG} ya está en ${target}`);
  process.exit(0);
}

mkdirSync(dirname(zip), { recursive: true });
if (!existsSync(zip)) {
  console.log(`Descargando ${ASSET}…`);
  const response = await fetch(URL_);
  if (!response.ok || response.body === null) throw new Error(`Descarga fallida: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(zip));
}

const actual = await sha256(zip);
if (actual !== SHA256) {
  rmSync(zip);
  throw new Error(`SHA-256 distinto: esperado ${SHA256}, recibido ${actual}`);
}
console.log('SHA-256 verificado.');

mkdirSync(target, { recursive: true });
// the GNU tar of Git Bash reads "C:" as a host; use the bsdtar that ships with Windows
const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe') : 'tar';
const extract = spawnSync(tar, ['-xf', zip, '-C', target], { stdio: 'inherit' });
if (extract.status !== 0) throw new Error(`No se pudo descomprimir ${zip}`);
console.log(`Stockfish ${TAG} en ${target}`);
