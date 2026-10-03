// Perfil de quien lo abre (piloto, organizador o admin): su cuenta (nombre, email, contraseña, modo, tema,
// cerrar sesión, eliminar cuenta) y sus estadísticas al volante, en cualquier equipo, evento o pista.
import { useEffect, useState } from 'react';
import Icon from '../icons.jsx';
import { api, logout, setSession, useSession } from '../lib/session.js';
import { fmt } from '../lib/limits.js';
import { stop } from '../lib/gateway.js';
import { setMode as setTheme, useThemeMode } from '../lib/theme.js';
import { MODES, modesOf, setMode, useMode } from '../lib/mode.js';
import { Page, Card, Field, Segmented, Pill, ErrorText, input, btn, fmtLap, fmtSplit } from './ui.jsx';
import { RANGES, lapAvg, Kpi, Delta, LapChart, Th } from './Stats.jsx';
import { KIND_OPTIONS } from './Racing.jsx';

const ROLE_LABEL = { admin: 'Administrador', organizer: 'Organizador', pilot: 'Piloto' };

// Ajustes de la cuenta: cada tarjeta guarda lo suyo y muestra su propio error.
function AccountSection() {
  const { user } = useSession();
  const theme = useThemeMode();
  const mode = useMode(user.role);
  const modes = modesOf(user.role);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Cuenta" badge={<Pill tone="accent">{ROLE_LABEL[user.role]}</Pill>}>
        <NameForm user={user} />
        <EmailForm user={user} />
      </Card>
      <div className="flex min-w-0 flex-col gap-4">
        {modes.length > 1 && (
          <Card title="Modo">
            <Segmented value={mode} onChange={setMode} options={modes.map((m) => [m, MODES[m]])} />
            <p className="text-[13px] text-muted">Cada modo muestra solo sus vistas. Para correr con tu equipo, usa el modo Piloto.</p>
          </Card>
        )}
        <Card title="Apariencia">
          <Segmented value={theme} onChange={setTheme} options={[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']]} />
          <p className="text-[13px] text-muted">Claro para el muro a pleno sol; oscuro para noche o boxes cerrados.</p>
        </Card>
        <PasswordForm />
        <Card title="Sesión">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { stop(); logout(); }} className={btn.ghost}><Icon name="logout" size={15} />Cerrar sesión</button>
          </div>
          <DeleteAccount />
        </Card>
      </div>
    </div>
  );
}

// Envío de un formulario con su estado de error y de «guardado».
function useForm(fn) {
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const onSubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    setError('');
    setDone(false);
    try { await fn(new FormData(form), form); setDone(true); } catch (err) { setError(err.message); }
  };
  return { error, done, onSubmit };
}

function NameForm({ user }) {
  const f = useForm(async (d) => setSession(await api('/api/me', { method: 'PATCH', body: { name: d.get('name') } })));
  return (
    <form onSubmit={f.onSubmit} className="flex flex-col gap-2">
      <Field label="Nombre"><input className={input} name="name" defaultValue={user.name} required maxLength={60} /></Field>
      <ErrorText>{f.error}</ErrorText>
      <div className="flex items-center gap-3"><button className={btn.ghost}>Guardar nombre</button>{f.done && <span className="text-[13px] text-ok">Guardado.</span>}</div>
    </form>
  );
}

function EmailForm({ user }) {
  const f = useForm(async (d, form) => {
    setSession(await api('/api/me', { method: 'PATCH', body: { email: d.get('email'), password: d.get('password') } }));
    form.password.value = '';
  });
  return (
    <form onSubmit={f.onSubmit} className="flex flex-col gap-2 border-t border-line pt-4">
      <Field label="Email (con el que entras)"><input className={input} name="email" type="email" defaultValue={user.email} required autoComplete="email" /></Field>
      <Field label="Tu contraseña, para confirmarlo"><input className={input} name="password" type="password" required autoComplete="current-password" /></Field>
      <ErrorText>{f.error}</ErrorText>
      <div className="flex items-center gap-3"><button className={btn.ghost}>Cambiar email</button>{f.done && <span className="text-[13px] text-ok">Email cambiado.</span>}</div>
    </form>
  );
}

function PasswordForm() {
  const f = useForm(async (d, form) => {
    if (d.get('next') !== d.get('next2')) throw new Error('Las contraseñas no coinciden.');
    setSession(await api('/api/password', { method: 'POST', body: { current: d.get('current'), next: d.get('next') } }));
    form.reset();
  });
  return (
    <Card title="Contraseña">
      <form onSubmit={f.onSubmit} className="flex flex-col gap-3">
        <Field label="Contraseña actual"><input className={input} name="current" type="password" autoComplete="current-password" required /></Field>
        <Field label="Nueva contraseña"><input className={input} name="next" type="password" autoComplete="new-password" minLength={8} required /></Field>
        <Field label="Repítela"><input className={input} name="next2" type="password" autoComplete="new-password" minLength={8} required /></Field>
        <ErrorText>{f.error}</ErrorText>
        <div className="flex items-center gap-3"><button className={btn.ghost}><Icon name="key" size={15} />Cambiar contraseña</button>{f.done && <span className="text-[13px] text-ok">Cambiada. Las demás sesiones se han cerrado.</span>}</div>
      </form>
    </Card>
  );
}

// Eliminar la cuenta: pide la contraseña; sale de su equipo y sus vueltas quedan sin piloto.
function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const f = useForm(async (d) => { await api('/api/me', { method: 'DELETE', body: { password: d.get('password') } }); stop(); logout(); });
  if (!open) return <button onClick={() => setOpen(true)} className={`${btn.danger} self-start`}><Icon name="trash" size={14} />Eliminar mi cuenta</button>;
  return (
    <form onSubmit={f.onSubmit} className="flex flex-col gap-2 rounded-[4px] border border-crit/40 bg-crit-soft p-3">
      <p className="text-[13px] text-crit">Se borra tu cuenta y sales de tu equipo. Tus vueltas se quedan en las estadísticas del equipo, sin tu nombre. No se puede deshacer.</p>
      <Field label="Tu contraseña"><input className={input} name="password" type="password" required autoComplete="current-password" /></Field>
      <ErrorText>{f.error}</ErrorText>
      <div className="flex gap-2"><button className={btn.dangerSolid}>Eliminar definitivamente</button><button type="button" onClick={() => setOpen(false)} className={btn.ghost}>Cancelar</button></div>
    </form>
  );
}

const hm = (s) => `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`;

// Por pista: vueltas, mejor, media y, con tramos, el mejor de cada uno y la vuelta ideal. Solo se comparan
// vueltas con el mismo número de tramos (el más habitual en esa pista).
function byTrack(laps) {
  const groups = new Map();
  for (const l of laps) {
    // Vueltas de un evento: agrupadas por evento (su pista es la del organizador); si no, por pista del equipo.
    const key = l.event_id ? `ev:${l.event_id}` : l.track_id ?? `sin:${l.team ?? ''}`;
    if (!groups.has(key)) groups.set(key, { name: l.event_id ? l.event ?? 'Evento eliminado' : l.track ?? 'Pista sin guardar', isEvent: !!l.event_id, team: l.team, laps: [] });
    groups.get(key).laps.push(l);
  }
  return [...groups.values()].map((g) => {
    const counts = {};
    for (const l of g.laps) if (l.sectors) counts[l.sectors.length] = (counts[l.sectors.length] ?? 0) + 1;
    const n = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0);
    const withSectors = g.laps.filter((l) => l.sectors?.length === n);
    const best = n ? Array.from({ length: n }, (_, i) => Math.min(...withSectors.map((l) => l.sectors[i]))) : [];
    return { ...g, best: Math.min(...g.laps.map((l) => l.ms)), avg: lapAvg(g.laps), sectors: best, ideal: best.length ? best.reduce((a, b) => a + b, 0) : null };
  }).sort((a, b) => b.laps.length - a.laps.length);
}

export default function Profile() {
  const { user, team } = useSession();
  const [range, setRange] = useState('all');
  const [kind, setKind] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null);
    api(`/api/me/stats?since=${RANGES[range][1]().toISOString()}${kind === 'all' ? '' : `&kind=${kind}`}`).then(setData).catch((e) => setError(e.message));
  }, [range, kind]);

  const laps = data?.laps ?? [];
  const m = data?.metrics ?? {};
  const avg = lapAvg(laps);
  const best = laps.reduce((b, l) => (!b || l.ms < b.ms ? l : b), null);
  const tracks = byTrack(laps);

  return (
    <Page title="Mi perfil" subtitle={`${user.email}${team ? ` · ${team.name}` : ''}`}>
      <AccountSection />
      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-[0.06em]">Mis estadísticas</h2>
          <p className="text-[13px] text-muted">Tus vueltas y tu telemetría al volante, en todos tus equipos y eventos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented value={kind} onChange={setKind} options={KIND_OPTIONS} />
          <Segmented value={range} onChange={setRange} options={Object.entries(RANGES).map(([k, [l]]) => [k, l])} />
        </div>
      </div>
      {error && <p role="alert" className="mb-4 rounded-[4px] bg-crit-soft px-3 py-2 text-crit">{error}</p>}
      {!data ? <p className="text-muted">Cargando…</p> : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Vueltas" value={laps.length} sub={tracks.length > 0 && `en ${tracks.length} pista${tracks.length > 1 ? 's' : ''}`} />
            <Kpi label="Mejor vuelta" value={fmtLap(best?.ms)} sub={best && (best.track ?? best.team)} />
            <Kpi label="Media de vuelta" value={fmtLap(avg && Math.round(avg))} />
            <Kpi label="Al volante" value={hm(m.seconds ?? 0)} />
            <Kpi label="Recorrido" value={`${fmt(m.km ?? 0, 1)} km`} />
            <Kpi label="Velocidad máx." value={m.max_speed == null ? '—' : `${fmt(m.max_speed)} km/h`} sub={m.avg_speed != null && `media ${fmt(m.avg_speed)} km/h`} />
          </div>

          {laps.length === 0 ? (
            <Card title="Tus vueltas">
              <p className="flex items-start gap-3 text-[14px] leading-snug text-fg-2">
                <Icon name="wheel" size={20} className="mt-0.5 text-muted" />
                <span>Aún no hay vueltas tuyas en este periodo. Cuentan las que das con tu móvil al volante («Tomar el volante» en Piloto).</span>
              </p>
            </Card>
          ) : <>
            <Card title="Tiempos por vuelta" badge={<span className="num text-[12px] text-muted">media {fmtLap(Math.round(avg))}</span>}>
              <LapChart laps={laps.map((l) => ({ ...l, driver: l.track ?? l.team }))} avg={avg} bestId={best.id} />
            </Card>

            <Card title="Por evento y pista" flush>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-[14px]">
                  <thead className="bg-raised text-left"><tr className="label"><Th>Evento o pista</Th><Th right>Vueltas</Th><Th right>Mejor</Th><Th right>Media</Th><Th>Mejores tramos</Th><Th right>Vuelta ideal</Th></tr></thead>
                  <tbody>
                    {tracks.map((t) => (
                      <tr key={t.name + t.team} className="border-t border-line">
                        <td className="px-4 py-2.5"><div className="flex items-center gap-1.5 font-semibold">{t.isEvent && <Icon name="finish" size={14} className="text-accent" />}{t.name}</div>{t.team && <div className="text-[12px] text-muted">{t.team}</div>}</td>
                        <td className="num px-4 py-2.5 text-right">{t.laps.length}</td>
                        <td className="num px-4 py-2.5 text-right font-bold text-ok">{fmtLap(t.best)}</td>
                        <td className="num px-4 py-2.5 text-right">{fmtLap(Math.round(t.avg))}</td>
                        <td className="num px-4 py-2.5 text-fg-2">{t.sectors.length ? t.sectors.map(fmtSplit).join(' · ') : '—'}</td>
                        <td className="num px-4 py-2.5 text-right">{fmtLap(t.ideal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card title="Tus vueltas" flush>
                <div className="max-h-[480px] overflow-auto">
                  <table className="w-full min-w-[620px] text-[14px]">
                    <thead className="sticky top-0 bg-raised text-left"><tr className="label"><Th>Fecha</Th><Th>Evento o pista</Th><Th right>Tiempo</Th><Th right>vs tu media</Th><Th right>Temp. máx</Th><Th right>Vel. máx</Th></tr></thead>
                    <tbody>
                      {[...laps].reverse().map((l) => (
                        <tr key={l.id} className={`border-t border-line ${l.id === best.id ? 'bg-ok-soft' : ''}`}>
                          <td className="num px-4 py-2 text-fg-2">{new Date(l.started_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td className="px-4 py-2">{l.event_id ? l.event ?? 'Evento eliminado' : l.track ?? 'Pista sin guardar'}{l.team && <span className="text-[12px] text-muted"> · {l.team}</span>}</td>
                          <td className="num px-4 py-2 text-right font-bold">{fmtLap(l.ms)}</td>
                          <td className="px-4 py-2 text-right"><Delta ms={l.ms - avg} /></td>
                          <td className="num px-4 py-2 text-right">{l.max_temp == null ? '—' : `${fmt(l.max_temp)} °C`}</td>
                          <td className="num px-4 py-2 text-right">{l.max_speed == null ? '—' : `${fmt(l.max_speed)} km/h`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card title="Tu telemetría" flush>
                <table className="w-full text-[14px]">
                  <tbody>
                    {[
                      ['Temp. motor media', m.avg_temp, 0, '°C'], ['Temp. motor máx.', m.max_temp, 0, '°C'], ['Régimen máx.', m.max_rpm, 0, 'rpm'],
                      ['Velocidad media', m.avg_speed, 0, 'km/h'], ['Acelerador medio', m.avg_throttle, 0, '%'],
                    ].map(([k, v, d, u]) => (
                      <tr key={k} className="border-t border-line first:border-t-0">
                        <td className="px-4 py-2.5 font-semibold">{k}</td>
                        <td className="num px-4 py-2.5 text-right">{v == null ? '—' : `${fmt(v, d)} ${u}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </>}
        </div>
      )}
    </Page>
  );
}
