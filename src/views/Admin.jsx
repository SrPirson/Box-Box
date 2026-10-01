// Administración de la plataforma: cuentas (rol, restablecer contraseña, eliminar) y equipos.
import { useEffect, useState } from 'react';
import Icon from '../icons.jsx';
import { api, useSession } from '../lib/session.js';
import { Page, Card, Pill, Segmented, ConfirmButton, ErrorText, input, btn } from './ui.jsx';

const date = (d) => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Admin() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState(null);
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const load = () => Promise.all([api('/api/admin/users'), api('/api/admin/teams')]).then(([u, t]) => { setUsers(u); setTeams(t); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const run = async (fn) => { setError(''); try { await fn(); await load(); } catch (e) { setError(e.message); } };
  const f = filter.trim().toLowerCase();

  return (
    <Page title="Administración" subtitle="Cuentas y equipos de toda la plataforma."
      actions={<Segmented value={tab} onChange={setTab} options={[['users', `Cuentas${users ? ` · ${users.length}` : ''}`], ['teams', `Equipos${teams ? ` · ${teams.length}` : ''}`]]} />}>
      <ErrorText>{error}</ErrorText>
      <div className="mb-3 mt-2 flex items-center gap-2">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tab === 'users' ? 'Buscar por nombre, email o equipo' : 'Buscar equipo'} className={`${input} max-w-sm`} />
      </div>
      {tab === 'users'
        ? <Users users={users?.filter((u) => !f || [u.name, u.email, u.team].some((s) => s?.toLowerCase().includes(f)))} run={run} />
        : <Teams teams={teams?.filter((t) => !f || [t.name, t.owner].some((s) => s?.toLowerCase().includes(f)))} run={run} />}
    </Page>
  );
}

function Users({ users, run }) {
  const { user: me } = useSession();
  const [temp, setTemp] = useState(null); // { name, password } recién generada
  if (!users) return <p className="text-muted">Cargando…</p>;
  return (
    <>
      {temp && (
        <div role="status" className="mb-3 flex flex-wrap items-center gap-3 rounded-[4px] border border-warn bg-warn-soft px-4 py-3">
          <Icon name="key" size={18} className="text-warn" />
          <span className="text-[14px]">Contraseña temporal de <b>{temp.name}</b>: <b className="num select-all text-[16px]">{temp.password}</b>. Dísela por un canal privado; al entrar tendrá que cambiarla. No se volverá a mostrar.</span>
          <button onClick={() => { navigator.clipboard?.writeText(temp.password); }} className={btn.ghost}><Icon name="copy" size={14} />Copiar</button>
          <button onClick={() => setTemp(null)} className="ml-auto text-muted hover:text-fg" aria-label="Cerrar"><Icon name="x" size={16} /></button>
        </div>
      )}
      <Card title="Cuentas" flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[14px]">
            <thead className="bg-raised"><tr className="label">{['Nombre', 'Email', 'Equipo', 'Rol', 'Alta', ''].map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-4 py-2.5 font-semibold">{u.name}{u.id === me.id && <span className="text-muted"> (tú)</span>} {u.must_reset && <Pill>Cambio pendiente</Pill>}</td>
                  <td className="num px-4 py-2.5 text-fg-2">{u.email}</td>
                  <td className="px-4 py-2.5">{u.team ?? <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-2.5">
                    {u.id === me.id ? <Pill tone="accent">Admin</Pill> : (
                      <select value={u.role} onChange={(e) => run(() => api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { role: e.target.value } }))}
                        className="h-8 rounded-[4px] border border-line-strong bg-sunken px-2 text-[13px] font-semibold uppercase" aria-label={`Rol de ${u.name}`}>
                        <option value="pilot">Piloto</option><option value="admin">Admin</option>
                      </select>
                    )}
                  </td>
                  <td className="num px-4 py-2.5 text-[13px] text-muted">{date(u.created_at)}</td>
                  <td className="px-4 py-2.5">
                    {u.id !== me.id && (
                      <span className="flex justify-end gap-2">
                        <button className={btn.ghost} onClick={() => run(async () => { const r = await api(`/api/admin/users/${u.id}/reset`, { method: 'POST' }); setTemp({ name: u.name, password: r.tempPassword }); })}>
                          <Icon name="key" size={14} />Restablecer
                        </button>
                        <ConfirmButton label="Eliminar" confirm="Eliminar cuenta" icon={<Icon name="trash" size={14} />} onConfirm={() => run(() => api(`/api/admin/users/${u.id}`, { method: 'DELETE' }))} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Teams({ teams, run }) {
  if (!teams) return <p className="text-muted">Cargando…</p>;
  return (
    <Card title="Equipos" flush>
      {teams.length === 0 && <p className="p-4 text-[14px] text-muted">Todavía no hay equipos.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-[14px]">
          <thead className="bg-raised"><tr className="label">{['Equipo', 'Capitán', 'Miembros', 'Vueltas', 'Código', 'Alta', ''].map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id} className="border-t border-line">
                <td className="px-4 py-2.5 font-semibold"><span className="num text-muted">#{t.dorsal}</span> {t.name}</td>
                <td className="px-4 py-2.5">{t.owner ?? <span className="text-muted">—</span>}</td>
                <td className="num px-4 py-2.5">{t.members}</td>
                <td className="num px-4 py-2.5">{t.laps}</td>
                <td className="num px-4 py-2.5 tracking-[0.15em] text-fg-2">{t.invite_code}</td>
                <td className="num px-4 py-2.5 text-[13px] text-muted">{date(t.created_at)}</td>
                <td className="px-4 py-2.5 text-right">
                  <ConfirmButton label="Eliminar" confirm="Eliminar equipo y datos" icon={<Icon name="trash" size={14} />} onConfirm={() => run(() => api(`/api/admin/teams/${t.id}`, { method: 'DELETE' }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
