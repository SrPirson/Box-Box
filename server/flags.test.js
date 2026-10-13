// La bandera activa sobrevive a un reinicio del servidor (se recupera de event_log), con quién la ha visto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io } from 'socket.io-client';

const PORT = 3490 + Math.floor(Math.random() * 100);
const BASE = `http://localhost:${PORT}`;
const start = (dir) => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT, PGLITE_DIR: dir, ADMIN_EMAIL: 'jefe@x.es', DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  p.stdout.on('data', (d) => d.includes('escuchando') && resolve(p));
  p.on('exit', (c) => reject(new Error(`El servidor no ha arrancado (salida ${c})`)));
});
const stop = (p) => new Promise((r) => { p.once('exit', r); p.kill(); });
const call = async (path, { token, method = 'GET', body } = {}) => (await fetch(BASE + path, {
  method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body),
})).json();
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(BASE, { transports: ['websocket'], auth: { token }, reconnection: false });
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});
const next = (s, ev) => new Promise((r) => s.once(ev, r));
const nextFlag = (s) => new Promise((r) => s.on('flag', (f) => f && r(f))); // al conectar llega también la actual (null)

test('la bandera activa se recupera al reiniciar el servidor', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'boxbox-'));
  let server = await start(dir);
  try {
    const reg = (name, email) => call('/api/register', { method: 'POST', body: { name, email, password: 'pistapista' } });
    const admin = await reg('Jefe', 'jefe@x.es');
    const org = await reg('Olga', 'olga@x.es');
    await call(`/api/admin/users/${org.user.id}`, { token: admin.token, method: 'PATCH', body: { role: 'organizer' } });
    const ev = await call('/api/events', { token: org.token, method: 'POST', body: { name: 'E', startsOn: '2099-01-01' } });
    await call(`/api/events/${ev.id}`, { token: org.token, method: 'PATCH', body: { track: { line: [[40, -3], [40, -2.9]] }, draft: false } });
    const pepe = await reg('Pepe', 'pepe@x.es');
    const team = (await call('/api/teams', { token: pepe.token, method: 'POST', body: { name: 'T', eventCode: ev.inviteCode } })).team;
    await call('/api/team', { token: pepe.token, method: 'PATCH', body: { racing: true } });

    const [so, sp] = await Promise.all([connect(org.token), connect(pepe.token)]);
    const red = nextFlag(sp);
    await so.timeout(2000).emitWithAck('event:flag', { eventId: ev.id, type: 'red' });
    const flag = await red;
    sp.emit('flag:seen', flag.ts);
    await new Promise((r) => setTimeout(r, 300));
    so.close(); sp.close();

    await stop(server);
    server = await start(dir);
    // El piloto la recibe al conectar; la organizadora ve que ya la había visto.
    const sp2 = io(BASE, { transports: ['websocket'], auth: { token: pepe.token }, reconnection: false });
    assert.equal((await nextFlag(sp2)).ts, flag.ts);
    const so2 = await connect(org.token);
    const status = next(so2, 'event:flag');
    so2.emit('event:watch', ev.id);
    assert.deepEqual((await status).seen, [team.id]);
    so2.close(); sp2.close();
  } finally {
    await stop(server);
    await rm(dir, { recursive: true, force: true });
  }
});
