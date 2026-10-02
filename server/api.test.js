// Integración: servidor real con PGlite en memoria.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3390 + Math.floor(Math.random() * 100);
const BASE = `http://localhost:${PORT}`;
let server;

before(async () => {
  server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT, PGLITE_DIR: 'memory://', ADMIN_EMAIL: 'jefe@cencerro.es', DATABASE_URL: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((r) => server.stdout.on('data', (d) => d.includes('escuchando') && r()));
});
after(() => server.kill());

const call = async (path, { token, method = 'GET', body } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
};
const connect = (token) => new Promise((resolve, reject) => {
  const s = io(BASE, { transports: ['websocket'], auth: { token }, reconnection: false });
  s.on('connect', () => resolve(s));
  s.on('connect_error', reject);
});
const next = (s, ev) => new Promise((r) => s.once(ev, r));

test('cuentas, equipos, tiempo real, vueltas y administración', async () => {
  // Registro y login
  const ana = await call('/api/register', { method: 'POST', body: { name: 'Ana', email: 'ana@x.es', password: 'pistapista' } });
  assert.equal(ana.user.role, 'pilot');
  assert.equal((await call('/api/register', { method: 'POST', body: { name: 'Ana', email: 'ANA@x.es', password: 'pistapista' } })).status, 409);
  assert.equal((await call('/api/register', { method: 'POST', body: { name: 'B', email: 'b@x.es', password: 'corta' } })).status, 400);
  assert.equal((await call('/api/login', { method: 'POST', body: { email: 'ana@x.es', password: 'mala-clave' } })).status, 401);
  const jefe = await call('/api/register', { method: 'POST', body: { name: 'Jefe', email: 'jefe@cencerro.es', password: 'adminadmin' } });
  assert.equal(jefe.user.role, 'admin');

  // Equipo + invitación
  const t = await call('/api/teams', { token: ana.token, method: 'POST', body: { name: 'Cencerro Racing' } });
  assert.equal(t.team.ownerId, ana.user.id);
  const beto = await call('/api/register', { method: 'POST', body: { name: 'Beto', email: 'beto@x.es', password: 'pistapista' } });
  assert.equal((await call('/api/teams/join', { token: beto.token, method: 'POST', body: { code: 'NOEXISTE' } })).status, 404);
  const joined = await call('/api/teams/join', { token: beto.token, method: 'POST', body: { code: t.team.inviteCode.toLowerCase() } });
  assert.equal(joined.team.members.length, 2);
  // Beto no es capitán: no puede renovar la invitación, pero sí ajustar el coche.
  assert.equal((await call('/api/team/invite', { token: beto.token, method: 'POST' })).status, 403);
  assert.equal((await call('/api/team', { token: beto.token, method: 'PATCH', body: { limits: { tempWarn: 120 } } })).status, 400);
  const line = [[40, -3.0001], [40, -2.9999]];
  const patched = await call('/api/team', { token: beto.token, method: 'PATCH', body: { dorsal: '44', limits: { tempCrit: 105 }, track: { line } } });
  assert.equal(patched.dorsal, '44');
  assert.equal(patched.limits.tempCrit, 105);

  // Tiempo real: Ana conduce, Beto en BOX. Otro equipo no ve nada.
  const intruso = await call('/api/register', { method: 'POST', body: { name: 'Otro', email: 'otro@x.es', password: 'pistapista' } });
  await call('/api/teams', { token: intruso.token, method: 'POST', body: { name: 'Rivales' } });
  const [sa, sb, so] = await Promise.all([connect(ana.token), connect(beto.token), connect(intruso.token)]);
  let leaked = false;
  so.onAny((ev) => { if (['telemetry', 'telemetry:batch', 'lap', 'msg', 'ack', 'pilot'].includes(ev)) leaked = true; }); // presence/driver son de su propio equipo

  const drv = next(sb, 'driver');
  sa.emit('drive');
  assert.equal((await drv).name, 'Ana');

  // 3 cruces de meta (circuito de ida y vuelta sobre lat 40) separados 30 s → 2 vueltas.
  const laps = [];
  sb.on('lap', (l) => laps.push(l));
  const t0 = Date.now() - 120_000;
  const packets = [];
  for (let i = 0; i <= 360; i++) {
    const ts = t0 + i * 250;                   // 90 s a 4 Hz
    const phase = ((i * 250) % 30_000) / 30_000; // una vuelta cada 30 s
    packets.push({ ts, obd: { coolant: 90, rpm: 6000, voltage: 13.8, throttle: 50 }, gps: { lat: 40 - 0.001 + 0.002 * phase, lng: -3, speed: 120 } });
  }
  const got = next(sb, 'telemetry:batch');
  sa.emit('telemetry:batch', { packets });
  const batch = await got;
  assert.equal(batch.packets[0].car, '44');
  assert.equal(batch.packets[0].limits.tempCrit, 105);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(laps.length, 2);
  assert.ok(Math.abs(laps[0].ms - 30_000) < 300, `vuelta de ${laps[0].ms} ms`);

  // Beto toma el volante: la telemetría de Ana se rechaza.
  const back = next(sa, 'driver');
  sb.emit('drive');
  assert.equal((await back).name, 'Beto');
  const rejected = next(sa, 'driver');
  sa.emit('telemetry', { ts: Date.now(), obd: {} });
  assert.equal((await rejected).name, 'Beto');

  // Estadísticas guardadas
  const st = await call(`/api/stats?since=${new Date(t0 - 1000).toISOString()}`, { token: beto.token });
  assert.equal(st.laps.length, 2);
  assert.equal(st.drivers[0].name, 'Ana');
  assert.ok(st.metrics.samples >= 80, `${st.metrics.samples} muestras`); // ~1 Hz durante 90 s
  assert.equal(st.metrics.avg_temp, 90);
  assert.equal(leaked, false, 'el otro equipo no debe recibir nada');

  // Administración: un piloto no puede; el admin restablece la contraseña de Ana.
  assert.equal((await call('/api/admin/users', { token: beto.token })).status, 403);
  const users = await call('/api/admin/users', { token: jefe.token });
  assert.ok(Object.values(users).some((u) => u.email === 'ana@x.es'));
  const reset = await call(`/api/admin/users/${ana.user.id}/reset`, { token: jefe.token, method: 'POST' });
  assert.equal((await call('/api/me', { token: ana.token })).status, 401); // token antiguo invalidado
  const relog = await call('/api/login', { method: 'POST', body: { email: 'ana@x.es', password: reset.tempPassword } });
  assert.equal(relog.user.mustReset, true);
  const changed = await call('/api/password', { token: relog.token, method: 'POST', body: { next: 'nuevaclave1' } });
  assert.equal(changed.user.mustReset, false);

  // Ana (capitana) sale: Beto pasa a capitán.
  const left = await call('/api/team/leave', { token: changed.token, method: 'POST' });
  assert.equal(left.team, null);
  assert.equal((await call('/api/team', { token: beto.token })).ownerId, beto.user.id);

  for (const s of [sa, sb, so]) s.close();
});

test('pistas guardadas: guardar, editar, aplicar y eliminar', async () => {
  const eva = await call('/api/register', { method: 'POST', body: { name: 'Eva', email: 'eva@x.es', password: 'pistapista' } });
  const { token } = eva;
  await call('/api/teams', { token, method: 'POST', body: { name: 'Pistas' } });
  const line = [[40, -3.0001], [40, -2.9999]];
  const cut = [[40.001, -3.0001], [40.001, -2.9999]];
  assert.equal((await call('/api/tracks', { token, method: 'POST', body: { name: 'Jarama' } })).status, 400); // nada dibujado
  assert.equal((await call('/api/team', { token, method: 'PATCH', body: { track: { line, sectors: [[[40, -3]]] } } })).status, 400); // corte de un punto

  await call('/api/team', { token, method: 'PATCH', body: { track: { line, sectors: [cut] } } });
  const jarama = await call('/api/tracks', { token, method: 'POST', body: { name: 'Jarama' } });
  assert.deepEqual(jarama.tracks.map((t) => t.name), ['Jarama']);
  assert.equal(jarama.track.name, 'Jarama');

  // Editar la pista activa guardada la actualiza también en la lista.
  await call('/api/team', { token, method: 'PATCH', body: { track: { ...jarama.track, sectors: [cut, cut] } } });
  await call('/api/team', { token, method: 'PATCH', body: { track: { line: [[41, -3.0001], [41, -2.9999]] } } }); // pista nueva sin guardar
  const applied = await call(`/api/tracks/${jarama.track.id}/apply`, { token, method: 'POST' });
  assert.deepEqual(applied.track.line, line);
  assert.equal(applied.track.sectors.length, 2);

  // Eliminarla deja el dibujo como pista sin guardar.
  const gone = await call(`/api/tracks/${jarama.track.id}`, { token, method: 'DELETE' });
  assert.deepEqual(gone.tracks, []);
  assert.equal(gone.track.id, undefined);
  assert.deepEqual(gone.track.line, line);

  // Icono del coche: solo imágenes en base64; nada que pueda inyectar HTML en el marcador del mapa.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const withIcon = await call('/api/team', { token, method: 'PATCH', body: { carIcon: png, carIconStyle: 'sprite' } });
  assert.equal(withIcon.carIcon, png);
  assert.equal(withIcon.carIconStyle, 'sprite');
  assert.equal((await call('/api/team', { token, method: 'PATCH', body: { carIconStyle: 'gigante' } })).status, 400);
  for (const bad of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AAA" onerror="alert(1)', 'x'.repeat(10)]) {
    assert.equal((await call('/api/team', { token, method: 'PATCH', body: { carIcon: bad } })).status, 400, bad);
  }
  assert.equal((await call('/api/team', { token, method: 'PATCH', body: { carIcon: null } })).carIcon, null);
});
