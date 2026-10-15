// Tiempo real por equipo: cada equipo es una sala aislada con un coche y un único piloto al volante.
// Aquí se cronometran las vueltas y se guarda la telemetría a 1 Hz para estadísticas.
import { q, one } from './db.js';
import { createLapTimer, createRoute } from './laps.js';
import { LIMITS } from '../src/lib/limits.js';
import { ZONE_TYPES, inZone } from '../src/lib/zones.js';

let io;
const states = new Map(); // teamId → Promise<estado>
const room = (teamId) => `team:${teamId}`;

// En un evento, la pista que se cronometra es la del organizador, igual para todos los equipos.
async function loadTeam(id) {
  // event_id: el evento que el equipo está corriendo (inscrito y participando); si no participa, entrena con su pista.
  const t = await one(`select t.id, t.name, t.dorsal, t.limits, case when t.racing then t.event_id end as event_id, e.session,
      case when t.event_id is null or not t.racing then t.track else e.track end as track
    from teams t left join events e on e.id = t.event_id where t.id = $1`, [id]);
  return t && { ...t, limits: { ...LIMITS, ...t.limits }, route: t.track?.path ? createRoute(t.track.path) : null };
}
// Sala del organizador: un resumen de cada equipo del evento (posición, piloto, vuelta), nunca sus mensajes.
const eventRoom = (eventId) => `event:${eventId}`;
const EVENT_EVERY_MS = 1000;

// Dirección de carrera: la bandera actual de cada evento llega a todos sus equipos y se queda hasta que el
// organizador la cambia; la verde la retira. seen: equipos que la han visto (pulsan «Visto»). En memoria y en
// event_log, del que se recupera al arrancar.
const FLAGS = ['green', 'yellow', 'sc', 'red', 'chequered', 'text'];
const flags = new Map(); // eventId → { type, text, ts, seen: Set<teamId> }
const flagOf = (eventId) => { const f = flags.get(eventId); return f ? { type: f.type, text: f.text, ts: f.ts, age: Date.now() - f.ts } : null; };
const flagStatus = (eventId) => { const f = flags.get(eventId); return f && { ...flagOf(eventId), seen: [...f.seen] }; };
const canRun = (u, e) => e && (u.role === 'admin' || (u.role === 'organizer' && e.organizer_id === u.id));
// Registro del evento: se guarda y llega en vivo a quien sigue el evento (Race Control).
export async function logEvent(eventId, kind, data) {
  const r = await one('insert into event_log (event_id, kind, data) values ($1, $2, $3) returning id, ts, kind, data', [eventId, kind, data])
    .catch((e) => { console.error('event_log', e.message); return null; });
  if (r) io.to(eventRoom(eventId)).emit('event:log', r);
}
// Al arrancar: la última bandera de cada evento (del último día; la verde no se queda) y quién la ha visto.
async function restoreFlags() {
  const rows = await q(`select distinct on (event_id) event_id, data from event_log
    where kind = 'flag' and ts > now() - interval '1 day' order by event_id, id desc`);
  for (const { event_id: ev, data: f } of rows) {
    if (f.type === 'green' || flags.has(ev)) continue;
    const seen = await q(`select data->>'teamId' as t from event_log where event_id = $1 and kind = 'seen' and (data->>'flagTs')::bigint = $2`, [ev, f.ts]);
    flags.set(ev, { type: f.type, text: f.text, ts: f.ts, seen: new Set(seen.map((s) => Number(s.t))) });
  }
}
// Banderas locales (zonas del trazado): varias a la vez por evento, en memoria y en event_log. Llegan a los
// equipos que participan ('zones') y al organizador ('event:zones'); cada coche sabe cuándo entra en una ('zone:here').
const zones = new Map(); // eventId → Map<id, { id, type, from, to, dir, label, ts, by }>
export const zonesOf = (eventId) => [...(zones.get(eventId)?.values() ?? [])];
async function restoreZones() {
  const rows = await q(`select event_id, kind, data from event_log where kind in ('zone', 'zone.clear') and ts > now() - interval '1 day' order by id`);
  for (const { event_id: ev, kind, data } of rows) {
    if (!zones.has(ev)) zones.set(ev, new Map());
    if (kind === 'zone') zones.get(ev).set(data.id, data);
    else if (data.id == null) zones.get(ev).clear();
    else zones.get(ev).delete(data.id);
  }
}
async function zonesChanged(eventId) {
  for (const t of await q('select id from teams where event_id = $1 and racing', [eventId])) io.to(room(t.id)).emit('zones', zonesOf(eventId));
  io.to(eventRoom(eventId)).emit('event:zones', zonesOf(eventId));
}
const num01 = (v) => typeof v === 'number' && v >= 0 && v <= 1;
async function setZone(eventId, d, by) {
  if (!ZONE_TYPES[d?.type] || !num01(d.from) || !num01(d.to) || ![1, -1].includes(d.dir)) return false;
  const z = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, type: d.type, from: d.from, to: d.to, dir: d.dir,
    label: String(d.label ?? 'Zona').slice(0, 20), ts: Date.now(), by };
  if (!zones.has(eventId)) zones.set(eventId, new Map());
  zones.get(eventId).set(z.id, z);
  await logEvent(eventId, 'zone', z);
  await zonesChanged(eventId);
  return true;
}
async function clearZone(eventId, id, by) {
  const z = id == null ? null : zones.get(eventId)?.get(id);
  if (id == null) zones.get(eventId)?.clear(); else if (!z) return false; else zones.get(eventId).delete(id);
  await logEvent(eventId, 'zone.clear', { id: id ?? null, type: z?.type, label: z?.label, by });
  await zonesChanged(eventId);
  return true;
}

async function setFlag(eventId, type, text, by) {
  const ts = Date.now();
  flags.set(eventId, { type, text, ts, seen: new Set() });
  logEvent(eventId, 'flag', { type, text, ts, by });
  for (const t of await q('select id from teams where event_id = $1 and racing', [eventId])) io.to(room(t.id)).emit('flag', flagOf(eventId));
  io.to(eventRoom(eventId)).emit('event:flag', flagStatus(eventId));
}
function state(teamId) {
  if (!states.has(teamId)) {
    states.set(teamId, loadTeam(teamId).then((team) => ({ team, driver: null, pit: null, lap: createLapTimer(), lastStored: 0, lastEvent: 0, online: new Map() })));
  }
  return states.get(teamId);
}

// En boxes: parada para repostar o cambiar de piloto. Que el OBD calle, el coche esté parado o nadie
// mande datos es lo normal ahí, así que BOX no lo trata como avería. Termina al salir rodando.
// pit: { since, reason, arrived }. Cuando el piloto avisa de que entra, `arrived` es false (viene de camino:
// alarmas normales, sin cuenta) hasta que BOX confirma que el coche ha llegado; ahí empieza la cuenta.
const PIT_EXIT_KMH = 40;
const setPit = (st, pit) => {
  st.pit = pit;
  io.to(room(st.team.id)).emit('pit', pit);
};
const PIT_REASONS = { pit: 'Entrada a box', fuel: 'Repostaje' };

// driver: quién conduce (a quien se atribuyen vueltas y muestras); by: la cuenta del móvil del coche, la única
// que puede enviar la telemetría. Suelen coincidir, pero desde el móvil del coche se puede elegir a otro
// miembro del equipo sin desconectar el OBD.
const setDriver = (st, u, by = u?.id) => {
  const prev = st.driver;
  st.driver = u && { id: u.id, name: u.name, by };
  if (prev && st.driver && prev.id !== st.driver.id) {
    // Relevo: la vuelta del cambio no es representativa ni de uno ni de otro. Con calle de boxes dibujada sí
    // cuenta (en resistencia, cada vuelta suma): se cierra al salir de boxes.
    if (!st.team.track?.pitOut) st.lap.restart();
    // El relevo solo se hace con el coche parado: si no había parada confirmada, empieza ya.
    if (!st.pit?.arrived) setPit(st, { since: Date.now(), reason: st.pit?.reason ?? 'Cambio de piloto', arrived: true });
  }
  io.to(room(st.team.id)).emit('driver', st.driver);
};
// Sanción sin ver más reciente del equipo (si participa en su evento), o null.
const lastPenalty = (teamId) => one(`select p.id, p.laps, p.retired, p.reason, (extract(epoch from p.created_at) * 1000)::float8 as ts
  from penalties p join teams t on t.id = p.team_id and t.event_id = p.event_id and t.racing
  where p.team_id = $1 and p.seen_at is null order by p.id desc limit 1`, [teamId]).then((r) => r ?? null);
// Sanción puesta o anulada: el equipo recarga sus vueltas y ve la pendiente; el organizador recarga la lista.
export async function teamPenalty(eventId, teamId) {
  io.to(room(teamId)).emit('team');
  io.to(room(teamId)).emit('penalty', await lastPenalty(teamId));
  io.to(eventRoom(eventId)).emit('event:penalties');
}
// Equipos que están ahora en boxes (parada confirmada), para el directo público.
export async function pitsOf(teamIds) {
  const out = new Set();
  for (const id of teamIds) if (states.has(id) && (await states.get(id)).pit?.arrived) out.add(id);
  return out;
}
// Última posición de cada coche del evento (de los últimos 15 s), para el mapa del directo público.
export async function carsOf(teamIds) {
  const out = [];
  for (const id of teamIds) {
    const c = states.has(id) && (await states.get(id)).summary;
    if (c?.gps && Date.now() - c.ts < 15_000) out.push({ teamId: c.teamId, car: c.car, ts: c.ts, gps: c.gps, compass: c.compass, pit: c.pit });
  }
  return out;
}
const presence = (st) => io.to(room(st.team.id)).emit('presence', [...st.online.keys()]);

// Para el resumen del admin: equipos con alguien conectado ahora y banderas activas (no verdes) por evento.
export async function liveStats() {
  const all = await Promise.all(states.values());
  return {
    teamsOnline: all.filter((st) => st.team && st.online.size > 0).length,
    flags: [...flags.entries()].filter(([, f]) => f.type !== 'green').map(([eventId, f]) => ({ eventId, type: f.type, ts: f.ts })),
  };
}

// Llamado por la API cuando cambian dorsal, límites, meta o trazado.
export async function teamChanged(teamId) {
  if (states.has(teamId)) {
    const st = await state(teamId);
    const before = JSON.stringify(st.team?.track);
    st.team = await loadTeam(teamId);
    if (!st.team) states.delete(teamId);
    else if (JSON.stringify(st.team.track) !== before) st.lap.restart();
  }
  io.to(room(teamId)).emit('team');
  // Entra en un evento (o empieza a participar) o sale de él: su bandera, o ninguna.
  const t = await one('select event_id, racing from teams where id = $1', [teamId]);
  io.to(room(teamId)).emit('flag', t?.event_id && t.racing ? flagOf(t.event_id) : null);
  io.to(room(teamId)).emit('zones', t?.event_id && t.racing ? zonesOf(t.event_id) : []);
  if (t?.event_id) io.to(eventRoom(t.event_id)).emit('event:teams'); // el organizador recarga equipos e iconos
}

// Aviso para el registro de BOX del equipo (p. ej., empieza o deja de participar en el evento).
export const teamNotice = (teamId, text) => io.to(room(teamId)).emit('notice', { text, ts: Date.now() });

// Expulsa las conexiones de un usuario (eliminado, sacado del equipo o cambiado de equipo); al reconectar
// se vuelve a validar quién es y a qué equipo pertenece.
export async function kick(userId) {
  for (const s of await io.fetchSockets()) if (s.data.user.id === userId) s.disconnect(true);
  for (const p of states.values()) {
    const st = await p;
    if (st.driver?.id === userId || st.driver?.by === userId) setDriver(st, null);
  }
}

// Tipo de vuelta: libre fuera de un evento; dentro, la sesión que marca el organizador.
const kindOf = (team) => (team.event_id ? team.session : 'free');

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function attachLive(server, userFromToken) {
  io = server;
  // Nadie entra hasta tener recuperadas las banderas: quien conecta tras un reinicio recibe la que hay.
  const restored = Promise.all([restoreFlags(), restoreZones()]).catch((e) => console.error('banderas', e.message));
  // Entran los miembros de un equipo y, aunque no tengan equipo, los organizadores (para seguir sus eventos).
  io.use(async (socket, next) => {
    await restored;
    const u = await userFromToken(socket.handshake.auth?.token).catch(() => null);
    if (!u || (!u.team_id && !['organizer', 'admin'].includes(u.role))) return next(new Error('unauthorized'));
    socket.data.user = u;
    next();
  });

  io.on('connection', async (socket) => {
    const u = socket.data.user;
    // El organizador sigue un evento suyo (el admin, cualquiera).
    socket.on('event:watch', async (eventId) => {
      const e = await one('select id, organizer_id from events where id = $1', [Number(eventId)]).catch(() => null);
      if (!canRun(u, e)) return;
      socket.join(eventRoom(e.id));
      socket.emit('event:flag', flagStatus(e.id));
      socket.emit('event:zones', zonesOf(e.id));
    });
    // ack: el panel sabe si la bandera ha llegado al servidor (sin acuse, avisa de que no se ha enviado).
    socket.on('event:flag', async (d, ack) => {
      const e = await one('select id, organizer_id from events where id = $1', [Number(d?.eventId)]).catch(() => null);
      const text = String(d?.text ?? '').trim().slice(0, 120);
      const ok = canRun(u, e) && FLAGS.includes(d?.type) && (d.type !== 'text' || !!text);
      if (ok) await setFlag(e.id, d.type, d.type === 'text' ? text : null, u.name);
      if (typeof ack === 'function') ack({ ok });
    });
    // Bandera local: { eventId, action: 'set', type, from, to, dir, label } o { eventId, action: 'clear', id? } (sin id: todas).
    socket.on('event:zone', async (d, ack) => {
      const e = await one('select id, organizer_id from events where id = $1', [Number(d?.eventId)]).catch(() => null);
      const ok = canRun(u, e) && (d?.action === 'clear' ? await clearZone(e.id, d.id ?? null, u.name) : await setZone(e.id, d, u.name));
      if (typeof ack === 'function') ack({ ok: !!ok });
    });
    socket.on('event:unwatch', (eventId) => socket.leave(eventRoom(Number(eventId))));
    if (!u.team_id) return;

    const st = await state(u.team_id);
    if (!st.team) return socket.disconnect(true);
    const r = room(u.team_id);
    socket.join(r);
    st.online.set(u.id, (st.online.get(u.id) ?? 0) + 1);
    presence(st);
    socket.emit('driver', st.driver);
    socket.emit('pit', st.pit);
    socket.emit('flag', st.team.event_id ? flagOf(st.team.event_id) : null);
    socket.emit('zones', st.team.event_id ? zonesOf(st.team.event_id) : []);
    // Sin await: los manejadores de abajo tienen que estar puestos antes de que lleguen los primeros paquetes.
    lastPenalty(st.team.id).then((p) => socket.emit('penalty', p)).catch(() => {});
    // Alguien del equipo ha visto la sanción: el organizador lo ve en la lista.
    socket.on('penalty:seen', async (id) => {
      const p = await one('update penalties set seen_at = now() where id = $1 and team_id = $2 and seen_at is null returning event_id', [Number(id), st.team.id]).catch(() => null);
      if (!p) return;
      logEvent(p.event_id, 'penalty.seen', { team: st.team.name, by: u.name });
      io.to(eventRoom(p.event_id)).emit('event:penalties');
      socket.to(r).emit('penalty', await lastPenalty(st.team.id)); // el resto del equipo deja de verla
    });
    // Alguien del equipo ha visto la bandera: el organizador lo ve en la clasificación.
    socket.on('flag:seen', (ts) => {
      const ev = st.team.event_id;
      const f = flags.get(ev);
      if (!f || f.ts !== ts || f.seen.has(st.team.id)) return;
      f.seen.add(st.team.id);
      logEvent(ev, 'seen', { flagTs: ts, teamId: st.team.id, team: st.team.name, by: u.name });
      io.to(eventRoom(ev)).emit('event:flag', flagStatus(ev));
    });
    // BOX confirma la llegada del coche ('arrived', empieza la cuenta) o termina/cancela la parada (false).
    socket.on('pit', (action) => setPit(st, action === 'arrived'
      ? { since: Date.now(), reason: st.pit?.reason ?? 'Marcado desde BOX', arrived: true }
      : null));
    socket.on('disconnect', () => {
      const n = st.online.get(u.id) - 1;
      n > 0 ? st.online.set(u.id, n) : st.online.delete(u.id);
      presence(st);
    });

    // Tomar el volante: el móvil anterior deja de poder enviar telemetría. Sin driverId conduce el dueño de
    // la cuenta, salvo que este móvil ya fuera el del coche (sigue el piloto elegido). Con driverId, conduce
    // ese miembro del equipo (cambio de piloto rápido); si no es del equipo, se ignora.
    socket.on('drive', async (d) => {
      if (d?.driverId == null) return setDriver(st, st.driver?.by === u.id ? st.driver : u, u.id);
      const m = await one('select id, name from users where id = $1 and team_id = $2', [Number(d.driverId), st.team.id]).catch(() => null);
      if (m) setDriver(st, m, u.id);
    });

    const telemetry = (packets, batch) => {
      if (!Array.isArray(packets) || !packets.length) return;
      if (!st.driver) setDriver(st, u);
      if (st.driver.by !== u.id) return socket.emit('driver', st.driver);
      const now = Date.now();
      const out = [];
      for (const p of packets.slice(0, 1000).sort((a, b) => a.ts - b.ts)) {
        const ts = Math.abs(num(p.ts) - now) < 864e5 ? p.ts : now; // reloj del móvil absurdo → hora del servidor
        const o = p.obd ?? {};
        const g = p.gps ?? {};
        const s = { ts, lat: num(g.lat), lng: num(g.lng), speed: num(g.speed), coolant: num(o.coolant), rpm: num(o.rpm), throttle: num(o.throttle), voltage: num(o.voltage) };
        // Sale de boxes (no por datos atrasados). Mientras viene de camino va rápido: eso no la termina. Con calle
        // de boxes dibujada, la parada la marcan sus líneas de entrada y salida.
        const pitLane = st.team.track?.pitOut;
        if (!pitLane && st.pit?.arrived && s.speed >= PIT_EXIT_KMH && now - ts < 10_000) setPit(st, null);
        const loc = st.team.route && s.lat != null ? st.team.route.locate([s.lat, s.lng]) : null;
        s.at = loc?.at;
        // Bandera local: avisa al equipo al entrar en una zona y al salir (solo con datos en vivo).
        if (st.team.event_id && loc && now - ts < 10_000) {
          const here = zonesOf(st.team.event_id).find((z) => inZone(z, loc.at)) ?? null;
          if ((here?.id ?? null) !== (st.zoneHere ?? null)) { st.zoneHere = here?.id ?? null; io.to(r).emit('zone:here', here); }
        }
        const d = st.driver;
        const wasInPit = st.lap.inPit;
        const lap = st.lap.push(s, st.team.track?.line ?? st.team.route?.line, st.team.track?.sectors, st.team.track);
        if (pitLane && now - ts < 10_000) {
          if (st.lap.inPit && !wasInPit && !st.pit?.arrived) setPit(st, { since: ts, reason: st.pit?.reason ?? 'Calle de boxes', arrived: true });
          else if (!st.lap.inPit && wasInPit) setPit(st, null);
        }
        if (lap) {
          // JSON.stringify: pg mandaría un array JS como array de Postgres, no como jsonb.
          q('insert into laps (team_id, driver_id, started_at, ms, avg_temp, max_temp, avg_rpm, max_rpm, max_speed, min_volt, sectors, track_id, event_id, kind) values ($1,$2,to_timestamp($3/1000.0),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
            [st.team.id, d.id, lap.startedAt, lap.ms, lap.avgTemp, lap.maxTemp, lap.avgRpm, lap.maxRpm, lap.maxSpeed, lap.minVolt, lap.sectors && JSON.stringify(lap.sectors),
              st.team.event_id ? null : st.team.track?.id ?? null, st.team.event_id, kindOf(st.team)])
            .then(() => st.team.event_id && io.to(eventRoom(st.team.event_id)).emit('event:lap', { teamId: st.team.id, team: st.team.name, ms: lap.ms, driver: d.name }))
            .catch((e) => console.error('lap', e.message));
          io.to(r).emit('lap', { ...lap, driver: d.name, driverId: d.id });
        }
        if (ts - st.lastStored >= 1000) {
          st.lastStored = ts;
          q('insert into samples (team_id, driver_id, ts, rpm, coolant, throttle, voltage, speed, lat, lng, kind, track_id) values ($1,$2,to_timestamp($3/1000.0),$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [st.team.id, d.id, ts, s.rpm, s.coolant, s.throttle, s.voltage, s.speed, s.lat, s.lng, kindOf(st.team), st.team.event_id ? null : st.team.track?.id ?? null]).catch((e) => console.error('sample', e.message));
        }
        // Fuera de pista: metros al trazado descontando el error del GPS, para no avisar por un fix impreciso.
        const offTrack = loc ? Math.round(Math.max(0, loc.dist - (num(g.acc) ?? 0))) : null;
        out.push({ ...p, ts, offTrack, car: st.team.dorsal, limits: st.team.limits, driver: d.name, lapStartedAt: st.lap.startedAt, lapSplits: st.lap.splits });
      }
      batch ? socket.to(r).emit('telemetry:batch', { packets: out }) : socket.to(r).emit('telemetry', out[0]);
      // El emisor no recibe su telemetría: le basta el cronómetro y los parciales para su vista de tiempos.
      socket.emit('lap:live', { lapStartedAt: st.lap.startedAt, lapSplits: st.lap.splits });
      // Resumen para el organizador del evento, como mucho una vez por segundo.
      const last = out.at(-1);
      if (st.team.event_id && now - st.lastEvent >= EVENT_EVERY_MS) {
        st.lastEvent = now;
        st.summary = {
          teamId: st.team.id, team: st.team.name, car: st.team.dorsal, driver: st.driver.name, ts: last.ts,
          gps: last.gps ?? null, compass: last.compass ?? null, lapStartedAt: last.lapStartedAt, pit: st.pit?.arrived ? st.pit.reason : null,
        };
        io.to(eventRoom(st.team.event_id)).emit('event:car', st.summary);
      }
    };
    socket.on('telemetry', (p) => telemetry([p], false));
    socket.on('telemetry:batch', (b) => telemetry(b?.packets, true));

    // Anular la vuelta en curso (el coche se ha salido o ha tenido que parar a mitad): no se guarda, y la
    // siguiente empieza al cruzar de nuevo la meta, desde el T1.
    socket.on('lap:reset', () => {
      st.lap.restart();
      io.to(r).emit('lap:reset', { by: u.name, ts: Date.now() });
    });

    // Mensajería: se reenvía al resto del equipo con el remitente verificado.
    for (const ev of ['pilot', 'msg', 'ack']) {
      socket.on(ev, (d) => {
        if (ev === 'pilot' && PIT_REASONS[d?.type] && !st.pit) setPit(st, { since: Date.now(), reason: PIT_REASONS[d.type], arrived: false });
        socket.to(r).emit(ev, { ...d, from: { id: u.id, name: u.name }, serverTs: Date.now() });
      });
    }
  });
}
