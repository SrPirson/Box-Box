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
async function teamPayload(teamId) {
  const t = await one('select * from teams where id = $1', [teamId]);
  if (!t) return null;
  const [members, tracks] = await Promise.all([
    q('select id, name, role from users where team_id = $1 order by created_at', [teamId]),
    q('select id, name from tracks where team_id = $1 order by name', [teamId]),
  ]);
  return {
    id: t.id, name: t.name, inviteCode: t.invite_code, ownerId: t.owner_id, dorsal: t.dorsal, phone: t.phone,
    limits: { ...LIMITS, ...t.limits }, track: t.track, tracks, carIcon: t.car_icon, carIconStyle: t.car_icon_style, members,
  };
}
const session = async (u, withToken) => ({
  ...(withToken && { token: sign(u) }),
  user: publicUser(u),
  team: u.team_id ? await teamPayload(u.team_id) : null,
});

async function uniqueCode() {
  for (;;) {
    const c = randomCode();
    if (!(await one('select 1 from teams where invite_code = $1', [c]))) return c;
  }
}

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
  ['POST', '/api/teams', 'user', async ({ user, body }) => {
    const t = await one('insert into teams (name, invite_code, owner_id, limits) values ($1, $2, $3, $4) returning id',
      [str(body.name, 'Nombre del equipo', { max: 60 }), await uniqueCode(), user.id, LIMITS]);
    await joinTeam(user, t.id);
    return session(await reload(user.id));
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
    if (!['admin', 'pilot'].includes(body.role)) fail(400, 'Rol no válido.');
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
