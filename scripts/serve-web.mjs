// Static server for web/dist, with no dependencies, for machines without VS Code (Live Server also works).
// Serves only web/dist on http://127.0.0.1:5500 (the port that CORS allows).
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'dist');
const host = '127.0.0.1';
const port = Number(process.env.SERVE_WEB_PORT) || 5500;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

if (!existsSync(join(root, 'index.html'))) {
  console.error('serve:web: no existe web/dist/index.html. Ejecuta primero: pnpm build:web');
  process.exit(1);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}`);
  let file = normalize(join(root, decodeURIComponent(url.pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado');
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  response.end(readFileSync(file));
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`serve:web: el puerto ${port} está ocupado (¿Live Server u otro servidor?). Ciérralo o usa SERVE_WEB_PORT.`);
  } else {
    console.error(`serve:web: ${error.message}`);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`ChessSpeak web en http://${host}:${port}/  (Ctrl+C para parar)`);
});
