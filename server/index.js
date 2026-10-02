// Servidor: API REST + PWA compilada + tiempo real por equipo (Socket.io).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { Server } from 'socket.io';
import { handleApi, userFromToken } from './api.js';
import { attachLive } from './live.js';

const PORT = process.env.PORT || 3300;
const DIST = join(import.meta.dirname, '..', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };

// Dirección antigua: con REDIRECT_TO, quien la abre en el navegador pasa a la nueva. La app Android
// (WebView, "; wv)" en el user agent) no se redirige: la de una versión anterior sigue cargando aquí,
// ve el aviso de versión nueva e instala la que ya apunta a la dirección nueva.
const REDIRECT_TO = process.env.REDIRECT_TO?.replace(/\/$/, '');

const http = createServer(async (req, res) => {
  if (REDIRECT_TO && req.method === 'GET' && !req.url.startsWith('/api/') && !/;\s*wv\)/.test(req.headers['user-agent'] ?? '')) {
    res.writeHead(301, { Location: REDIRECT_TO + req.url }).end();
    return;
  }
  if (await handleApi(req, res)) return;
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  for (const file of [join(DIST, path), join(DIST, 'index.html')]) {
    try {
      const body = await readFile(file);
      // Los assets llevan hash en el nombre: caché larga. index.html y sw.js siempre frescos.
      const immutable = path.startsWith('/assets/');
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
      return res.end(body);
    } catch {}
  }
  res.writeHead(404).end();
});

// Solo WebSocket (sin long-polling) para mantener la latencia por debajo de 100 ms.
attachLive(new Server(http, { transports: ['websocket'] }), userFromToken);

http.listen(PORT, () => console.log(`Box Box escuchando en http://0.0.0.0:${PORT}`));

// Copia única a otra base de datos (ver migrate.js), en segundo plano para no retrasar el arranque.
if (process.env.MIGRATE_TO) import('./migrate.js').then((m) => m.migrateTo(process.env.MIGRATE_TO));
