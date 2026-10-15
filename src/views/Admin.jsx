// Administración de la plataforma: Resumen (métricas, en vivo y lo que necesita atención), Cuentas (búsqueda,
// filtros y acciones masivas en el servidor, con panel de detalle y «Suplantar» de un clic), Equipos y
// Auditoría. Cada cambio de un admin queda en la auditoría.
import { useEffect, useState } from 'react';
import Icon from '../icons.jsx';
import { api, impersonate, useSession } from '../lib/session.js';
import { FLAG_INFO } from '../lib/store.js';
import { Page, Card, Pill, Field, Segmented, ConfirmButton, ErrorText, input, btn } from './ui.jsx';

const ROLES = { pilot: 'Piloto', organizer: 'Organizador', admin: 'Admin' };
const ROLE_TONE = { pilot: 'muted', organizer: 'info', admin: 'accent' };
const date = (d) => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
const time = (d) => new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const ago = (d) => {
  if (!d) return 'nunca';
  const s = (new Date(d) - Date.now()) / 1000;
  for (const [u, n] of [['day', 86400], ['hour', 3600], ['minute', 60]]) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
  return 'ahora';
};

// Texto de una entrada de auditoría.
export function auditText(r) {
  const d = r.data ?? {};
  return ({
    'user.role': () => `${d.name}: ${ROLES[d.from] ?? d.from} → ${ROLES[d.to] ?? d.to}`,
    'user.reset': () => `Contraseña restablecida a ${d.name}`,
    'user.delete': () => `Cuenta eliminada: ${d.name} (${d.email})`,
    'team.delete': () => `Equipo eliminado: ${d.team} (${d.members} miembros)`,
    'event.create': () => `Evento creado: ${d.event}`,
    'event.publish': () => `Evento publicado: ${d.event}`,
    'event.delete': () => `Evento eliminado: ${d.event}`,
    'event.organizer': () => `Nuevo organizador de ${d.event}`,
    'event.results': () => `Resultado publicado en ${d.event} (${d.session === 'race' ? 'carrera' : 'entrenamiento'})`,
    'impersonate.start': () => `Suplanta a ${d.name}${d.reason ? ` · motivo: «${d.reason}»` : ''}`,
    'impersonate.write': () => `Suplantando a ${d.name}: ${d.method} ${d.path}`,
    'impersonate.end': () => `Fin de suplantar a ${d.name}`,
  }[r.action] ?? (() => r.action))();
}

const Tile = ({ label, value, sub, tone }) => (
  <div className={`rounded-[4px] border bg-panel px-4 py-3 ${tone === 'warn' ? 'border-warn' : 'border-line'}`}>
    <div className="label">{label}</div>
    <div className="num text-[28px] font-bold leading-tight">{value}</div>
    {sub && <div className="text-[12px] text-muted">{sub}</div>}
  </div>
);

export function AdminOverview({ onNav }) {
  const [o, setO] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => api('/api/admin/overview').then(setO).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);
  if (!o) return <Page icon="chart" color="results" title="Resumen">{error ? <ErrorText>{error}</ErrorText> : <p className="text-muted">Cargando…</p>}</Page>;
  const c = o.counts;
  const attention = o.stalePasswords.length + o.idleToday.length;
  return (
    <Page icon="chart" color="results" title="Resumen" subtitle="La plataforma de un vistazo; se actualiza cada 30 s.">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Cuentas" value={c.users} sub={`+${c.usersWeek} esta semana · ${c.activeWeek} activas en 7 días`} />
          <Tile label="Organizadores" value={c.organizers} sub={`${c.teams} equipos`} />
          <Tile label="Eventos" value={c.eventsToday} sub={`hoy · ${c.eventsNext} en los próximos 30 días`} />
          <Tile label="Vueltas" value={c.lapsWeek} sub="en los últimos 7 días" />
        </div>
        <Card icon="signal" color="teams" title="En vivo ahora">
          <p className="text-[15px]"><b className="num">{o.teamsOnline}</b> equipo{o.teamsOnline === 1 ? '' : 's'} con alguien conectado.</p>
          {o.flags.length === 0 ? <p className="text-[14px] text-muted">Ningún evento con bandera activa.</p> : (
            <ul className="flex flex-col gap-1.5">
              {o.flags.map((f) => (
                <li key={f.eventId} className="flex flex-wrap items-center gap-2 text-[14px]">
                  <span className={`rounded-[3px] px-1.5 text-[12px] font-bold uppercase ${FLAG_INFO[f.type]?.cls ?? ''}`}>{FLAG_INFO[f.type]?.label ?? f.type}</span>
                  <b>{f.event}</b><span className="text-muted">desde {new Date(f.ts).toLocaleTimeString('es-ES')}</span>
                  <button onClick={() => onNav(`control/${f.eventId}`)} className={`${btn.ghost} h-7`}>Race Control</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card icon="alert" color="results" title={`Necesita atención${attention ? ` · ${attention}` : ''}`} tone={attention ? 'border-warn' : ''}>
            {attention === 0 && <p className="text-[14px] text-muted">Nada pendiente.</p>}
            {o.idleToday.map((e) => (
              <p key={e.id} className="text-[14px]"><Icon name="alert" size={15} className="mr-1 inline text-warn" /><b>{e.name}</b> es hoy y {e.idle} equipo{e.idle === 1 ? ' no participa' : 's no participan'}.
                <button onClick={() => onNav(`eventos/${e.id}`)} className="ml-2 text-[13px] font-semibold text-accent underline">Abrir</button></p>
            ))}
            {o.stalePasswords.length > 0 && (
              <div className="text-[14px]"><Icon name="key" size={15} className="mr-1 inline text-warn" />Con la contraseña temporal sin cambiar desde hace más de 7 días:
                <span className="ml-1">{o.stalePasswords.map((u, i) => <span key={u.id}>{i > 0 && ', '}<button onClick={() => onNav(`cuentas/${u.id}`)} className="font-semibold text-accent underline">{u.name}</button></span>)}</span>
              </div>
            )}
          </Card>
          <Card icon="refresh" color="data" title="Actividad reciente" badge={<button onClick={() => onNav('auditoria')} className="text-[12px] font-semibold uppercase text-accent">Ver todo</button>}>
            {o.recent.length === 0 ? <p className="text-[14px] text-muted">Aún no hay actividad.</p> : (
              <ul className="flex flex-col gap-1 text-[13px]">
                {o.recent.map((r) => <li key={r.id} className="flex gap-2"><span className="num shrink-0 text-muted">{time(r.ts)}</span><span><b>{r.actor ?? '—'}</b> · {auditText(r)}</span></li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </Page>
  );
}

// Cuentas: la búsqueda, el filtro y las páginas los hace el servidor. path: [id] abre su panel.
export function AdminUsers({ path = [], onNav }) {
  const { user: me } = useSession();
  const [query, setQuery] = useState('');
  const [q, setQ] = useState(''); // búsqueda aplicada (con pausa al escribir)
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState('');
  const [temps, setTemps] = useState([]); // contraseñas temporales recién generadas
  const open = Number(path[0]) || null;
  useEffect(() => { const t = setTimeout(() => { setQ(query.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [query]);
  const load = () => api(`/api/admin/users?q=${encodeURIComponent(q)}&role=${role}&page=${page}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [q, role, page]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;
  const rows = data?.rows ?? [];
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOnPage = rows.length > 0 && rows.every((u) => u.id === me.id || selected.has(u.id));
  const bulk = async (action, extra = {}) => {
    try {
      const r = await api('/api/admin/users/bulk', { method: 'POST', body: { ids: [...selected], action, ...extra } });
      if (r.passwords.length) setTemps(r.passwords);
      setError(r.failed.length ? `No se ha podido con ${r.failed.length}: ${[...new Set(r.failed.map((f) => f.error))].join(' ')}` : '');
      setSelected(new Set());
      load();
    } catch (e) { setError(e.message); }
  };

  return (
    <Page icon="users" color="teams" title="Cuentas" subtitle="Busca por nombre, email o equipo; selecciona varias para cambiarlas a la vez. Todo queda en la auditoría."
      actions={<span className="text-[13px] text-muted">{data ? `${data.total} cuenta${data.total === 1 ? '' : 's'}` : ''}</span>}>
      <div className="flex flex-col gap-3">
        <ErrorText>{error}</ErrorText>
        {temps.length > 0 && <TempPasswords list={temps} onClose={() => setTemps([])} />}
        <div className="flex flex-wrap items-center gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, email o equipo" aria-label="Buscar cuentas" className={`${input} max-w-sm`} />
          <div className="max-w-full overflow-x-auto"><Segmented value={role} onChange={(r) => { setRole(r); setPage(1); }} options={[['', 'Todos'], ...Object.entries(ROLES)]} /></div>
        </div>
        {selected.size > 0 && <BulkBar count={selected.size} onAction={bulk} onClear={() => setSelected(new Set())} />}
        <Card icon="users" color="teams" title="Cuentas" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[14px]">
              <thead className="bg-raised"><tr className="label">
                <th className="w-10 px-3 py-2"><input type="checkbox" aria-label="Seleccionar todas las de esta página" checked={allOnPage}
                  onChange={() => setSelected((s) => { const n = new Set(s); rows.forEach((u) => u.id !== me.id && (allOnPage ? n.delete(u.id) : n.add(u.id))); return n; })} /></th>
                {['Nombre', 'Email', 'Equipo', 'Rol', 'Último acceso', 'Alta'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {!data && <tr><td colSpan={7} className="px-3 py-3 text-muted">Cargando…</td></tr>}
                {data && rows.length === 0 && <tr><td colSpan={7} className="px-3 py-3 text-muted">Ninguna cuenta con esa búsqueda.</td></tr>}
                {rows.map((u) => (
                  <tr key={u.id} onClick={() => onNav(`cuentas/${u.id}`)} className={`cursor-pointer border-t border-line hover:bg-raised ${open === u.id ? 'bg-accent-soft' : ''}`}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {u.id !== me.id && <input type="checkbox" aria-label={`Seleccionar a ${u.name}`} checked={selected.has(u.id)} onChange={() => toggle(u.id)} />}
                    </td>
                    <td className="px-3 py-2.5 font-semibold">{u.name}{u.id === me.id && <span className="text-muted"> (tú)</span>} {u.must_reset && <Pill>Contraseña temporal</Pill>}</td>
                    <td className="num px-3 py-2.5 text-fg-2">{u.email}</td>
                    <td className="px-3 py-2.5">{u.team ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2.5"><Pill tone={ROLE_TONE[u.role]}>{ROLES[u.role]}</Pill></td>
                    <td className="px-3 py-2.5 text-[13px] text-fg-2" title={u.last_seen_at ? time(u.last_seen_at) : ''}>{ago(u.last_seen_at)}</td>
                    <td className="num px-3 py-2.5 text-[13px] text-muted">{date(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2 text-[13px]">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className={`${btn.ghost} h-8`}><Icon name="back" size={14} />Anterior</button>
              <span className="num">Página {page} de {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(page + 1)} className={`${btn.ghost} h-8`}>Siguiente<Icon name="chevron" size={14} /></button>
            </div>
          )}
        </Card>
      </div>
      {open && <UserPanel key={open} id={open} me={me} onClose={() => onNav('cuentas')} onChanged={load} onTemps={setTemps} onNav={onNav} />}
    </Page>
  );
}

function TempPasswords({ list, onClose }) {
  return (
    <div role="status" className="flex flex-wrap items-start gap-3 rounded-[4px] border border-warn bg-warn-soft px-4 py-3">
      <Icon name="key" size={18} className="mt-0.5 text-warn" />
      <div className="min-w-0 flex-1 text-[14px]">
        <p>Contraseñas temporales: dáselas por un canal privado; al entrar tendrán que cambiarlas. No se volverán a mostrar.</p>
        <ul className="mt-1">{list.map((t) => <li key={t.id}><b>{t.name}</b>: <b className="num select-all">{t.password}</b></li>)}</ul>
      </div>
      <button onClick={() => navigator.clipboard?.writeText(list.map((t) => `${t.name}: ${t.password}`).join('\n'))} className={btn.ghost}><Icon name="copy" size={14} />Copiar</button>
      <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Cerrar"><Icon name="x" size={16} /></button>
    </div>
  );
}

// Acciones con varias cuentas seleccionadas; cada una pide confirmación en línea.
function BulkBar({ count, onAction, onClear }) {
  const [role, setRole] = useState('organizer');
  const [ask, setAsk] = useState(null); // 'role' | 'reset'
  const label = { role: `¿Pasar ${count} cuenta${count === 1 ? '' : 's'} a ${ROLES[role]}?`, reset: `¿Restablecer la contraseña de ${count}?` };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[4px] border border-accent bg-accent-soft px-3 py-2">
      <b className="text-[14px]">{count} seleccionada{count === 1 ? '' : 's'}</b>
      {ask ? <>
        <span className="text-[14px] font-semibold">{label[ask]}</span>
        <button onClick={() => { setAsk(null); onAction(ask, ask === 'role' ? { role } : {}); }} className={btn.primary}>Sí</button>
        <button onClick={() => setAsk(null)} className={btn.ghost}>Cancelar</button>
      </> : <>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Rol nuevo" className="h-9 rounded-[4px] border border-line-strong bg-sunken px-2 text-[13px] font-semibold uppercase">
          {Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={() => setAsk('role')} className={btn.ghost}>Cambiar rol</button>
        <button onClick={() => setAsk('reset')} className={btn.ghost}><Icon name="key" size={14} />Restablecer contraseña</button>
        <ConfirmButton label="Eliminar" confirm={`Eliminar ${count}`} icon={<Icon name="trash" size={14} />} onConfirm={() => onAction('delete')} />
      </>}
      <button onClick={onClear} className="ml-auto text-[13px] font-semibold text-muted hover:text-fg">Quitar selección</button>
    </div>
  );
}

// Panel lateral de una cuenta: datos, rol, contraseña, suplantar, eliminar e historial.
function UserPanel({ id, me, onClose, onChanged, onTemps, onNav }) {
  const [u, setU] = useState(null);
  const [error, setError] = useState('');
  const [role, setRole] = useState(null); // rol a confirmar
  const load = () => api(`/api/admin/users/${id}`).then(setU).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); });
  const act = async (fn) => { setError(''); try { await fn(); await load(); onChanged(); } catch (e) { setError(e.message); } };
  const self = u?.id === me.id;
  return (
    <>
      <div className="fixed inset-0 z-[1500] bg-black/30" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-label={u ? `Cuenta de ${u.name}` : 'Cuenta'}
        className="fixed inset-y-0 right-0 z-[1501] flex w-full max-w-md flex-col overflow-y-auto border-l border-line bg-panel shadow-xl">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
          <h2 className="min-w-0 flex-1 truncate text-[16px] font-bold uppercase tracking-[0.04em]">{u?.name ?? 'Cuenta'}</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center text-muted hover:text-fg" aria-label="Cerrar"><Icon name="x" size={18} /></button>
        </header>
        {!u ? <div className="p-4">{error ? <ErrorText>{error}</ErrorText> : <p className="text-muted">Cargando…</p>}</div> : (
          <div className="flex flex-col gap-4 p-4">
            <ErrorText>{error}</ErrorText>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[14px]">
              <dt className="text-muted">Email</dt><dd className="num break-all">{u.email}</dd>
              <dt className="text-muted">Equipo</dt><dd>{u.team ?? '—'}</dd>
              <dt className="text-muted">Organiza</dt><dd>{u.events} evento{u.events === 1 ? '' : 's'}</dd>
              <dt className="text-muted">Vueltas</dt><dd className="num">{u.laps}</dd>
              <dt className="text-muted">Último acceso</dt><dd>{ago(u.last_seen_at)}</dd>
              <dt className="text-muted">Alta</dt><dd>{date(u.created_at)}</dd>
            </dl>
            <Field label="Rol">
              {self ? <span><Pill tone="accent">Admin</Pill> <span className="text-[13px] text-muted">No puedes cambiar tu propio rol.</span></span> : (
                <select value={role ?? u.role} onChange={(e) => setRole(e.target.value === u.role ? null : e.target.value)} className={input}>
                  {Object.entries(ROLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              )}
            </Field>
            {role && (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-[4px] bg-warn-soft px-3 py-2 text-[14px]">
                <span className="min-w-0 flex-1 font-semibold text-warn">{role === 'pilot' ? `${u.name} dejará de poder organizar eventos.` : role === 'organizer' ? `${u.name} podrá crear y dirigir eventos.` : `${u.name} podrá administrar toda la plataforma.`}</span>
                <button onClick={() => act(() => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { role } })).then(() => setRole(null))} className={btn.primary}>Confirmar</button>
                <button onClick={() => setRole(null)} className={btn.ghost}>Cancelar</button>
              </div>
            )}
            {!self && <div className="flex flex-wrap gap-2">
              <button onClick={() => act(async () => { const r = await api(`/api/admin/users/${u.id}/reset`, { method: 'POST' }); onTemps([{ id: u.id, name: u.name, password: r.tempPassword }]); })} className={btn.ghost}>
                <Icon name="key" size={14} />Restablecer contraseña</button>
              {/* Un clic: 30 min con control de su cuenta; cada cambio queda en la auditoría. Sin act(): con el token
                  nuevo ya no se puede recargar esta cuenta (es solo para admins). */}
              {u.role !== 'admin' && <button title="Controlar su cuenta 30 min (queda en la auditoría)" className={btn.ghost}
                onClick={() => api(`/api/admin/users/${u.id}/impersonate`, { method: 'POST', body: {} })
                  .then(({ token }) => impersonate(token)).then(() => onNav('')).catch((err) => setError(err.message))}>
                <Icon name="eye" size={14} />Suplantar</button>}
            </div>}
            {!self && (
              <div className="flex flex-col gap-2 rounded-[4px] border border-crit p-3">
                <span className="label text-crit">Zona de peligro</span>
                <ConfirmButton label="Eliminar cuenta" confirm="Sí, eliminar" icon={<Icon name="trash" size={14} />}
                  onConfirm={() => api(`/api/admin/users/${u.id}`, { method: 'DELETE' }).then(() => { onChanged(); onClose(); }).catch((e) => setError(e.message))} />
              </div>
            )}
            <div>
              <span className="label">Historial</span>
              {u.history.length === 0 ? <p className="text-[13px] text-muted">Sin cambios registrados.</p> : (
                <ul className="mt-1 flex flex-col gap-1 text-[13px]">
                  {u.history.map((r) => <li key={r.id} className="flex gap-2"><span className="num shrink-0 text-muted">{time(r.ts)}</span><span><b>{r.actor ?? '—'}</b> · {auditText(r)}</span></li>)}
                </ul>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

export function AdminTeams() {
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const load = () => api('/api/admin/teams').then((t) => setTeams(Object.values(t).filter((x) => typeof x === 'object'))).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const f = filter.trim().toLowerCase();
  const shown = teams?.filter((t) => !f || [t.name, t.owner].some((s) => s?.toLowerCase().includes(f)));
  return (
    <Page icon="car" color="track" title="Equipos" subtitle="Todos los equipos de la plataforma. Eliminar un equipo borra también sus vueltas y su telemetría.">
      <div className="flex flex-col gap-3">
        <ErrorText>{error}</ErrorText>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar equipo o capitán" aria-label="Buscar equipo" className={`${input} max-w-sm`} />
        <Card icon="car" color="track" title={`Equipos${teams ? ` · ${teams.length}` : ''}`} flush>
          {!shown ? <p className="p-4 text-muted">Cargando…</p> : shown.length === 0 ? <p className="p-4 text-[14px] text-muted">Ningún equipo.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-[14px]">
                <thead className="bg-raised"><tr className="label">{['Equipo', 'Capitán', 'Miembros', 'Vueltas', 'Código', 'Alta', ''].map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
                <tbody>
                  {shown.map((t) => (
                    <tr key={t.id} className="border-t border-line">
                      <td className="px-4 py-2.5 font-semibold"><span className="num text-muted">#{t.dorsal}</span> {t.name}</td>
                      <td className="px-4 py-2.5">{t.owner ?? <span className="text-muted">—</span>}</td>
                      <td className="num px-4 py-2.5">{t.members}</td>
                      <td className="num px-4 py-2.5">{t.laps}</td>
                      <td className="num px-4 py-2.5 tracking-[0.15em] text-fg-2">{t.invite_code}</td>
                      <td className="num px-4 py-2.5 text-[13px] text-muted">{date(t.created_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <ConfirmButton label="Eliminar" confirm="Eliminar equipo y datos" icon={<Icon name="trash" size={14} />}
                          onConfirm={() => api(`/api/admin/teams/${t.id}`, { method: 'DELETE' }).then(load).catch((e) => setError(e.message))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}

export function AdminAudit({ onNav }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/api/admin/audit?page=${page}`).then(setData).catch((e) => setError(e.message)); }, [page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per)) : 1;
  return (
    <Page icon="shield" color="data" title="Auditoría" subtitle="Quién ha cambiado qué: roles, contraseñas, bajas, eventos, resultados y cada suplantación con lo que se hizo.">
      <ErrorText>{error}</ErrorText>
      <Card icon="shield" color="data" title={`Registro${data ? ` · ${data.total}` : ''}`} flush>
        {!data ? <p className="p-4 text-muted">Cargando…</p> : data.rows.length === 0 ? <p className="p-4 text-[14px] text-muted">Aún no hay nada registrado.</p> : (
          <ul>
            {data.rows.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-3 border-t border-line px-4 py-2 text-[14px] first:border-t-0">
                <span className="num w-32 shrink-0 text-muted">{time(r.ts)}</span>
                <b className="w-32 shrink-0 truncate">{r.actor ?? '—'}</b>
                <span className="min-w-0 flex-1">{auditText(r)}</span>
                {r.subject && <button onClick={() => onNav(`cuentas/${r.subject}`)} className="text-[13px] font-semibold text-accent underline">Cuenta</button>}
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2 text-[13px]">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className={`${btn.ghost} h-8`}><Icon name="back" size={14} />Más recientes</button>
            <span className="num">Página {page} de {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)} className={`${btn.ghost} h-8`}>Más antiguas<Icon name="chevron" size={14} /></button>
          </div>
        )}
      </Card>
    </Page>
  );
}
