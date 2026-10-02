// API REST: cuentas, equipos con invitación, administración y estadísticas.
import { q, one } from './db.js';
import { hashPassword, checkPassword, sign, verify, randomCode, tempPassword } from './auth.js';
import { teamChanged, kick } from './live.js';
import { LIMITS, limitErrors } from '../src/lib/limits.js';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };

export async function userFromToken(token) {
  const p = verify(token);
  if (!p) return null;
  const u = await one('select * from users where id = $1', [p.uid]);
  return u && u.pass.slice(0, 8) === p.pv ? u : null;
}

// ── Validación en el borde ──
const str = (v, name, { min = 1, max = 100 } = {}) => {
  v = typeof v === 'string' ? v.trim() : '';
  if (v.length < min || v.length > max) fail(400, `${name}: entre ${min} y ${max} caracteres.`);
  return v;
};
const email = (v) => {
  v = str(v, 'Email', { max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(400, 'El email no es válido.');
  return v;
};
const password = (v) => str(v, 'Contraseña', { min: 8, max: 200 });
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ── Respuestas ──
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, mustReset: u.must_reset, teamId: u.team_id });
// Columnas de un evento (la fecha como texto: un date de Postgres llega como Date a medianoche local y se desplaza).
const EVENT_COLS = "id, name, to_char(starts_on, 'YYYY-MM-DD') as starts_on, place, organizer_id, invite_code, track, closed";
const eventSummary = (e) => ({ id: e.id, name: e.name, startsOn: e.starts_on, place: e.place, closed: e.closed });

async function teamPayload(teamId) {
  const t = await one('select * from teams where id = $1', [teamId]);
  if (!t) return null;
  const [members, tracks, ev] = await Promise.all([
    q('select id, name, role from users where team_id = $1 order by created_at', [teamId]),
    q('select id, name from tracks where team_id = $1 order by name', [teamId]),
    t.event_id ? one(`select ${EVENT_COLS} from events where id = $1`, [t.event_id]) : null,
  ]);
  return {
    id: t.id, name: t.name, inviteCode: t.invite_code, ownerId: t.owner_id, dorsal: t.dorsal, phone: t.phone,
    limits: { ...LIMITS, ...t.limits }, carIcon: t.car_icon, carIconStyle: t.car_icon_style, members,
    // En un evento, la pista es la del organizador (igual para todos los equipos) y no hay pistas propias.
    event: ev ? eventSummary(ev) : null,
    track: ev ? ev.track : t.track,
    tracks: ev ? [] : tracks,
  };
}
const session = async (u, withToken) => ({
  ...(withToken && { token: sign(u) }),
  user: publicUser(u),
  team: u.team_id ? await teamPayload(u.team_id) : null,
});

// Los códigos de equipo y de evento comparten espacio: un mismo campo «código» sirve para los dos.
async function uniqueCode() {
  for (;;) {
    const c = randomCode();
    if (!(await one('select 1 from teams where invite_code = $1 union all select 1 from events where invite_code = $1', [c]))) return c;
  }
}

const isOrganizer = (u) => u.role === 'organizer' || u.role === 'admin';
// Evento del organizador (o cualquiera, para el admin); si no es suyo, como si no existiera.
async function ownEvent(user, id) {
  const e = await one(`select ${EVENT_COLS} from events where id = $1`, [id]);
  if (!e || (user.role !== 'admin' && e.organizer_id !== user.id)) fail(404, 'Ese evento no existe.');
  return e;
}
async function eventPayload(e) {
  const teams = await q(`select t.id, t.name, t.dorsal, t.invite_code,
      coalesce(json_agg(json_build_object('id', u.id, 'name', u.name) order by u.created_at) filter (where u.id is not null), '[]') as members
    from teams t left join users u on u.team_id = t.id where t.event_id = $1 group by t.id order by t.created_at`, [e.id]);
  return { ...eventSummary(e), inviteCode: e.invite_code, track: e.track, organizerId: e.organizer_id,
    teams: teams.map((t) => ({ id: t.id, name: t.name, dorsal: t.dorsal, inviteCode: t.invite_code, members: t.members })) };
}
const eventFields = (body) => {
  const set = {};
  if ('name' in body) set.name = str(body.name, 'Nombre del evento', { max: 80 });
  if ('place' in body) set.place = str(body.place, 'Lugar', { min: 0, max: 80 });
  if ('startsOn' in body) {
    if (body.startsOn != null && body.startsOn !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(body.startsOn)) fail(400, 'Fecha no válida.');
    set.starts_on = body.startsOn || null;
  }
  if ('closed' in body) set.closed = !!body.closed;
  if ('track' in body) { const geo = trackGeometry(body.track); set.track = Object.keys(geo).length ? geo : null; }
  return set;
};
// Cambios en la pista del evento (o el evento borrado): cada equipo recarga la suya y reinicia el cronometraje.
const eventTeamsChanged = async (eventId) => {
  for (const t of await q('select id from teams where event_id = $1', [eventId])) await teamChanged(t.id);
};

// Sale del equipo actual. Si era el capitán, pasa la capitanía al miembro más antiguo; si no queda nadie,
// el equipo y sus estadísticas se eliminan.
async function leaveTeam(u) {
  if (!u.team_id) return;
  const teamId = u.team_id;
  await q('update users set team_id = null where id = $1', [u.id]);
  const t = await one('select owner_id from teams where id = $1', [teamId]);
  if (t?.owner_id === u.id) {
    const next = await one('select id from users where team_id = $1 order by created_at limit 1', [teamId]);
    if (next) await q('update teams set owner_id = $1 where id = $2', [next.id, teamId]);
    else await q('delete from teams where id = $1', [teamId]);
  }
  await kick(u.id);
  await teamChanged(teamId);
}

async function joinTeam(u, teamId) {
  if (u.team_id === teamId) return;
  await leaveTeam(u);
  await q('update users set team_id = $1 where id = $2', [teamId, u.id]);
  await teamChanged(teamId);
}

// Geometría de una pista validada: trazado, meta y cortes de tramo (lo demás, como id y nombre, se descarta).
function trackGeometry(t) {
  const { line, path, sectors } = t ?? {};
  const pts = (a, min, max) => Array.isArray(a) && a.length >= min && a.length <= max && a.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNum));
  if (line != null && !pts(line, 2, 2)) fail(400, 'La línea de meta necesita dos puntos.');
  if (path != null && !pts(path, 3, 2000)) fail(400, 'El trazado necesita entre 3 y 2000 puntos.');
  if (sectors != null && !(Array.isArray(sectors) && sectors.length <= 20 && sectors.every((s) => pts(s, 2, 2)))) fail(400, 'Hasta 20 tramos, cada corte con dos puntos.');
  return { ...(line && { line }), ...(path && { path }), ...(sectors?.length && { sectors }) };
}
async function setActiveTrack(teamId, track) {
  await q('update teams set track = $1 where id = $2', [track, teamId]);
  await teamChanged(teamId);
  return teamPayload(teamId);
}

const reload = (id) => one('select * from users where id = $1', [id]);
const isOwner = (u, team) => u.role === 'admin' || team.owner_id === u.id;

// ── Rutas: [método, ruta, nivel de acceso, manejador] ──
const routes = [
  ['POST', '/api/register', 'none', async ({ body }) => {
    const e = email(body.email);
    if (await one('select 1 from users where email = $1', [e])) fail(409, 'Ya existe una cuenta con ese email.');
    const u = await one('insert into users (email, name, pass, role) values ($1, $2, $3, $4) returning *',
      [e, str(body.name, 'Nombre', { max: 60 }), await hashPassword(password(body.password)), e === ADMIN_EMAIL ? 'admin' : 'pilot']);
    return session(u, true);
  }],
  ['POST', '/api/login', 'none', async ({ body }) => {
    let u = await one('select * from users where email = $1', [String(body.email ?? '').trim().toLowerCase()]);
    if (!u || !(await checkPassword(String(body.password ?? ''), u.pass))) fail(401, 'Email o contraseña incorrectos.');
    if (u.email === ADMIN_EMAIL && u.role !== 'admin') u = await one("update users set role = 'admin' where id = $1 returning *", [u.id]);
    return session(u, true);
  }],
  ['GET', '/api/me', 'user', ({ user }) => session(user)],
  ['POST', '/api/password', 'user', async ({ user, body }) => {
    if (!user.must_reset && !(await checkPassword(String(body.current ?? ''), user.pass))) fail(400, 'La contraseña actual no es correcta.');
    const u = await one('update users set pass = $1, must_reset = false where id = $2 returning *', [await hashPassword(password(body.next)), user.id]);
    await kick(u.id); // las demás sesiones con la contraseña antigua quedan fuera
    return session(u, true);
  }],

  // Equipos
  // Con eventCode, el equipo se inscribe en ese evento; sin él, es un equipo de entrenamiento.
  ['POST', '/api/teams', 'user', async ({ user, body }) => {
    let eventId = null;
    if (body.eventCode) {
      const e = await one('select id, closed from events where invite_code = $1', [String(body.eventCode).trim().toUpperCase()]);
      if (!e) fail(404, 'Ese código de evento no existe.');
      if (e.closed) fail(409, 'Las inscripciones de este evento están cerradas.');
      eventId = e.id;
    }
    // En un evento, el siguiente dorsal libre (para no tener varios «#1»); el equipo puede cambiarlo después.
    const dorsal = eventId
      ? String((await one(`select coalesce(max(nullif(regexp_replace(dorsal, '[^0-9]', '', 'g'), '')::int), 0) + 1 as n from teams where event_id = $1`, [eventId])).n)
      : '1';
    const t = await one('insert into teams (name, invite_code, owner_id, limits, event_id, dorsal) values ($1, $2, $3, $4, $5, $6) returning id',
      [str(body.name, 'Nombre del equipo', { max: 60 }), await uniqueCode(), user.id, LIMITS, eventId, dorsal]);
    await joinTeam(user, t.id);
    return session(await reload(user.id));
  }],
  // Qué es un código: la invitación de un equipo (para unirse) o la de un evento (para inscribir un equipo).
  ['GET', /^\/api\/code\/([A-Za-z0-9]+)$/, 'user', async ({ params }) => {
    const code = params[0].toUpperCase();
    const t = await one('select t.name, e.name as event from teams t left join events e on e.id = t.event_id where t.invite_code = $1', [code]);
    if (t) return { kind: 'team', team: { name: t.name, event: t.event } };
    const e = await one(`select ${EVENT_COLS} from events where invite_code = $1`, [code]);
    if (!e) fail(404, 'Ese código no existe. Pide uno nuevo al equipo o al organizador.');
    const teams = await q('select t.name, t.dorsal, (select count(*)::int from users u where u.team_id = t.id) as members from teams t where t.event_id = $1 order by t.created_at', [e.id]);
    return { kind: 'event', event: { ...eventSummary(e), teams } };
  }],
  ['POST', '/api/teams/join', 'user', async ({ user, body }) => {
    const t = await one('select id from teams where invite_code = $1', [String(body.code ?? '').trim().toUpperCase()]);
    if (!t) fail(404, 'Ese código de invitación no existe. Pide al equipo uno nuevo.');
    await joinTeam(user, t.id);
    return session(await reload(user.id));
  }],
  ['POST', '/api/team/leave', 'team', async ({ user }) => { await leaveTeam(user); return session(await reload(user.id)); }],
  ['GET', '/api/team', 'team', ({ team }) => teamPayload(team.id)],
  ['PATCH', '/api/team', 'team', async ({ user, team, body }) => {
    const set = {};
    if ('name' in body) { if (!isOwner(user, team)) fail(403, 'Solo el capitán puede renombrar el equipo.'); set.name = str(body.name, 'Nombre del equipo', { max: 60 }); }
    if ('dorsal' in body) set.dorsal = str(body.dorsal, 'Dorsal', { max: 6 });
    if ('carIcon' in body) {
      // Solo una imagen en base64 (el cliente la reduce a 96 px): nada que pueda escapar del src del marcador.
      const v = body.carIcon;
      if (v != null && !(typeof v === 'string' && v.length <= 80_000 && /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(v))) fail(400, 'La imagen no es válida o es demasiado grande.');
      set.car_icon = v ?? null;
    }
    if ('carIconStyle' in body) {
      if (!['round', 'sprite'].includes(body.carIconStyle)) fail(400, 'Estilo de icono no válido.');
      set.car_icon_style = body.carIconStyle;
    }
    if ('phone' in body) set.phone =str(body.phone, 'Teléfono', { min: 0, max: 30 });
    if ('limits' in body) {
      const l = { ...LIMITS };
      for (const k of Object.keys(LIMITS)) if (isNum(body.limits?.[k])) l[k] = body.limits[k];
      const errs = Object.values(limitErrors(l));
      if (errs.length) fail(400, errs[0]);
      set.limits = l;
    }
    if ('track' in body) {
      if (team.event_id) fail(403, 'En un evento, la pista la define el organizador.');
      const geo = trackGeometry(body.track);
      // Editar una pista guardada la guarda también: la próxima vez que se elija sale con los cambios.
      const saved = isNum(body.track?.id) && await one('update tracks set track = $1 where id = $2 and team_id = $3 returning id, name', [geo, body.track.id, team.id]);
      set.track = saved ? { ...geo, id: saved.id, name: saved.name } : Object.keys(geo).length ? geo : null;
    }
    const keys = Object.keys(set);
    if (keys.length) {
      await q(`update teams set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`, [team.id, ...keys.map((k) => set[k])]);
      await teamChanged(team.id);
    }
    return teamPayload(team.id);
  }],

  // Pistas guardadas: la elegida se copia como pista activa del equipo (la que se cronometra).
  ['POST', '/api/tracks', 'team', async ({ team, body }) => {
    if (team.event_id) fail(403, 'En un evento, la pista la define el organizador.');
    const geo = trackGeometry(team.track);
    if (!Object.keys(geo).length) fail(400, 'Dibuja antes el trazado, la meta o los tramos de la pista.');
    const t = await one('insert into tracks (team_id, name, track) values ($1, $2, $3) returning id, name', [team.id, str(body.name, 'Nombre de la pista', { max: 60 }), geo]);
    return setActiveTrack(team.id, { ...geo, id: t.id, name: t.name });
  }],
  ['POST', /^\/api\/tracks\/(\d+)\/apply$/, 'team', async ({ team, params }) => {
    const t = await one('select id, name, track from tracks where id = $1 and team_id = $2', [Number(params[0]), team.id]);
    if (!t) fail(404, 'Esa pista ya no existe.');
    return setActiveTrack(team.id, { ...t.track, id: t.id, name: t.name });
  }],
  ['DELETE', /^\/api\/tracks\/(\d+)$/, 'team', async ({ team, params }) => {
    const id = Number(params[0]);
    await q('delete from tracks where id = $1 and team_id = $2', [id, team.id]);
    // Si era la activa, su dibujo sigue en el mapa como pista sin guardar.
    if (team.track?.id === id) return setActiveTrack(team.id, Object.keys(trackGeometry(team.track)).length ? trackGeometry(team.track) : null);
    return teamPayload(team.id);
  }],
  ['POST', '/api/team/invite', 'team', async ({ user, team }) => {
    if (!isOwner(user, team)) fail(403, 'Solo el capitán puede renovar la invitación.');
    await q('update teams set invite_code = $1 where id = $2', [await uniqueCode(), team.id]);
    return teamPayload(team.id);
  }],
  ['DELETE', /^\/api\/team\/members\/(\d+)$/, 'team', async ({ user, team, params }) => {
    if (!isOwner(user, team)) fail(403, 'Solo el capitán puede sacar a alguien del equipo.');
    const id = Number(params[0]);
    if (id === user.id) fail(400, 'Para salir tú, usa «Salir del equipo».');
    await q('update users set team_id = null where id = $1 and team_id = $2', [id, team.id]);
    await kick(id);
    await teamChanged(team.id);
    return teamPayload(team.id);
  }],

  // Estadísticas desde una fecha (el cliente manda el inicio de "hoy" en su zona horaria).
  ['GET', '/api/stats', 'team', async ({ team, url }) => {
    const since = new Date(url.searchParams.get('since') || 0);
    if (Number.isNaN(since.getTime())) fail(400, 'Fecha no válida.');
    const args = [team.id, since];
    const [laps, metrics, drivers] = await Promise.all([
      q(`select l.id, l.started_at, l.ms, l.avg_temp, l.max_temp, l.avg_rpm, l.max_rpm, l.max_speed, l.min_volt, l.sectors, l.track_id, l.driver_id, u.name as driver
         from laps l left join users u on u.id = l.driver_id where l.team_id = $1 and l.started_at >= $2 order by l.started_at`, args),
      one(`select count(*)::int as samples,
             avg(coolant)::float8 as avg_temp, max(coolant)::float8 as max_temp,
             avg(voltage)::float8 as avg_volt, min(voltage)::float8 as min_volt,
             avg(rpm)::float8 as avg_rpm, max(rpm)::float8 as max_rpm,
             avg(speed)::float8 as avg_speed, max(speed)::float8 as max_speed, avg(throttle)::float8 as avg_throttle
           from samples where team_id = $1 and ts >= $2`, args),
      q(`select u.id, u.name, count(*)::int as laps, min(l.ms)::int as best, avg(l.ms)::float8 as avg, avg(l.avg_temp)::float8 as avg_temp
         from laps l join users u on u.id = l.driver_id where l.team_id = $1 and l.started_at >= $2 group by u.id, u.name order by best`, args),
    ]);
    return { laps, metrics, drivers };
  }],

  // Perfil del piloto: sus vueltas y su telemetría al volante, de cualquier equipo (también de uno ya eliminado).
  ['GET', '/api/me/stats', 'user', async ({ user, url }) => {
    const since = new Date(url.searchParams.get('since') || 0);
    if (Number.isNaN(since.getTime())) fail(400, 'Fecha no válida.');
    const args = [user.id, since];
    const [laps, metrics] = await Promise.all([
      q(`select l.id, l.started_at, l.ms, l.avg_temp, l.max_temp, l.max_rpm, l.max_speed, l.min_volt, l.sectors, l.track_id,
           l.event_id, e.name as event, t.name as team, tr.name as track
         from laps l left join teams t on t.id = l.team_id left join tracks tr on tr.id = l.track_id left join events e on e.id = l.event_id
         where l.driver_id = $1 and l.started_at >= $2 order by l.started_at`, args),
      // Muestras a 1 Hz: su número son los segundos al volante, y la velocidad integrada, los km.
      one(`select count(*)::int as seconds, coalesce(sum(speed), 0)::float8 / 3600 as km,
             avg(coolant)::float8 as avg_temp, max(coolant)::float8 as max_temp, max(rpm)::float8 as max_rpm,
             avg(speed)::float8 as avg_speed, max(speed)::float8 as max_speed, avg(throttle)::float8 as avg_throttle
           from samples where driver_id = $1 and ts >= $2`, args),
    ]);
    return { laps, metrics };
  }],

  // Eventos (organizadores; el admin ve y gestiona todos).
  ['GET', '/api/events', 'organizer', ({ user }) => q(`select e.id, e.name, to_char(e.starts_on, 'YYYY-MM-DD') as "startsOn", e.place, e.closed,
      (select count(*)::int from teams t where t.event_id = e.id) as teams
    from events e where $1 or e.organizer_id = $2 order by e.starts_on desc nulls last, e.created_at desc`, [user.role === 'admin', user.id])],
  ['POST', '/api/events', 'organizer', async ({ user, body }) => {
    const f = eventFields({ name: body.name, place: body.place ?? '', startsOn: body.startsOn });
    const e = await one('insert into events (name, place, starts_on, organizer_id, invite_code) values ($1, $2, $3, $4, $5) returning id',
      [f.name, f.place, f.starts_on, user.id, await uniqueCode()]);
    return eventPayload(await ownEvent(user, e.id));
  }],
  ['GET', /^\/api\/events\/(\d+)$/, 'organizer', async ({ user, params }) => eventPayload(await ownEvent(user, Number(params[0])))],
  ['PATCH', /^\/api\/events\/(\d+)$/, 'organizer', async ({ user, params, body }) => {
    const e = await ownEvent(user, Number(params[0]));
    const set = eventFields(body);
    const keys = Object.keys(set);
    if (keys.length) await q(`update events set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`, [e.id, ...keys.map((k) => set[k])]);
    if (keys.length) await eventTeamsChanged(e.id); // los equipos ven nombre, fecha, estado y pista del evento
    return eventPayload(await ownEvent(user, e.id));
  }],
  ['POST', /^\/api\/events\/(\d+)\/invite$/, 'organizer', async ({ user, params }) => {
    const e = await ownEvent(user, Number(params[0]));
    await q('update events set invite_code = $1 where id = $2', [await uniqueCode(), e.id]);
    return eventPayload(await ownEvent(user, e.id));
  }],
  // Borrar el evento: sus equipos siguen, como equipos de entrenamiento; las vueltas conservan el evento en el historial.
  ['DELETE', /^\/api\/events\/(\d+)$/, 'organizer', async ({ user, params }) => {
    const e = await ownEvent(user, Number(params[0]));
    const teams = await q('select id from teams where event_id = $1', [e.id]);
    await q('delete from events where id = $1', [e.id]);
    for (const t of teams) await teamChanged(t.id);
    return { ok: true };
  }],
  // Clasificación: por equipo, vueltas, mejor, última y cuándo cruzó la meta por última vez (desempate en resistencia).
  ['GET', /^\/api\/events\/(\d+)\/standings$/, 'organizer', async ({ user, params }) => {
    const e = await ownEvent(user, Number(params[0]));
    return q(`select t.id, t.name, t.dorsal, count(l.id)::int as laps, min(l.ms)::int as best,
        (array_agg(l.ms order by l.started_at desc))[1] as last,
        max(l.started_at + l.ms * interval '1 millisecond') as last_at,
        (select u.name from laps b join users u on u.id = b.driver_id where b.team_id = t.id and b.event_id = $1 order by b.ms limit 1) as best_driver
      from teams t left join laps l on l.team_id = t.id and l.event_id = $1
      where t.event_id = $1 group by t.id order by t.created_at`, [e.id]);
  }],

  // Administración de la plataforma
  ['GET', '/api/admin/users', 'admin', () => q(`select u.id, u.email, u.name, u.role, u.must_reset, u.created_at, t.name as team
    from users u left join teams t on t.id = u.team_id order by u.created_at desc`)],
  ['GET', '/api/admin/teams', 'admin', () => q(`select t.id, t.name, t.dorsal, t.invite_code, t.created_at, o.name as owner,
    (select count(*)::int from users m where m.team_id = t.id) as members,
    (select count(*)::int from laps l where l.team_id = t.id) as laps
    from teams t left join users o on o.id = t.owner_id order by t.created_at desc`)],
  ['PATCH', /^\/api\/admin\/users\/(\d+)$/, 'admin', async ({ user, params, body }) => {
    const id = Number(params[0]);
    if (id === user.id) fail(400, 'No puedes cambiar tu propio rol.');
    if (!['admin', 'organizer', 'pilot'].includes(body.role)) fail(400, 'Rol no válido.');
    await q('update users set role = $1 where id = $2', [body.role, id]);
    return { ok: true };
  }],
  ['POST', /^\/api\/admin\/users\/(\d+)\/reset$/, 'admin', async ({ params }) => {
    const temp = tempPassword();
    const u = await one('update users set pass = $1, must_reset = true where id = $2 returning id', [await hashPassword(temp), Number(params[0])]);
    if (!u) fail(404, 'Ese usuario no existe.');
    await kick(u.id);
    return { tempPassword: temp };
  }],
  ['DELETE', /^\/api\/admin\/users\/(\d+)$/, 'admin', async ({ user, params }) => {
    const id = Number(params[0]);
    if (id === user.id) fail(400, 'No puedes eliminar tu propia cuenta.');
    const u = await reload(id);
    if (!u) fail(404, 'Ese usuario no existe.');
    await leaveTeam(u);
    await q('delete from users where id = $1', [id]);
    return { ok: true };
  }],
  ['DELETE', /^\/api\/admin\/teams\/(\d+)$/, 'admin', async ({ params }) => {
    const id = Number(params[0]);
    const members = await q('select id from users where team_id = $1', [id]);
    await q('delete from teams where id = $1', [id]);
    for (const m of members) await kick(m.id);
    await teamChanged(id);
    return { ok: true };
  }],
];

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 100_000) fail(413, 'Petición demasiado grande.');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks)); } catch { fail(400, 'JSON no válido.'); }
}

// Devuelve true si la petición era de la API.
export async function handleApi(req, res) {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return false;
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  try {
    let params;
    const route = routes.find(([m, p]) => m === req.method && (typeof p === 'string' ? p === url.pathname : (params = url.pathname.match(p)?.slice(1))));
    if (!route) fail(404, 'Ruta no encontrada.');
    const [, , access, handler] = route;
    const ctx = { req, url, params };
    if (access !== 'none') {
      ctx.user = await userFromToken(req.headers.authorization?.replace(/^Bearer /, ''));
      if (!ctx.user) fail(401, 'Tu sesión ha caducado. Vuelve a entrar.');
      if (access === 'admin' && ctx.user.role !== 'admin') fail(403, 'Solo para administradores.');
      if (access === 'organizer' && !isOrganizer(ctx.user)) fail(403, 'Solo para organizadores de eventos.');
      if (access === 'team') {
        ctx.team = ctx.user.team_id && await one('select * from teams where id = $1', [ctx.user.team_id]);
        if (!ctx.team) fail(409, 'No perteneces a ningún equipo.');
      }
    }
    ctx.body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : {};
    send(200, await handler(ctx));
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    send(e.status ?? 500, { error: e instanceof HttpError ? e.message : 'Error interno del servidor.' });
  }
  return true;
}
