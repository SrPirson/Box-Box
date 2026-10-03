// Vista BOX (portátil en el muro): equipo y vueltas, alarmas por niveles, gauges con media, mapa y mensajería con acuse.
import { Fragment, useEffect, useRef, useState } from 'react';
import Icon from '../icons.jsx';
import TrackMap from './TrackMap.jsx';
import { RacingButton } from './Racing.jsx';
import { useSocket, useLive } from '../lib/store.js';
import { api, setTeam, useSession } from '../lib/session.js';
import { carAlarms, worst, limitsOf, lateMs, fmt, fmtAge, PHONE_HOT } from '../lib/limits.js';
import { useStats, lapAvg, sectorStats } from './Stats.jsx';
import { fmtLap, fmtDelta, fmtSplit, ConfirmButton } from './ui.jsx';

const NO_ACK_MS = 10000; // acuse pendiente → «sin respuesta»
const TRAIL_MAX = 600; // ~2,5 min a 4 Hz
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const hhmmss = (ts) => new Date(ts).toLocaleTimeString('es-ES');

const BAND = { ok: 'bg-ok', warn: 'bg-warn-solid', crit: 'bg-crit-solid' };

export default function Box({ muted }) {
  const [cars, setCars] = useState({});      // dorsal → último paquete
  const trails = useRef({});                   // dorsal → [[lat,lng], ...]
  const [sel, setSel] = useState(null);
  const [log, setLog] = useState([]);
  const [breakdowns, setBreakdowns] = useState([]); // averías sin atender
  const [acked, setAcked] = useState(() => new Set());
  const [focus, setFocus] = useState(null);
  const [now, setNow] = useState(Date.now());
  const { team } = useSession();
  const today = useStats('today');   // vueltas de hoy
  const month = useStats('month');   // medias de referencia (30 días)

  const ingest = (packets) => {
    for (const p of packets) {
      if (!p.gps) continue;
      const t = (trails.current[p.car] ??= []);
      t.push([p.gps.lat, p.gps.lng]);
      if (t.length > TRAIL_MAX) t.shift();
    }
    setCars((c) => {
      const n = { ...c };
      for (const p of packets) if (!n[p.car] || p.ts > n[p.car].ts) n[p.car] = p;
      return n;
    });
    setSel(packets.at(-1)?.car ?? null); // un coche por equipo: siempre el último que ha enviado (sigue al dorsal si cambia)
  };

  const { socket } = useSocket({
    telemetry: (p) => ingest([p]),
    'telemetry:batch': ({ packets }) => ingest(packets.sort((a, b) => a.ts - b.ts)),
    pilot: (e) => {
      setLog((l) => [{ id: uid(), dir: 'in', car: e.car, text: e.label, ts: Date.now(), critical: e.critical }, ...l]);
      if (e.critical) setBreakdowns((b) => [...b, { ...e, id: uid() }]);
    },
    // Vuelta anulada (desde Piloto o desde BOX): fuera el cronómetro y los parciales hasta el próximo cruce de meta.
    notice: ({ text, ts }) => setLog((l) => [{ id: uid(), dir: 'in', car: team.dorsal, text: text.toUpperCase(), ts }, ...l]),
    'lap:reset': ({ by, ts }) => {
      setCars((c) => Object.fromEntries(Object.entries(c).map(([k, p]) => [k, { ...p, lapStartedAt: null, lapSplits: [] }])));
      setLog((l) => [{ id: uid(), dir: 'in', car: team.dorsal, text: `VUELTA ANULADA · ${by}`, ts }, ...l]);
    },
    ack: (a) => setLog((l) => l.map((m) => (m.id === a.id ? { ...m, acks: { ...m.acks, [a.car]: { answer: a.answer, at: Date.now() } } } : m))),
  });

  const send = (text, to) => {
    const m = { id: uid(), to, text: text.trim().toUpperCase(), ts: Date.now() };
    socket.emit('msg', m);
    setLog((l) => [{ ...m, dir: 'out', acks: {} }, ...l]);
  };

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);

  // Alarmas derivadas del último paquete de cada coche (en boxes se callan las propias de una parada).
  const { pit, driver } = useLive();
  const alarms = Object.fromEntries(Object.values(cars).map((p) => [p.car, carAlarms(p, now, !!pit?.arrived)]));
  const states = Object.fromEntries(Object.entries(alarms).map(([c, a]) => [c, worst(a)]));
  const crits = Object.entries(alarms).flatMap(([car, a]) => a.filter((x) => x.level === 'crit').map((x) => ({ ...x, car, id: `${car}:${x.key}` })));
  const unacked = crits.filter((c) => !acked.has(c.id));
  const ackAll = () => setAcked(new Set(crits.map((c) => c.id)));

  // Si la condición desaparece, la alarma se rearma para la próxima vez.
  const activeIds = crits.map((c) => c.id).join();
  useEffect(() => { setAcked((s) => new Set([...s].filter((id) => activeIds.split(',').includes(id)))); }, [activeIds]);

  // Espacio = reconocer (salvo escribiendo o con un botón enfocado).
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName)) { e.preventDefault(); ackAll(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const warnIds = Object.entries(alarms).flatMap(([car, a]) => a.filter((x) => x.level === 'warn' && !x.silent).map((x) => `${car}:${x.key}`)).join();
  useAlarmSound({ critical: unacked.length > 0 || breakdowns.length > 0, warnIds, muted });

  const p = cars[sel];
  return (
    <div className="flex h-full flex-col">
      <AlarmBanner breakdowns={breakdowns} crits={crits} unacked={unacked} onAck={ackAll}
        onLocate={(gps) => setFocus({ ...gps, t: Date.now() })}
        onDone={(id) => setBreakdowns((b) => b.filter((x) => x.id !== id))} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-auto bg-line lg:grid-cols-[220px_minmax(0,1fr)_360px] lg:overflow-hidden 2xl:grid-cols-[260px_minmax(0,1fr)_420px]">
        <TeamColumn team={team} laps={today.data?.laps ?? []} lapStartedAt={cars[sel]?.lapStartedAt} splits={cars[sel]?.lapSplits} now={now}
          onResetLap={() => socket.emit('lap:reset')} />

        <section className="flex flex-col gap-px bg-line lg:min-h-0" aria-label="Telemetría">
          {pit && <PitBar pit={pit} now={now} onArrived={() => socket.emit('pit', 'arrived')} onEnd={() => socket.emit('pit', false)} />}
          {p ? (
            <>
              <CarHeader p={p} driver={driver?.name ?? p.driver} state={states[p.car]} alarms={alarms[p.car]} now={now}
                onPit={!pit && (() => socket.emit('pit', 'arrived'))} />
              {team.obd && <Gauges p={p} stale={lateMs(p, now) > limitsOf(p).staleWarn * 1000} avg={month.data?.metrics} />}
            </>
          ) : <EmptyTelemetry />}
          <div className="min-h-[320px] flex-1 bg-panel">
            <TrackMap cars={cars} trails={trails.current} sel={sel} states={states} focus={focus} track={team.track}
              // Participando en un evento la pista la pone el organizador: se ve, pero no se edita.
              onTrack={team.racing ? undefined : (track) => api('/api/team', { method: 'PATCH', body: { track } }).then(setTeam)}
              toolbar={team.racing
                ? <div className="flex flex-wrap items-center gap-2"><span className="flex items-center gap-1.5 px-1 text-[13px] font-semibold"><Icon name="finish" size={15} className="text-accent" />Pista del evento · {team.event.name}</span><RacingButton /></div>
                : <div className="flex flex-wrap items-center gap-2"><TrackPicker team={team} /><RacingButton /></div>} carIcon={team.carIcon} carIconStyle={team.carIconStyle} />
          </div>
        </section>

        <Messages dorsal={team.dorsal} log={log} now={now} send={send} />
      </div>
    </div>
  );
}

// ── Pistas guardadas: elegir una la aplica al mapa y al cronometraje; editar la activa la guarda sola ──
function TrackPicker({ team }) {
  const [naming, setNaming] = useState(false);
  const [error, setError] = useState('');
  const t = team.track;
  const saved = team.tracks ?? []; // sesiones guardadas antes de existir las pistas no lo traen
  const drawn =!!(t?.line || t?.path || t?.sectors);
  const run = (p) => { setError(''); return p.then(setTeam).catch((e) => setError(e.message)); };
  const saveAs = (e) => {
    e.preventDefault();
    run(api('/api/tracks', { method: 'POST', body: { name: new FormData(e.currentTarget).get('name') } })).then(() => setNaming(false));
  };
  const fresh = () => run(api('/api/team', { method: 'PATCH', body: { track: null } }));
  const small = 'flex h-8 items-center gap-1.5 rounded-[4px] border border-line px-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-2 hover:bg-raised';

  if (naming) return (
    <form onSubmit={saveAs} className="flex items-center gap-2">
      <input name="name" required maxLength={60} autoFocus placeholder="Nombre de la pista" className="h-8 w-44 rounded-[4px] border border-line bg-sunken px-2 text-[14px]" />
      <button className={`${small} border-accent text-accent`}>Guardar</button>
      <button type="button" onClick={() => setNaming(false)} className={small}>Cancelar</button>
      {error && <span className="text-[12px] text-crit">{error}</span>}
    </form>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 rounded-[4px] border border-line pl-2 text-fg-2">
        <Icon name="flag" size={15} /><span className="sr-only">Pista</span>
        <select value={t?.id ?? ''} onChange={(e) => e.target.value && run(api(`/api/tracks/${e.target.value}/apply`, { method: 'POST' }))}
          className="h-8 max-w-48 bg-transparent pr-2 text-[13px] font-semibold text-fg">
          <option value="" disabled>{drawn ? 'Pista sin guardar' : saved.length ? 'Elige una pista…' : 'Sin pistas guardadas'}</option>
          {saved.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {drawn && !t.id && <button onClick={() => setNaming(true)} className={`${small} border-accent text-accent`}><Icon name="plus" size={14} />Guardar pista</button>}
      {/* Una pista guardada no se pierde al empezar otra; una sin guardar sí, así que se confirma */}
      {t?.id || !drawn
        ? drawn && <button onClick={fresh} className={small}><Icon name="plus" size={14} />Nueva</button>
        : <ConfirmButton label="Nueva" confirm="Descartar dibujo" icon={<Icon name="plus" size={14} />} onConfirm={fresh} />}
      {t?.id && <ConfirmButton label="Eliminar" confirm={`Eliminar «${t.name}»`} icon={<Icon name="trash" size={14} />}
        onConfirm={() => run(api(`/api/tracks/${t.id}`, { method: 'DELETE' }))} />}
      {error && <span className="text-[12px] text-crit">{error}</span>}
    </div>
  );
}

// ── Banner de alarmas: averías (con posición) y alarmas críticas con reconocimiento ──
function AlarmBanner({ breakdowns, crits, unacked, onAck, onLocate, onDone }) {
  if (!breakdowns.length && !crits.length) return null;
  return (
    <div role="alert" className="flex shrink-0 flex-col gap-px border-b border-line bg-line">
      {breakdowns.map((b) => (
        <div key={b.id} className="alarm-ring flex flex-wrap items-center gap-x-4 gap-y-2 bg-crit-solid px-4 py-2.5 text-on-crit">
          <Icon name="wrench" size={22} stroke={2.5} />
          <span className="text-xl font-bold uppercase tracking-[0.04em]">Coche #{b.car} · {b.label}</span>
          <span className="num text-sm opacity-90">{hhmmss(b.ts)}</span>
          {b.gps && <span className="num text-sm opacity-90">{b.gps.lat.toFixed(5)}, {b.gps.lng.toFixed(5)}</span>}
          <span className="ml-auto flex gap-2">
            {b.gps && <BannerButton onClick={() => onLocate(b.gps)} icon="pin">Ver en mapa</BannerButton>}
            <BannerButton onClick={() => onDone(b.id)} icon="check">Atendido</BannerButton>
          </span>
        </div>
      ))}
      {crits.length > 0 && (
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 bg-crit-soft px-4 py-2 text-crit ${unacked.length ? 'alarm-ring' : ''}`}>
          <Icon name="alert" size={20} stroke={2.5} />
          <span className="text-[15px] font-bold uppercase tracking-[0.08em]">Crítico</span>
          {crits.map((c) => (
            <span key={c.id} className={`num rounded-[3px] border border-crit px-2 py-0.5 text-[13px] font-semibold ${unacked.some((u) => u.id === c.id) ? 'bg-crit-solid text-on-crit' : ''}`}>
              #{c.car} {c.text}
            </span>
          ))}
          {unacked.length > 0 ? (
            <button onClick={onAck} className="ml-auto flex items-center gap-2 rounded-[4px] bg-crit-solid px-3 py-1.5 text-[13px] font-bold uppercase tracking-[0.08em] text-on-crit">
              Reconocer <kbd className="num rounded-[3px] border border-current/50 px-1 text-[11px]">Espacio</kbd>
            </button>
          ) : <span className="ml-auto text-[13px] font-semibold uppercase tracking-[0.08em]">Reconocida · activa</span>}
        </div>
      )}
    </div>
  );
}
const BannerButton = ({ icon, children, ...p }) => (
  <button {...p} className="flex items-center gap-1.5 rounded-[4px] border-2 border-current px-3 py-1 text-[13px] font-bold uppercase tracking-[0.08em] hover:bg-black/15">
    <Icon name={icon} size={15} stroke={2.5} />{children}
  </button>
);

// ── Columna izquierda: equipo (quién está y quién conduce) + vueltas en vivo ──
function TeamColumn({ team, laps, lapStartedAt, splits = [], now, onResetLap }) {
  const live = useLive();
  const sec = sectorStats(laps, team.track);
  // Parciales de la vuelta en curso: tiempo de cada tramo ya cerrado (de corte a corte).
  const done = splits.map((t, i) => t - (splits[i - 1] ?? 0));
  const avg = lapAvg(laps);
  const last = laps.at(-1);
  const best = laps.reduce((b, l) => (!b || l.ms < b.ms ? l : b), null);
  const members = [...team.members].sort((a, b) => (live.driver?.id === b.id) - (live.driver?.id === a.id) || live.online.includes(b.id) - live.online.includes(a.id));
  return (
    <aside className="flex flex-col bg-panel lg:min-h-0 lg:overflow-y-auto" aria-label="Equipo y vueltas">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="label">Vueltas · hoy</span><span className="num text-[12px] text-muted">{laps.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line">
        <div className="col-span-2 bg-panel px-3 py-2.5">
          <div className="label flex items-center gap-1.5"><Icon name="timer" size={13} />Vuelta en curso
            {lapStartedAt && (
              <button onClick={onResetLap} title="Descarta esta vuelta: la siguiente empieza al cruzar la meta, desde el T1"
                className="ml-auto flex items-center gap-1 rounded-[3px] border border-line px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-2 hover:bg-raised hover:text-fg">
                <Icon name="undo" size={11} />Anular
              </button>
            )}
          </div>
          <div className="num text-[30px] font-bold leading-tight">{lapStartedAt ? fmtLap(Math.max(0, now - lapStartedAt)).slice(0, -2) : '—'}</div>
          {!team.track?.line && !team.track?.path && <div className="text-[12px] leading-snug text-muted">Define la meta o dibuja el trazado en el mapa para cronometrar.</div>}
          {sec.n > 0 && lapStartedAt && (
            <div className="num mt-1.5 grid grid-cols-[auto_1fr_auto] gap-x-2 text-[13px]">
              {sec.per.map((s, i) => (
                <Fragment key={i}>
                  <span className="text-muted">T{i + 1}</span>
                  <span className={i < done.length ? 'font-semibold' : 'text-muted'}>{i < done.length ? fmtSplit(done[i]) : i === done.length ? 'en curso' : '—'}</span>
                  <span>{i < done.length && s.best != null ? <DeltaText ms={done[i] - s.best} /> : ''}</span>
                </Fragment>
              ))}
            </div>
          )}
        </div>
        <LapStat label="Última" value={fmtLap(last?.ms)} sub={last && avg != null && <DeltaText ms={last.ms - avg} />} />
        <LapStat label="Mejor" value={fmtLap(best?.ms)} sub={best?.driver} />
        <LapStat label="Media" value={fmtLap(avg && Math.round(avg))} />
        <LapStat label="Piloto" value={live.driver?.name ?? '—'} small />
      </div>
      {laps.length > 0 && (
        <ol className="border-b border-line">
          {laps.slice(-8).reverse().map((l) => (
            <li key={l.id} className={`num flex flex-wrap items-baseline gap-x-2 border-b border-line px-3 py-1.5 text-[13px] last:border-b-0 ${l.id === best?.id ? 'bg-ok-soft' : ''}`}>
              <span className="w-6 text-muted">{laps.indexOf(l) + 1}</span>
              <span className="font-semibold">{fmtLap(l.ms)}</span>
              <span className="ml-auto"><DeltaText ms={l.ms - avg} /></span>
              {sec.laps.includes(l) && (
                <span className="basis-full pl-8 text-[11px] text-muted">
                  {l.sectors.map((ms, i) => <span key={i} className={`mr-2 ${ms === sec.per[i].best ? 'font-bold text-ok' : ''}`}>{fmtSplit(ms)}</span>)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="label">Equipo</span><span className="num text-[12px] text-muted">{live.online.length}/{team.members.length}</span>
      </div>
      <ul className="flex overflow-x-auto lg:flex-col">
        {members.map((m) => {
          const online = live.online.includes(m.id);
          const driving = live.driver?.id === m.id;
          return (
            <li key={m.id} className={`flex shrink-0 items-center gap-2.5 border-b border-line px-3 py-2 ${online ? '' : 'opacity-60'}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-ok' : 'bg-pending'}`} title={online ? 'Conectado' : 'Desconectado'} />
              <span className="truncate text-[14px] font-semibold">{m.name}</span>
              {driving && <span className="ml-auto flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em] text-ok"><Icon name="wheel" size={13} />Al volante</span>}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
const LapStat = ({ label, value, sub, small }) => (
  <div className="min-w-0 bg-panel px-3 py-2">
    <div className="label">{label}</div>
    <div className={`num truncate font-bold ${small ? 'text-[15px] leading-7' : 'text-[18px]'}`}>{value}</div>
    {sub && <div className="truncate text-[12px] text-muted">{sub}</div>}
  </div>
);
// Más rápido que la media = ▼ verde; más lento = ▲ ámbar.
const DeltaText = ({ ms }) => ms == null || Number.isNaN(ms) ? null : (
  <span className={`num ${ms < 0 ? 'text-ok' : ms > 0 ? 'text-warn' : 'text-muted'}`}>{ms < 0 ? '▼' : ms > 0 ? '▲' : '='} {fmtDelta(ms)}</span>
);

// ── Cabecera del coche seleccionado: estado + datos del móvil ──
// Parada. Viene de camino (el piloto avisó): BOX confirma la llegada y ahí empieza la cuenta.
// En boxes: sin alarmas de señal, batería, régimen ni pista mientras dura.
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const pitBtn = 'rounded-[4px] border-2 border-current px-3 py-1 text-[13px] font-bold uppercase tracking-[0.08em]';
function PitBar({ pit, now, onArrived, onEnd }) {
  if (!pit.arrived) return (
    <div role="status" className="alarm-ring flex flex-wrap items-center gap-x-4 gap-y-2 bg-warn-soft px-4 py-2 text-warn">
      <Icon name="pitIn" size={20} stroke={2.5} />
      <span className="text-[15px] font-bold uppercase tracking-[0.08em]">Viene a boxes</span>
      <span className="text-[13px] font-semibold">{pit.reason} · avisó hace {mmss(now - pit.since)}</span>
      <span className="ml-auto flex gap-2">
        <button onClick={onArrived} className={`${pitBtn} border-transparent bg-warn-solid text-on-warn`}>Coche en boxes</button>
        <button onClick={onEnd} className={pitBtn}>Cancelar</button>
      </span>
    </div>
  );
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-info-soft px-4 py-2 text-info">
      <Icon name="pitIn" size={20} stroke={2.5} />
      <span className="text-[15px] font-bold uppercase tracking-[0.08em]">En boxes</span>
      <span className="num text-[15px] font-bold">{mmss(now - pit.since)}</span>
      <span className="text-[13px] font-semibold">{pit.reason} · sin alarmas de señal, batería ni pista hasta que salga</span>
      <button onClick={onEnd} className={`ml-auto ${pitBtn}`}>Fin de boxes</button>
    </div>
  );
}

function CarHeader({ p, driver, state, alarms, now, onPit }) {
  const stateText = { ok: 'Normal', warn: 'Aviso', crit: 'Crítico' }[state];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-panel px-4 py-2">
      <span className="num text-2xl font-bold">#{p.car}</span>
      {driver && <span className="flex items-center gap-1.5 text-[15px] font-semibold"><Icon name="wheel" size={15} className="text-muted" />{driver}</span>}
      {onPit && <button onClick={onPit} title="Calla las alarmas de una parada (sin señal, batería, pista) hasta que el coche salga"
        className="flex items-center gap-1.5 rounded-[4px] border border-line px-2 py-0.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-2 hover:bg-raised">
        <Icon name="pitIn" size={13} />En boxes</button>}
      <span className={`flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.08em] ${state === 'ok' ? 'text-ok' : state === 'warn' ? 'text-warn' : 'text-crit'}`}>
        <span className={`h-2 w-2 rounded-full ${BAND[state]}`} />{stateText}
        {alarms.length > 0 && <span className="font-semibold normal-case tracking-normal">· {alarms.map((a) => a.text).join(' · ')}</span>}
      </span>
      <span className="ml-auto flex flex-wrap gap-x-5 gap-y-1">
        <Stat icon="battery" label="Móvil" value={p.phoneBattery == null ? '—' : `${p.phoneBattery} %`} warn={p.phoneBattery != null && p.phoneBattery < limitsOf(p).phoneWarn} />
        {p.phoneTemp != null && <Stat icon="thermo" label="Temp. móvil" value={`${p.phoneTemp} °C`} warn={p.phoneTemp >= PHONE_HOT} />}
        <Stat icon="signal" label="Red" value={(p.net?.type ?? '—').toUpperCase()} />
        <Stat icon="pin" label="GPS" value={p.gps?.acc == null ? '—' : `± ${p.gps.acc} m`} />
        <Stat icon="crosshair" label="Dato" value={`hace ${fmtAge(now - p.ts)}`} />
      </span>
    </div>
  );
}
const Stat = ({ icon, label, value, warn }) => (
  <span className="flex items-center gap-1.5 text-[13px]">
    <Icon name={icon} size={14} className="text-muted" /><span className="label">{label}</span>
    <span className={`num ${warn ? 'text-warn' : 'text-fg-2'}`}>{value}</span>
  </span>
);

// ── Gauges: arco para temperatura, barra de LEDs para RPM, digital para voltaje y velocidad ──
function Gauges({ p, stale, avg = {} }) {
  const o = p.obd ?? {};
  const L = limitsOf(p);
  const v = o.voltage;
  const voltState = v == null ? 'ok' : v < L.voltCrit || v > L.voltHighCrit ? 'crit' : v < L.voltWarn || v > L.voltHighWarn ? 'warn' : 'ok';
  return (
    <div className="grid grid-cols-2 gap-px bg-line xl:grid-cols-4">
      {/* Estrecho: temp + batería arriba, RPM y velocidad a lo ancho.
          Portátil: temp · RPM (doble) · batería y velocidad apiladas. */}
      <TempArc value={o.coolant} stale={stale} L={L} avg={avg.avg_temp} />
      <div className="order-3 col-span-2 xl:order-none"><RpmBar value={o.rpm} throttle={o.throttle} stale={stale} L={L} avg={avg.avg_rpm} /></div>
      <div className="contents xl:grid xl:grid-rows-2 xl:gap-px">
        <Readout label="Batería" unit="V" value={o.voltage} digits={2} stale={stale} compact avg={avg.avg_volt}
          state={voltState} bar={{ min: 10, max: 16, marks: [L.voltCrit, L.voltHighWarn] }} />
        <div className="order-4 col-span-2 xl:order-none xl:col-span-1"><Readout label="Velocidad GPS" unit="km/h" value={p.gps?.speed} stale={stale} compact avg={avg.avg_speed} /></div>
      </div>
    </div>
  );
}

const STATE_TEXT = { ok: 'text-fg', warn: 'text-warn', crit: 'text-crit' };

function GaugeShell({ label, state, stale, compact, avg, children }) {
  return (
    <div className={`relative flex h-full flex-col bg-panel px-4 py-3 ${compact ? 'min-h-[148px] xl:min-h-0 xl:py-2' : 'min-h-[148px]'} ${state === 'crit' && !stale ? 'alarm-ring' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="label">{label}</span>
        {stale ? <span className="num rounded-[3px] bg-warn-soft px-1.5 text-[11px] font-semibold text-warn">SIN DATOS</span> : avg}
      </div>
      {children}
    </div>
  );
}

// Referencia de 30 días: "media 88 °C ▲ 3". Por encima/por debajo con flecha y signo, sin color de alarma.
function AvgTag({ value, avg, unit, digits = 0 }) {
  if (avg == null) return null;
  const d = value == null ? null : value - avg;
  const tol = digits ? 0.05 : 0.5;
  return (
    <span className="num truncate text-[11px] text-muted" title="Media de los últimos 30 días">
      media {fmt(avg, digits)}
      {d != null && <span className="ml-1 text-fg-2">{Math.abs(d) < tol ? '=' : d > 0 ? `▲ ${fmt(d, digits)}` : `▼ ${fmt(-d, digits)}`}</span>}
    </span>
  );
}

function TempArc({ value, stale, L, avg }) {
  const [min, max] = [40, 130];
  const state = value > L.tempCrit ? 'crit' : value >= L.tempWarn ? 'warn' : 'ok';
  const ang = (v) => 150 + (240 * (Math.min(max, Math.max(min, v)) - min)) / (max - min);
  const pt = (a, r) => [100 + r * Math.cos((a * Math.PI) / 180), 92 + r * Math.sin((a * Math.PI) / 180)];
  const arc = (v0, v1, r) => {
    const [a0, a1] = [ang(v0), ang(v1)];
    const [[x0, y0], [x1, y1]] = [pt(a0, r), pt(a1, r)];
    return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const tick = (v) => { const [[x0, y0], [x1, y1]] = [pt(ang(v), 58), pt(ang(v), 84)]; return <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--text-2)" strokeWidth="1.5" />; };
  const [[lx, ly], [rx, ry]] = [pt(ang(min), 70), pt(ang(max), 70)];
  return (
    <GaugeShell label="Temp. motor" state={state} stale={stale} avg={<AvgTag value={value} avg={avg} unit="°C" />}>
      <svg viewBox="0 0 200 150" className="mx-auto -mb-2 w-full max-w-[220px]" role="img" aria-label={`Temperatura ${fmt(value)} grados`}>
        <path d={arc(L.tempWarn, L.tempCrit, 80)} stroke="var(--arc-warn)" strokeOpacity="0.55" strokeWidth="4" fill="none" />
        <path d={arc(L.tempCrit, max, 80)} stroke="var(--arc-crit)" strokeOpacity="0.55" strokeWidth="4" fill="none" />
        <path d={arc(min, max, 68)} stroke="var(--arc-track)" strokeWidth="12" fill="none" strokeLinecap="butt" />
        {value != null && !stale && <path d={arc(min, value, 68)} stroke={`var(--arc-${state})`} strokeWidth="12" fill="none" />}
        {tick(L.tempWarn)}{tick(L.tempCrit)}
        <text x={lx} y={ly + 18} textAnchor="middle" className="num" fontSize="10" fill="var(--muted)">{min}</text>
        <text x={rx} y={ry + 18} textAnchor="middle" className="num" fontSize="10" fill="var(--muted)">{max}</text>
        <text x="100" y="100" textAnchor="middle" className="num" fontSize="40" fontWeight="700"
          fill={stale ? 'var(--muted)' : state === 'ok' ? 'var(--text)' : `var(--${state})`} opacity={stale ? 0.5 : 1}>
          {stale && value != null ? '~' : ''}{fmt(value)}
        </text>
        <text x="100" y="120" textAnchor="middle" fontSize="13" fill="var(--muted)">°C</text>
      </svg>
    </GaugeShell>
  );
}

// Barra segmentada estilo luces de cambio del volante.
function RpmBar({ value, throttle, stale, L, avg }) {
  const N = 28;
  const max = Math.ceil((L.rpmCrit * 1.08) / 1000) * 1000; // escala: limitador + margen, redondeada a miles
  const lit = value == null || stale ? 0 : Math.round((Math.min(value, max) / max) * N);
  const zone = (i) => { const r = ((i + 1) / N) * max; return r > L.rpmCrit ? 'crit' : r > L.rpmWarn ? 'warn' : 'ok'; };
  const state = value >= L.rpmCrit ? 'crit' : 'ok';
  return (
    <GaugeShell label="RPM" state={state} stale={stale} avg={<AvgTag value={value} avg={avg} unit="rpm" />}>
      <div className="flex flex-1 flex-col justify-center gap-3">
        <div className="flex items-baseline gap-2">
          <span className={`num text-[44px] font-bold leading-none ${stale ? 'text-muted opacity-50' : ''}`}>{stale && value != null ? '~' : ''}{fmt(value)}</span>
          <span className="text-[15px] text-muted">rpm</span>
          <span className="ml-auto flex items-baseline gap-2 whitespace-nowrap"><span className="label">Acelerador</span><span className="num text-[15px] text-fg-2">{fmt(throttle)} %</span></span>
        </div>
        <div className="flex h-5 gap-[3px]" aria-hidden="true">
          {Array.from({ length: N }, (_, i) => (
            <span key={i} className="flex-1 rounded-[1px]" style={{ background: i < lit ? `var(--arc-${zone(i)})` : 'var(--arc-track)' }} />
          ))}
        </div>
        <div className="num flex justify-between text-[10px] text-muted">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => <span key={f}>{fmt((max * f) / 1000, max * f % 1000 ? 1 : 0)}k</span>)}
        </div>
      </div>
    </GaugeShell>
  );
}

function Readout({ label, unit, value, digits = 0, state = 'ok', stale, bar, compact, avg }) {
  const pos = (v) => `${(100 * (Math.min(bar.max, Math.max(bar.min, v)) - bar.min)) / (bar.max - bar.min)}%`;
  return (
    <GaugeShell label={label} state={state} stale={stale} compact={compact} avg={<AvgTag value={value} avg={avg} unit={unit} digits={digits ? 1 : 0} />}>
      <div className={`flex flex-1 flex-col justify-center ${compact ? 'gap-3 xl:gap-1.5' : 'gap-3'}`}>
        <div className="flex items-baseline gap-2">
          <span className={`num font-bold leading-none ${compact ? 'text-[44px] xl:text-[32px]' : 'text-[44px]'} ${stale ? 'text-muted opacity-50' : STATE_TEXT[state]}`}>{stale && value != null ? '~' : ''}{fmt(value, digits)}</span>
          <span className="text-[15px] text-muted">{unit}</span>
        </div>
        {bar && (
          <div className="relative h-1.5 rounded-full bg-sunken">
            {value != null && !stale && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: pos(value), background: `var(--arc-${state})` }} />}
            {bar.marks.map((m) => <span key={m} className="absolute -top-1 h-3.5 w-px bg-fg-2" style={{ left: pos(m) }} />)}
          </div>
        )}
        {bar && <div className={`num flex justify-between text-[10px] text-muted ${compact ? 'xl:hidden' : ''}`}><span>{bar.min}</span><span>{bar.max}</span></div>}
      </div>
    </GaugeShell>
  );
}

function EmptyTelemetry() {
  return (
    <div className="flex flex-col items-start gap-2 bg-panel px-6 py-8">
      <span className="label">Esperando telemetría</span>
      <p className="max-w-xl text-[15px] leading-snug text-fg-2">
        Abre la vista <b className="text-fg">Piloto</b> en el móvil del coche y pulsa <b className="text-fg">SIM</b>, <b className="text-fg">OBD</b> o <b className="text-fg">GPS</b>.
        Los coches del mismo canal aparecerán en la lista de coches.
      </p>
    </div>
  );
}

// ── Mensajes al piloto + registro con acuses ──
const QUICK = [
  { text: 'ENTRA SIGUIENTE VUELTA', cls: 'border-warn bg-warn-soft text-warn' },
  { text: 'APRIETA / MAX PACE' },
  { text: 'MODO ECO' },
  { text: 'SANCIÓN' },
];

function Messages({ dorsal, log, now, send }) {
  const [text, setText] = useState('');
  const { driver } = useLive();
  const to = 'all';
  const recipients = () => [dorsal];

  return (
    <aside className="flex flex-col bg-panel lg:min-h-0" aria-label="Mensajes al piloto">
      <div className="flex h-9 shrink-0 items-center border-b border-line px-3"><span className="label">Mensajes al piloto</span></div>
      <div className="flex flex-col gap-3 border-b border-line p-3">
        <div className="flex items-center gap-2 text-[14px]">
          <span className="label">Para</span>
          <Icon name="wheel" size={15} className="text-muted" />
          {driver ? <b>{driver.name}</b> : <span className="text-muted">nadie al volante todavía</span>}
          <span className="num ml-auto text-muted">#{dorsal}</span>
        </div>
        <HoldButton onFire={() => send('ENTRA YA EN BOX', to)}>Entra ya en box</HoldButton>
        <div className="grid grid-cols-3 gap-2">
          {QUICK.map((q, i) => (
            <button key={q.text} onClick={() => send(q.text, to)}
              className={`min-h-12 rounded-[4px] border px-2 text-[15px] font-semibold uppercase leading-tight tracking-[0.04em] transition active:translate-y-px ${i === 0 ? 'col-span-3' : ''} ${q.cls ?? 'border-line-strong bg-raised text-fg hover:border-fg-2'}`}>
              {q.text}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { send(text, to); setText(''); } }} className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Mensaje personalizado</span>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={60} placeholder="Mensaje personalizado"
              className="h-10 w-full rounded-[4px] border border-line-strong bg-sunken pl-3 pr-12 text-[15px] placeholder:text-muted" />
            <span className="num pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted">{text.length}/60</span>
          </label>
          <button disabled={!text.trim()} aria-label="Enviar mensaje"
            className="grid h-10 w-10 place-items-center rounded-[4px] bg-accent text-panel transition-opacity disabled:opacity-40">
            <Icon name="send" size={17} />
          </button>
        </form>
      </div>

      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <span className="label">Registro</span><span className="num text-[12px] text-muted">{log.length}</span>
      </div>
      <ol className="min-h-40 flex-1 lg:overflow-y-auto">
        {log.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-muted">Sin mensajes. Lo que envíes al piloto y sus avisos aparecerán aquí.</li>}
        {log.map((m) => {
          const problem = m.dir === 'out' && Object.values(m.acks).some((a) => a.answer === 'PROBLEMA');
          return (
            <li key={m.id} className={`flex flex-col gap-1 border-b border-line px-3 py-2 ${problem ? 'bg-warn-soft' : m.critical ? 'bg-crit-soft' : ''}`}>
              <div className="flex items-baseline gap-2">
                <span className="num text-[12px] text-muted">{hhmmss(m.ts)}</span>
                <span className="num text-[12px] font-semibold text-fg-2">{m.dir === 'in' ? `#${m.car} → BOX` : `BOX → ${m.to === 'all' ? 'PILOTO' : '#' + m.to}`}</span>
                {m.dir === 'in' && <Badge tone={m.critical ? 'crit' : 'info'}>{m.critical ? 'Avería' : 'Piloto'}</Badge>}
              </div>
              <div className="text-[15px] font-semibold uppercase leading-tight tracking-[0.02em]">{m.text}</div>
              {m.dir === 'out' && (
                <div className="flex flex-wrap gap-1">
                  {recipients(m).map((c) => <AckBadge key={c} car={c} ack={m.acks[c]} waited={now - m.ts} sentAt={m.ts} />)}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

// Mantener pulsado 400 ms: evita un ENTRA YA EN BOX accidental sin el coste de un diálogo.
function HoldButton({ onFire, children }) {
  const [holding, setHolding] = useState(false);
  const t = useRef();
  const begin = () => { setHolding(true); t.current = setTimeout(() => { setHolding(false); onFire(); }, 400); };
  const cancel = () => { clearTimeout(t.current); setHolding(false); };
  return (
    <button onPointerDown={begin} onPointerUp={cancel} onPointerLeave={cancel} onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); begin(); } }} onKeyUp={cancel}
      className="relative flex h-14 items-center justify-center gap-2 overflow-hidden rounded-[4px] bg-crit-solid text-xl font-bold uppercase tracking-[0.06em] text-on-crit">
      <span className="absolute inset-y-0 left-0 bg-black/25" style={{ width: holding ? '100%' : '0%', transition: holding ? 'width 400ms linear' : 'none' }} />
      <span className="relative flex items-center gap-2"><Icon name="pitIn" size={22} stroke={2.5} />{children}</span>
      <span className="relative ml-2 text-[11px] font-semibold tracking-[0.08em] opacity-80">mantén pulsado</span>
    </button>
  );
}

const TONE = {
  ok: 'border-ok/40 bg-ok-soft text-ok', crit: 'border-crit/40 bg-crit-soft text-crit',
  warn: 'border-warn/40 bg-warn-soft text-warn', info: 'border-info/40 bg-info-soft text-info', pending: 'border-pending/60 text-pending',
};
const Badge = ({ tone, children }) => (
  <span className={`inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-px text-[11px] font-bold uppercase tracking-[0.06em] ${TONE[tone]}`}>{children}</span>
);

function AckBadge({ car, ack, waited, sentAt }) {
  if (ack) {
    const tone = { OK: 'ok', NO: 'crit', PROBLEMA: 'warn' }[ack.answer];
    return <Badge tone={tone}><span className="num">#{car}</span> {ack.answer} <span className="num font-medium opacity-80">· {fmt((ack.at - sentAt) / 1000, 1)} s</span></Badge>;
  }
  if (waited > NO_ACK_MS) return <Badge tone="warn"><span className="num">#{car}</span> Sin respuesta <span className="num font-medium">{fmt(waited / 1000)} s</span></Badge>;
  return <Badge tone="pending"><span className="pulse h-1.5 w-1.5 rounded-full bg-pending" /><span className="num">#{car}</span> Pendiente</Badge>;
}

// Sonido con Web Audio: crítico = dos tonos cada 5 s hasta reconocer; aviso nuevo = un tic.
function useAlarmSound({ critical, warnIds, muted }) {
  const ctx = useRef(null);
  const seen = useRef(new Set());
  useEffect(() => {
    const unlock = () => { ctx.current ??= new AudioContext(); ctx.current.resume(); };
    addEventListener('pointerdown', unlock);
    return () => removeEventListener('pointerdown', unlock);
  }, []);
  const tone = (freq, at, dur) => {
    const c = ctx.current;
    if (!c || muted) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.25, c.currentTime + at);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + at + dur);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + at);
    o.stop(c.currentTime + at + dur);
  };
  useEffect(() => {
    if (!critical || muted) return;
    const beep = () => { tone(880, 0, 0.18); tone(660, 0.22, 0.25); };
    beep();
    const t = setInterval(beep, 5000);
    return () => clearInterval(t);
  }, [critical, muted]);
  useEffect(() => {
    const ids = warnIds ? warnIds.split(',') : [];
    if (ids.some((id) => !seen.current.has(id))) tone(880, 0, 0.12);
    seen.current = new Set(ids);
  }, [warnIds]);
}
