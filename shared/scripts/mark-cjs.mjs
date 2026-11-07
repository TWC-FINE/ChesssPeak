// shared/package.json says "type": "module", so Node would read dist/cjs/*.js as ESM.
// This marks that folder as CommonJS for the server (Nest) and Jest.
import { writeFileSync } from 'node:fs';

writeFileSync(new URL('../dist/cjs/package.json', import.meta.url), '{ "type": "commonjs" }\n');
