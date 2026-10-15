// Race Control (#control/12): la consola del día de carrera a pantalla completa. Torre de tiempos, mapa,
// banderas con atajos de teclado y registro con hora. No hay nada editable ni destructivo: preparar el evento
// se hace en su espacio (#eventos/12). También exporta lo que comparten las dos pantallas: los datos en vivo del
// evento (useEventLive) y el panel de banderas.
import { useEffect, useRef, useState } from 'react';
import Icon from '../icons.jsx';
import TrackMap from './TrackMap.jsx';
import { SESSIONS } from './Racing.jsx';
import { api } from '../lib/session.js';
import { useSocket, FLAG_INFO } from '../lib/store.js';
import { liveLink } from './Results.jsx';
import { Segmented, Pill, ErrorText, ConfirmButton, input, btn, fmtLap, downloadCsv } from './ui.jsx';

export const STALE_MS = 15000; // sin datos de un coche desde hace más: «sin señal»
const TRAIL_MAX = 300;
const sessionName = (s) => SESSIONS.find(([v]) => v === s)?.[1] ?? s;
const hms = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [s / 3600, (s % 3600) / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':'); };
const clock = (ts) => new Date(ts).toLocaleTimeString('es-ES');
// Reloj de la sesión: en una carrera de resistencia con duración, lo que queda; si no, lo que lleva.
export const sessionClock = (ev, now) => {
  if (!ev.sessionStartedAt) return { label: 'Sesión', text: '--:--:--' };
  const left = ev.session === 'race' && ev.raceFormat === 'endurance' && ev.raceTarget;
  return left ? { label: 'Queda', text: hms(ev.raceTarget * 60_000 - (now - ev.sessionStartedAt)) } : { label: 'Sesión', text: hms(now - ev.sessionStartedAt) };
};

// Datos en vivo de un evento para su organizador: el evento, la clasificación, los coches (resumen a 1 Hz),
// la bandera y el registro. sendFlag espera el acuse del servidor y nunca envía sin conexión.
export function useEventLive(id) {
  const [ev, setEv] = useState(null);
  const [standings, setStandings] = useState([]);
  const [session, setSessionView] = useState(null); // sesión que se mira en la clasificación (null: la en curso)
  const [cars, setCars] = useState({}); // equipo → último resumen en vivo
  const trails = useRef({});
  const [flag, setFlag] = useState(null); // bandera actual y equipos que la han visto
  const [log, setLog] = useState([]); // registro, lo más reciente primero
  const [penalties, setPenalties] = useState([]); // sanciones del evento, lo más reciente primero
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const loadEvent = () => api(`/api/events/${id}`).then(setEv).catch((e) => setError(e.message));
  const loadStandings = (s = session) => api(`/api/events/${id}/standings${s ? `?session=${s}` : ''}`).then((r) => setStandings(Object.values(r))).catch(() => {});
  const loadPenalties = () => api(`/api/events/${id}/penalties`).then(setPenalties).catch(() => {});
  const loadLog = () => api(`/api/events/${id}/log`).then((r) => setLog(Object.values(r).filter((x) => typeof x === 'object'))).catch(() => {});

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
    'event:teams': loadEvent,
    'event:penalties': () => { loadPenalties(); loadStandings(); },
    'event:log': (r) => { setLog((l) => [r, ...l]); if (r.kind === 'session') loadEvent(); },
    connect: () => { socket.emit('event:watch', id); loadLog(); }, // al reconectar, volver a la sala y ponerse al día
  });
  useEffect(() => {
    loadEvent();
    loadStandings();
    loadLog();
    loadPenalties();
    socket.emit('event:watch', id);
    const t = setInterval(() => setNow(Date.now()), 1000);
    const s = setInterval(loadStandings, 30_000);
    return () => { clearInterval(t); clearInterval(s); socket.emit('event:unwatch', id); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // run/patch dicen si ha ido bien (para deshacer un campo que no se ha podido guardar).
  const run = (p) => p.then((e) => { setEv(e); setError(''); return true; }).catch((e) => { setError(e.message); return false; });
  const patch = (body) => run(api(`/api/events/${id}`, { method: 'PATCH', body }));
  const sendFlag = async (type, text) => {
    // Sin conexión no se emite: Socket.io la guardaría y la daría al reconectar, quizá minutos tarde.
    if (!connected) throw new Error('Sin conexión: la bandera NO se ha dado.');
    const r = await socket.timeout(3000).emitWithAck('event:flag', { eventId: id, type, text })
      .catch(() => { throw new Error('El servidor no ha confirmado la bandera: puede que no haya llegado.'); });
    if (!r?.ok) throw new Error('El servidor no ha aceptado la bandera.');
  };
  const live = (teamId) => { const c = cars[teamId]; return c && now - c.ts < STALE_MS ? c : null; };
  const setSession = (s) => { setSessionView(s); loadStandings(s); };
  const changeSession = (s) => patch({ session: s }).then((ok) => { if (ok) setSession(null); return ok; });
  return { ev, setEv, standings, session, setSession, changeSession, cars, trails, flag, log, penalties, setPenalties, error, setError, now, connected, run, patch, sendFlag, live };
}

// Botón que actúa al mantenerlo pulsado `ms` (con barra de progreso). Con `hotkey`, también manteniendo esa tecla.
export function HoldButton({ ms = 600, onDone, hotkey, disabled, className = '', children }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef(null);
  const start = () => { if (disabled || timer.current) return; setHolding(true); timer.current = setTimeout(() => { stop(); onDone(); }, ms); };
  const stop = () => { clearTimeout(timer.current); timer.current = null; setHolding(false); };
  useEffect(() => {
    if (!hotkey) return;
    const down = (e) => { if (e.key.toLowerCase() === hotkey && !e.repeat && !typing(e)) start(); };
    const up = (e) => { if (e.key.toLowerCase() === hotkey) stop(); };
    addEventListener('keydown', down); addEventListener('keyup', up);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); };
  });
  return (
    <button type="button" disabled={disabled} className={`relative overflow-hidden disabled:opacity-40 ${className}`}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && start()} onKeyUp={stop}>
      <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-current opacity-25"
        style={{ width: holding ? '100%' : '0%', transition: holding ? `width ${ms}ms linear` : 'none' }} />
      <span className="relative flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}
const typing = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

// Panel de banderas. Verde, amarilla, safety car y cuadros: dos toques (o su tecla dos veces, o tecla + Enter).
// Roja: mantener pulsado (o mantener la R). El servidor confirma cada una: si no, se dice y se puede reintentar.
const ARMED = ['green', 'yellow', 'sc', 'chequered'];
const KEYS = { g: 'green', y: 'yellow', s: 'sc', f: 'chequered' };
export function FlagPanel({ flag, racing, send, connected, keys = false, big = false }) {
  const [armed, setArmed] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(null); // { type, error? }
  const disarm = useRef(null);
  const give = (type) => {
    setArmed(null);
    setSending({ type });
    send(type, text)
      .then(() => { setSending(null); if (type === 'text') setText(''); })
      .catch((e) => setSending({ type, error: e.message }));
  };
  const fire = (type) => {
    if (armed !== type) { setArmed(type); clearTimeout(disarm.current); disarm.current = setTimeout(() => setArmed((a) => (a === type ? null : a)), 3000); return; }
    give(type);
  };
  useEffect(() => {
    if (!keys) return;
    const onKey = (e) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') setArmed(null);
      else if (e.key === 'Enter' && armed) { e.preventDefault(); give(armed); }
      else if (KEYS[e.key.toLowerCase()] && connected) fire(KEYS[e.key.toLowerCase()]);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
  const active = flag && flag.type !== 'green';
  const missing = active ? racing.filter((t) => !flag.seen.includes(t.id)) : [];
  const nameOf = (type) => (type === 'text' ? 'El aviso' : FLAG_INFO[type].label);
  const size = big ? 'h-[72px] text-[18px] lg:h-14 lg:text-[15px]' : 'h-12 text-[15px]';
  const key = (k) => keys && <kbd className="hidden rounded-[3px] border border-current px-1 text-[11px] lg:inline">{k}</kbd>;
  const button = (type, label, k) => (
    <button type="button" onClick={() => fire(type)} disabled={!connected}
      className={`flex items-center justify-center gap-2 rounded-[4px] px-3 font-bold uppercase disabled:opacity-40 ${size} ${FLAG_INFO[type].cls} ${armed === type ? 'ring-4 ring-fg ring-offset-2 ring-offset-panel' : ''}`}>
      <Icon name="flag" size={16} />{armed === type ? 'Toca otra vez' : label}{armed !== type && key(k)}
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div aria-live="polite" className={`rounded-[4px] px-3 py-2 ${active ? FLAG_INFO[flag.type].cls : 'bg-ok-soft text-ok'}`}>
        <div className="flex flex-wrap items-baseline gap-x-2 text-[16px] font-bold uppercase">
          {active ? <>{flag.type === 'text' ? 'Aviso' : FLAG_INFO[flag.type].label}<span className="num text-[13px] font-semibold">desde {clock(flag.ts)}</span></> : 'Pista libre'}
        </div>
        {active && <div className="text-[13px] font-semibold">{flag.type === 'text' && <>«{flag.text}» · </>}Visto por {racing.length - missing.length} de {racing.length}
          {missing.length > 0 && <> · Faltan: {missing.map((t) => `#${t.dorsal} ${t.name}`).join(', ')}</>}</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {button('green', active ? 'Verde · retirar' : 'Verde', 'G')}{button('yellow', 'Amarilla', 'Y')}
        {button('sc', 'Safety car', 'S')}{button('chequered', 'Cuadros', 'F')}
        <HoldButton ms={600} hotkey={keys ? 'r' : null} disabled={!connected} onDone={() => give('red')}
          className={`col-span-2 rounded-[4px] px-3 font-bold uppercase ${size} ${FLAG_INFO.red.cls}`}>
          <Icon name="flag" size={16} />Bandera roja · mantén pulsado{key('R')}
        </HoldButton>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) fire('text'); }} className="flex gap-2">
        <input className={`${input} min-w-0 flex-1`} value={text} onChange={(e) => setText(e.target.value)} maxLength={120}
          placeholder="Aviso a todos: «Aceite en la curva 3»" aria-label="Aviso a todos los pilotos" />
        <button disabled={!text.trim() || !connected} className={armed === 'text' ? btn.dangerSolid : btn.primary}>{armed === 'text' ? 'Otra vez' : 'Enviar'}</button>
      </form>
      {sending?.error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-[4px] bg-crit-soft px-3 py-2">
          <span className="min-w-0 flex-1 text-[14px] font-bold text-crit">{nameOf(sending.type)}: {sending.error}</span>
          <button onClick={() => give(sending.type)} className={btn.dangerSolid}><Icon name="refresh" size={14} />Reintentar</button>
          <button onClick={() => setSending(null)} className={btn.ghost}>Cerrar</button>
        </div>
      )}
      {sending && !sending.error && <p role="status" className="text-[13px] font-semibold text-fg-2">Dando {nameOf(sending.type).toLowerCase()}…</p>}
      {keys && <p className="hidden text-[12px] text-muted lg:block">Teclas: G, Y, S, F y otra vez (o Enter) para dar la bandera; Esc cancela; mantén R para la roja.</p>}
    </div>
  );
}

// Sanciones de la sesión en curso: N vueltas que se restan o retirar al equipo (dos toques). Le llegan al equipo
// como una bandera; se pueden anular si fue un error.
export function PenaltyPanel({ ev, penalties, onChange }) {
  const [teamId, setTeamId] = useState('');
  const [laps, setLaps] = useState('1');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const act = (p) => p.then((r) => { onChange(r); setError(''); return true; }).catch((e) => { setError(e.message); return false; });
  const give = (retired) => act(api(`/api/events/${ev.id}/penalties`, { method: 'POST', body: { teamId: Number(teamId), laps: Number(laps), reason, retired } }))
    .then((ok) => ok && setReason(''));
  const now = penalties.filter((p) => p.session === ev.session);
  const n = Number(laps);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted">Resta vueltas a un equipo en la sesión en curso ({sessionName(ev.session).toLowerCase()}) o retíralo de la carrera.
        Le aparece en Piloto y Box hasta que pulsa «Visto», y sale en el directo público.</p>
      <ErrorText>{error}</ErrorText>
      <label className="flex flex-col gap-1"><span className="label">Equipo</span>
        <select className={input} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">— Elige el equipo —</option>
          {ev.teams.filter((t) => t.racing).map((t) => <option key={t.id} value={t.id}>#{t.dorsal} {t.name}</option>)}
        </select>
      </label>
      <div className="flex gap-2">
        <label className="flex w-28 shrink-0 flex-col gap-1"><span className="label">Vueltas a restar</span>
          <input className={input} type="number" min={1} max={100} inputMode="numeric" value={laps} onChange={(e) => setLaps(e.target.value)} /></label>
        <label className="flex min-w-0 flex-1 flex-col gap-1"><span className="label">Motivo</span>
          <input className={input} value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} placeholder="Saltarse la bandera roja" /></label>
      </div>
      {teamId && (
        <div className="flex flex-wrap gap-2">
          {Number.isInteger(n) && n >= 1 && <ConfirmButton solid label={`Restar ${n} vuelta${n === 1 ? '' : 's'}`} confirm="Sí, sancionar" onConfirm={() => give(false)} />}
          <ConfirmButton label="Retirar de la carrera" confirm="Sí, retirar" onConfirm={() => give(true)} />
        </div>
      )}
      {now.length > 0 && (
        <ul className="flex flex-col border-t border-line text-[13px]">
          {now.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line py-1.5">
              <span className="num text-fg-2">{clock(p.ts)}</span>
              <b>#{p.dorsal} {p.team}</b>
              <span className="font-semibold text-crit">{p.retired ? 'Retirado' : `−${p.laps} v`}</span>
              {p.reason && <span className="min-w-0 truncate text-fg-2">{p.reason}</span>}
              <span className={`ml-auto ${p.seen ? 'text-ok' : 'text-warn'}`}>{p.seen ? 'Visto' : 'Sin ver'}</span>
              <ConfirmButton label="Anular" confirm="Sí, anular" onConfirm={() => act(api(`/api/events/${ev.id}/penalties/${p.id}`, { method: 'DELETE' }))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Texto de una entrada del registro.
export function logText(l) {
  const d = l.data;
  if (l.kind === 'flag') return `${d.type === 'text' ? `Aviso «${d.text}»` : FLAG_INFO[d.type]?.label ?? d.type}${d.by ? ` · ${d.by}` : ''}`;
  if (l.kind === 'seen') return `${d.team} ha visto la bandera${d.by ? ` (${d.by})` : ''}`;
  if (l.kind === 'results') return `Resultado publicado: ${sessionName(d.session)}${d.by ? ` · ${d.by}` : ''}`;
  if (l.kind === 'penalty') return `Sanción a #${d.dorsal} ${d.team}: ${d.retired ? 'retirado' : `${d.laps} vuelta${d.laps === 1 ? '' : 's'}`}${d.reason ? ` («${d.reason}»)` : ''}${d.by ? ` · ${d.by}` : ''}`;
  if (l.kind === 'penalty.cancel') return `Sanción anulada a #${d.dorsal} ${d.team}${d.by ? ` · ${d.by}` : ''}`;
  if (l.kind === 'penalty.seen') return `${d.team} ha visto la sanción${d.by ? ` (${d.by})` : ''}`;
  if (l.kind === 'session') return `${d.restart ? 'Reloj de sesión puesto a cero' : `Sesión → ${sessionName(d.session)}`}${d.by ? ` · ${d.by}` : ''}`;
  return l.kind;
}
// CSV del registro, del más antiguo al más reciente.
const downloadLog = (ev, log) => downloadCsv(`registro-${ev.name}`,
  [['Hora', 'Tipo', 'Detalle'], ...[...log].reverse().map((l) => [new Date(l.ts).toLocaleString('es-ES'), l.kind, logText(l)])]);

// Pantalla completa del navegador y pantalla siempre encendida mientras Race Control está abierto.
function useWakeLock() {
  useEffect(() => {
    let lock = null;
    const get = async () => { if (document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen').catch(() => null); };
    get();
    document.addEventListener('visibilitychange', get);
    return () => { document.removeEventListener('visibilitychange', get); lock?.release(); };
  }, []);
}

export default function RaceControlPage({ path = [], onNav }) {
  const id = Number(path[0]);
  if (!id) return <p className="p-6 text-muted">Abre Race Control desde el evento (Mis eventos → el evento → Race Control).</p>;
  return <Console key={id} id={id} onNav={onNav} />;
}

function Console({ id, onNav }) {
  const L = useEventLive(id);
  const [left, setLeft] = useState('tower'); // por debajo de xl: torre o mapa
  const [focus, setFocus] = useState(null);
  const [full, setFull] = useState(!!document.fullscreenElement);
  useWakeLock();
  useEffect(() => { const f = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f); }, []);
  const { ev, now } = L;
  if (!ev) return <div className="p-6">{L.error ? <ErrorText>{L.error}</ErrorText> : <p className="text-muted">Cargando…</p>}</div>;

  const racing = ev.teams.filter((t) => t.racing);
  const rows = L.standings.filter((r) => r.racing); // ya ordenada por el servidor según el formato de la sesión
  const timer = sessionClock(ev, now);
  const icons = Object.fromEntries(ev.teams.map((t) => [t.id, { carIcon: t.carIcon ?? null, carIconStyle: t.carIconStyle }]));
  const mapCars = Object.fromEntries(Object.values(L.cars).map((p) => [p.teamId, { ...p, key: p.teamId, ...icons[p.teamId] }]));
  const states = Object.fromEntries(Object.values(L.cars).map((p) => [p.teamId, now - p.ts > STALE_MS ? 'crit' : p.pit ? 'warn' : 'ok']));
  const map = <TrackMap cars={mapCars} trails={L.trails.current} sel={null} states={states} focus={focus} track={ev.track} />;
  const other = ev.session === 'race' ? 'practice' : 'race';
  const exit = () => { if (document.fullscreenElement) document.exitFullscreen(); onNav(`eventos/${id}`); };

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-panel px-3 py-1">
        <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">Race Control</span>
        <h1 className="min-w-0 truncate text-[17px] font-bold uppercase tracking-[0.04em]">{ev.name}</h1>
        <Pill tone={ev.session === 'race' ? 'accent' : 'info'}>{sessionName(ev.session)}</Pill>
        <span className="num text-[17px] font-bold" title={timer.label === 'Queda' ? 'Tiempo que queda de carrera' : 'Tiempo desde que empezó la sesión'}>
          {timer.label === 'Queda' && <span className="mr-1 text-[12px] uppercase text-muted">Queda</span>}{timer.text}</span>
        {ev.publicCode && <a href={liveLink(ev.publicCode)} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-accent underline">Directo público</a>}
        <span className="ml-auto flex items-center gap-3 text-[13px]">
          <span className={`flex items-center gap-1.5 font-semibold uppercase ${L.connected ? 'text-ok' : 'text-crit'}`}>
            <span className={`h-2 w-2 rounded-full ${L.connected ? 'bg-ok' : 'pulse bg-crit'}`} />{L.connected ? 'En línea' : 'Sin conexión'}</span>
          <span className="num hidden text-fg-2 sm:inline">{clock(now)}</span>
          {document.documentElement.requestFullscreen && (
            <button onClick={() => (full ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}))} className={btn.ghost}
              title={full ? 'Salir de pantalla completa' : 'Pantalla completa'}><Icon name="fit" size={15} /><span className="hidden md:inline">{full ? 'Salir' : 'Pantalla completa'}</span></button>
          )}
          <button onClick={exit} className={btn.ghost} title="Volver al evento"><Icon name="x" size={15} /><span className="hidden md:inline">Cerrar</span></button>
        </span>
      </header>
      {!L.connected && <div role="alert" className="shrink-0 bg-crit-solid px-3 py-1.5 text-center text-[14px] font-bold uppercase text-on-crit">Sin conexión · las banderas NO se envían hasta que vuelva</div>}
      <ErrorText>{L.error}</ErrorText>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[minmax(0,1fr)_auto] lg:overflow-hidden xl:grid-cols-[400px_minmax(0,1fr)_380px]">
        {/* Banderas: lo primero en el móvil; a la derecha en pantallas grandes */}
        <section className="order-1 flex flex-col gap-3 rounded-[4px] border border-line bg-panel p-3 lg:order-3 lg:overflow-y-auto" aria-label="Banderas">
          <FlagPanel flag={L.flag} racing={racing} send={L.sendFlag} connected={L.connected} keys big />
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <span className="label">Sesión</span>
            <HoldButton ms={1000} onDone={() => L.changeSession(other)} className={`${btn.ghost} h-11 w-full`}>Pasar a {sessionName(other)} · mantén pulsado</HoldButton>
            <HoldButton ms={1000} onDone={() => L.patch({ sessionStart: true })} className={`${btn.ghost} w-full`}>Reloj a cero · mantén pulsado</HoldButton>
            <p className="text-[12px] text-muted">Las vueltas siguientes cuentan en la sesión en curso.</p>
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <span className="label">Sanciones a equipos</span>
            <PenaltyPanel ev={ev} penalties={L.penalties} onChange={L.setPenalties} />
          </div>
        </section>

        <section className="order-2 flex min-h-[320px] flex-col overflow-hidden rounded-[4px] border border-line bg-panel lg:order-1 xl:min-h-0" aria-label="Torre de tiempos">
          <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
            <span className="xl:hidden"><Segmented value={left} onChange={setLeft} options={[['tower', 'Torre'], ['map', 'Mapa']]} /></span>
            <span className="label hidden xl:inline">Torre</span>
            <span className="ml-auto text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{ev.session === 'race' && ev.raceFormat !== 'best' ? 'Por vueltas' : 'Por mejor vuelta'}</span>
          </div>
          {left === 'map' ? <div className="min-h-[360px] flex-1 xl:hidden">{map}</div> : null}
          <div className={`min-h-0 flex-1 overflow-y-auto ${left === 'map' ? 'hidden xl:block' : ''}`}>
            {rows.length === 0 ? <p className="p-3 text-[14px] text-muted">Ningún equipo participa todavía.</p> : (
              <ol>
                {rows.map((r) => {
                  const c = L.live(r.id);
                  const band = !c ? 'bg-line-strong' : c.pit ? 'bg-warn-solid' : 'bg-ok-solid';
                  const notSeen = L.flag && L.flag.type !== 'green' && !L.flag.seen.includes(r.id);
                  const gap = r.gap || fmtLap(r.best);
                  return (
                    <li key={r.id}>
                      <button onClick={() => setFocus(L.cars[r.id]?.gps ? { ...L.cars[r.id].gps, t: Date.now() } : null)}
                        className="flex w-full items-center gap-2 border-b border-line py-1.5 pr-3 text-left text-[14px] hover:bg-raised">
                        <span className={`h-8 w-1.5 shrink-0 ${band}`} title={!c ? 'Sin señal' : c.pit ? 'En boxes' : 'En pista'} />
                        <span className="num w-6 text-right font-bold">{r.pos ?? 'RET'}</span>
                        <span className="num w-9 font-semibold text-fg-2">#{r.dorsal}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{r.name}{c?.driver && <span className="text-[13px] font-medium text-fg-2"> · {c.driver}</span>}</span>
                        {notSeen && <span className="text-warn" title="No ha visto la bandera"><Icon name="flag" size={15} /><span className="sr-only">No ha visto la bandera</span></span>}
                        {r.pen > 0 && <span className="num text-[12px] font-bold text-crit" title="Vueltas de sanción">−{r.pen}</span>}
                        <span className="num w-[88px] text-right font-bold">{gap}</span>
                        <span className="num w-[68px] text-right text-fg-2">{c?.pit ? 'BOX' : fmtLap(r.last)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>

        <section className="order-4 hidden min-h-0 overflow-hidden rounded-[4px] border border-line bg-panel xl:order-2 xl:block" aria-label="Mapa">{map}</section>

        <section className="order-5 flex max-h-56 flex-col overflow-hidden rounded-[4px] border border-line bg-panel lg:col-span-2 xl:col-span-3" aria-label="Registro">
          <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
            <span className="label">Registro</span>
            <button onClick={() => downloadLog(ev, L.log)} disabled={!L.log.length} className={`${btn.ghost} ml-auto h-8`}><Icon name="download" size={14} />Exportar CSV</button>
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto px-3 py-1 text-[13px]">
            {L.log.length === 0 && <li className="py-1 text-muted">Aún no hay nada: aquí quedan las banderas, quién las ve y los cambios de sesión.</li>}
            {L.log.map((l) => <li key={l.id} className="flex gap-3 py-0.5"><span className="num text-fg-2">{clock(l.ts)}</span><span className={l.kind === 'flag' ? 'font-semibold' : ''}>{logText(l)}</span></li>)}
          </ol>
        </section>
      </div>
    </div>
  );
}
