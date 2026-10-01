// Servidor BOX: sirve la PWA compilada y reenvía eventos en tiempo real por "canal" (sala Socket.io).
// Cada coche y cada portátil de BOX se une a un canal; todo lo que emite uno lo reciben los demás del canal.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3300;
const DIST = join(import.meta.dirname, '..', 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const http = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  for (const file of [join(DIST, path), join(DIST, 'index.html')]) {
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      return res.end(body);
    } catch {}
  }
  res.writeHead(404).end();
});

// Solo WebSocket (sin long-polling) para mantener la latencia por debajo de 100 ms.
const io = new Server(http, { transports: ['websocket'], cors: { origin: '*' } });

// Eventos que se reenvían tal cual al resto del canal.
const RELAYED = ['telemetry', 'telemetry:batch', 'pilot', 'msg', 'ack'];

io.on('connection', (socket) => {
  const channel = String(socket.handshake.query.channel || 'equipo');
  socket.join(channel);
  for (const ev of RELAYED) {
    socket.on(ev, (data) => socket.to(channel).emit(ev, { ...data, serverTs: Date.now() }));
  }
});

http.listen(PORT, () => console.log(`Cencerro BOX escuchando en http://0.0.0.0:${PORT}`));
