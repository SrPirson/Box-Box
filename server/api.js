// API REST: cuentas, equipos con invitación, administración y estadísticas.
import { q, one } from './db.js';
import { hashPassword, checkPassword, sign, verify, randomCode, tempPassword } from './auth.js';
import { teamChanged, kick, teamNotice, logEvent, liveStats, teamPenalty, pitsOf } from './live.js';
import { LIMITS, limitErrors } from '../src/lib/limits.js';
import { rank, RACE_FORMATS } from '../src/lib/events.js';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };

export async function userFromToken(token) {
  const p = verify(token);
  if (!p) return null;
  const u = await one('select * from users where id = $1', [p.uid]);
  if (!u || u.pass.slice(0, 8) !== p.pv) return null;
  // Último acceso, como mucho una escritura cada 5 min; viendo la app como otra persona no cuenta.
  if (!p.imp && (!u.last_seen_at || Date.now() - u.last_seen_at > 300_000)) q('update users set last_seen_at = now() where id = $1', [u.id]).catch(() => {});
  return p.imp ? { ...u, imp: p.imp, impUntil: p.exp } : u;
}

// Auditoría: actor (quien lo hace), acción, cuenta afectada (subject) y detalles legibles (nombres, motivo…).
const audit = (actor, action, subject = null, data = {}) => q('insert into audit_log (actor_id, actor, action, subject, data) values ($1, $2, $3, $4, $5)',
  [actor?.id ?? null, actor?.name ?? null, action, subject, data]).catch((e) => console.error('audit', e.message));

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
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, mustReset: u.must_reset, teamId: u.team_id,
  ...(u.imp && { impersonatedUntil: u.impUntil }) });
// Columnas de un evento (la fecha como texto: un date de Postgres llega como Date a medianoche local y se desplaza).
const EVENT_COLS = `id, name, to_char(starts_on, 'YYYY-MM-DD') as starts_on, place, organizer_id, invite_code, track, closed, private, session, draft, max_teams, public_code, race_format, race_target,
  (extract(epoch from session_started_at) * 1000)::float8 as session_started_at`;
const eventSummary = (e) => ({ id: e.id, name: e.name, startsOn: e.starts_on, place: e.place, closed: e.closed, private: e.private, session: e.session,
  draft: e.draft, maxTeams: e.max_teams, sessionStartedAt: e.session_started_at, raceFormat: e.race_format, raceTarget: e.race_target });
// ¿Se puede inscribir un equipo en este evento? (e: con id, closed, draft y max_teams)
const ENROLL_COLS = 'id, closed, draft, max_teams';
async function checkEnroll(e) {
  if (e?.draft) fail(409, 'Este evento aún no está publicado.');
  if (e?.closed) fail(409, 'Las inscripciones de este evento están cerradas.');
  if (e?.max_teams && (await one('select count(*)::int as n from teams where event_id = $1', [e.id])).n >= e.max_teams) fail(409, 'El evento está completo: no quedan plazas.');
}
const KINDS = ['free', 'practice', 'race'];
// Filtro opcional por tipo de vuelta (?kind=free|practice|race); null = todas.
const kindParam = (url) => { const k = url.searchParams.get('kind'); return KINDS.includes(k) ? k : null; };

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
    limits: { ...LIMITS, ...t.limits }, carIcon: t.car_icon, carIconStyle: t.car_icon_style, obd: t.obd, members,
    // Participando en un evento, la pista es la del organizador (igual para todos) y no hay pistas propias;
    // inscrito sin participar, el equipo entrena con las suyas.
    event: ev ? { ...eventSummary(ev), liveCode: ev.public_code } : null,
    // Sanciones de la sesión en curso (participando): el contador de vueltas de BOX las descuenta.
    penalties: ev && t.racing ? await q(`select id, laps, retired, reason, (extract(epoch from created_at) * 1000)::float8 as ts, seen_at is not null as seen
      from penalties where event_id = $1 and team_id = $2 and session = $3 order by id`, [ev.id, t.id, ev.session]) : [],
    racing: !!ev && t.racing,
    track: ev && t.racing ? ev.track : t.track,
    tracks,
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
  const teams = await q(`select t.id, t.name, t.dorsal, t.invite_code, t.car_icon, t.car_icon_style, t.racing,
      coalesce(json_agg(json_build_object('id', u.id, 'name', u.name) order by u.created_at) filter (where u.id is not null), '[]') as members
    from teams t left join users u on u.team_id = t.id where t.event_id = $1 group by t.id order by t.created_at`, [e.id]);
  const org = e.organizer_id && await one('select name from users where id = $1', [e.organizer_id]);
  return { ...eventSummary(e), inviteCode: e.invite_code, publicCode: e.public_code, track: e.track, organizerId: e.organizer_id, organizer: org?.name ?? null,
    teams: teams.map((t) => ({ id: t.id, name: t.name, dorsal: t.dorsal, inviteCode: t.invite_code, members: t.members, carIcon: t.car_icon, carIconStyle: t.car_icon_style, racing: t.racing })) };
}
// Clasificación de una sesión por equipo, ya ordenada según el formato (rank): vueltas, mejor, última, vueltas de
// sanción (pen), retirado y cuándo cruzó la meta (desempate). A N vueltas, el cruce de la vuelta N que cuenta
// (sin las que dé de más), con el piloto de la mejor vuelta. sort: 'best' o 'laps' para forzar el orden.
async function standingsOf(e, s, sort) {
  const f = sort ?? (s === 'practice' ? 'best' : e.race_format);
  const format = f === 'best' ? 'best' : s === 'race' && e.race_format === 'laps' ? 'laps' : 'endurance';
  const target = format === 'laps' ? e.race_target : null;
  const rows = await q(`select t.id, t.name, t.dorsal, t.racing, count(l.id)::int as laps, min(l.ms)::int as best,
      (array_agg(l.ms order by l.started_at desc))[1] as last, coalesce(p.laps, 0)::int as pen, coalesce(p.retired, false) as retired,
      (array_agg(l.started_at + l.ms * interval '1 millisecond' order by l.started_at))[least(count(l.id), $3::int + coalesce(p.laps, 0))] as last_at,
      (select u.name from laps b join users u on u.id = b.driver_id where b.team_id = t.id and b.event_id = $1 and b.kind = $2 order by b.ms limit 1) as best_driver
    from teams t left join laps l on l.team_id = t.id and l.event_id = $1 and l.kind = $2
    left join lateral (select sum(laps) as laps, bool_or(retired) as retired from penalties where team_id = t.id and event_id = $1 and session = $2) p on true
    where t.event_id = $1 group by t.id, p.laps, p.retired order by t.created_at`, [e.id, s, target]);
  return rank(rows, format, target);
}
// Sanciones de un evento (o de una sesión), lo más reciente primero.
const penaltiesOf = (eventId, session = null) => q(`select p.id, p.team_id as "teamId", t.name as team, t.dorsal, p.session, p.laps, p.retired, p.reason, p.by,
    (extract(epoch from p.created_at) * 1000)::float8 as ts, p.seen_at is not null as seen
  from penalties p join teams t on t.id = p.team_id where p.event_id = $1 and ($2::text is null or p.session = $2) order by p.id desc`, [eventId, session]);
// Resultados publicados de un evento (entrenamiento primero) y el código de su enlace público.
async function eventResults(eventId) {
  const [results, e] = await Promise.all([
    q(`select session, published_at as "publishedAt", published_by as "publishedBy", sort, rows from event_results where event_id = $1 order by session = 'race', session`, [eventId]),
    one('select public_code from events where id = $1', [eventId]),
  ]);
  return { publicCode: e?.public_code ?? null, results };
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
  if ('private' in body) set.private = !!body.private;
  if ('session' in body) {
    if (!['practice', 'race'].includes(body.session)) fail(400, 'Sesión no válida.');
    set.session = body.session;
  }
  if ('track' in body) { const geo = trackGeometry(body.track); set.track = Object.keys(geo).length ? geo : null; }
  if ('raceFormat' in body) {
    if (!RACE_FORMATS[body.raceFormat]) fail(400, 'Formato de carrera no válido.');
    set.race_format = body.raceFormat;
  }
  if ('raceTarget' in body) {
    const n = body.raceTarget === '' || body.raceTarget == null ? null : Number(body.raceTarget);
    if (n != null && !(Number.isInteger(n) && n >= 1 && n <= 10000)) fail(400, 'La duración tiene que ser un número entero (minutos o vueltas), o vacío.');
    set.race_target = n;
  }
  if ('maxTeams' in body) {
    const n = body.maxTeams === '' || body.maxTeams == null ? null : Number(body.maxTeams);
    if (n != null && !(Number.isInteger(n) && n >= 1 && n <= 500)) fail(400, 'El cupo tiene que ser un número de equipos entre 1 y 500, o vacío para no tener límite.');
    set.max_teams = n;
  }
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
  const { line, path, sectors, pitIn, pitOut } = t ?? {};
  const pts = (a, min, max) => Array.isArray(a) && a.length >= min && a.length <= max && a.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNum));
  if (line != null && !pts(line, 2, 2)) fail(400, 'La línea de meta necesita dos puntos.');
  if (path != null && !pts(path, 3, 2000)) fail(400, 'El trazado necesita entre 3 y 2000 puntos.');
  if (sectors != null && !(Array.isArray(sectors) && sectors.length <= 20 && sectors.every((s) => pts(s, 2, 2)))) fail(400, 'Hasta 20 tramos, cada corte con dos puntos.');
  if ((pitIn != null && !pts(pitIn, 2, 2)) || (pitOut != null && !pts(pitOut, 2, 2))) fail(400, 'La entrada y la salida de boxes necesitan dos puntos cada una.');
  return { ...(line && { line }), ...(path && { path }), ...(sectors?.length && { sectors }), ...(pitIn && pitOut && { pitIn, pitOut }) };
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
  // Perfil: el nombre se cambia sin más; el email (con el que se entra) pide la contraseña actual.
  ['PATCH', '/api/me', 'user', async ({ user, body }) => {
    const set = {};
    if ('name' in body) set.name = str(body.name, 'Nombre', { max: 60 });
    if ('email' in body) {
      const e = email(body.email);
      if (e !== user.email) {
        if (!(await checkPassword(String(body.password ?? ''), user.pass))) fail(400, 'La contraseña no es correcta.');
        if (await one('select 1 from users where email = $1', [e])) fail(409, 'Ya existe una cuenta con ese email.');
        set.email = e;
      }
    }
    const keys = Object.keys(set);
    if (keys.length) await q(`update users set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`, [user.id, ...keys.map((k) => set[k])]);
    if (user.team_id) await teamChanged(user.team_id); // el equipo ve el nombre nuevo
    return session(await reload(user.id));
  }],
  // Eliminar la cuenta: sale de su equipo (pasando la capitanía) y sus vueltas quedan sin piloto.
  ['DELETE', '/api/me', 'user', async ({ user, body }) => {
    if (!(await checkPassword(String(body.password ?? ''), user.pass))) fail(400, 'La contraseña no es correcta.');
    if (user.role === 'admin' && (await one("select count(*)::int as n from users where role = 'admin'")).n === 1) fail(409, 'Eres el único administrador: nombra antes a otro.');
    await leaveTeam(user);
    await q('delete from users where id = $1', [user.id]);
    return { ok: true };
  }],

  // Equipos
  // Con eventCode, el equipo se inscribe en ese evento; sin él, es un equipo de entrenamiento.
  // Con eventId (desde la lista de eventos), solo si es público.
  ['POST', '/api/teams', 'user', async ({ user, body }) => {
    let eventId = null;
    if (body.eventCode || body.eventId) {
      const e = body.eventCode
        ? await one(`select ${ENROLL_COLS} from events where invite_code = $1`, [String(body.eventCode).trim().toUpperCase()])
        : await one(`select ${ENROLL_COLS} from events where id = $1 and not private`, [Number(body.eventId)]);
      if (!e) fail(404, body.eventCode ? 'Ese código de evento no existe.' : 'Ese evento no existe o es privado.');
      await checkEnroll(e);
      eventId = e.id;
    }
    // En un evento, el siguiente dorsal libre (para no tener varios «#1»); el equipo puede cambiarlo después.
    const dorsal = eventId
      ? String((await one(`select coalesce(max(nullif(regexp_replace(dorsal, '[^0-9]', '', 'g'), '')::int), 0) + 1 as n from teams where event_id = $1`, [eventId])).n)
      : '1';
    const t = await one('insert into teams (name, invite_code, owner_id, limits, event_id, dorsal, racing) values ($1, $2, $3, $4, $5, $6, false) returning id',
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
    if (e.draft) fail(409, 'Este evento aún no está publicado.');
    const teams = await q('select t.name, t.dorsal, (select count(*)::int from users u where u.team_id = t.id) as members from teams t where t.event_id = $1 order by t.created_at', [e.id]);
    return { kind: 'event', event: { ...eventSummary(e), teams } };
  }],
  ['POST', '/api/teams/join', 'user', async ({ user, body }) => {
    const t = await one('select id from teams where invite_code = $1', [String(body.code ?? '').trim().toUpperCase()]);
    if (!t) fail(404, 'Ese código de invitación no existe. Pide al equipo uno nuevo.');
    await joinTeam(user, t.id);
    return session(await reload(user.id));
  }],
  // El capitán inscribe a su equipo (con sus pilotos y su coche) en un evento público o con código, o lo saca
  // del evento (eventId null). Si su dorsal ya lo lleva otro equipo del evento, toma el siguiente libre.
  ['POST', '/api/team/enroll', 'team', async ({ user, team, body }) => {
    if (!isOwner(user, team)) fail(403, 'Solo el capitán puede inscribir al equipo en un evento.');
    let e = null;
    if (body.eventCode) e = await one(`select ${ENROLL_COLS} from events where invite_code = $1`, [String(body.eventCode).trim().toUpperCase()]);
    else if (body.eventId != null) e = await one(`select ${ENROLL_COLS} from events where id = $1 and not private`, [Number(body.eventId)]);
    if ((body.eventCode || body.eventId != null) && !e) fail(404, 'Ese evento no existe o es privado.');
    if (e && e.id !== team.event_id) await checkEnroll(e);
    let dorsal = team.dorsal;
    if (e && (await one('select 1 from teams where event_id = $1 and dorsal = $2 and id <> $3', [e.id, dorsal, team.id]))) {
      dorsal = String((await one(`select coalesce(max(nullif(regexp_replace(dorsal, '[^0-9]', '', 'g'), '')::int), 0) + 1 as n from teams where event_id = $1`, [e.id])).n);
    }
    // Inscrito, pero sin participar todavía: sigue entrenando con sus pistas hasta que lo active.
    await q('update teams set event_id = $1, dorsal = $2, racing = false where id = $3', [e?.id ?? null, dorsal, team.id]);
    await teamChanged(team.id);
    return teamPayload(team.id);
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
    if ('obd' in body) set.obd = body.obd === true;
    // Participar o no en el evento en el que está inscrito: cualquier miembro.
    if ('racing' in body) {
      if (!team.event_id) fail(400, 'El equipo no está inscrito en ningún evento.');
      set.racing = body.racing === true;
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
      if (team.event_id && team.racing) fail(403, 'En un evento, la pista la define el organizador.');
      const geo = trackGeometry(body.track);
      // Editar una pista guardada la guarda también: la próxima vez que se elija sale con los cambios.
      const saved = isNum(body.track?.id) && await one('update tracks set track = $1 where id = $2 and team_id = $3 returning id, name', [geo, body.track.id, team.id]);
      set.track = saved ? { ...geo, id: saved.id, name: saved.name } : Object.keys(geo).length ? geo : null;
    }
    const keys = Object.keys(set);
    if (keys.length) {
      await q(`update teams set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`, [team.id, ...keys.map((k) => set[k])]);
      await teamChanged(team.id);
      if ('racing' in set) teamNotice(team.id, `${set.racing ? 'Participando en el evento' : 'Fuera del evento: entrenamiento libre'} · ${user.name}`);
    }
    return teamPayload(team.id);
  }],

  // Pistas guardadas: la elegida se copia como pista activa del equipo (la que se cronometra).
  ['POST', '/api/tracks', 'team', async ({ team, body }) => {
    if (team.event_id && team.racing) fail(403, 'En un evento, la pista la define el organizador.');
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
    // ?track=<id>: solo las de una pista guardada del equipo (las libres; las de evento no tienen track_id).
    const track = Number(url.searchParams.get('track')) || null;
    const args = [team.id, since, kindParam(url), track];
    const [laps, metrics, drivers] = await Promise.all([
      q(`select l.id, l.started_at, l.ms, l.avg_temp, l.max_temp, l.avg_rpm, l.max_rpm, l.max_speed, l.min_volt, l.sectors, l.track_id, l.driver_id, l.kind,
           u.name as driver, tr.name as track, e.name as event
         from laps l left join users u on u.id = l.driver_id left join tracks tr on tr.id = l.track_id left join events e on e.id = l.event_id
         where l.team_id = $1 and l.started_at >= $2 and ($3::text is null or l.kind = $3) and ($4::int is null or l.track_id = $4) order by l.started_at`, args),
      one(`select count(*)::int as samples,
             avg(coolant)::float8 as avg_temp, max(coolant)::float8 as max_temp,
             avg(voltage)::float8 as avg_volt, min(voltage)::float8 as min_volt,
             avg(rpm)::float8 as avg_rpm, max(rpm)::float8 as max_rpm,
             avg(speed)::float8 as avg_speed, max(speed)::float8 as max_speed, avg(throttle)::float8 as avg_throttle
           from samples where team_id = $1 and ts >= $2 and ($3::text is null or kind = $3) and ($4::int is null or track_id = $4)`, args),
      q(`select u.id, u.name, count(*)::int as laps, min(l.ms)::int as best, avg(l.ms)::float8 as avg, avg(l.avg_temp)::float8 as avg_temp
         from laps l join users u on u.id = l.driver_id where l.team_id = $1 and l.started_at >= $2 and ($3::text is null or l.kind = $3) and ($4::int is null or l.track_id = $4)
         group by u.id, u.name order by best`, args),
    ]);
    return { laps, metrics, drivers };
  }],

  // Perfil del piloto: sus vueltas y su telemetría al volante, de cualquier equipo (también de uno ya eliminado).
  ['GET', '/api/me/stats', 'user', async ({ user, url }) => {
    const since = new Date(url.searchParams.get('since') || 0);
    if (Number.isNaN(since.getTime())) fail(400, 'Fecha no válida.');
    const args = [user.id, since, kindParam(url)];
    const [laps, metrics] = await Promise.all([
      q(`select l.id, l.started_at, l.ms, l.avg_temp, l.max_temp, l.max_rpm, l.max_speed, l.min_volt, l.sectors, l.track_id, l.kind,
           l.event_id, e.name as event, t.name as team, tr.name as track
         from laps l left join teams t on t.id = l.team_id left join tracks tr on tr.id = l.track_id left join events e on e.id = l.event_id
         where l.driver_id = $1 and l.started_at >= $2 and ($3::text is null or l.kind = $3) order by l.started_at`, args),
      // Muestras a 1 Hz: su número son los segundos al volante, y la velocidad integrada, los km.
      one(`select count(*)::int as seconds, coalesce(sum(speed), 0)::float8 / 3600 as km,
             avg(coolant)::float8 as avg_temp, max(coolant)::float8 as max_temp, max(rpm)::float8 as max_rpm,
             avg(speed)::float8 as avg_speed, max(speed)::float8 as max_speed, avg(throttle)::float8 as avg_throttle
           from samples where driver_id = $1 and ts >= $2 and ($3::text is null or kind = $3)`, args),
    ]);
    return { laps, metrics };
  }],

  // Eventos (organizadores; el admin ve y gestiona todos).
  // Lista del organizador (sus eventos) o del admin (todos, con su organizador).
  ['GET', '/api/events', 'organizer', ({ user, url }) => q(`select e.id, e.name, to_char(e.starts_on, 'YYYY-MM-DD') as "startsOn", e.place, e.closed, e.private, e.draft, e.max_teams as "maxTeams",
      (e.track->'line') is not null as "hasFinish", e.invite_code as "inviteCode",
      o.name as organizer, (select count(*)::int from teams t where t.event_id = e.id) as teams,
      (select count(*)::int from teams t where t.event_id = e.id and t.racing) as racing
    from events e left join users o on o.id = e.organizer_id
    where ($1 and $3) or e.organizer_id = $2 order by e.starts_on desc nulls last, e.created_at desc`,
  [user.role === 'admin', user.id, url.searchParams.get('all') === '1'])],
  // Para los pilotos: eventos públicos con inscripción abierta, próximos (por fecha) o pasados, con buscador.
  ['GET', '/api/events/public', 'user', ({ url }) => {
    const past = url.searchParams.get('past') === '1';
    return q(`select e.id, e.name, to_char(e.starts_on, 'YYYY-MM-DD') as "startsOn", e.place, e.closed, o.name as organizer,
        (select count(*)::int from teams t where t.event_id = e.id) as teams
      from events e left join users o on o.id = e.organizer_id
      where not e.private and not e.draft and ($1 = '' or e.name ilike '%' || $1 || '%' or e.place ilike '%' || $1 || '%')
        and ${past ? 'e.starts_on < current_date' : '(e.starts_on is null or e.starts_on >= current_date) and not e.closed'}
      order by e.starts_on ${past ? 'desc' : 'asc'} nulls last, e.created_at desc limit 100`, [String(url.searchParams.get('q') ?? '').trim().slice(0, 60)]);
  }],
  ['POST', '/api/events', 'organizer', async ({ user, body }) => {
    const f = eventFields({ name: body.name, place: body.place ?? '', startsOn: body.startsOn, raceFormat: body.raceFormat ?? 'endurance', raceTarget: body.raceTarget ?? null });
    const e = await one(`insert into events (name, place, starts_on, organizer_id, invite_code, draft, public_code, race_format, race_target)
      values ($1, $2, $3, $4, $5, true, $6, $7, $8) returning id`, [f.name, f.place, f.starts_on, user.id, await uniqueCode(), randomCode(10), f.race_format, f.race_target]);
    audit(user, 'event.create', null, { eventId: e.id, event: f.name });
    return eventPayload(await ownEvent(user, e.id));
  }],
  ['GET', /^\/api\/events\/(\d+)$/, 'organizer', async ({ user, params }) => eventPayload(await ownEvent(user, Number(params[0])))],
  ['PATCH', /^\/api\/events\/(\d+)$/, 'organizer', async ({ user, params, body }) => {
    const e = await ownEvent(user, Number(params[0]));
    const set = eventFields(body);
    // Cambiar el organizador: solo el admin, y a alguien con ese rol.
    if ('organizerId' in body) {
      if (user.role !== 'admin') fail(403, 'Solo el administrador puede cambiar el organizador.');
      const o = await one("select id from users where id = $1 and role in ('organizer', 'admin')", [Number(body.organizerId)]);
      if (!o) fail(400, 'Esa persona no es organizadora.');
      set.organizer_id = o.id;
      audit(user, 'event.organizer', o.id, { eventId: e.id, event: e.name });
    }
    // Publicar (no tiene vuelta atrás): hace falta la fecha y la meta, o no se cronometraría ninguna vuelta.
    if (body.draft === false && e.draft) {
      if (!('starts_on' in set ? set.starts_on : e.starts_on)) fail(400, 'Pon la fecha del evento antes de publicarlo.');
      if (!('track' in set ? set.track : e.track)?.line) fail(400, 'Marca la línea de meta antes de publicar: sin ella no se cronometra ninguna vuelta.');
      set.draft = false;
      audit(user, 'event.publish', null, { eventId: e.id, event: e.name });
    }
    // Cambiar de sesión (o empezarla de nuevo) pone en marcha su reloj y queda en el registro.
    const newSession = 'session' in set && set.session !== e.session;
    if (newSession || body.sessionStart === true) set.session_started_at = new Date();
    const keys = Object.keys(set);
    if (keys.length) await q(`update events set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`, [e.id, ...keys.map((k) => set[k])]);
    if (keys.length) await eventTeamsChanged(e.id); // los equipos ven nombre, fecha, estado y pista del evento
    if (set.session_started_at) await logEvent(e.id, 'session', { session: set.session ?? e.session, restart: !newSession, by: user.name });
    return eventPayload(await ownEvent(user, e.id));
  }],
  // Registro de dirección de carrera (lo más reciente primero).
  ['GET', /^\/api\/events\/(\d+)\/log$/, 'organizer', async ({ user, params }) => {
    const e = await ownEvent(user, Number(params[0]));
    return q('select id, ts, kind, data from event_log where event_id = $1 order by id desc limit 500', [e.id]);
  }],
  // Pistas que se pueden copiar a este evento: las guardadas del equipo del organizador y las de sus otros eventos.
  ['GET', /^\/api\/events\/(\d+)\/track-sources$/, 'organizer', async ({ user, params }) => {
    const e = await ownEvent(user, Number(params[0]));
    const [tracks, events] = await Promise.all([
      user.team_id ? q('select id, name, track from tracks where team_id = $1 order by name', [user.team_id]) : [],
      q(`select id, name, track from events where organizer_id = $1 and id <> $2 and track->'line' is not null order by created_at desc limit 50`, [e.organizer_id, e.id]),
    ]);
    return [...tracks.map((t) => ({ key: `t${t.id}`, label: `Pista guardada · ${t.name}`, track: t.track })),
      ...events.map((x) => ({ key: `e${x.id}`, label: `Evento · ${x.name}`, track: x.track }))];
  }],
  // Recordar a un equipo inscrito que active «Participar» (le llega al registro de su BOX).
  ['POST', /^\/api\/events\/(\d+)\/teams\/(\d+)\/remind$/, 'organizer', async ({ user, params }) => {
    const e = await ownEvent(user, Number(params[0]));
    const t = await one('select id from teams where id = $1 and event_id = $2', [Number(params[1]), e.id]);
    if (!t) fail(404, 'Ese equipo no está en el evento.');
    teamNotice(t.id, `La organización de «${e.name}» os recuerda que activéis «Participar» para correr el evento.`);
    return { ok: true };
  }],
  ['POST', /^\/api\/events\/(\d+)\/invite$/, 'organizer', async ({ user, params }) => {
    const e = await ownEvent(user, Number(params[0]));
    await q('update events set invite_code = $1 where id = $2', [await uniqueCode(), e.id]);
    return eventPayload(await ownEvent(user, e.id));
  }],
  // Gestión de inscritos. Echar a un equipo del evento: sigue existiendo, como equipo de entrenamiento.
  ['DELETE', /^\/api\/events\/(\d+)\/teams\/(\d+)$/, 'organizer', async ({ user, params }) => {
    const e = await ownEvent(user, Number(params[0]));
    const t = await one('update teams set event_id = null where id = $1 and event_id = $2 returning id', [Number(params[1]), e.id]);
    if (!t) fail(404, 'Ese equipo no está en el evento.');
    await teamChanged(t.id);
    return eventPayload(e);
  }],
  // Sacar a un piloto de su equipo (si era el capitán, la capitanía pasa al siguiente).
  ['DELETE', /^\/api\/events\/(\d+)\/teams\/(\d+)\/members\/(\d+)$/, 'organizer', async ({ user, params }) => {
    const e = await ownEvent(user, Number(params[0]));
    const u = await one('select u.* from users u join teams t on t.id = u.team_id where u.id = $1 and t.id = $2 and t.event_id = $3', [Number(params[2]), Number(params[1]), e.id]);
    if (!u) fail(404, 'Ese piloto no está en el equipo.');
    await leaveTeam(u);
    return eventPayload(e);
  }],
  // Meter a un piloto ya registrado (por su email) en un equipo del evento; sale del equipo en el que estuviera.
  ['POST', /^\/api\/events\/(\d+)\/teams\/(\d+)\/members$/, 'organizer', async ({ user, params, body }) => {
    const e = await ownEvent(user, Number(params[0]));
    const t = await one('select id from teams where id = $1 and event_id = $2', [Number(params[1]), e.id]);
    if (!t) fail(404, 'Ese equipo no está en el evento.');
    const u = await one('select * from users where email = $1', [email(body.email)]);
    if (!u) fail(404, 'No hay ninguna cuenta con ese email: tiene que registrarse antes.');
    await joinTeam(u, t.id);
    await kick(u.id); // sus conexiones abiertas se reconectan ya en el equipo nuevo
    return eventPayload(e);
  }],
  // Borrar el evento: sus equipos siguen, como equipos de entrenamiento; las vueltas conservan el evento en el historial.
  ['DELETE', /^\/api\/events\/(\d+)$/, 'organizer', async ({ user, params }) => {
    const e = await ownEvent(user, Number(params[0]));
    const teams = await q('select id from teams where event_id = $1', [e.id]);
    await q('delete from events where id = $1', [e.id]);
    audit(user, 'event.delete', null, { eventId: e.id, event: e.name, teams: teams.length });
    for (const t of teams) await teamChanged(t.id);
    return { ok: true };
  }],
  // Clasificación de una sesión (?session=practice|race; por defecto, la actual): por equipo, vueltas, mejor,
  // última y cuándo cruzó la meta por última vez (desempate en resistencia).
  ['GET', /^\/api\/events\/(\d+)\/standings$/, 'organizer', async ({ user, params, url }) => {
    const e = await ownEvent(user, Number(params[0]));
    return standingsOf(e, ['practice', 'race'].includes(url.searchParams.get('session')) ? url.searchParams.get('session') : e.session);
  }],
  // Publicar el resultado de una sesión (sort: 'best' mejor vuelta o 'laps' más vueltas): una instantánea que ya
  // no cambia, con enlace público. Volver a publicar la sustituye.
  ['POST', /^\/api\/events\/(\d+)\/results$/, 'organizer', async ({ user, params, body }) => {
    const e = await ownEvent(user, Number(params[0]));
    if (!['practice', 'race'].includes(body.session)) fail(400, 'Sesión no válida.');
    const sort = body.sort === 'laps' ? 'laps' : 'best';
    // Sin vueltas no sale en el resultado (van al final de la clasificación: las posiciones no cambian).
    const rows = (await standingsOf(e, body.session, sort)).filter((r) => r.laps > 0)
      .map((r) => ({ pos: r.pos, dorsal: r.dorsal, team: r.name, laps: r.eff, pen: r.pen, retired: r.retired, best: r.best, last: r.last, bestDriver: r.best_driver }));
    if (!rows.length) fail(409, 'Aún no hay ninguna vuelta en esa sesión.');
    // Código propio del enlace público: no es el de inscripción (en un evento privado ese no debe circular).
    if (!e.public_code) await q('update events set public_code = $1 where id = $2', [randomCode(10), e.id]);
    await q(`insert into event_results (event_id, session, published_by, sort, rows) values ($1, $2, $3, $4, $5)
      on conflict (event_id, session) do update set published_at = now(), published_by = $3, sort = $4, rows = $5`,
    [e.id, body.session, user.name, sort, JSON.stringify(rows)]);
    await logEvent(e.id, 'results', { session: body.session, by: user.name });
    audit(user, 'event.results', null, { eventId: e.id, event: e.name, session: body.session });
    return eventResults(e.id);
  }],
  ['GET', /^\/api\/events\/(\d+)\/results$/, 'organizer', async ({ user, params }) => eventResults((await ownEvent(user, Number(params[0]))).id)],
  // Sanciones (dirección de carrera): N vueltas que se restan en la sesión en curso, o retirar al equipo. Le llegan
  // al equipo como una bandera (pantalla completa en Piloto hasta «Visto») y quedan en el registro.
  ['GET', /^\/api\/events\/(\d+)\/penalties$/, 'organizer', async ({ user, params }) => penaltiesOf((await ownEvent(user, Number(params[0]))).id)],
  ['POST', /^\/api\/events\/(\d+)\/penalties$/, 'organizer', async ({ user, params, body }) => {
    const e = await ownEvent(user, Number(params[0]));
    const t = await one('select id, name, dorsal from teams where id = $1 and event_id = $2', [Number(body.teamId), e.id]);
    if (!t) fail(404, 'Ese equipo no está en el evento.');
    const retired = !!body.retired;
    const laps = retired ? 0 : Number(body.laps);
    if (!retired && !(Number.isInteger(laps) && laps >= 1 && laps <= 100)) fail(400, 'La sanción tiene que ser de 1 a 100 vueltas.');
    const reason = str(body.reason ?? '', 'Motivo', { min: 0, max: 120 });
    const p = await one('insert into penalties (event_id, team_id, session, laps, retired, reason, by) values ($1, $2, $3, $4, $5, $6, $7) returning id',
      [e.id, t.id, e.session, laps, retired, reason, user.name]);
    await logEvent(e.id, 'penalty', { id: p.id, teamId: t.id, team: t.name, dorsal: t.dorsal, laps, retired, reason, session: e.session, by: user.name });
    await teamPenalty(e.id, t.id);
    return penaltiesOf(e.id);
  }],
  // Anular una sanción (puesta por error): se devuelven las vueltas o deja de estar retirado.
  ['DELETE', /^\/api\/events\/(\d+)\/penalties\/(\d+)$/, 'organizer', async ({ user, params }) => {
    const e = await ownEvent(user, Number(params[0]));
    const p = await one('delete from penalties where id = $1 and event_id = $2 returning team_id, laps, retired, reason', [Number(params[1]), e.id]);
    if (!p) fail(404, 'Esa sanción no existe.');
    const t = await one('select name, dorsal from teams where id = $1', [p.team_id]);
    await logEvent(e.id, 'penalty.cancel', { teamId: p.team_id, team: t?.name, dorsal: t?.dorsal, laps: p.laps, retired: p.retired, reason: p.reason, by: user.name });
    await teamPenalty(e.id, p.team_id);
    return penaltiesOf(e.id);
  }],
  // Directo público (sin cuenta, como un apex-timing): clasificación de la sesión en curso según el formato,
  // quién está en boxes, la mejor vuelta y las sanciones. Lo abren los equipos (Clasificación) y quien tenga el enlace.
  ['GET', /^\/api\/public\/live\/([A-Za-z0-9]+)$/, 'none', async ({ params }) => {
    const e = await one(`select ${EVENT_COLS} from events where public_code = $1 and not draft`, [params[0].toUpperCase()]);
    if (!e) fail(404, 'No hay ningún evento en directo con ese enlace.');
    const [rows, comments] = await Promise.all([standingsOf(e, e.session), penaltiesOf(e.id, e.session)]);
    const shown = rows.filter((r) => r.racing || r.laps > 0);
    const pits = await pitsOf(shown.map((r) => r.id));
    const best = shown.filter((r) => r.best != null).sort((a, b) => a.best - b.best)[0];
    return {
      event: { ...eventSummary(e), now: Date.now() },
      rows: shown.map((r) => ({ id: r.id, pos: r.pos, dorsal: r.dorsal, team: r.name, laps: r.eff, pen: r.pen, retired: r.retired, best: r.best, last: r.last, gap: r.gap, pit: pits.has(r.id) })),
      best: best ? { team: best.name, dorsal: best.dorsal, ms: best.best, driver: best.best_driver } : null,
      comments: comments.map(({ seen, by, ...c }) => c),
    };
  }],
  // Página pública de resultados (sin cuenta): solo lo publicado, sin más datos personales que el nombre del piloto.
  ['GET', /^\/api\/public\/results\/([A-Za-z0-9]+)$/, 'none', async ({ params }) => {
    const e = await one(`select id, name, to_char(starts_on, 'YYYY-MM-DD') as "startsOn", place from events where public_code = $1`, [params[0].toUpperCase()]);
    const r = e && await eventResults(e.id);
    if (!r?.results.length) fail(404, 'No hay resultados publicados con ese enlace.');
    return { event: { name: e.name, startsOn: e.startsOn, place: e.place }, results: r.results };
  }],

  // Administración de la plataforma
  // Cuentas con búsqueda (nombre, email o equipo), rol (o 'staff': organizadores y admins) y páginas de `per`.
  ['GET', '/api/admin/users', 'admin', async ({ url }) => {
    const p = url.searchParams;
    const per = Math.min(500, Math.max(1, Number(p.get('per')) || 50));
    const page = Math.max(1, Number(p.get('page')) || 1);
    const rows = await q(`select u.id, u.email, u.name, u.role, u.must_reset, u.created_at, u.last_seen_at, t.name as team, count(*) over()::int as total
      from users u left join teams t on t.id = u.team_id
      where ($1 = '' or u.name ilike '%' || $1 || '%' or u.email ilike '%' || $1 || '%' or t.name ilike '%' || $1 || '%')
        and ($2 = '' or u.role = $2 or ($2 = 'staff' and u.role in ('organizer', 'admin')))
      order by u.created_at desc limit $3 offset $4`, [String(p.get('q') ?? '').trim().slice(0, 100), String(p.get('role') ?? ''), per, (page - 1) * per]);
    return { rows: rows.map(({ total, ...u }) => u), total: rows[0]?.total ?? 0, page, per };
  }],
  // Una cuenta: datos, equipo, eventos que organiza e historial de auditoría (lo que le han hecho y lo que ha hecho).
  ['GET', /^\/api\/admin\/users\/(\d+)$/, 'admin', async ({ params }) => {
    const id = Number(params[0]);
    const u = await one(`select u.id, u.email, u.name, u.role, u.must_reset, u.created_at, u.last_seen_at, t.name as team, t.id as team_id,
        (select count(*)::int from events e where e.organizer_id = u.id) as events,
        (select count(*)::int from laps l where l.driver_id = u.id) as laps
      from users u left join teams t on t.id = u.team_id where u.id = $1`, [id]);
    if (!u) fail(404, 'Ese usuario no existe.');
    return { ...u, history: await q('select id, ts, actor, action, data from audit_log where subject = $1 or actor_id = $1 order by id desc limit 50', [id]) };
  }],
  ['GET', '/api/admin/teams', 'admin', () => q(`select t.id, t.name, t.dorsal, t.invite_code, t.created_at, o.name as owner,
    (select count(*)::int from users m where m.team_id = t.id) as members,
    (select count(*)::int from laps l where l.team_id = t.id) as laps
    from teams t left join users o on o.id = t.owner_id order by t.created_at desc`)],
  ['PATCH', /^\/api\/admin\/users\/(\d+)$/, 'admin', async ({ user, params, body }) => {
    await setRole(user, Number(params[0]), body.role);
    return { ok: true };
  }],
  ['POST', /^\/api\/admin\/users\/(\d+)\/reset$/, 'admin', async ({ user, params }) => ({ tempPassword: (await resetUser(user, Number(params[0]))).password })],
  ['DELETE', /^\/api\/admin\/users\/(\d+)$/, 'admin', async ({ user, params }) => { await deleteUser(user, Number(params[0])); return { ok: true }; }],
  // Acciones masivas: role (con body.role), reset o delete. Sigue con las demás si una falla y dice cuáles.
  ['POST', '/api/admin/users/bulk', 'admin', async ({ user, body }) => {
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Number.isInteger))].slice(0, 500);
    if (!ids.length) fail(400, 'No hay cuentas seleccionadas.');
    if (!['role', 'reset', 'delete'].includes(body.action)) fail(400, 'Acción no válida.');
    const done = [], failed = [], passwords = [];
    for (const id of ids) {
      try {
        if (body.action === 'role') await setRole(user, id, body.role);
        else if (body.action === 'reset') passwords.push(await resetUser(user, id));
        else await deleteUser(user, id);
        done.push(id);
      } catch (e) { failed.push({ id, error: e.message }); }
    }
    return { done, failed, passwords };
  }],
  ['DELETE', /^\/api\/admin\/teams\/(\d+)$/, 'admin', async ({ user, params }) => {
    const id = Number(params[0]);
    const t = await one('select name from teams where id = $1', [id]);
    const members = await q('select id from users where team_id = $1', [id]);
    await q('delete from teams where id = $1', [id]);
    for (const m of members) await kick(m.id);
    await teamChanged(id);
    if (t) audit(user, 'team.delete', null, { team: t.name, members: members.length });
    return { ok: true };
  }],
  // Resumen de la plataforma en una consulta, más lo que pasa ahora mismo en vivo.
  ['GET', '/api/admin/overview', 'admin', async () => {
    const [c, live, attention, events] = await Promise.all([
      one(`select (select count(*)::int from users) as users,
          (select count(*)::int from users where created_at > now() - interval '7 days') as "usersWeek",
          (select count(*)::int from users where last_seen_at > now() - interval '7 days') as "activeWeek",
          (select count(*)::int from users where role = 'organizer') as organizers,
          (select count(*)::int from teams) as teams,
          (select count(*)::int from events where starts_on = current_date and not draft) as "eventsToday",
          (select count(*)::int from events where starts_on > current_date and starts_on <= current_date + 30 and not draft) as "eventsNext",
          (select count(*)::int from laps where started_at > now() - interval '7 days') as "lapsWeek"`),
      liveStats(),
      q(`select id, name, email from users where must_reset and created_at < now() - interval '7 days' order by created_at limit 20`),
      q(`select e.id, e.name, (select count(*)::int from teams t where t.event_id = e.id and not t.racing) as idle
        from events e where e.starts_on = current_date and not e.draft`),
    ]);
    const names = Object.fromEntries((live.flags.length ? await q('select id, name from events where id = any($1)', [live.flags.map((f) => f.eventId)]) : []).map((e) => [e.id, e.name]));
    return {
      counts: c, teamsOnline: live.teamsOnline,
      flags: live.flags.map((f) => ({ ...f, event: names[f.eventId] ?? `Evento ${f.eventId}` })),
      stalePasswords: attention, idleToday: events.filter((e) => e.idle > 0),
      recent: await q('select id, ts, actor, action, subject, data from audit_log order by id desc limit 12'),
    };
  }],
  ['GET', '/api/admin/audit', 'admin', async ({ url }) => {
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const rows = await q('select id, ts, actor, action, subject, data, count(*) over()::int as total from audit_log order by id desc limit 100 offset $1', [(page - 1) * 100]);
    return { rows: rows.map(({ total, ...r }) => r), total: rows[0]?.total ?? 0, page, per: 100 };
  }],
  // Suplantar: token de 30 min para controlar la cuenta de esa persona (soporte). Motivo opcional, todo auditado
  // (inicio, fin y cada escritura), nunca a otro admin.
  ['POST', /^\/api\/admin\/users\/(\d+)\/impersonate$/, 'admin', async ({ user, params, body }) => {
    const reason = body.reason ? str(body.reason, 'Motivo', { max: 200 }) : null;
    const target = await reload(Number(params[0]));
    if (!target) fail(404, 'Ese usuario no existe.');
    if (target.id === user.id || target.role === 'admin') fail(403, 'No se puede suplantar a otro administrador.');
    audit(user, 'impersonate.start', target.id, { name: target.name, reason });
    return { token: sign(target, { imp: user.id }, IMPERSONATE_MS) };
  }],
  ['POST', '/api/impersonation/end', 'user', async ({ user }) => {
    if (user.imp) audit(await one('select id, name from users where id = $1', [user.imp]), 'impersonate.end', user.id, { name: user.name });
    return { ok: true };
  }],
];
const IMPERSONATE_MS = 30 * 60_000;

// Acciones de administración sobre una cuenta (sueltas o masivas), auditadas.
async function setRole(admin, id, role) {
  if (id === admin.id) fail(400, 'No puedes cambiar tu propio rol.');
  if (!['admin', 'organizer', 'pilot'].includes(role)) fail(400, 'Rol no válido.');
  const before = await one('select name, role from users where id = $1', [id]);
  if (!before) fail(404, 'Ese usuario no existe.');
  if (before.role === role) return;
  await q('update users set role = $1 where id = $2', [role, id]);
  await kick(id); // sus conexiones se reconectan con el rol nuevo (p. ej., deja de poder dar banderas)
  audit(admin, 'user.role', id, { name: before.name, from: before.role, to: role });
}
async function resetUser(admin, id) {
  const temp = tempPassword();
  const u = await one('update users set pass = $1, must_reset = true where id = $2 returning id, name', [await hashPassword(temp), id]);
  if (!u) fail(404, 'Ese usuario no existe.');
  await kick(u.id);
  audit(admin, 'user.reset', u.id, { name: u.name });
  return { id: u.id, name: u.name, password: temp };
}
async function deleteUser(admin, id) {
  if (id === admin.id) fail(400, 'No puedes eliminar tu propia cuenta.');
  const u = await reload(id);
  if (!u) fail(404, 'Ese usuario no existe.');
  await leaveTeam(u);
  await q('delete from users where id = $1', [id]);
  audit(admin, 'user.delete', id, { name: u.name, email: u.email });
}

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
      // Suplantando: ni contraseña ni baja de la cuenta; cada escritura queda en la auditoría con el admin real.
      if (ctx.user.imp && ['POST /api/password', 'DELETE /api/me'].includes(`${req.method} ${route[1]}`)) fail(403, 'Suplantando una cuenta no se puede cambiar su contraseña ni eliminarla.');
      if (ctx.user.imp && req.method !== 'GET' && route[1] !== '/api/impersonation/end') audit(await one('select id, name from users where id = $1', [ctx.user.imp]), 'impersonate.write', ctx.user.id, { name: ctx.user.name, method: req.method, path: url.pathname });
      if (access === 'admin' && ctx.user.role !== 'admin') fail(403, 'Solo para administradores.');
      if (access === 'organizer' && !isOrganizer(ctx.user)) fail(403, 'Solo para organizadores de eventos.');
      if (access === 'team') {
        ctx.team = ctx.user.team_id && await one('select * from teams where id = $1', [ctx.user.team_id]);
        if (!ctx.team) fail(409, 'No perteneces a ningún equipo.');
      }
    }
    ctx.body = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {}; // DELETE /api/me lleva la contraseña
    send(200, await handler(ctx));
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    send(e.status ?? 500, { error: e instanceof HttpError ? e.message : 'Error interno del servidor.' });
  }
  return true;
}
