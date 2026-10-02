// Tiempo real por equipo: cada equipo es una sala aislada con un coche y un único piloto al volante.
// Aquí se cronometran las vueltas y se guarda la telemetría a 1 Hz para estadísticas.
import { q, one } from './db.js';
import { createLapTimer, createRoute } from './laps.js';
import { LIMITS } from '../src/lib/limits.js';

let io;
const states = new Map(); // teamId → Promise<estado>
const room = (teamId) => `team:${teamId}`;

async function loadTeam(id) {
  const t = await one('select id, dorsal, limits, track from teams where id = $1', [id]);
  return t && { ...t, limits: { ...LIMITS, ...t.limits }, route: t.track?.path ? createRoute(t.track.path) : null };
}
function state(teamId) {
  if (!states.has(teamId)) {
    states.set(teamId, loadTeam(teamId).then((team) => ({ team, driver: null, pit: null, lap: createLapTimer(), lastStored: 0, online: new Map() })));
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
}

// Expulsa las conexiones de un usuario (eliminado, sacado del equipo o cambiado de equipo); al reconectar
// se vuelve a validar quién es y a qué equipo pertenece.
export async function kick(userId) {
  for (const s of await io.fetchSockets()) if (s.data.user.id === userId) s.disconnect(true);
  for (const p of states.values()) {
    const st = await p;
    if (st.driver?.id === userId) setDriver(st, null);
  }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function attachLive(server, userFromToken) {
  io = server;
  io.use(async (socket, next) => {
    const u = await userFromToken(socket.handshake.auth?.token).catch(() => null);
    if (!u?.team_id) return next(new Error('unauthorized'));
    socket.data.user = u;
    next();
  });

  io.on('connection', async (socket) => {
    const u = socket.data.user;
    const st = await state(u.team_id);
    if (!st.team) return socket.disconnect(true);
    const r = room(u.team_id);
    socket.join(r);
    st.online.set(u.id, (st.online.get(u.id) ?? 0) + 1);
    presence(st);
    socket.emit('driver', st.driver);
    socket.emit('pit', st.pit);
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
          q('insert into laps (team_id, driver_id, started_at, ms, avg_temp, max_temp, avg_rpm, max_rpm, max_speed, min_volt, sectors, track_id) values ($1,$2,to_timestamp($3/1000.0),$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [st.team.id, u.id, lap.startedAt, lap.ms, lap.avgTemp, lap.maxTemp, lap.avgRpm, lap.maxRpm, lap.maxSpeed, lap.minVolt, lap.sectors && JSON.stringify(lap.sectors), st.team.track?.id ?? null])
            .catch((e) => console.error('lap', e.message));
          io.to(r).emit('lap', { ...lap, driver: u.name, driverId: u.id });
        }
        if (ts - st.lastStored >= 1000) {
          st.lastStored = ts;
          q('insert into samples (team_id, driver_id, ts, rpm, coolant, throttle, voltage, speed, lat, lng) values ($1,$2,to_timestamp($3/1000.0),$4,$5,$6,$7,$8,$9,$10)',
            [st.team.id, u.id, ts, s.rpm, s.coolant, s.throttle, s.voltage, s.speed, s.lat, s.lng]).catch((e) => console.error('sample', e.message));
        }
        // Fuera de pista: metros al trazado descontando el error del GPS, para no avisar por un fix impreciso.
        const offTrack = loc ? Math.round(Math.max(0, loc.dist - (num(g.acc) ?? 0))) : null;
        out.push({ ...p, ts, offTrack, car: st.team.dorsal, limits: st.team.limits, driver: u.name, lapStartedAt: st.lap.startedAt, lapSplits: st.lap.splits });
      }
      batch ? socket.to(r).emit('telemetry:batch', { packets: out }) : socket.to(r).emit('telemetry', out[0]);
    };
    socket.on('telemetry', (p) => telemetry([p], false));
    socket.on('telemetry:batch', (b) => telemetry(b?.packets, true));

    // Mensajería: se reenvía al resto del equipo con el remitente verificado.
    for (const ev of ['pilot', 'msg', 'ack']) {
      socket.on(ev, (d) => {
        if (ev === 'pilot' && PIT_REASONS[d?.type] && !st.pit) setPit(st, { since: Date.now(), reason: PIT_REASONS[d.type], arrived: false });
        socket.to(r).emit(ev, { ...d, from: { id: u.id, name: u.name }, serverTs: Date.now() });
      });
    }
  });
}
