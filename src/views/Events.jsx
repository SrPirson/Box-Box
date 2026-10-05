// Eventos (organizadores): la lista con el estado de cada evento y, al abrir uno, su espacio por pestañas.
// Preparar (pista, inscritos, ajustes) va aparte de correr (Resumen: dirección de carrera, clasificación y mapa
// en vivo). La ruta está en la URL: #eventos, #eventos/12, #eventos/12/pista. El organizador no ve los mensajes
// de los equipos.
import { useEffect, useRef, useState } from 'react';
import Icon from '../icons.jsx';
import TrackMap from './TrackMap.jsx';
import { SESSIONS } from './Racing.jsx';
import { api, inviteLink } from '../lib/session.js';
import { useSocket, FLAG_INFO } from '../lib/store.js';
import { EVENT_STATES, eventState, missingToPublish } from '../lib/events.js';
import { Page, Card, Field, Segmented, ConfirmButton, Pill, ErrorText, input, btn, fmtLap, fmtDelta } from './ui.jsx';

const fmtDate = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const STALE_MS = 15000; // sin datos de un coche desde hace más: «sin señal»
const TRAIL_MAX = 300;
const TABS = [['resumen', 'Resumen'], ['pista', 'Pista'], ['inscritos', 'Inscritos'], ['ajustes', 'Ajustes']];
const StatePill = ({ state }) => <Pill tone={EVENT_STATES[state].tone}>{state === 'today' && <span className="pulse h-1.5 w-1.5 rounded-full bg-ok" />}{EVENT_STATES[state].label}</Pill>;

// admin: todos los eventos (no los crea; puede cambiarles el organizador). Si no, los del organizador.
// path: [] la lista; [id, pestaña?] el evento.
export default function Events({ admin = false, path = [], onNav }) {
  const id = Number(path[0]) || null;
  const tab = TABS.some(([t]) => t === path[1]) ? path[1] : 'resumen';
  const go = (p) => onNav(['eventos', ...p].join('/'));
  if (id) return <Workspace key={id} id={id} tab={tab} admin={admin} go={go} />;
  return <EventList admin={admin} go={go} />;
}

function EventList({ admin, go }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => { api(admin ? '/api/events?all=1' : '/api/events').then(setList).catch((e) => setError(e.message)); }, [admin]);
  const create = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError('');
    try {
      const ev = await api('/api/events', { method: 'POST', body: { name: f.get('name'), startsOn: f.get('startsOn'), place: f.get('place') } });
      go([ev.id, 'pista']); // lo siguiente que falta casi siempre: la meta
    } catch (err) { setError(err.message); }
  };
  const rows = (list ?? []).map((e) => ({ ...e, state: eventState(e) }));
  const count = (s) => rows.filter((e) => e.state === s).length;
  const q = query.trim().toLowerCase();
  const shown = rows.filter((e) => (filter === 'all' || e.state === filter) && (!q || [e.name, e.place, e.organizer].some((s) => s?.toLowerCase().includes(q))));
  // Primero lo de hoy, luego lo próximo (más cercano antes), los borradores y lo terminado (más reciente antes).
  const rank = { today: 0, open: 1, draft: 2, done: 3 };
  shown.sort((a, b) => rank[a.state] - rank[b.state] || (a.state === 'done' ? -1 : 1) * String(a.startsOn ?? '9').localeCompare(String(b.startsOn ?? '9')));

  return (
    <Page title={admin ? 'Eventos' : 'Mis eventos'} max="max-w-[1180px]"
      subtitle={admin ? 'Todos los eventos de la plataforma: ábrelos, cámbiales el organizador, ciérralos o bórralos.'
        : 'Crea el evento, marca la pista y publícalo; los equipos se inscriben desde la lista de eventos o con su código.'}
      actions={!admin && !creating && <button onClick={() => setCreating(true)} className={btn.primary}><Icon name="plus" size={15} />Nuevo evento</button>}>
      <div className="flex flex-col gap-4">
        <ErrorText>{error}</ErrorText>
        {creating && (
          <Card title="Nuevo evento">
            <form onSubmit={create} className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_170px_minmax(0,1fr)_auto] sm:items-end">
              <Field label="Nombre"><input className={input} name="name" required maxLength={80} placeholder="24 Horas de Jarama" autoFocus /></Field>
              <Field label="Fecha"><input className={input} name="startsOn" type="date" /></Field>
              <Field label="Lugar"><input className={input} name="place" maxLength={80} placeholder="Circuito del Jarama" /></Field>
              <span className="flex gap-2">
                <button className={btn.primary}>Crear</button>
                <button type="button" onClick={() => setCreating(false)} className={btn.ghost}>Cancelar</button>
              </span>
            </form>
            <p className="text-[13px] text-muted">Se crea como borrador: nadie lo ve ni se puede inscribir hasta que lo publiques con su fecha y su línea de meta.</p>
          </Card>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="max-w-full overflow-x-auto"><Segmented value={filter} onChange={setFilter} options={[['all', `Todos · ${rows.length}`],
            ...Object.entries(EVENT_STATES).map(([s, v]) => [s, `${v.label} · ${count(s)}`])]} /></div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar evento o lugar" aria-label="Buscar evento"
            className={`${input} max-w-xs`} />
        </div>
        <Card title={admin ? 'Eventos' : 'Mis eventos'} flush>
          {!list ? <p className="px-4 py-3 text-[14px] text-muted">Cargando…</p>
            : rows.length === 0 ? (
              <div className="flex flex-wrap items-center gap-3 px-4 py-4 text-[14px] text-muted">
                {admin ? 'Aún no hay eventos en la plataforma.' : <>Todavía no tienes eventos. Tardas tres minutos: nombre, pista y publicar.
                  <button onClick={() => setCreating(true)} className={btn.ghost}><Icon name="plus" size={14} />Crear el primero</button></>}
              </div>
            ) : shown.length === 0 ? <p className="px-4 py-3 text-[14px] text-muted">Ningún evento con ese filtro.</p> : (
              <ul>
                {shown.map((e) => (
                  <li key={e.id} className="border-t border-line first:border-t-0">
                    <button onClick={() => go([e.id])}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-raised">
                      {/* El estado: columna propia en pantallas anchas; en el móvil, delante del nombre */}
                      <span className="hidden w-28 shrink-0 sm:block"><StatePill state={e.state} /></span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold"><span className="sm:hidden"><StatePill state={e.state} /></span>{e.name}{e.private && <Pill tone="info">Privado</Pill>}{e.closed && e.state === 'open' && <Pill tone="muted">Cerrado</Pill>}</span>
                        <span className="text-[12px] text-muted">{[fmtDate(e.startsOn) || 'Sin fecha', e.place, `${e.teams} equipo${e.teams === 1 ? '' : 's'}${e.teams ? ` · ${e.racing} participa${e.racing === 1 ? '' : 'n'}` : ''}`, admin && e.organizer].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fg-2">{nextStep(e)}</span>
                      <Icon name="chevron" size={16} className="text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </Card>
      </div>
    </Page>
  );
}

// Lo siguiente que hay que hacer con un evento de la lista.
function nextStep(e) {
  if (e.state === 'draft') { const m = missingToPublish(e); return m.length ? `Falta: ${m.join(' y ')}` : 'Listo para publicar'; }
  if (e.state === 'open') return e.closed ? 'Inscripción cerrada' : `Código ${e.inviteCode}`;
  return e.state === 'today' ? 'Dirigir la carrera' : 'Ver clasificación';
}

function Workspace({ id, tab, admin, go }) {
  const [ev, setEv] = useState(null);
  const [standings, setStandings] = useState([]);
  const [cars, setCars] = useState({}); // equipo → último resumen en vivo
  const trails = useRef({});
  const [focus, setFocus] = useState(null); // equipo seleccionado en el mapa
  const [session, setSession] = useState(null); // sesión de la clasificación (null: la actual del evento)
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [flag, setFlag] = useState(null); // bandera actual del evento y equipos que la han visto
  // run/patch dicen si ha ido bien (BlurInput deshace el cambio si no).
  const run = (p) => p.then((e) => { setEv(e); setError(''); return true; }).catch((e) => { setError(e.message); return false; });
  const patch = (body) => run(api(`/api/events/${id}`, { method: 'PATCH', body }));
  const loadStandings = (s = session) => api(`/api/events/${id}/standings${s ? `?session=${s}` : ''}`).then((r) => setStandings(Object.values(r))).catch(() => {});

  const { socket, connected } = useSocket({
    'event:car': (p) => {
      if (p.gps) {
        const t = (trails.current[p.teamId] ??= []);
        t.push([p.gps.lat, p.gps.lng]);
        if (t.length > TRAIL_MAX) t.shift();
      }
      setCars((c) => ({ ...c, [p.teamId]: p }));
    },
    'event:lap': () => loadStandings(),
    'event:flag': setFlag,
    'event:teams': () => api(`/api/events/${id}`).then(setEv).catch(() => {}),
    connect: () => socket.emit('event:watch', id), // al reconectar, volver a la sala del evento
  });
  useEffect(() => {
    api(`/api/events/${id}`).then(setEv).catch((e) => setError(e.message));
    loadStandings();
    socket.emit('event:watch', id);
    const t = setInterval(() => setNow(Date.now()), 1000);
    const s = setInterval(loadStandings, 30_000);
    return () => { clearInterval(t); clearInterval(s); socket.emit('event:unwatch', id); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = <button onClick={() => go([])} className={btn.ghost}><Icon name="back" size={15} />Eventos</button>;
  if (!ev) return <Page title="Evento" actions={back}>{error ? <ErrorText>{error}</ErrorText> : <p className="text-muted">Cargando…</p>}</Page>;

  const state = eventState(ev);
  const racing = ev.teams.filter((t) => t.racing);
  // Coches para el mapa: clave = equipo (dos equipos pueden llevar el mismo dorsal).
  // Con el icono que cada equipo tenga configurado (null: círculo con el dorsal).
  const icons = Object.fromEntries(ev.teams.map((t) => [t.id, { carIcon: t.carIcon ?? null, carIconStyle: t.carIconStyle }]));
  const mapCars = Object.fromEntries(Object.values(cars).map((p) => [p.teamId, { ...p, key: p.teamId, ...icons[p.teamId] }]));
  const states = Object.fromEntries(Object.values(cars).map((p) => [p.teamId, now - p.ts > STALE_MS ? 'crit' : p.pit ? 'warn' : 'ok']));
  const map = (edit) => <TrackMap cars={mapCars} trails={trails.current} sel={null} states={states} focus={focus} track={ev.track}
    onTrack={edit ? (track) => patch({ track }) : undefined}
    toolbar={<span className="px-1 text-[13px] text-muted">{edit ? 'La misma pista para todos los equipos: dibuja el trazado, la meta y los tramos.' : 'Coches en vivo de los equipos que participan.'}</span>} />;

  return (
    <Page title={ev.name} max="max-w-[1400px]" actions={back}
      subtitle={<span className="flex flex-wrap items-center gap-2"><StatePill state={state} />{[fmtDate(ev.startsOn) || 'Sin fecha', ev.place, admin && ev.organizer && `organiza ${ev.organizer}`].filter(Boolean).join(' · ')}
        {ev.private && <Pill tone="info">Privado</Pill>}</span>}>
      <nav aria-label="Secciones del evento" className="-mt-1 mb-4 flex overflow-x-auto overflow-y-hidden border-b border-line">
        {TABS.map(([t, label]) => (
          <button key={t} onClick={() => go([id, t])} aria-current={t === tab ? 'page' : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] font-semibold uppercase tracking-[0.08em] ${t === tab ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}>
            {label}{t === 'inscritos' && ` · ${ev.teams.length}`}
          </button>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-4">
        <ErrorText>{error}</ErrorText>
        {tab === 'resumen' && <>
          {state === 'draft' && <Publish ev={ev} patch={patch} go={go} />}
          {state !== 'draft' && <ShareCode ev={ev} />}
          {state !== 'draft' && <>
            {/* Fija arriba en pantallas grandes: la bandera se tiene que poder dar sin buscarla (por encima del mapa: Leaflet usa z-index hasta 1000) */}
            <div className="z-[1001] lg:sticky lg:top-0">
              <RaceControl flag={flag} racing={racing} send={async (type, text) => {
                // Sin conexión no se emite: Socket.io la guardaría y la daría al reconectar, quizá minutos tarde.
                if (!connected) throw new Error('Sin conexión: la bandera NO se ha dado.');
                const r = await socket.timeout(3000).emitWithAck('event:flag', { eventId: id, type, text })
                  .catch(() => { throw new Error('El servidor no ha confirmado la bandera: puede que no haya llegado.'); });
                if (!r?.ok) throw new Error('El servidor no ha aceptado la bandera.');
              }} />
            </div>
            <SessionSwitch ev={ev} onChange={(s) => { patch({ session: s }); setSession(null); loadStandings(s); }} />
            <Standings rows={standings} ev={ev} session={session} setSession={(s) => { setSession(s); loadStandings(s); }}
              live={(teamId) => { const c = cars[teamId]; return c && now - c.ts < STALE_MS ? c : null; }} now={now} flag={flag}
              onPick={(teamId) => setFocus(cars[teamId]?.gps ? { ...cars[teamId].gps, t: Date.now() } : null)} />
            <Card title="Coches en vivo" flush><div className="h-[520px]">{map(false)}</div></Card>
          </>}
        </>}
        {tab === 'pista' && (
          <Card title="Pista del evento" flush>
            {!ev.track?.line && <p className="border-b border-line bg-warn-soft px-4 py-2 text-[14px] font-semibold text-warn">Falta la línea de meta: sin ella no se cronometra ninguna vuelta. Pulsa «Meta» y marca sus dos extremos en el mapa.</p>}
            <div className="h-[calc(100vh-260px)] min-h-[420px]">{map(true)}</div>
          </Card>
        )}
        {tab === 'inscritos' && <Teams ev={ev} setEv={setEv} state={state} />}
        {tab === 'ajustes' && <Settings ev={ev} admin={admin} patch={patch} run={run} setError={setError} onDeleted={() => go([])} />}
      </div>
    </Page>
  );
}

// Borrador: lo que falta para publicarlo y el botón de publicar (no tiene vuelta atrás).
function Publish({ ev, patch, go }) {
  const missing = missingToPublish(ev);
  const items = [
    ['Nombre', true, 'ajustes'], ['Fecha', !!ev.startsOn, 'ajustes'], ['Línea de meta', !!ev.track?.line, 'pista'],
    ['Trazado del circuito (recomendado: avisa si un coche se sale)', (ev.track?.path?.length ?? 0) >= 3, 'pista', true],
  ];
  return (
    <Card title="Borrador · Publica el evento" tone="border-accent">
      <ul className="flex flex-col gap-1.5">
        {items.map(([label, ok, to, optional]) => (
          <li key={label} className="flex items-center gap-2 text-[14px]">
            <span className={ok ? 'text-ok' : optional ? 'text-muted' : 'text-warn'}><Icon name={ok ? 'check' : 'flag'} size={16} /></span>
            <span className={ok ? '' : 'font-semibold'}>{label}</span>
            {!ok && <button onClick={() => go([ev.id, to])} className="text-[13px] font-semibold text-accent underline">{to === 'pista' ? 'Ir a Pista' : 'Ir a Ajustes'}</button>}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={missing.length > 0} onClick={() => patch({ draft: false })} className={btn.primary}>Publicar evento</button>
        <span className="text-[13px] text-muted">{missing.length ? `Falta: ${missing.join(' y ')}.` : `Saldrá en la lista de eventos${ev.private ? ' (es privado: solo con su código)' : ''} y los equipos podrán inscribirse.`}</span>
      </div>
    </Card>
  );
}

function ShareCode({ ev }) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(ev.inviteCode);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[4px] border border-line bg-panel px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="label">Código de inscripción {ev.closed && <Pill tone="muted">Inscripciones cerradas</Pill>}</div>
        <div className="num text-[26px] font-bold tracking-[0.2em]">{ev.inviteCode}</div>
      </div>
      <button onClick={() => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })} className={btn.ghost}>
        <Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copiado' : 'Copiar enlace'}</button>
      {navigator.share && <button onClick={() => navigator.share({ title: ev.name, text: `Inscribe tu equipo en ${ev.name} con Box Box (código ${ev.inviteCode})`, url: link }).catch(() => {})} className={btn.ghost}><Icon name="share" size={15} />Compartir</button>}
    </div>
  );
}

// Sesión en curso: cambiarla pide confirmación (las vueltas siguientes cuentan en la otra).
function SessionSwitch({ ev, onChange }) {
  const [next, setNext] = useState(null);
  return (
    <div className="flex flex-col gap-2">
      <Segmented label="Sesión en curso" value={next ?? ev.session} onChange={(s) => setNext(s === ev.session ? null : s)} options={SESSIONS} />
      {next && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-[4px] bg-warn-soft px-3 py-2">
          <span className="min-w-0 flex-1 text-[14px] font-semibold text-warn">¿Pasar a {SESSIONS.find(([v]) => v === next)[1]}? Las vueltas desde ahora cuentan en esa sesión.</span>
          <button onClick={() => { onChange(next); setNext(null); }} className={btn.primary}>Sí, cambiar</button>
          <button onClick={() => setNext(null)} className={btn.ghost}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

function Standings({ rows: raw, ev, session, setSession, live, now, flag, onPick }) {
  const [order, setOrder] = useState('best');
  const rows = [...raw].sort(order === 'best'
    ? (a, b) => (a.best ?? Infinity) - (b.best ?? Infinity)
    : (a, b) => b.laps - a.laps || new Date(a.last_at ?? 8.64e15) - new Date(b.last_at ?? 8.64e15));
  const leader = rows[0];
  return (
    <Card title="Clasificación" flush badge={<span className="flex flex-wrap gap-2">
      <Segmented value={session ?? ev.session} onChange={setSession} options={SESSIONS} />
      <Segmented value={order} onChange={setOrder} options={[['best', 'Mejor vuelta'], ['laps', 'Más vueltas']]} />
    </span>}>
      {rows.length === 0 ? <p className="px-4 py-3 text-[14px] text-muted">Aún no hay equipos inscritos. Comparte el código de inscripción.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead className="bg-raised text-left"><tr className="label">
              <th className="px-3 py-2">Pos</th><th className="px-3 py-2">Equipo</th><th className="px-3 py-2 text-right">Vueltas</th>
              <th className="px-3 py-2 text-right">Mejor</th><th className="px-3 py-2 text-right">Dif.</th><th className="px-3 py-2 text-right">Última</th>
              <th className="px-3 py-2">Vuelta en curso</th><th className="px-3 py-2">Estado</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const c = live(r.id);
                const gap = i === 0 ? null : order === 'best' ? (r.best != null && leader.best != null ? fmtDelta(r.best - leader.best) : '—') : `${r.laps - leader.laps} v`;
                return (
                  <tr key={r.id} tabIndex={0} onClick={() => onPick(r.id)} onKeyDown={(e) => e.key === 'Enter' && onPick(r.id)}
                    className={`cursor-pointer border-t border-line hover:bg-raised ${i === 0 && (r.best || r.laps) ? 'bg-ok-soft' : ''}`}>
                    <td className="num px-3 py-2 font-bold">{i + 1}</td>
                    <td className="px-3 py-2"><span className="num mr-1.5 text-muted">#{r.dorsal}</span><b>{r.name}</b>{r.best_driver && <span className="text-[12px] text-muted"> · mejor: {r.best_driver}</span>}</td>
                    <td className="num px-3 py-2 text-right">{r.laps}</td>
                    <td className="num px-3 py-2 text-right font-bold">{fmtLap(r.best)}</td>
                    <td className="num px-3 py-2 text-right text-fg-2">{gap ?? '—'}</td>
                    <td className="num px-3 py-2 text-right">{fmtLap(r.last)}</td>
                    <td className="num px-3 py-2">{c?.lapStartedAt ? fmtLap(Math.max(0, now - c.lapStartedAt)).slice(0, -2) : '—'}</td>
                    <td className="px-3 py-2"><span className="flex items-center gap-1.5">
                      {!r.racing ? <Pill tone="muted">No participa</Pill> : !c ? <Pill tone="muted">Sin señal</Pill> : c.pit ? <Pill tone="warn">Boxes</Pill> : <Pill tone="ok">En pista · {c.driver}</Pill>}
                      {flag && flag.type !== 'green' && r.racing && (flag.seen.includes(r.id)
                        ? <span title="Ha visto la bandera" className="text-ok"><Icon name="check" size={16} /><span className="sr-only">Ha visto la bandera</span></span>
                        : <span title="Aún no ha visto la bandera" className="text-warn"><Icon name="flag" size={16} /><span className="sr-only">Aún no ha visto la bandera</span></span>)}
                    </span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Teams({ ev, setEv, state }) {
  const [filter, setFilter] = useState('all');
  const racing = ev.teams.filter((t) => t.racing).length;
  const shown = ev.teams.filter((t) => filter === 'all' || (filter === 'racing') === t.racing);
  return (
    <Card title={`Equipos inscritos · ${ev.teams.length}`} flush badge={ev.teams.length > 0 &&
      <Segmented value={filter} onChange={setFilter} options={[['all', 'Todos'], ['racing', `Participan · ${racing}`], ['idle', `No participan · ${ev.teams.length - racing}`]]} />}>
      {ev.teams.length === 0 ? <p className="px-4 py-3 text-[14px] text-muted">{state === 'draft' ? 'Publica el evento para que los equipos puedan inscribirse.' : 'Ninguno todavía. Comparte el código de inscripción (en Resumen).'}</p> : (
        <>
          <p className="border-b border-line px-4 py-2 text-[13px] text-muted">Cada equipo elige si participa: los que participan usan la pista del evento, salen en el mapa y reciben las banderas; los demás entrenan por su cuenta.</p>
          <ul>{shown.map((t) => <TeamRow key={t.id} team={t} eventId={ev.id} onChange={setEv} />)}</ul>
        </>
      )}
    </Card>
  );
}

// Ajustes: datos del evento, inscripción y, al final, la zona de peligro.
function Settings({ ev, admin, patch, run, setError, onDeleted }) {
  const [organizers, setOrganizers] = useState([]); // admin: a quién se puede pasar el evento
  useEffect(() => {
    if (admin) api('/api/admin/users').then((u) => setOrganizers(Object.values(u).filter((x) => ['organizer', 'admin'].includes(x.role)))).catch(() => {});
  }, [admin]);
  return (
    <>
      <Card title="Datos del evento">
        {admin && (
          <Field label="Organizador">
            <select className={input} value={ev.organizerId ?? ''} onChange={(e) => patch({ organizerId: Number(e.target.value) })}>
              {ev.organizerId == null && <option value="">— Sin organizador —</option>}
              {organizers.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.email}</option>)}
            </select>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_170px_minmax(0,1fr)]">
          <Field label="Nombre"><BlurInput value={ev.name} maxLength={80} onSave={(name) => patch({ name })} /></Field>
          <Field label="Fecha"><BlurInput type="date" value={ev.startsOn ?? ''} onSave={(startsOn) => patch({ startsOn })} /></Field>
          <Field label="Lugar"><BlurInput value={ev.place} maxLength={80} onSave={(place) => patch({ place })} /></Field>
        </div>
      </Card>
      <Card title="Inscripción">
        <Segmented label="Visibilidad" value={ev.private ? 'private' : 'public'} onChange={(v) => patch({ private: v === 'private' })}
          options={[['public', 'Público · sale en la lista'], ['private', 'Privado · solo con código']]} />
        <Segmented label="Inscripciones" value={ev.closed ? 'closed' : 'open'} onChange={(v) => patch({ closed: v === 'closed' })}
          options={[['open', 'Abiertas'], ['closed', 'Cerradas']]} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14px]">Código <b className="num tracking-[0.15em]">{ev.inviteCode}</b></span>
          <ConfirmButton label="Renovar código" confirm="Sí, renovar" icon={<Icon name="refresh" size={14} />} onConfirm={() => run(api(`/api/events/${ev.id}/invite`, { method: 'POST' }))} />
          <span className="text-[13px] text-muted">El código anterior deja de valer; los equipos ya inscritos no se ven afectados.</span>
        </div>
      </Card>
      <Card title="Zona de peligro" tone="border-crit">
        <div className="flex flex-wrap items-center gap-3">
          <ConfirmButton label="Eliminar evento" confirm="Sí, eliminar" icon={<Icon name="trash" size={14} />}
            onConfirm={() => api(`/api/events/${ev.id}`, { method: 'DELETE' }).then(onDeleted).catch((e) => setError(e.message))} />
          <span className="text-[13px] text-muted">No borra nada de los equipos: siguen como equipos de entrenamiento y sus vueltas conservan el evento en el historial.</span>
        </div>
      </Card>
    </>
  );
}

// Dirección de carrera: la bandera llega a los equipos que participan y sigue activa hasta que se cambia;
// la verde la retira. Cada botón pide un segundo toque para no dar una bandera roja por error, y el servidor
// confirma que la ha dado: si no, se dice bien claro y se puede reintentar.
function RaceControl({ flag, racing, send }) {
  const [armed, setArmed] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(null); // { type, error? }
  const give = (type) => {
    setSending({ type });
    send(type, text)
      .then(() => { setSending(null); if (type === 'text') setText(''); })
      .catch((e) => setSending({ type, error: e.message }));
  };
  const fire = (type) => {
    if (armed !== type) { setArmed(type); setTimeout(() => setArmed((a) => (a === type ? null : a)), 3000); return; }
    setArmed(null);
    give(type);
  };
  const active = flag && flag.type !== 'green';
  const missing = active ? racing.filter((t) => !flag.seen.includes(t.id)) : [];
  const nameOf = (type) => (type === 'text' ? 'El aviso' : FLAG_INFO[type].label);
  const button = (type, label = FLAG_INFO[type].label) => (
    <button type="button" onClick={() => fire(type)}
      className={`flex h-12 items-center justify-center gap-2 rounded-[4px] px-3 text-[15px] font-bold uppercase ${FLAG_INFO[type].cls} ${armed === type ? 'ring-4 ring-fg ring-offset-2 ring-offset-panel' : ''}`}>
      <Icon name="flag" size={16} />{armed === type ? 'Toca otra vez' : label}
    </button>
  );
  return (
    <Card title="Dirección de carrera" badge={active
      ? <Pill tone="warn">{flag.type === 'text' ? 'Aviso' : FLAG_INFO[flag.type].label} · visto por {racing.length - missing.length}/{racing.length}</Pill>
      : <Pill tone="ok">Pista libre</Pill>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {button('green', active ? 'Verde · retirar' : 'Bandera verde')}{button('yellow')}{button('sc')}{button('red')}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) fire('text'); }} className="flex flex-wrap gap-2">
        <input className={`${input} min-w-0 flex-1`} value={text} onChange={(e) => setText(e.target.value)} maxLength={120}
          placeholder="Aviso a todos los pilotos: «Aceite en la curva 3»" />
        <button disabled={!text.trim()} className={armed === 'text' ? btn.dangerSolid : btn.primary}>{armed === 'text' ? 'Toca otra vez' : 'Enviar aviso'}</button>
      </form>
      {sending?.error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-[4px] bg-crit-soft px-3 py-2">
          <span className="min-w-0 flex-1 text-[14px] font-bold text-crit">{nameOf(sending.type)}: {sending.error}</span>
          <button onClick={() => give(sending.type)} className={btn.dangerSolid}><Icon name="refresh" size={14} />Reintentar</button>
          <button onClick={() => setSending(null)} className={btn.ghost}>Cerrar</button>
        </div>
      )}
      {sending && !sending.error && <p role="status" className="text-[13px] font-semibold text-fg-2">Dando {nameOf(sending.type).toLowerCase()}…</p>}
      {active && <p className="text-[13px] text-muted">Activa desde las {new Date(flag.ts).toLocaleTimeString('es-ES')}{flag.type === 'text' && <> · «{flag.text}»</>}.
        {missing.length > 0 && <> <b className="text-warn">Faltan por verla:</b> {missing.map((t) => `#${t.dorsal} ${t.name}`).join(', ')}.</>}</p>}
    </Card>
  );
}

// Un equipo inscrito: sus pilotos (se puede sacar a uno), meter a un piloto registrado por su email y echar
// al equipo del evento (sigue existiendo como equipo de entrenamiento).
function TeamRow({ team: t, eventId, onChange }) {
  const [adding, setAdding] = useState(false);
  const [armed, setArmed] = useState(null); // piloto a punto de sacar (segundo toque para confirmar)
  const [error, setError] = useState('');
  const act = (p) => { setError(''); return p.then((e) => { onChange(e); return true; }).catch((e) => { setError(e.message); return false; }); };
  const add = (e) => {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get('email');
    act(api(`/api/events/${eventId}/teams/${t.id}/members`, { method: 'POST', body: { email } })).then((ok) => ok && setAdding(false));
  };
  return (
    <li className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="num text-muted">#{t.dorsal}</span>
        <b className="text-[15px]">{t.name}</b>
        {t.racing ? <Pill tone="ok">Participando</Pill> : <Pill tone="muted">No participa</Pill>}
        <span className="num text-[12px] text-muted" title="Código del equipo: lo usan sus pilotos para unirse">código {t.inviteCode}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => setAdding(!adding)} className={btn.ghost}><Icon name="plus" size={14} />Añadir piloto</button>
          <ConfirmButton label="Echar del evento" confirm="Sí, echarlo" icon={<Icon name="x" size={14} />}
            onConfirm={() => act(api(`/api/events/${eventId}/teams/${t.id}`, { method: 'DELETE' }))} />
        </span>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        {t.members.length === 0 && <span className="text-[13px] text-muted">Sin pilotos.</span>}
        {t.members.map((m) => (
          <span key={m.id} className={`flex items-center gap-1 rounded-[3px] border py-0.5 pl-2 pr-0.5 text-[13px] ${armed === m.id ? 'border-crit bg-crit-soft text-crit' : 'border-line'}`}>
            {armed === m.id ? `¿Sacar a ${m.name}?` : m.name}
            {armed === m.id
              ? <>
                <button onClick={() => { setArmed(null); act(api(`/api/events/${eventId}/teams/${t.id}/members/${m.id}`, { method: 'DELETE' })); }}
                  className="rounded-[3px] bg-crit-solid px-1.5 text-[12px] font-bold uppercase text-on-crit">Sí</button>
                <button onClick={() => setArmed(null)} className="px-1.5 text-[12px] font-semibold uppercase">No</button>
              </>
              : <button title={`Sacar a ${m.name} del equipo`} aria-label={`Sacar a ${m.name} del equipo`} onClick={() => setArmed(m.id)}
                className="grid h-6 w-6 place-items-center rounded-[3px] text-muted hover:bg-crit-soft hover:text-crit"><Icon name="x" size={13} /></button>}
          </span>
        ))}
      </div>
      {adding && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <Field label="Email del piloto (ya registrado)"><input className={`${input} w-64`} name="email" type="email" required autoFocus /></Field>
          <button className={btn.primary}>Añadir al equipo</button>
          <button type="button" onClick={() => setAdding(false)} className={btn.ghost}>Cancelar</button>
          <p className="basis-full text-[12px] text-muted">Si ya está en otro equipo, sale de él y pasa a este.</p>
        </form>
      )}
    </li>
  );
}

// Campo que guarda al salir de él (o con Enter), solo si ha cambiado. onSave dice si ha ido bien: si no,
// vuelve al valor anterior (el error se muestra arriba).
function BlurInput({ value, onSave, ...p }) {
  const [v, setV] = useState(value);
  const [saved, setSaved] = useState(false);
  useEffect(() => setV(value), [value]);
  const save = async () => {
    if (v === value) return;
    if (await onSave(v)) { setSaved(true); setTimeout(() => setSaved(false), 2000); } else setV(value);
  };
  return (
    <span className="relative block">
      <input {...p} className={input} value={v} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      {saved && <span role="status" className="pointer-events-none absolute right-9 top-1/2 -translate-y-1/2 rounded-[3px] bg-panel px-1 text-[12px] font-semibold text-ok">Guardado ✓</span>}
    </span>
  );
}
