// Eventos (organizadores): la lista con el estado de cada evento, el asistente para crearlos y, al abrir uno,
// su espacio por pestañas. Preparar (pista, inscritos, ajustes) va aparte de correr (Resumen y, a pantalla
// completa, Race Control). La ruta está en la URL: #eventos, #eventos/nuevo, #eventos/12/asistente/2,
// #eventos/12/pista. El organizador no ve los mensajes de los equipos.
import { useEffect, useState } from 'react';
import Icon from '../icons.jsx';
import TrackMap from './TrackMap.jsx';
import { SESSIONS } from './Racing.jsx';
import { useEventLive, FlagPanel, PenaltyPanel, STALE_MS } from './RaceControl.jsx';
import { ResultsTab, liveLink, lapsText } from './Results.jsx';
import { api, inviteLink } from '../lib/session.js';
import { EVENT_STATES, RACE_FORMATS, targetText, eventState, missingToPublish, readiness } from '../lib/events.js';
import { Page, Card, Field, Segmented, Tabs, Empty, IconChip, Tip, ConfirmButton, Pill, ErrorText, input, btn, fmtLap } from './ui.jsx';

const fmtDate = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
// Pestañas del evento: cada una con su icono y color de sección.
const TABS = [
  { id: 'resumen', label: 'Resumen', icon: 'flag', color: 'race' },
  { id: 'pista', label: 'Pista', icon: 'route', color: 'track' },
  { id: 'inscritos', label: 'Inscritos', icon: 'users', color: 'teams' },
  { id: 'resultados', label: 'Resultados', icon: 'chart', color: 'results' },
  { id: 'ajustes', label: 'Ajustes', icon: 'sliders', color: 'data' },
];
const STEPS = ['Datos', 'Pista', 'Inscripción', 'Revisar y publicar'];
const StatePill = ({ state }) => <Pill tone={EVENT_STATES[state].tone}>{state === 'today' && <span className="pulse h-1.5 w-1.5 rounded-full bg-ok" />}{EVENT_STATES[state].label}</Pill>;
const formatText = (ev) => {
  const format = ev.raceFormat ?? 'endurance';
  return [RACE_FORMATS[format].label, targetText(format, ev.raceTarget)].filter(Boolean).join(' · ');
};
const Check = ({ ok, optional }) => <span className={ok ? 'text-ok' : optional ? 'text-muted' : 'text-warn'}><Icon name={ok ? 'check' : 'flag'} size={16} /></span>;

// admin: todos los eventos (no los crea; puede cambiarles el organizador). Si no, los del organizador.
// path: [] la lista; ['nuevo'] o [id, 'asistente', paso] el asistente; [id, pestaña?] el evento.
export default function Events({ admin = false, path = [], onNav }) {
  const go = (p) => onNav(['eventos', ...p].join('/'));
  if (path[0] === 'nuevo' && !admin) return <Wizard step={1} go={go} />;
  const id = Number(path[0]) || null;
  if (id && path[1] === 'asistente') return <Wizard key={id} id={id} step={Math.min(4, Math.max(1, Number(path[2]) || 2))} go={go} />;
  if (id) return <Workspace key={id} id={id} tab={TABS.some((t) => t.id === path[1]) ? path[1] : 'resumen'} admin={admin} go={go} onNav={onNav} />;
  return <EventList admin={admin} go={go} />;
}

function EventList({ admin, go }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  useEffect(() => { api(admin ? '/api/events?all=1' : '/api/events').then(setList).catch((e) => setError(e.message)); }, [admin]);
  const rows = (list ?? []).map((e) => ({ ...e, state: eventState(e) }));
  const count = (s) => rows.filter((e) => e.state === s).length;
  const q = query.trim().toLowerCase();
  const shown = rows.filter((e) => (filter === 'all' || e.state === filter) && (!q || [e.name, e.place, e.organizer].some((s) => s?.toLowerCase().includes(q))));
  // Primero lo de hoy, luego lo próximo (más cercano antes), los borradores y lo terminado (más reciente antes).
  const rank = { today: 0, open: 1, draft: 2, done: 3 };
  shown.sort((a, b) => rank[a.state] - rank[b.state] || (a.state === 'done' ? -1 : 1) * String(a.startsOn ?? '9').localeCompare(String(b.startsOn ?? '9')));
  const create = <button onClick={() => go(['nuevo'])} className={btn.primary}><Icon name="plus" size={15} />Nuevo evento</button>;

  return (
    <Page title={admin ? 'Eventos' : 'Mis eventos'} icon="finish" color="race" max="max-w-[1180px]" actions={!admin && create}
      subtitle={admin ? 'Todos los eventos de la plataforma: ábrelos, cámbiales el organizador, ciérralos o bórralos.'
        : 'Crea el evento, marca la pista y publícalo; los equipos se inscriben desde la lista de eventos o con su código.'}>
      <div className="flex flex-col gap-4">
        <ErrorText>{error}</ErrorText>
        <div className="flex flex-wrap items-center gap-2">
          <div className="max-w-full overflow-x-auto"><Segmented value={filter} onChange={setFilter} options={[['all', `Todos · ${rows.length}`],
            ...Object.entries(EVENT_STATES).map(([s, v]) => [s, `${v.label} · ${count(s)}`])]} /></div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar evento o lugar" aria-label="Buscar evento"
            className={`${input} max-w-xs`} />
        </div>
        <Card title={admin ? 'Eventos' : 'Mis eventos'} icon="finish" color="race" flush>
          {!list ? <p className="px-4 py-3 text-[14px] text-muted">Cargando…</p>
            : rows.length === 0 ? (
              <Empty icon="finish" color="race" title={admin ? 'Aún no hay eventos' : 'Crea tu primer evento'} action={!admin && create}>
                {admin ? 'Cuando los organizadores creen eventos, aparecerán aquí.' : 'Tardas tres minutos: datos, pista y publicar. Los equipos se inscriben con su código.'}
              </Empty>
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
                        <span className="text-[12px] text-muted">{[fmtDate(e.startsOn) || 'Sin fecha', e.place,
                          `${e.teams}${e.maxTeams ? `/${e.maxTeams}` : ''} equipo${e.teams === 1 ? '' : 's'}${e.teams ? ` · ${e.racing} participa${e.racing === 1 ? '' : 'n'}` : ''}`, admin && e.organizer].filter(Boolean).join(' · ')}</span>
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

// Asistente de 4 pasos. El paso 1 crea el borrador; los demás lo van completando (todo se guarda al momento,
// así que se puede salir y seguir otro día). A la derecha, la checklist de lo que falta para publicar.
function Wizard({ id, step, go }) {
  const [ev, setEv] = useState(null);
  const [error, setError] = useState('');
  const [sources, setSources] = useState([]); // pistas que se pueden copiar
  const [copies, setCopies] = useState(0); // al copiar una pista, el mapa se monta de nuevo y la encuadra
  useEffect(() => {
    if (!id) return;
    api(`/api/events/${id}`).then(setEv).catch((e) => setError(e.message));
    api(`/api/events/${id}/track-sources`).then((r) => setSources(Object.values(r).filter((x) => typeof x === 'object'))).catch(() => {});
  }, [id]);
  const patch = (body) => api(`/api/events/${id}`, { method: 'PATCH', body }).then((e) => { setEv(e); setError(''); return true; }).catch((e) => { setError(e.message); return false; });
  const to = (n) => go([id, 'asistente', n]);
  const saveData = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { name: f.get('name'), startsOn: f.get('startsOn'), place: f.get('place'), raceFormat: f.get('raceFormat'), raceTarget: f.get('raceFormat') === 'best' || !f.get('raceTarget') ? null : Math.round(Number(f.get('raceTarget')) * (f.get('raceUnit') === 'h' ? 60 : 1)) };
    setError('');
    if (!id) {
      try { const created = await api('/api/events', { method: 'POST', body }); go([created.id, 'asistente', 2]); } catch (err) { setError(err.message); }
    } else if (await patch(body)) to(2);
  };
  useEffect(() => { if (ev && !ev.draft) go([id]); }, [ev?.draft]); // eslint-disable-line react-hooks/exhaustive-deps -- ya publicado: al evento
  if (id && (!ev || !ev.draft)) return <Page title="Nuevo evento" icon="plus" color="race">{error ? <ErrorText>{error}</ErrorText> : <p className="text-muted">Cargando…</p>}</Page>;
  const checks = ev ? readiness(ev).publish : [];
  const missing = ev ? missingToPublish(ev) : ['fecha', 'línea de meta'];
  const footer = (back, next) => (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
      {back && <button type="button" onClick={() => to(step - 1)} className={btn.ghost}><Icon name="back" size={14} />Atrás</button>}
      {id && <button type="button" onClick={() => go([])} className={btn.ghost}>Guardar borrador y salir</button>}
      <span className="ml-auto">{next}</span>
    </div>
  );

  return (
    <Page title={ev?.name ?? 'Nuevo evento'} icon="plus" color="race" max="max-w-[1400px]" subtitle="Se guarda como borrador mientras lo preparas: nadie lo ve hasta que lo publiques."
      actions={<button onClick={() => go([])} className={btn.ghost}><Icon name="back" size={15} />Eventos</button>}>
      <ol className="mb-4 flex flex-wrap gap-x-1 gap-y-2" aria-label="Pasos">
        {STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <li key={label} className="flex items-center gap-1">
              <button disabled={!id || n === step} onClick={() => to(n)} aria-current={n === step ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-[4px] px-2 py-1 text-[13px] font-semibold uppercase tracking-[0.06em] disabled:cursor-default ${n === step ? 'bg-accent-soft text-accent' : n < step ? 'text-fg hover:bg-raised' : 'text-muted hover:bg-raised'}`}>
                <span className={`grid h-6 w-6 place-items-center rounded-full text-[12px] ${n === step ? 'bg-accent text-panel' : 'bg-sunken'}`}>{n}</span>{label}
              </button>
              {n < STEPS.length && <span className="h-px w-6 bg-line-strong" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card title={`${step} · ${STEPS[step - 1]}`} icon={['sliders', 'route', 'users', 'send'][step - 1]} color={['data', 'track', 'teams', 'race'][step - 1]}>
          <ErrorText>{error}</ErrorText>
          {step === 1 && (
            <form onSubmit={saveData} className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_170px_minmax(0,1fr)]">
                <Field label="Nombre"><input className={input} name="name" required maxLength={80} defaultValue={ev?.name} placeholder="24 Horas de Jarama" autoFocus /></Field>
                <Field label="Fecha"><input className={input} name="startsOn" type="date" defaultValue={ev?.startsOn ?? ''} /></Field>
                <Field label="Lugar"><input className={input} name="place" maxLength={80} defaultValue={ev?.place} placeholder="Circuito del Jarama" /></Field>
              </div>
              <FormatFields ev={ev} />
              {footer(false, <button className={btn.primary}>Siguiente<Icon name="chevron" size={15} /></button>)}
            </form>
          )}
          {step === 2 && <>
            {sources.length > 0 && (
              <Field label="Copiar una pista que ya tienes" help="Trae el trazado, la meta y los tramos; después puedes retocarla en el mapa.">
                <select className={input} value="" onChange={(e) => { const s = sources.find((x) => x.key === e.target.value); if (s) patch({ track: s.track }).then((ok) => ok && setCopies((n) => n + 1)); }}>
                  <option value="">— Elige una pista guardada o de otro evento —</option>
                  {sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </Field>
            )}
            {!ev.track?.line && <p className="rounded-[4px] bg-warn-soft px-3 py-2 text-[14px] font-semibold text-warn">Sin meta no se cronometra ninguna vuelta: pulsa «Meta» y marca sus dos extremos en el mapa.</p>}
            <div className="h-[460px] overflow-hidden rounded-[4px] border border-line">
              <TrackMap key={copies} cars={{}} trails={{}} sel={null} states={{}} track={ev.track} onTrack={(track) => patch({ track })}
                toolbar={<span className="px-1 text-[13px] text-muted">Trazado, meta y tramos: la misma pista para todos los equipos.</span>} />
            </div>
            {footer(true, <button onClick={() => to(3)} className={btn.primary}>Siguiente<Icon name="chevron" size={15} /></button>)}
          </>}
          {step === 3 && <>
            <Segmented label="Visibilidad" value={ev.private ? 'private' : 'public'} onChange={(v) => patch({ private: v === 'private' })}
              options={[['public', 'Público · sale en la lista'], ['private', 'Privado · solo con código']]} />
            <Field label="Cupo de equipos" help="Vacío: sin límite. Al llenarse, nadie más se puede inscribir.">
              <BlurInput type="number" min={1} max={500} inputMode="numeric" placeholder="Sin límite" value={ev.maxTeams ?? ''}
                onSave={(v) => patch({ maxTeams: v === '' ? null : Number(v) })} />
            </Field>
            {footer(true, <button onClick={() => to(4)} className={btn.primary}>Siguiente<Icon name="chevron" size={15} /></button>)}
          </>}
          {step === 4 && <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
              <dt className="text-muted">Evento</dt><dd className="font-semibold">{ev.name}</dd>
              <dt className="text-muted">Fecha y lugar</dt><dd>{[fmtDate(ev.startsOn) || 'Sin fecha', ev.place].filter(Boolean).join(' · ')}</dd>
              <dt className="text-muted">Carrera</dt><dd>{formatText(ev)}</dd>
              <dt className="text-muted">Pista</dt><dd>{ev.track?.line ? `Meta marcada${ev.track.path?.length >= 3 ? ' · con trazado' : ''}${ev.track.sectors?.length ? ` · ${ev.track.sectors.length + 1} tramos` : ''}${ev.track.pitOut ? ' · con calle de boxes' : ''}` : 'Sin meta'}</dd>
              <dt className="text-muted">Inscripción</dt><dd>{ev.private ? 'Privada, con código' : 'Pública'} · {ev.maxTeams ? `cupo de ${ev.maxTeams} equipos` : 'sin cupo'}</dd>
            </dl>
            {footer(true, <button disabled={missing.length > 0} onClick={() => patch({ draft: false }).then((ok) => ok && go([id]))} className={btn.primary}>Publicar evento</button>)}
            <p className="text-[13px] text-muted">{missing.length ? `Para publicarlo falta: ${missing.join(' y ')}.` : `Al publicarlo ${ev.private ? 'podrán inscribirse con el código' : 'saldrá en la lista de eventos'} y tendrás el código para compartir.`}</p>
          </>}
        </Card>
        <Card title="Evento listo" icon="check" color="teams" tip="Lo obligatorio para publicar va en ámbar hasta que esté hecho; lo opcional, en gris.">
          <ul className="flex flex-col gap-2">
            {(ev ? checks : readiness({}).publish).map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-[14px]">
                <Check ok={c.ok && !!ev} optional={!c.required} />
                <button disabled={!id} onClick={() => to(c.step)} className={`text-left disabled:cursor-default ${c.ok ? '' : 'font-semibold'} ${id ? 'hover:underline' : ''}`}>{c.label}{!c.required && !c.ok && <span className="font-normal text-muted"> · opcional</span>}</button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}

function Workspace({ id, tab, admin, go, onNav }) {
  const L = useEventLive(id);
  const [focus, setFocus] = useState(null); // coche seleccionado en el mapa
  const { ev, now } = L;
  const back = <button onClick={() => go([])} className={btn.ghost}><Icon name="back" size={15} />Eventos</button>;
  if (!ev) return <Page title="Evento" icon="finish" color="race" actions={back}>{L.error ? <ErrorText>{L.error}</ErrorText> : <p className="text-muted">Cargando…</p>}</Page>;

  const state = eventState(ev);
  const racing = ev.teams.filter((t) => t.racing);
  // Coches para el mapa: clave = equipo (dos equipos pueden llevar el mismo dorsal).
  // Con el icono que cada equipo tenga configurado (null: círculo con el dorsal).
  const icons = Object.fromEntries(ev.teams.map((t) => [t.id, { carIcon: t.carIcon ?? null, carIconStyle: t.carIconStyle }]));
  const mapCars = Object.fromEntries(Object.values(L.cars).map((p) => [p.teamId, { ...p, key: p.teamId, ...icons[p.teamId] }]));
  const states = Object.fromEntries(Object.values(L.cars).map((p) => [p.teamId, now - p.ts > STALE_MS ? 'crit' : p.pit ? 'warn' : 'ok']));
  const map = (edit) => <TrackMap cars={mapCars} trails={L.trails.current} sel={null} states={states} focus={focus} track={ev.track}
    onTrack={edit ? (track) => L.patch({ track }) : undefined}
    toolbar={<span className="px-1 text-[13px] text-muted">{edit ? 'La misma pista para todos los equipos: trazado, meta, tramos y calle de boxes.' : 'Coches en vivo de los equipos que participan.'}</span>} />;
  const control = state !== 'draft' && (
    <button onClick={() => onNav(`control/${id}`)} className={state === 'today' ? btn.primary : btn.ghost}><Icon name="flag" size={15} />Race Control</button>
  );

  return (
    <Page title={ev.name} icon="finish" color="race" max="max-w-[1400px]" actions={<span className="flex flex-wrap gap-2">{control}{back}</span>}
      subtitle={<span className="flex flex-wrap items-center gap-2"><StatePill state={state} />{[fmtDate(ev.startsOn) || 'Sin fecha', ev.place, admin && ev.organizer && `organiza ${ev.organizer}`].filter(Boolean).join(' · ')}
        {ev.private && <Pill tone="info">Privado</Pill>}</span>}
      hero={<EventStats ev={ev} racing={racing.length} cars={L.cars} now={now} />}
      nav={<Tabs label="Secciones del evento" value={tab} onChange={(t) => go([id, t])}
        items={TABS.filter((t) => t.id !== 'resultados' || state !== 'draft').map((t) => (t.id === 'inscritos' ? { ...t, count: `${ev.teams.length}${ev.maxTeams ? `/${ev.maxTeams}` : ''}` } : t))} />}>
      <div className="flex min-w-0 flex-col gap-4">
        <ErrorText>{L.error}</ErrorText>
        {tab === 'resumen' && <>
          {state === 'draft' && <Publish ev={ev} patch={L.patch} go={go} />}
          {state !== 'draft' && <ShareCode ev={ev} />}
          {(state === 'open' || state === 'today') && <RaceDay ev={ev} cars={L.cars} log={L.log} now={now} />}
          {state !== 'draft' && (
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="flex min-w-0 flex-col gap-4">
                <Standings rows={L.standings} ev={ev} session={L.session} setSession={L.setSession} live={L.live} now={now} flag={L.flag}
                  onPick={(teamId) => setFocus(L.cars[teamId]?.gps ? { ...L.cars[teamId].gps, t: Date.now() } : null)} />
                <Card title="Coches en vivo" icon="pin" color="track" subtitle="Toca un equipo en la clasificación para ir a su coche." flush><div className="h-[420px] sm:h-[520px]">{map(false)}</div></Card>
              </div>
              <div className="flex min-w-0 flex-col gap-4">
                {/* Para dirigir la carrera, mejor Race Control (pantalla completa y atajos); aquí, a mano para probar */}
                <Card title="Dirección de carrera" icon="flag" color="race" tip="Las banderas llegan al instante a todos los equipos que participan: a pantalla completa y con voz en Piloto. Para el día de carrera, mejor Race Control (pantalla completa y atajos de teclado).">
                  <FlagPanel flag={L.flag} racing={racing} send={L.sendFlag} connected={L.connected} />
                </Card>
                <Card title="Sesión" icon="timer" color="results"><SessionSwitch ev={ev} onChange={L.changeSession} /></Card>
                <Card title="Sanciones a equipos" icon="alert" color="danger"><PenaltyPanel ev={ev} penalties={L.penalties} onChange={L.setPenalties} /></Card>
              </div>
            </div>
          )}
        </>}
        {tab === 'pista' && (
          <Card title="Pista del evento" icon="route" color="track" subtitle="Trazado, meta, tramos y calle de boxes: la misma pista para todos los equipos." flush>
            {!ev.track?.line && <p className="border-b border-line bg-warn-soft px-4 py-2 text-[14px] font-semibold text-warn">Falta la línea de meta: sin ella no se cronometra ninguna vuelta. Pulsa «Meta» y marca sus dos extremos en el mapa.</p>}
            <div className="h-[calc(100vh-260px)] min-h-[420px]">{map(true)}</div>
          </Card>
        )}
        {tab === 'inscritos' && <Teams ev={ev} setEv={L.setEv} state={state} />}
        {tab === 'resultados' && <ResultsTab ev={ev} />}
        {tab === 'ajustes' && <Settings ev={ev} admin={admin} patch={L.patch} run={L.run} setError={L.setError} onDeleted={() => go([])} />}
      </div>
    </Page>
  );
}

// Portada del evento: los números del día de un vistazo.
function EventStats({ ev, racing, cars, now }) {
  const live = Object.values(cars).filter((c) => now - c.ts < STALE_MS).length;
  const stat = (icon, color, value, label) => (
    <div className="flex items-center gap-2.5"><IconChip icon={icon} color={color} />
      <div><div className="num text-[17px] font-bold leading-none sm:text-[20px]">{value}</div><div className="label mt-0.5">{label}</div></div></div>
  );
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3">
      {stat('users', 'teams', `${ev.teams.length}${ev.maxTeams ? `/${ev.maxTeams}` : ''}`, 'Inscritos')}
      {stat('flag', 'race', racing, 'Participan')}
      {stat('signal', 'track', live, 'Con señal')}
      {stat('finish', 'results', formatText(ev), `Sesión: ${SESSIONS.find(([v]) => v === ev.session)?.[1]}`)}
    </div>
  );
}

// Borrador: lo que falta para publicarlo y el botón de publicar (no tiene vuelta atrás).
function Publish({ ev, patch, go }) {
  const missing = missingToPublish(ev);
  const checks = readiness(ev).publish;
  const step = checks.find((c) => c.required && !c.ok)?.step ?? 4;
  return (
    <Card title="Borrador · Publica el evento" icon="send" color="data" subtitle="Nadie lo ve hasta que lo publiques.">
      <ul className="flex flex-col gap-1.5">
        {checks.map((c) => (
          <li key={c.key} className="flex items-center gap-2 text-[14px]">
            <Check ok={c.ok} optional={!c.required} /><span className={c.ok ? '' : 'font-semibold'}>{c.label}</span>
            {!c.ok && <button onClick={() => go([ev.id, c.tab])} className="text-[13px] font-semibold text-accent underline">{c.tab === 'pista' ? 'Ir a Pista' : 'Ir a Ajustes'}</button>}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={missing.length > 0} onClick={() => patch({ draft: false })} className={btn.primary}>Publicar evento</button>
        <button onClick={() => go([ev.id, 'asistente', step])} className={btn.ghost}>Seguir con el asistente</button>
        <span className="text-[13px] text-muted">{missing.length ? `Falta: ${missing.join(' y ')}.` : `Saldrá en la lista de eventos${ev.private ? ' (es privado: solo con su código)' : ''} y los equipos podrán inscribirse.`}</span>
      </div>
    </Card>
  );
}

// Antes de la salida: quién participa, quién tiene señal y si la bandera de prueba ha llegado a todos.
function RaceDay({ ev, cars, log, now }) {
  const [reminded, setReminded] = useState({}); // equipo → ya avisado
  const [error, setError] = useState('');
  const items = readiness(ev, { cars, log, now }).raceDay;
  const remind = (t) => api(`/api/events/${ev.id}/teams/${t.id}/remind`, { method: 'POST' })
    .then(() => setReminded((r) => ({ ...r, [t.id]: true }))).catch((e) => setError(e.message));
  return (
    <Card title="Día de carrera · Comprobaciones" icon="check" color="teams" tip="Para la bandera de prueba: da una amarilla y espera a que todos la vean; después, la verde. Ese día, no despliegues cambios en el servidor.">
      <ErrorText>{error}</ErrorText>
      <ul className="flex flex-col gap-2">
        {items.map((c) => (
          <li key={c.key} className="flex flex-wrap items-center gap-2 text-[14px]">
            <Check ok={c.ok} /><span className={c.ok ? '' : 'font-semibold'}>{c.label}</span>
            {c.teams?.map((t) => (
              <button key={t.id} onClick={() => remind(t)} disabled={reminded[t.id]} className={`${btn.ghost} h-7 px-2 text-[12px]`}>
                {reminded[t.id] ? <><Icon name="check" size={12} />Avisado #{t.dorsal}</> : <>Recordar a #{t.dorsal}</>}
              </button>
            ))}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ShareCode({ ev }) {
  const [copied, setCopied] = useState(false);
  const link = inviteLink(ev.inviteCode);
  return (
    <div className="rise flex flex-wrap items-center gap-3 rounded-[8px] border border-line border-l-4 border-l-[var(--t-teams)] bg-panel px-4 py-3">
      <IconChip icon="key" color="teams" size="h-10 w-10" iconSize={18} />
      <div className="min-w-[180px] flex-1">
        <div className="label flex flex-wrap items-center gap-1.5">Código de inscripción {ev.closed && <Pill tone="muted">Inscripciones cerradas</Pill>}{ev.maxTeams && ev.teams.length >= ev.maxTeams && <Pill tone="warn">Completo</Pill>}</div>
        <div className="num text-[26px] font-bold tracking-[0.2em] text-[var(--t-teams)]">{ev.inviteCode}</div>
      </div>
      <button onClick={() => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })} className={btn.ghost}>
        <Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copiado' : 'Copiar enlace'}</button>
      {navigator.share && <button onClick={() => navigator.share({ title: ev.name, text: `Inscribe tu equipo en ${ev.name} con Box Box (código ${ev.inviteCode})`, url: link }).catch(() => {})} className={btn.ghost}><Icon name="share" size={15} />Compartir</button>}
      {ev.publicCode && <a href={liveLink(ev.publicCode)} target="_blank" rel="noreferrer" className={`${btn.ghost} border-[var(--t-live)] text-[var(--t-live)]`} title="Clasificación en directo, sin cuenta: para equipos y público">
        <Icon name="play" size={15} />Directo público</a>}
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

// Clasificación ya ordenada por el servidor según el formato (entrenamiento: mejor vuelta; carrera: el del evento).
function Standings({ rows, ev, session, setSession, live, now, flag, onPick }) {
  const shown = session ?? ev.session;
  return (
    <Card title="Clasificación" subtitle={shown === 'race' ? formatText(ev) : 'Por mejor vuelta'} icon="chart" color="results" flush
      tip="El orden lo marca el formato del evento (Ajustes → Carrera). Las vueltas de sanción ya están restadas: «48 (−2)»."
      badge={<Segmented value={shown} onChange={setSession} options={SESSIONS} />}>
      {rows.length === 0 ? <Empty icon="users" color="teams" title="Aún no hay equipos">Comparte el código de inscripción para que se apunten.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead className="bg-raised text-left"><tr className="label">
              <th className="px-3 py-2">Pos</th><th className="px-3 py-2">Equipo</th><th className="px-3 py-2 text-right">Vueltas</th>
              <th className="hidden px-3 py-2 text-right sm:table-cell">Mejor</th><th className="px-3 py-2 text-right">Dif.</th><th className="hidden px-3 py-2 text-right md:table-cell">Última</th>
              <th className="hidden px-3 py-2 lg:table-cell">En curso</th><th className="px-3 py-2">Estado</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const c = live(r.id);
                return (
                  <tr key={r.id} tabIndex={0} onClick={() => onPick(r.id)} onKeyDown={(e) => e.key === 'Enter' && onPick(r.id)}
                    className={`cursor-pointer border-t border-line hover:bg-raised ${i === 0 && (r.best || r.laps) ? 'bg-ok-soft' : ''}`}>
                    <td className="px-3 py-2"><span className={`num grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold ${r.pos === 1 ? 'bg-[var(--t-results)] text-panel' : r.pos ? 'bg-sunken' : 'bg-crit-soft text-crit'}`}>{r.pos ?? 'RET'}</span></td>
                    <td className="max-w-[180px] px-3 py-2 sm:max-w-none"><div className="truncate"><span className="num mr-1.5 font-semibold text-fg-2">#{r.dorsal}</span><b>{r.name}</b></div>{r.best_driver && <div className="truncate text-[12px] text-fg-2">mejor: {r.best_driver}</div>}</td>
                    <td className="num px-3 py-2 text-right">{lapsText({ laps: r.eff, pen: r.pen })}</td>
                    <td className="num hidden px-3 py-2 text-right font-bold sm:table-cell">{fmtLap(r.best)}</td>
                    <td className="num whitespace-nowrap px-3 py-2 text-right text-fg-2">{r.gap || '—'}</td>
                    <td className="num hidden px-3 py-2 text-right md:table-cell">{fmtLap(r.last)}</td>
                    <td className="num hidden px-3 py-2 lg:table-cell">{c?.lapStartedAt ? fmtLap(Math.max(0, now - c.lapStartedAt)).slice(0, -2) : '—'}</td>
                    <td className="px-3 py-2"><span className="flex items-center gap-1.5">
                      {!r.racing ? <Pill tone="muted">No participa</Pill> : !c ? <Pill tone="muted">Sin señal</Pill> : c.pit ? <Pill tone="warn">Boxes</Pill> : <Pill tone="ok"><span className="hidden sm:inline">En pista · </span>{c.driver}</Pill>}
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
    <Card title={`Equipos inscritos · ${ev.teams.length}${ev.maxTeams ? ` de ${ev.maxTeams}` : ''}`} icon="users" color="teams" flush
      tip="Cada equipo elige si participa: los que participan usan la pista del evento, salen en el mapa y reciben las banderas; los demás entrenan por su cuenta." badge={ev.teams.length > 0 &&
      <Segmented value={filter} onChange={setFilter} options={[['all', 'Todos'], ['racing', `Participan · ${racing}`], ['idle', `No participan · ${ev.teams.length - racing}`]]} />}>
      {ev.teams.length === 0 ? <p className="px-4 py-3 text-[14px] text-muted">{state === 'draft' ? 'Publica el evento para que los equipos puedan inscribirse.' : 'Ninguno todavía. Comparte el código de inscripción (en Resumen).'}</p> : (
        <>
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
    if (admin) api('/api/admin/users?role=staff&per=500').then((r) => setOrganizers(r.rows)).catch(() => {});
  }, [admin]);
  return (
    <>
      <Card title="Datos del evento" icon="sliders" color="data">
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
      <Card title="Carrera" icon="finish" color="race" subtitle="Cómo se ordena la clasificación y cuánto dura.">
        <FormatFields ev={ev} patch={patch} />
      </Card>
      <Card title="Retransmisión y directo público" icon="play" color="live" subtitle="Lo que ve el público sin cuenta: vídeo, mapa y clasificación.">
        <Field label="Vídeo en directo" help="Enlace del directo en YouTube, Twitch, Kick u otra web (https). Se ve en el directo público, junto al mapa y la clasificación.">
          <BlurInput type="url" maxLength={300} placeholder="https://www.youtube.com/watch?v=…" value={ev.videoUrl ?? ''} onSave={(videoUrl) => patch({ videoUrl })} />
        </Field>
        {ev.publicCode && <p className="text-[14px]">Enlace para el público (sin cuenta): <a href={liveLink(ev.publicCode)} target="_blank" rel="noreferrer" className="num font-semibold text-accent underline">{liveLink(ev.publicCode)}</a></p>}
      </Card>
      <Card title="Inscripción" icon="key" color="teams" subtitle="Quién puede apuntarse y cuántos.">
        <Segmented label="Visibilidad" value={ev.private ? 'private' : 'public'} onChange={(v) => patch({ private: v === 'private' })}
          options={[['public', 'Público · sale en la lista'], ['private', 'Privado · solo con código']]} />
        <Segmented label="Inscripciones" value={ev.closed ? 'closed' : 'open'} onChange={(v) => patch({ closed: v === 'closed' })}
          options={[['open', 'Abiertas'], ['closed', 'Cerradas']]} />
        <Field label="Cupo de equipos" help="Vacío: sin límite. Al llenarse, nadie más se puede inscribir (los ya inscritos siguen).">
          <span className="max-w-40"><BlurInput type="number" min={1} max={500} inputMode="numeric" placeholder="Sin límite" value={ev.maxTeams ?? ''}
            onSave={(v) => patch({ maxTeams: v === '' ? null : Number(v) })} /></span>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14px]">Código <b className="num tracking-[0.15em]">{ev.inviteCode}</b></span>
          <ConfirmButton label="Renovar código" confirm="Sí, renovar" icon={<Icon name="refresh" size={14} />} onConfirm={() => run(api(`/api/events/${ev.id}/invite`, { method: 'POST' }))} />
          <span className="text-[13px] text-muted">El código anterior deja de valer; los equipos ya inscritos no se ven afectados.</span>
        </div>
      </Card>
      <Card title="Zona de peligro" icon="trash" color="danger">
        <div className="flex flex-wrap items-center gap-3">
          <ConfirmButton label="Eliminar evento" confirm="Sí, eliminar" icon={<Icon name="trash" size={14} />}
            onConfirm={() => api(`/api/events/${ev.id}`, { method: 'DELETE' }).then(onDeleted).catch((e) => setError(e.message))} />
          <span className="text-[13px] text-muted">No borra nada de los equipos: siguen como equipos de entrenamiento y sus vueltas conservan el evento en el historial.</span>
        </div>
      </Card>
    </>
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
        <span className="num font-semibold text-fg-2">#{t.dorsal}</span>
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

// Formato de la carrera y su duración (en minutos u horas; se guarda en minutos) o vueltas. Con `patch`, se guarda
// al momento (Ajustes); sin él, son campos del formulario del asistente (raceFormat, raceTarget, raceUnit).
function FormatFields({ ev, patch }) {
  const [format, setFormat] = useState(ev?.raceFormat ?? 'endurance');
  const [unit, setUnit] = useState(ev?.raceTarget >= 60 && ev.raceTarget % 30 === 0 ? 'h' : 'min');
  const f = RACE_FORMATS[format];
  const k = format === 'endurance' && unit === 'h' ? 60 : 1; // minutos por unidad mostrada
  const shown = ev?.raceTarget ? String(ev.raceTarget / k) : '';
  const pick = (v) => { setFormat(v); if (patch) patch({ raceFormat: v, ...(v === 'best' && { raceTarget: null }) }); };
  const numProps = { type: 'number', min: k === 60 ? 0.5 : 1, step: k === 60 ? 0.5 : 1, max: 10000, inputMode: 'decimal', placeholder: 'Sin fijar' };
  return (
    <div className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="raceFormat" value={format} />
      <input type="hidden" name="raceUnit" value={format === 'endurance' ? unit : ''} />
      <Segmented label="Formato de la carrera" value={format} onChange={pick} options={Object.entries(RACE_FORMATS).map(([k, v]) => [k, v.label])} />
      {f.unit && (
        <Field label={format === 'endurance' ? 'Duración' : 'Vueltas'}>
          <span className="flex items-center gap-2">
            <span className="block w-28">{patch
              ? <BlurInput key={unit} {...numProps} value={shown} onSave={(v) => patch({ raceTarget: v === '' ? null : Math.round(Number(v) * k) })} />
              : <input key={unit} className={input} name="raceTarget" {...numProps} defaultValue={shown} />}</span>
            {format === 'endurance' && <Segmented value={unit} onChange={setUnit} options={[['min', 'Minutos'], ['h', 'Horas']]} />}
          </span>
        </Field>
      )}
      <p className="flex basis-full items-center gap-1.5 text-[13px] text-muted">{f.help}<Tip>El entrenamiento siempre va por mejor vuelta.{format === 'endurance' && ' Con la duración, Race Control y el directo público cuentan el tiempo que queda.'}</Tip></p>
    </div>
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
