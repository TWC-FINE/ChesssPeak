// Creates .env from .env.example with random passwords (Node crypto). It never overwrites an existing .env.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const example = join(root, '.env.example');
const target = join(root, '.env');

if (existsSync(target)) {
  console.error('env:init: ya existe .env; no lo toco. Bórralo o edítalo a mano si quieres otras contraseñas.');
  process.exit(1);
}

// hex only, so the values are safe inside connection strings
const secret = (bytes) => randomBytes(bytes).toString('hex');
const replacements = { 'change-me-pg': secret(18), 'change-me-mongo': secret(18) };

let text = readFileSync(example, 'utf8');
for (const [placeholder, value] of Object.entries(replacements)) text = text.replaceAll(placeholder, value);
// .env.example leaves this one empty on purpose: it has no default value
text = text.replace(/^GUEST_TOKEN_SECRET=$/m, `GUEST_TOKEN_SECRET=${secret(32)}`);
writeFileSync(target, text, { mode: 0o600 });
console.log('env:init: creado .env con contraseñas aleatorias (está en .gitignore). Siguiente: docker compose up -d');
