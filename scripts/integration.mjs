// Runs the server integration tests against the LOCAL databases (docker compose up -d).
// Safety: it refuses to run unless both URLs point to localhost / 127.0.0.1 and to a database whose
// name ends in _test, so it can never touch Neon, Atlas or the development databases.
// If the databases are not reachable it skips with a clear message (exit 0), except when CI is set:
// there a skip exits with 1, so a green CI can never mean that nothing was tested.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = join(root, 'server');

if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const skipExitCode = process.env.CI ? 1 : 0;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function refuse(message) {
  console.error(`test:integration: me niego a ejecutar. ${message}`);
  process.exit(2);
}

function parseTarget(name, schemes, defaultPort) {
  const raw = process.env[name];
  if (!raw) return undefined;
  let url;
  try {
    url = new URL(raw);
  } catch {
    refuse(`${name} no es una URL válida.`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) refuse(`${name} apunta a «${url.hostname}», que no es localhost ni 127.0.0.1.`);
  if (!schemes.includes(url.protocol)) refuse(`${name} debe empezar por ${schemes.join(' o ')}.`);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database.endsWith('_test')) refuse(`${name} usa la base «${database || '(ninguna)'}», y su nombre debe terminar en _test.`);
  return { raw, url, database, host: url.hostname, port: Number(url.port) || defaultPort };
}

const pg = parseTarget('DATABASE_URL_TEST', ['postgresql:', 'postgres:'], 5432);
const mongo = parseTarget('MONGO_URI_TEST', ['mongodb:'], 27017);

if (!pg || !mongo) {
  console.log('test:integration: omitido. Faltan DATABASE_URL_TEST y/o MONGO_URI_TEST en .env (ejecuta: pnpm env:init, y luego: docker compose up -d).');
  process.exit(skipExitCode);
}

const reachable = (host, port) =>
  new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 1500 });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => (socket.destroy(), resolve(false)));
  });

const [pgUp, mongoUp] = await Promise.all([reachable(pg.host, pg.port), reachable(mongo.host, mongo.port)]);
if (!pgUp || !mongoUp) {
  const down = [!pgUp && `Postgres (${pg.host}:${pg.port})`, !mongoUp && `Mongo (${mongo.host}:${mongo.port})`].filter(Boolean).join(' y ');
  console.log(`test:integration: omitido. No responde ${down}. Levanta las bases con: docker compose up -d`);
  process.exit(skipExitCode);
}

// create the _test database if it does not exist (connecting to the maintenance database of the same server)
const requirePg = createRequire(join(server, 'package.json'));
const { Client } = requirePg('pg');
const admin = new URL(pg.raw);
admin.pathname = '/postgres';
const client = new Client({ connectionString: admin.toString(), connectionTimeoutMillis: 3000 });
try {
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [pg.database]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${pg.database.replaceAll('"', '""')}"`);
} catch (error) {
  console.error(`test:integration: no pude preparar la base ${pg.database}: ${error.message}`);
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}

// The MongoDB driver loads its `os` adapter with a dynamic import(); inside Jest's CommonJS sandbox that fails
// unless vm modules are enabled, and the handshake then goes out without client metadata ("Missing required
// sub-document 'driver'"). Only the integration run needs this flag.
const nodeOptions = [process.env.NODE_OPTIONS, '--experimental-vm-modules'].filter(Boolean).join(' ');
const env = { ...process.env, DATABASE_URL: pg.raw, MONGO_URI: mongo.raw, NODE_OPTIONS: nodeOptions };
const run = (command) => spawnSync(command, { cwd: server, env, stdio: 'inherit', shell: true });

console.log(`test:integration: Postgres ${pg.host}:${pg.port}/${pg.database} · Mongo ${mongo.host}:${mongo.port}/${mongo.database}`);
let result = run('pnpm exec prisma migrate deploy');
if (result.status !== 0) process.exit(result.status ?? 1);
result = run('pnpm exec jest -c jest.integration.config.js --runInBand');
process.exit(result.status ?? 1);
