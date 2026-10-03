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
  assert.ok(batch.packets.at(-1).lapStartedAt != null, 'hay una vuelta en curso');

  // Anular la vuelta en curso: todos se enteran y la siguiente espera a cruzar la meta.
  const lapReset = next(sb, 'lap:reset');
  sa.emit('lap:reset');
  assert.equal((await lapReset).by, 'Ana');
  const after = next(sb, 'telemetry');
  sa.emit('telemetry', { ts: Date.now(), obd: {}, gps: { lat: 39.9995, lng: -3, speed: 100 } });
  assert.equal((await after).lapStartedAt, null);

  // Beto toma el volante: es un relevo (el coche pasa a boxes) y la telemetría de Ana se rechaza.
  const back = next(sa, 'driver');
  const pitIn = next(sa, 'pit');
  sb.emit('drive');
  assert.equal((await back).name, 'Beto');
  assert.equal((await pitIn).reason, 'Cambio de piloto');
  const rejected = next(sa, 'driver');
  sa.emit('telemetry', { ts: Date.now(), obd: {} });
  assert.equal((await rejected).name, 'Beto');
  // Beto sale rodando: fin de la parada.
  const pitOut = next(sa, 'pit');
  sb.emit('telemetry', { ts: Date.now(), obd: {}, gps: { lat: 39, lng: -3, speed: 80 } });
  assert.equal(await pitOut, null);

  // Beto avisa de que entra a boxes: viene de camino (sin cuenta) aunque vaya rápido, hasta que BOX confirma.
  const coming = next(sa, 'pit');
  sb.emit('pilot', { type: 'pit', label: 'SALGO A BOX' });
  assert.deepEqual([(await coming).reason, (await coming).arrived], ['Entrada a box', false]);
  let pitChanged = false;
  sa.once('pit', () => { pitChanged = true; });
  sb.emit('telemetry', { ts: Date.now(), obd: {}, gps: { lat: 39, lng: -3, speed: 120 } });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(pitChanged, false, 'ir rápido de camino a boxes no termina la parada');
  const arrived = next(sb, 'pit');
  sa.emit('pit', 'arrived');
  assert.equal((await arrived).arrived, true);
  sa.emit('pit', false);

  // Estadísticas guardadas
  const st = await call(`/api/stats?since=${new Date(t0 - 1000).toISOString()}`, { token: beto.token });
  assert.equal(st.laps.length, 2);
  assert.equal(st.drivers[0].name, 'Ana');
  assert.ok(st.metrics.samples >= 80, `${st.metrics.samples} muestras`); // ~1 Hz durante 90 s
  assert.equal(st.metrics.avg_temp, 90);
  assert.equal(leaked, false, 'el otro equipo no debe recibir nada');

  // Perfil: las vueltas son de Ana, no de Beto.
  const mine = await call(`/api/me/stats?since=${new Date(t0 - 1000).toISOString()}`, { token: ana.token });
  assert.equal(mine.laps.length, 2);
  assert.equal(mine.laps[0].team, 'Cencerro Racing');
  assert.ok(mine.metrics.seconds >= 80 && mine.metrics.km > 2, JSON.stringify(mine.metrics)); // 90 s a 120 km/h ≈ 3 km
  assert.equal((await call(`/api/me/stats?since=${new Date(t0 - 1000).toISOString()}`, { token: beto.token })).laps.length, 0);

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

  // Beto sale también: el equipo se elimina, pero Ana conserva sus vueltas en su perfil.
  await call('/api/team/leave', { token: beto.token, method: 'POST' });
  const kept = await call(`/api/me/stats?since=${new Date(t0 - 1000).toISOString()}`, { token: changed.token });
  assert.equal(kept.laps.length, 2);
  assert.equal(kept.laps[0].team, null);

  for (const s of [sa, sb, so]) s.close();
});

test('eventos: organizador, inscripción de equipos, pista común, seguimiento en vivo y clasificación', async () => {
  const admin = await call('/api/login', { method: 'POST', body: { email: 'jefe@cencerro.es', password: 'adminadmin' } });
  const olga = await call('/api/register', { method: 'POST', body: { name: 'Olga', email: 'olga@x.es', password: 'pistapista' } });
  // Un piloto no puede crear eventos; el admin la hace organizadora.
  assert.equal((await call('/api/events', { token: olga.token, method: 'POST', body: { name: 'X' } })).status, 403);
  await call(`/api/admin/users/${olga.user.id}`, { token: admin.token, method: 'PATCH', body: { role: 'organizer' } });

  const ev = await call('/api/events', { token: olga.token, method: 'POST', body: { name: '24h Jarama', startsOn: '2026-11-07', place: 'Jarama' } });
  assert.equal(ev.startsOn, '2026-11-07');
  const line = [[40, -3.0001], [40, -2.9999]];
  await call(`/api/events/${ev.id}`, { token: olga.token, method: 'PATCH', body: { track: { line } } });

  // Un piloto inscribe su equipo con el código del evento: hereda la pista y no puede cambiarla.
  const pepe = await call('/api/register', { method: 'POST', body: { name: 'Pepe', email: 'pepe@x.es', password: 'pistapista' } });
  const look = await call(`/api/code/${ev.inviteCode.toLowerCase()}`, { token: pepe.token });
  assert.deepEqual([look.kind, look.event.name], ['event', '24h Jarama']);
  const reg = await call('/api/teams', { token: pepe.token, method: 'POST', body: { name: 'Los Rápidos', eventCode: ev.inviteCode } });
  assert.equal(reg.team.event.name, '24h Jarama');
  assert.equal(reg.team.dorsal, '1'); // el primero del evento; el siguiente sería el 2
  assert.deepEqual(reg.team.track.line, line);
  assert.equal((await call('/api/team', { token: pepe.token, method: 'PATCH', body: { track: { line: [[1, 1], [2, 2]] } } })).status, 403);

  // Otro piloto se une al equipo con el código del equipo.
  const quique = await call('/api/register', { method: 'POST', body: { name: 'Quique', email: 'quique@x.es', password: 'pistapista' } });
  assert.equal((await call(`/api/code/${reg.team.inviteCode}`, { token: quique.token })).kind, 'team');
  await call('/api/teams/join', { token: quique.token, method: 'POST', body: { code: reg.team.inviteCode } });
  const detail = await call(`/api/events/${ev.id}`, { token: olga.token });
  assert.deepEqual(detail.teams[0].members.map((m) => m.name), ['Pepe', 'Quique']);
  assert.equal((await call(`/api/events/${ev.id}`, { token: pepe.token })).status, 403);

  // En vivo: Olga (sin equipo) sigue el evento y ve el coche y las vueltas; luego la clasificación.
  const [so, sp] = await Promise.all([connect(olga.token), connect(pepe.token)]);
  so.emit('event:watch', ev.id);
  await new Promise((r) => setTimeout(r, 200));
  const car = next(so, 'event:car');
  const lapSeen = next(so, 'event:lap');
  sp.emit('drive');
  const t0 = Date.now() - 100_000;
  const packets = Array.from({ length: 361 }, (_, i) => ({ ts: t0 + i * 250, obd: {}, gps: { lat: 40 - 0.001 + 0.002 * (((i * 250) % 30_000) / 30_000), lng: -3, speed: 120 } }));
  sp.emit('telemetry:batch', { packets });
  assert.deepEqual([(await car).team, (await car).driver], ['Los Rápidos', 'Pepe']);
  assert.equal((await lapSeen).team, 'Los Rápidos');
  await new Promise((r) => setTimeout(r, 300));
  const standing = (await call(`/api/events/${ev.id}/standings`, { token: olga.token }))[0]; // call convierte la lista en objeto
  assert.equal(standing.laps, 2);
  assert.ok(Math.abs(standing.best - 30_000) < 300, `${standing.best} ms`);
  assert.equal(standing.best_driver, 'Pepe');
  // El perfil de Pepe sabe en qué evento dio cada vuelta.
  assert.equal((await call('/api/me/stats', { token: pepe.token })).laps[0].event, '24h Jarama');

  // Dirección de carrera: un piloto no puede dar banderas; la organizadora sí, y llega a todo el equipo.
  const pepeFlag = new Promise((r, j) => { sp.once('flag', j); setTimeout(r, 300); });
  sp.emit('event:flag', { eventId: ev.id, type: 'red' });
  await pepeFlag;
  const redP = next(sp, 'flag');
  const status = next(so, 'event:flag');
  so.emit('event:flag', { eventId: ev.id, type: 'red' });
  const red = await redP;
  assert.equal(red.type, 'red');
  assert.deepEqual((await status).seen, []);
  // Quien se conecta después la recibe al entrar; al pulsar «Visto», la organizadora lo ve.
  const sq = io(BASE, { transports: ['websocket'], auth: { token: quique.token }, reconnection: false });
  assert.equal((await next(sq, 'flag')).ts, red.ts);
  const seen = next(so, 'event:flag');
  sq.emit('flag:seen', red.ts);
  assert.deepEqual((await seen).seen, [reg.team.id]);
  const msg = next(sp, 'flag');
  so.emit('event:flag', { eventId: ev.id, type: 'text', text: '  Aceite en la curva 3  ' });
  assert.equal((await msg).text, 'Aceite en la curva 3');

  for (const s of [so, sp, sq]) s.close();
});

test('lista pública de eventos, gestión de inscritos por el organizador y perfil', async () => {
  const admin = await call('/api/login', { method: 'POST', body: { email: 'jefe@cencerro.es', password: 'adminadmin' } });
  const reg = (name, email) => call('/api/register', { method: 'POST', body: { name, email, password: 'pistapista' } });
  const org = await reg('Oriol', 'oriol@x.es');
  await call(`/api/admin/users/${org.user.id}`, { token: admin.token, method: 'PATCH', body: { role: 'organizer' } });
  const pub = await call('/api/events', { token: org.token, method: 'POST', body: { name: 'Resistencia Cheste', startsOn: '2099-05-01', place: 'Cheste' } });
  const priv = await call('/api/events', { token: org.token, method: 'POST', body: { name: 'Privado Club', startsOn: '2099-05-02' } });
  await call(`/api/events/${priv.id}`, { token: org.token, method: 'PATCH', body: { private: true } });

  // El piloto ve solo el público, lo encuentra buscando y se inscribe sin código; el privado no se puede así.
  const rita = await reg('Rita', 'rita@x.es');
  const list = Object.values(await call('/api/events/public?q=chest', { token: rita.token })).filter((x) => typeof x === 'object');
  assert.deepEqual(list.map((e) => e.name), ['Resistencia Cheste']);
  assert.equal(Object.values(await call('/api/events/public?q=Privado', { token: rita.token })).filter((x) => typeof x === 'object').length, 0);
  assert.equal((await call('/api/teams', { token: rita.token, method: 'POST', body: { name: 'X', eventId: priv.id } })).status, 404);
  const team = (await call('/api/teams', { token: rita.token, method: 'POST', body: { name: 'Rita Racing', eventId: pub.id } })).team;
  assert.equal(team.event.name, 'Resistencia Cheste');

  // El organizador mete a un piloto registrado por su email, lo saca y echa al equipo del evento.
  const sam = await reg('Sam', 'sam@x.es');
  const added = await call(`/api/events/${pub.id}/teams/${team.id}/members`, { token: org.token, method: 'POST', body: { email: 'SAM@x.es' } });
  assert.deepEqual(added.teams[0].members.map((m) => m.name), ['Rita', 'Sam']);
  assert.equal((await call(`/api/events/${pub.id}/teams/${team.id}/members`, { token: org.token, method: 'POST', body: { email: 'nadie@x.es' } })).status, 404);
  const removed = await call(`/api/events/${pub.id}/teams/${team.id}/members/${sam.user.id}`, { token: org.token, method: 'DELETE' });
  assert.deepEqual(removed.teams[0].members.map((m) => m.name), ['Rita']);
  const expelled = await call(`/api/events/${pub.id}/teams/${team.id}`, { token: org.token, method: 'DELETE' });
  assert.equal(expelled.teams.length, 0);
  assert.equal((await call('/api/me', { token: rita.token })).team.event, null); // sigue como equipo de entrenamiento
  // El capitán vuelve a inscribir a su mismo equipo desde la lista, y lo saca.
  assert.equal((await call('/api/team/enroll', { token: rita.token, method: 'POST', body: { eventId: pub.id } })).event.name, 'Resistencia Cheste');
  assert.equal((await call('/api/team/enroll', { token: rita.token, method: 'POST', body: { eventId: null } })).event, null);

  // Solo el admin cambia el organizador.
  assert.equal((await call(`/api/events/${pub.id}`, { token: org.token, method: 'PATCH', body: { organizerId: admin.user.id } })).status, 403);
  assert.equal((await call(`/api/events/${pub.id}`, { token: admin.token, method: 'PATCH', body: { organizerId: admin.user.id } })).organizer, 'Jefe');

  // Perfil: nombre libre; email con la contraseña; eliminar la cuenta con la contraseña.
  assert.equal((await call('/api/me', { token: rita.token, method: 'PATCH', body: { name: 'Rita G.' } })).user.name, 'Rita G.');
  assert.equal((await call('/api/me', { token: rita.token, method: 'PATCH', body: { email: 'rita2@x.es', password: 'mala' } })).status, 400);
  assert.equal((await call('/api/me', { token: rita.token, method: 'PATCH', body: { email: 'rita2@x.es', password: 'pistapista' } })).user.email, 'rita2@x.es');
  assert.equal((await call('/api/me', { token: sam.token, method: 'DELETE', body: { password: 'mala' } })).status, 400);
  assert.equal((await call('/api/me', { token: sam.token, method: 'DELETE', body: { password: 'pistapista' } })).ok, true);
  assert.equal((await call('/api/login', { method: 'POST', body: { email: 'sam@x.es', password: 'pistapista' } })).status, 401);
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
