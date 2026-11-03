import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root: the closest parent that has pnpm-workspace.yaml. */
export function repoRoot(from: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('pnpm-workspace.yaml not found');
    dir = parent;
  }
}

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) out[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/** Values from the .env file, overridden by real environment variables. */
export function loadEnv(file: string = join(repoRoot(), '.env')): Record<string, string> {
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
  const merged: Record<string, string> = { ...fromFile };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key in fromFile) merged[key] = value;
  }
  return merged;
}

/** Set keys in a .env file, keeping every other line as it is. */
export function updateEnvFile(file: string, entries: Record<string, string>): void {
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const pending = new Map(Object.entries(entries));
  const updated = lines.map((line) => {
    const key = /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];
    if (key !== undefined && pending.has(key)) {
      const value = pending.get(key)!;
      pending.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });
  while (updated.length > 0 && updated[updated.length - 1] === '') updated.pop();
  for (const [key, value] of pending) updated.push(`${key}=${value}`);
  writeFileSync(file, `${updated.join('\n')}\n`);
}
