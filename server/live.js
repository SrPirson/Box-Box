// Tiempo real por equipo: cada equipo es una sala aislada con un coche y un único piloto al volante.
// Aquí se cronometran las vueltas y se guarda la telemetría a 1 Hz para estadísticas.
import { q, one } from './db.js';
import { createLapTimer, createRoute } from './laps.js';
import { LIMITS } from '../src/lib/limits.js';

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
// organizador la cambia; la verde la retira. Solo en memoria. seen: equipos que la han visto (pulsan «Visto»).
const FLAGS = ['green', 'yellow', 'sc', 'red', 'text'];
const flags = new Map(); // eventId → { type, text, ts, seen: Set<teamId> }
const flagOf = (eventId) => { const f = flags.get(eventId); return f ? { type: f.type, text: f.text, ts: f.ts, age: Date.now() - f.ts } : null; };
const flagStatus = (eventId) => { const f = flags.get(eventId); return f && { ...flagOf(eventId), seen: [...f.seen] }; };
const canRun = (u, e) => e && (u.role === 'admin' || (u.role === 'organizer' && e.organizer_id === u.id));
async function setFlag(eventId, type, text) {
  flags.set(eventId, { type, text, ts: Date.now(), seen: new Set() });
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

const setDriver = (st, u) => {
  const prev = st.driver;
  st.driver = u && { id: u.id, name: u.name };
  if (prev && st.driver && prev.id !== st.driver.id) {
    // Relevo: la vuelta del cambio no es representativa ni de uno ni de otro.
    st.lap.restart();
    // El relevo solo se hace con el coche parado: si no había parada confirmada, empieza ya.
    if (!st.pit?.arrived) setPit(st, { since: Date.now(), reason: st.pit?.reason ?? 'Cambio de piloto', arrived: true });
  }
  io.to(room(st.team.id)).emit('driver', st.driver);
};
const presence = (st) => io.to(room(st.team.id)).emit('presence', [...st.online.keys()]);

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
    if (st.driver?.id === userId) setDriver(st, null);
  }
}

// Tipo de vuelta: libre fuera de un evento; dentro, la sesión que marca el organizador.
const kindOf = (team) => (team.event_id ? team.session : 'free');

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function attachLive(server, userFromToken) {
  io = server;
  // Entran los miembros de un equipo y, aunque no tengan equipo, los organizadores (para seguir sus eventos).
  io.use(async (socket, next) => {
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
    });
    socket.on('event:flag', async (d) => {
      const e = await one('select id, organizer_id from events where id = $1', [Number(d?.eventId)]).catch(() => null);
      const text = String(d?.text ?? '').trim().slice(0, 120);
      if (canRun(u, e) && FLAGS.includes(d.type) && (d.type !== 'text' || text)) await setFlag(e.id, d.type, d.type === 'text' ? text : null);
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
    // Alguien del equipo ha visto la bandera: el organizador lo ve en la clasificación.
    socket.on('flag:seen', (ts) => {
      const ev = st.team.event_id;
      const f = flags.get(ev);
      if (!f || f.ts !== ts) return;
      f.seen.add(st.team.id);
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

    // Tomar el volante: el piloto anterior deja de poder enviar telemetría.
    socket.on('drive', () => setDriver(st, u));

    const telemetry = (packets, batch) => {
      if (!Array.isArray(packets) || !packets.length) return;
      if (!st.driver) setDriver(st, u);
      if (st.driver.id !== u.id) return socket.emit('driver', st.driver);
      const now = Date.now();
      const out = [];
      for (const p of packets.slice(0, 1000).sort((a, b) => a.ts - b.ts)) {
        const ts = Math.abs(num(p.ts) - now) < 864e5 ? p.ts : now; // reloj del móvil absurdo → hora del servidor
        const o = p.obd ?? {};
        const g = p.gps ?? {};
        const s = { ts, lat: num(g.lat), lng: num(g.lng), speed: num(g.speed), coolant: num(o.coolant), rpm: num(o.rpm), throttle: num(o.throttle), voltage: num(o.voltage) };
        // Sale de boxes (no por datos atrasados). Mientras viene de camino va rápido: eso no la termina.
        if (st.pit?.arrived && s.speed >= PIT_EXIT_KMH && now - ts < 10_000) setPit(st, null);
        const loc = st.team.route && s.lat != null ? st.team.route.locate([s.lat, s.lng]) : null;
        s.at = loc?.at;
        const lap = st.lap.push(s, st.team.track?.line ?? st.team.route?.line, st.team.track?.sectors);
        if (lap) {
          // JSON.stringify: pg mandaría un array JS como array de Postgres, no como jsonb.
          q('insert into laps (team_id, driver_id, started_at, ms, avg_temp, max_temp, avg_rpm, max_rpm, max_speed, min_volt, sectors, track_id, event_id, kind) values ($1,$2,to_timestamp($3/1000.0),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
            [st.team.id, u.id, lap.startedAt, lap.ms, lap.avgTemp, lap.maxTemp, lap.avgRpm, lap.maxRpm, lap.maxSpeed, lap.minVolt, lap.sectors && JSON.stringify(lap.sectors),
              st.team.event_id ? null : st.team.track?.id ?? null, st.team.event_id, kindOf(st.team)])
            .then(() => st.team.event_id && io.to(eventRoom(st.team.event_id)).emit('event:lap', { teamId: st.team.id, team: st.team.name, ms: lap.ms, driver: u.name }))
            .catch((e) => console.error('lap', e.message));
          io.to(r).emit('lap', { ...lap, driver: u.name, driverId: u.id });
        }
        if (ts - st.lastStored >= 1000) {
          st.lastStored = ts;
          q('insert into samples (team_id, driver_id, ts, rpm, coolant, throttle, voltage, speed, lat, lng, kind) values ($1,$2,to_timestamp($3/1000.0),$4,$5,$6,$7,$8,$9,$10,$11)',
            [st.team.id, u.id, ts, s.rpm, s.coolant, s.throttle, s.voltage, s.speed, s.lat, s.lng, kindOf(st.team)]).catch((e) => console.error('sample', e.message));
        }
        // Fuera de pista: metros al trazado descontando el error del GPS, para no avisar por un fix impreciso.
        const offTrack = loc ? Math.round(Math.max(0, loc.dist - (num(g.acc) ?? 0))) : null;
        out.push({ ...p, ts, offTrack, car: st.team.dorsal, limits: st.team.limits, driver: u.name, lapStartedAt: st.lap.startedAt, lapSplits: st.lap.splits });
      }
      batch ? socket.to(r).emit('telemetry:batch', { packets: out }) : socket.to(r).emit('telemetry', out[0]);
      // Resumen para el organizador del evento, como mucho una vez por segundo.
      const last = out.at(-1);
      if (st.team.event_id && now - st.lastEvent >= EVENT_EVERY_MS) {
        st.lastEvent = now;
        io.to(eventRoom(st.team.event_id)).emit('event:car', {
          teamId: st.team.id, team: st.team.name, car: st.team.dorsal, driver: u.name, ts: last.ts,
          gps: last.gps ?? null, compass: last.compass ?? null, lapStartedAt: last.lapStartedAt, pit: st.pit?.arrived ? st.pit.reason : null,
        });
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
