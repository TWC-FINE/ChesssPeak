import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { repoRoot, updateEnvFile } from '../src/env.js';

// Downloads the official precompiled whisper.cpp for Windows and the base/small
// models into folders that git ignores, and writes their paths to .env.

const root = repoRoot();
const binRoot = join(root, 'whisper');
const modelDir = join(root, 'models');
const ASSET = 'whisper-bin-x64.zip';
const MODELS = ['base', 'small'] as const;

interface Asset {
  name: string;
  browser_download_url: string;
  size: number;
  digest?: string | null;
}
interface Release {
  tag_name: string;
  assets: Asset[];
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function download(url: string, file: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || response.body === null) throw new Error(`${url} -> HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(file));
}

function findFile(dir: string, name: string): string | undefined {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const found = findFile(full, name);
      if (found !== undefined) return found;
    } else if (entry.toLowerCase() === name) {
      return full;
    }
  }
  return undefined;
}

async function getBinary(): Promise<string> {
  const response = await fetch('https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=30', {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'chessspeak-spike' },
  });
  if (!response.ok) throw new Error(`GitHub API -> HTTP ${response.status}`);
  const releases = (await response.json()) as Release[];
  const release = releases.find((r) => r.assets.some((a) => a.name === ASSET));
  const asset = release?.assets.find((a) => a.name === ASSET);
  if (release === undefined || asset === undefined) throw new Error(`No release has ${ASSET}`);

  const target = join(binRoot, release.tag_name);
  const existing = existsSync(target) ? findFile(target, 'whisper-server.exe') : undefined;
  if (existing !== undefined) {
    console.log(`whisper.cpp ${release.tag_name} ya está en ${target}`);
    return existing;
  }

  mkdirSync(join(binRoot, 'downloads'), { recursive: true });
  const zip = join(binRoot, 'downloads', `${release.tag_name}-${ASSET}`);
  console.log(`Descargando ${ASSET} (${release.tag_name}, ${(asset.size / 1e6).toFixed(1)} MB)…`);
  await download(asset.browser_download_url, zip);

  const actual = await sha256(zip);
  const expected = asset.digest?.replace(/^sha256:/, '');
  if (expected === undefined) console.warn(`GitHub no publica digest para ${ASSET}; sha256 local: ${actual}`);
  else if (expected !== actual) throw new Error(`SHA-256 distinto: esperado ${expected}, recibido ${actual}`);
  else console.log('SHA-256 verificado contra GitHub.');

  mkdirSync(target, { recursive: true });
  // the GNU tar of Git Bash reads "D:" as a host; use the bsdtar that ships with Windows
  const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe') : 'tar';
  const extract = spawnSync(tar, ['-xf', zip, '-C', target], { stdio: 'inherit' });
  if (extract.status !== 0) throw new Error('No se pudo descomprimir con tar. Descomprime el zip a mano en ' + target);
  const server = findFile(target, 'whisper-server.exe');
  if (server === undefined) {
    const files = readdirSync(target, { recursive: true }).map(String).filter((f) => f.endsWith('.exe'));
    throw new Error(
      `El zip ${release.tag_name}/${ASSET} no incluye whisper-server.exe (ejecutables: ${files.join(', ') || 'ninguno'}). ` +
        'Hay que compilar whisper.cpp: ver spike/whisper-local/README.md, sección "Si el precompilado falla".',
    );
  }
  return server;
}

async function getModel(name: string): Promise<string> {
  const file = join(modelDir, `ggml-${name}.bin`);
  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${name}.bin`;
  // Hugging Face exposes the LFS sha256 in x-linked-etag on the redirect response
  const head = await fetch(url, { method: 'HEAD', redirect: 'manual' });
  const expected = head.headers.get('x-linked-etag')?.replace(/"/g, '');
  if (existsSync(file) && expected !== undefined && (await sha256(file)) === expected) {
    console.log(`Modelo ${name} ya descargado y verificado.`);
    return file;
  }
  mkdirSync(modelDir, { recursive: true });
  console.log(`Descargando modelo ${name}…`);
  await download(url, file);
  const actual = await sha256(file);
  if (expected === undefined) console.warn(`Sin sha256 publicado para ggml-${name}.bin; local: ${actual}`);
  else if (expected !== actual) throw new Error(`SHA-256 del modelo ${name} distinto: ${expected} vs ${actual}`);
  else console.log(`Modelo ${name}: SHA-256 verificado.`);
  return file;
}

const server = await getBinary();
const models: Record<string, string> = {};
for (const name of MODELS) models[name] = await getModel(name);

updateEnvFile(join(root, '.env'), {
  WHISPER_SERVER_PATH: server,
  WHISPER_MODEL_BASE: models.base!,
  WHISPER_MODEL_SMALL: models.small!,
});
console.log(`\nListo. Rutas escritas en ${join(root, '.env')}:\n  ${server}\n  ${models.base}\n  ${models.small}`);
