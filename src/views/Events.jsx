// Eventos (organizadores): crear eventos con su pista, compartir el código de inscripción, ver los equipos,
// la clasificación y el mapa con todos los coches en vivo. El organizador no ve los mensajes de los equipos.
import { useEffect, useRef, useState } from 'react';
import Icon from '../icons.jsx';
import TrackMap from './TrackMap.jsx';
import { api, inviteLink } from '../lib/session.js';
import { useSocket, FLAG_INFO } from '../lib/store.js';
import { Page, Card, Field, Segmented, ConfirmButton, Pill, ErrorText, input, btn, fmtLap, fmtDelta } from './ui.jsx';

const fmtDate = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const STALE_MS = 15000; // sin datos de un coche desde hace más: «sin señal»
const TRAIL_MAX = 300;

// admin: todos los eventos (no los crea; puede cambiarles el organizador). Si no, los del organizador.
export default function Events({ admin = false }) {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [error, setError] = useState('');
  const load = () => api(admin ? '/api/events?all=1' : '/api/events').then((l) => { setList(l); setSel((s) => s ?? l[0]?.id ?? null); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const create = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError('');
    try {
      const ev = await api('/api/events', { method: 'POST', body: { name: f.get('name'), startsOn: f.get('startsOn'), place: f.get('place') } });
      e.target.reset();
      setSel(ev.id);
      load();
    } catch (err) { setError(err.message); }
  };

  return (
    <Page title={admin ? 'Eventos' : 'Mis eventos'} max="max-w-[1400px]"
      subtitle={admin ? 'Todos los eventos de la plataforma: ábrelos, cámbiales el organizador, ciérralos o bórralos.'
        : 'Crea el evento con su pista; los equipos se inscriben desde la lista de eventos o, si es privado, con su código.'}>
      <ErrorText>{error}</ErrorText>
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card title={admin ? 'Eventos' : 'Mis eventos'} flush>
            {list?.length === 0 && <p className="px-4 py-3 text-[13px] text-muted">Aún no has creado ningún evento.</p>}
            <ul>
              {list?.map((e) => (
                <li key={e.id}>
                  <button onClick={() => setSel(e.id)} aria-current={e.id === sel ? 'true' : undefined}
                    className={`flex w-full flex-col items-start gap-0.5 border-t border-line px-4 py-2.5 text-left first:border-t-0 ${e.id === sel ? 'bg-accent-soft' : 'hover:bg-raised'}`}>
                    <span className="flex w-full items-center gap-2 text-[15px] font-semibold">{e.name}
                      <span className="ml-auto flex gap-1">{e.private && <Pill tone="info">Privado</Pill>}{e.closed && <Pill tone="muted">Cerrado</Pill>}</span></span>
                    <span className="text-[12px] text-muted">{[fmtDate(e.startsOn), e.place, `${e.teams} equipo${e.teams === 1 ? '' : 's'}`, admin && e.organizer].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {!admin && <Card title="Nuevo evento">
            <form onSubmit={create} className="flex flex-col gap-3">
              <Field label="Nombre"><input className={input} name="name" required maxLength={80} placeholder="24 Horas de Jarama" /></Field>
              <Field label="Fecha"><input className={input} name="startsOn" type="date" /></Field>
              <Field label="Lugar"><input className={input} name="place" maxLength={80} placeholder="Circuito del Jarama" /></Field>
              <button className={btn.primary}><Icon name="plus" size={15} />Crear evento</button>
            </form>
          </Card>}
        </div>
        {sel ? <EventDetail key={sel} id={sel} admin={admin} onChanged={load} onDeleted={() => { setSel(null); load(); }} />
          : <Card title="Evento"><p className="text-[14px] text-muted">Crea un evento o elige uno de la lista.</p></Card>}
      </div>
    </Page>
  );
}

function EventDetail({ id, admin, onChanged, onDeleted }) {
  const [ev, setEv] = useState(null);
  const [organizers, setOrganizers] = useState([]); // admin: a quién se puede pasar el evento
  useEffect(() => {
    if (admin) api('/api/admin/users').then((u) => setOrganizers(Object.values(u).filter((x) => ['organizer', 'admin'].includes(x.role)))).catch(() => {});
  }, [admin]);
  const [standings, setStandings] = useState([]);
  const [cars, setCars] = useState({}); // equipo → último resumen en vivo
  const trails = useRef({});
  const [focus, setFocus] = useState(null); // equipo seleccionado en el mapa
  const [order, setOrder] = useState('best');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [flag, setFlag] = useState(null); // bandera actual del evento y equipos que la han visto
  const run = (p) => p.then((e) => { setEv(e); onChanged(); }).catch((e) => setError(e.message));
  const patch = (body) => run(api(`/api/events/${id}`, { method: 'PATCH', body }));
  const loadStandings = () => api(`/api/events/${id}/standings`).then((s) => setStandings(Object.values(s))).catch(() => {});

  const { socket } = useSocket({
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

  if (!ev) return <Card title="Evento">{error ? <ErrorText>{error}</ErrorText> : <p className="text-muted">Cargando…</p>}</Card>;

  const live = (teamId) => { const c = cars[teamId]; return c && now - c.ts < STALE_MS ? c : null; };
  const rows = [...standings].sort(order === 'best'
    ? (a, b) => (a.best ?? Infinity) - (b.best ?? Infinity)
    : (a, b) => b.laps - a.laps || new Date(a.last_at ?? 8.64e15) - new Date(b.last_at ?? 8.64e15));
  const leader = rows[0];
  // Coches para el mapa: clave = equipo (dos equipos pueden llevar el mismo dorsal).
  const mapCars = Object.fromEntries(Object.values(cars).map((p) => [p.teamId, { ...p, key: p.teamId }]));
  const states = Object.fromEntries(Object.values(cars).map((p) => [p.teamId, now - p.ts > STALE_MS ? 'crit' : p.pit ? 'warn' : 'ok']));
  const link = inviteLink(ev.inviteCode);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ErrorText>{error}</ErrorText>
      <Card title="Evento" badge={<span className="flex gap-1">{ev.private ? <Pill tone="info">Privado</Pill> : <Pill tone="accent">Público</Pill>}{ev.closed ? <Pill tone="muted">Inscripciones cerradas</Pill> : <Pill tone="ok">Inscripciones abiertas</Pill>}</span>}>
        {admin && (
          <Field label="Organizador">
            <select className={input} value={ev.organizerId ?? ''} onChange={(e) => patch({ organizerId: Number(e.target.value) })}>
              {ev.organizerId == null && <option value="">— Sin organizador —</option>}
              {organizers.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.email}</option>)}
            </select>
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_160px_minmax(0,1fr)]">
          <Field label="Nombre"><BlurInput value={ev.name} maxLength={80} onSave={(name) => patch({ name })} /></Field>
          <Field label="Fecha"><BlurInput type="date" value={ev.startsOn ?? ''} onSave={(startsOn) => patch({ startsOn })} /></Field>
          <Field label="Lugar"><BlurInput value={ev.place} maxLength={80} onSave={(place) => patch({ place })} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-[4px] bg-sunken px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="label">Código de inscripción</div>
            <div className="num text-[26px] font-bold tracking-[0.2em]">{ev.inviteCode}</div>
          </div>
          <button onClick={() => navigator.clipboard?.writeText(link)} className={btn.ghost}><Icon name="copy" size={15} />Copiar enlace</button>
          {navigator.share && <button onClick={() => navigator.share({ title: ev.name, text: `Inscribe tu equipo en ${ev.name} con Box Box (código ${ev.inviteCode})`, url: link }).catch(() => {})} className={btn.ghost}><Icon name="share" size={15} />Compartir</button>}
          <button onClick={() => run(api(`/api/events/${id}/invite`, { method: 'POST' }))} className={btn.ghost}><Icon name="refresh" size={15} />Renovar</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => patch({ closed: !ev.closed })} className={btn.ghost}>{ev.closed ? 'Abrir inscripciones' : 'Cerrar inscripciones'}</button>
          <button onClick={() => patch({ private: !ev.private })} className={btn.ghost}
            title={ev.private ? 'Saldrá en la lista de eventos de los pilotos' : 'Solo se podrán inscribir con el código'}>
            {ev.private ? 'Hacerlo público' : 'Hacerlo privado'}</button>
          <ConfirmButton label="Eliminar evento" confirm="Sí, eliminar" icon={<Icon name="trash" size={14} />}
            onConfirm={() => api(`/api/events/${id}`, { method: 'DELETE' }).then(onDeleted).catch((e) => setError(e.message))} />
        </div>
        <p className="text-[13px] text-muted">Eliminar el evento no borra nada de los equipos: siguen como equipos de entrenamiento y sus vueltas conservan el evento en el historial.</p>
      </Card>

      <RaceControl flag={flag} teams={ev.teams.length} send={(type, text) => socket.emit('event:flag', { eventId: id, type, text })} />

      <Card title="Clasificación" flush badge={<Segmented value={order} onChange={setOrder} options={[['best', 'Mejor vuelta'], ['laps', 'Más vueltas']]} />}>
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
                    <tr key={r.id} onClick={() => setFocus(cars[r.id]?.gps ? { ...cars[r.id].gps, t: Date.now() } : null)}
                      className={`cursor-pointer border-t border-line hover:bg-raised ${i === 0 && (r.best || r.laps) ? 'bg-ok-soft' : ''}`}>
                      <td className="num px-3 py-2 font-bold">{i + 1}</td>
                      <td className="px-3 py-2"><span className="num mr-1.5 text-muted">#{r.dorsal}</span><b>{r.name}</b>{r.best_driver && <span className="text-[12px] text-muted"> · mejor: {r.best_driver}</span>}</td>
                      <td className="num px-3 py-2 text-right">{r.laps}</td>
                      <td className="num px-3 py-2 text-right font-bold">{fmtLap(r.best)}</td>
                      <td className="num px-3 py-2 text-right text-fg-2">{gap ?? '—'}</td>
                      <td className="num px-3 py-2 text-right">{fmtLap(r.last)}</td>
                      <td className="num px-3 py-2">{c?.lapStartedAt ? fmtLap(Math.max(0, now - c.lapStartedAt)).slice(0, -2) : '—'}</td>
                      <td className="px-3 py-2"><span className="flex items-center gap-1.5">
                        {!c ? <Pill tone="muted">Sin señal</Pill> : c.pit ? <Pill tone="warn">Boxes</Pill> : <Pill tone="ok">En pista · {c.driver}</Pill>}
                        {flag && flag.type !== 'green' && (flag.seen.includes(r.id)
                          ? <span title="Ha visto la bandera" className="text-ok"><Icon name="check" size={16} /></span>
                          : <span title="Aún no ha visto la bandera" className="text-warn"><Icon name="flag" size={16} /></span>)}
                      </span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Pista y coches en vivo" flush>
        <div className="h-[520px]">
          <TrackMap cars={mapCars} trails={trails.current} sel={null} states={states} focus={focus} track={ev.track}
            onTrack={(track) => patch({ track })}
            toolbar={<span className="px-1 text-[13px] text-muted">La misma pista para todos los equipos: meta, trazado y tramos.</span>} />
        </div>
      </Card>

      <Card title={`Equipos inscritos · ${ev.teams.length}`} flush>
        {ev.teams.length === 0 ? <p className="px-4 py-3 text-[14px] text-muted">Ninguno todavía.</p> : (
          <ul>
            {ev.teams.map((t) => (
              <TeamRow key={t.id} team={t} eventId={id} onChange={setEv} onError={setError} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// Dirección de carrera: la bandera llega a todos los equipos del evento y sigue activa hasta que se cambia;
// la verde la retira. Cada botón pide un segundo toque para no dar una bandera roja por error.
function RaceControl({ flag, teams, send }) {
  const [armed, setArmed] = useState(null);
  const [text, setText] = useState('');
  const fire = (type) => {
    if (armed !== type) { setArmed(type); setTimeout(() => setArmed((a) => (a === type ? null : a)), 3000); return; }
    setArmed(null);
    send(type, text);
    if (type === 'text') setText('');
  };
  const active = flag && flag.type !== 'green';
  const button = (type, label = FLAG_INFO[type].label) => (
    <button type="button" onClick={() => fire(type)}
      className={`flex h-12 items-center justify-center gap-2 rounded-[4px] px-3 text-[15px] font-bold uppercase ${FLAG_INFO[type].cls} ${armed === type ? 'ring-4 ring-fg ring-offset-2 ring-offset-panel' : ''}`}>
      <Icon name="flag" size={16} />{armed === type ? 'Toca otra vez' : label}
    </button>
  );
  return (
    <Card title="Dirección de carrera" badge={active
      ? <Pill tone="warn">{flag.type === 'text' ? 'Aviso' : FLAG_INFO[flag.type].label} · visto por {flag.seen.length}/{teams}</Pill>
      : <Pill tone="ok">Pista libre</Pill>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {button('green', active ? 'Verde · retirar' : 'Bandera verde')}{button('yellow')}{button('sc')}{button('red')}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) fire('text'); }} className="flex flex-wrap gap-2">
        <input className={`${input} min-w-0 flex-1`} value={text} onChange={(e) => setText(e.target.value)} maxLength={120}
          placeholder="Aviso a todos los pilotos: «Aceite en la curva 3»" />
        <button disabled={!text.trim()} className={armed === 'text' ? btn.dangerSolid : btn.primary}>{armed === 'text' ? 'Toca otra vez' : 'Enviar aviso'}</button>
      </form>
      {active && <p className="text-[13px] text-muted">Activa desde las {new Date(flag.ts).toLocaleTimeString('es-ES')}{flag.type === 'text' && <> · «{flag.text}»</>}. En la clasificación, ✓ = el equipo la ha visto.</p>}
    </Card>
  );
}

// Un equipo inscrito: sus pilotos (se puede sacar a uno), meter a un piloto registrado por su email y echar
// al equipo del evento (sigue existiendo como equipo de entrenamiento).
function TeamRow({ team: t, eventId, onChange, onError }) {
  const [adding, setAdding] = useState(false);
  const [armed, setArmed] = useState(null); // piloto a punto de sacar (segundo toque para confirmar)
  const act = (p) => p.then(onChange).catch((e) => onError(e.message));
  const add = (e) => {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get('email');
    act(api(`/api/events/${eventId}/teams/${t.id}/members`, { method: 'POST', body: { email } })).then(() => setAdding(false));
  };
  return (
    <li className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="num text-muted">#{t.dorsal}</span>
        <b className="text-[15px]">{t.name}</b>
        <span className="num text-[12px] text-muted" title="Código del equipo: lo usan sus pilotos para unirse">código {t.inviteCode}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <button onClick={() => setAdding(!adding)} className={btn.ghost}><Icon name="plus" size={14} />Añadir piloto</button>
          <ConfirmButton label="Echar del evento" confirm="Sí, echarlo" icon={<Icon name="x" size={14} />}
            onConfirm={() => act(api(`/api/events/${eventId}/teams/${t.id}`, { method: 'DELETE' }))} />
        </span>
      </div>
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

// Campo que guarda al salir de él (o con Enter), solo si ha cambiado.
function BlurInput({ value, onSave, ...p }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input {...p} className={input} value={v} onChange={(e) => setV(e.target.value)}
    onBlur={() => v !== value && onSave(v)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />;
}
