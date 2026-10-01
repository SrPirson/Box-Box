// Vista BOX (portátil en el muro): telemetría en vivo, alarmas, mapa y mensajería con acuse de recibo.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSocket } from '../lib/store.js';

const TEMP_MAX = 100;   // °C refrigerante
const VOLT_MIN = 12.2;  // V batería/alternador
const STALE_MS = 3000;  // sin paquetes → coche sin señal
const TRAIL_MAX = 2000;
const QUICK = ['ENTRA YA EN BOX', 'ENTRA SIGUIENTE VUELTA', 'APRIETA / MAX PACE', 'MODO ECO', 'SANCIÓN'];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function alarmsOf(p, now) {
  if (!p) return [];
  const a = [];
  if (now - p.ts > STALE_MS) a.push('SIN SEÑAL');
  if (p.obd?.coolant > TEMP_MAX) a.push(`TEMP ${p.obd.coolant}°C`);
  if (p.obd?.voltage != null && p.obd.voltage < VOLT_MIN) a.push(`VOLT ${p.obd.voltage}V`);
  return a;
}

export default function Box() {
  const [cars, setCars] = useState({});      // dorsal → último paquete
  const trails = useRef({});                   // dorsal → [[lat,lng], ...]
  const [sel, setSel] = useState(null);
  const [log, setLog] = useState([]);
  const [critical, setCritical] = useState([]); // averías sin atender
  const [now, setNow] = useState(Date.now());
  const [text, setText] = useState('');
  const [to, setTo] = useState('all');

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
    setSel((s) => s ?? packets[0]?.car);
  };

  const { socket, connected } = useSocket({
    telemetry: (p) => ingest([p]),
    'telemetry:batch': ({ packets }) => ingest(packets.sort((a, b) => a.ts - b.ts)),
    pilot: (e) => {
      setLog((l) => [{ id: uid(), dir: 'in', car: e.car, text: e.label, ts: e.ts, gps: e.gps, critical: e.critical }, ...l]);
      if (e.critical) setCritical((c) => [...c, e]);
    },
    ack: (a) => setLog((l) => l.map((m) => (m.id === a.id ? { ...m, acks: { ...m.acks, [a.car]: a.answer } } : m))),
  });

  const send = (msg) => {
    if (!msg.trim()) return;
    const m = { id: uid(), to, text: msg.trim().toUpperCase(), ts: Date.now() };
    socket.emit('msg', m);
    setLog((l) => [{ ...m, dir: 'out', acks: {} }, ...l]);
  };

  // Reloj para detectar coches sin señal.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const allAlarms = Object.values(cars).flatMap((p) => alarmsOf(p, now).filter((a) => a !== 'SIN SEÑAL').map((a) => `#${p.car} ${a}`));
  const alarming = allAlarms.length > 0 || critical.length > 0;
  useBeep(alarming);

  const p = cars[sel];
  const o = p?.obd ?? {};
  const alarms = alarmsOf(p, now);

  return (
    <div className="grid h-full grid-cols-1 gap-2 overflow-auto bg-black p-2 lg:grid-cols-[1fr_420px] lg:overflow-hidden">
      <section className="flex min-h-0 flex-col gap-2">
        {/* Averías críticas */}
        {critical.map((e, i) => (
          <div key={i} className="blink flex items-center gap-4 rounded bg-neon-red p-3 text-xl font-black text-black">
            COCHE #{e.car}: {e.label}
            {e.gps && <a className="underline" target="_blank" href={`https://maps.google.com/?q=${e.gps.lat},${e.gps.lng}`}>{e.gps.lat.toFixed(5)}, {e.gps.lng.toFixed(5)}</a>}
            <button onClick={() => setCritical((c) => c.filter((x) => x !== e))} className="ml-auto rounded bg-black px-3 py-1 text-white">ATENDIDO</button>
          </div>
        ))}

        {/* Selector de coche */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${connected ? 'bg-neon-green' : 'bg-neon-red blink'}`} title="Servidor" />
          {Object.keys(cars).length === 0 && <span className="text-white/40">Esperando telemetría…</span>}
          {Object.values(cars).map((c) => (
            <button key={c.car} onClick={() => setSel(c.car)}
              className={`rounded px-4 py-1 font-mono text-lg font-bold ${c.car === sel ? 'bg-white text-black' : 'bg-white/10'} ${alarmsOf(c, now).length ? 'ring-2 ring-neon-red' : ''}`}>
              #{c.car}
            </button>
          ))}
          {p && (
            <span className="ml-auto font-mono text-sm text-white/50">
              {p.net?.type ?? ''} · móvil {p.phoneBattery ?? '--'}% · {p.obd?.throttle ?? '--'}% acel.
            </span>
          )}
        </div>

        {alarms.length > 0 && <div className="blink rounded border-2 border-neon-red p-2 text-center text-2xl font-black text-neon-red">{alarms.join(' · ')}</div>}

        {/* Gauges */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Gauge label="TEMP MOTOR" unit="°C" value={o.coolant} min={40} max={130} alarm={o.coolant > TEMP_MAX} />
          <Gauge label="RPM" unit="" value={o.rpm} min={0} max={8000} />
          <Gauge label="VOLTAJE" unit="V" value={o.voltage} min={10} max={15} alarm={o.voltage != null && o.voltage < VOLT_MIN} />
          <Gauge label="VELOCIDAD GPS" unit="km/h" value={p?.gps?.speed} min={0} max={300} />
        </div>

        <TrackMap cars={cars} trails={trails.current} sel={sel} />
      </section>

      {/* Mensajería */}
      <section className="flex min-h-0 flex-col gap-2">
        <div className="flex gap-2">
          <label className="text-white/50">Para</label>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 rounded bg-white/10 px-2">
            <option value="all">TODOS</option>
            {Object.keys(cars).map((c) => <option key={c} value={c}>#{c}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {QUICK.map((q, i) => (
            <button key={q} onClick={() => send(q)}
              className={`rounded border-2 py-3 font-black ${i === 0 ? 'col-span-2 border-neon-red text-neon-red' : 'border-neon-blue text-neon-blue'} active:bg-white/20`}>
              {q}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(text); setText(''); }} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensaje personalizado…" className="flex-1 rounded bg-white/10 px-3 py-2" />
          <button className="rounded bg-neon-green px-4 font-black text-black">ENVIAR</button>
        </form>

        <ol className="min-h-40 flex-1 space-y-1 overflow-auto font-mono text-sm">
          {log.map((m) => (
            <li key={m.id} className={`rounded p-2 ${m.dir === 'in' ? (m.critical ? 'bg-neon-red/20' : 'bg-white/5') : 'bg-white/10'}`}>
              <span className="text-white/40">{new Date(m.ts).toLocaleTimeString()} </span>
              {m.dir === 'in' ? <b>#{m.car} → BOX: {m.text}</b> : <b>BOX → {m.to === 'all' ? 'TODOS' : '#' + m.to}: {m.text}</b>}
              {m.dir === 'out' && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {(m.to === 'all' ? Object.keys(cars) : [m.to]).map((c) => <AckBadge key={c} car={c} answer={m.acks[c]} />)}
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const ACK_CLS = { OK: 'bg-neon-green', NO: 'bg-neon-red', PROBLEMA: 'bg-neon-yellow' };
const AckBadge = ({ car, answer }) => (
  <span className={`rounded px-2 text-black ${ACK_CLS[answer] ?? 'bg-white/40 blink'}`}>#{car} {answer ?? 'PENDIENTE'}</span>
);

// Arco de 240° con el valor actual.
function Gauge({ label, unit, value, min, max, alarm }) {
  const f = value == null ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const arc = (to) => {
    const a = (d) => ((150 + d) * Math.PI) / 180;
    const [x, y] = [50 + 40 * Math.cos(a(to)), 50 + 40 * Math.sin(a(to))];
    return `M ${50 + 40 * Math.cos(a(0))} ${50 + 40 * Math.sin(a(0))} A 40 40 0 ${to > 180 ? 1 : 0} 1 ${x} ${y}`;
  };
  const color = alarm ? 'var(--color-neon-red)' : 'var(--color-neon-green)';
  return (
    <div className={`rounded-lg bg-white/5 p-2 text-center ${alarm ? 'blink ring-2 ring-neon-red' : ''}`}>
      <svg viewBox="0 0 100 82" className="mx-auto w-full max-w-48">
        <path d={arc(240)} stroke="#ffffff22" strokeWidth="8" fill="none" strokeLinecap="round" />
        {f > 0 && <path d={arc(240 * f)} stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" />}
        <text x="50" y="56" textAnchor="middle" fill={alarm ? color : 'white'} fontSize="20" fontWeight="900" fontFamily="monospace">{value ?? '--'}</text>
        <text x="50" y="72" textAnchor="middle" fill="#ffffff88" fontSize="9">{unit}</text>
      </svg>
      <div className="text-xs font-bold tracking-wider text-white/60">{label}</div>
    </div>
  );
}

// Mapa en vivo: un punto + estela por coche (circleMarker evita los iconos de Leaflet rotos con bundlers).
function TrackMap({ cars, trails, sel }) {
  const el = useRef(null);
  const map = useRef(null);
  const layers = useRef({});
  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: false }).setView([40.4, -3.7], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    return () => map.current.remove();
  }, []);
  useEffect(() => {
    for (const p of Object.values(cars)) {
      if (!p.gps) continue;
      const pos = [p.gps.lat, p.gps.lng];
      let l = layers.current[p.car];
      if (!l) {
        if (!Object.keys(layers.current).length) map.current.setView(pos, 16);
        l = layers.current[p.car] = {
          trail: L.polyline([], { color: '#00e5ff', weight: 2, opacity: 0.6 }).addTo(map.current),
          dot: L.circleMarker(pos, { radius: 9, color: '#000', fillColor: '#39ff14', fillOpacity: 1 }).bindTooltip('#' + p.car, { permanent: true }).addTo(map.current),
        };
      }
      l.trail.setLatLngs(trails[p.car] ?? []);
      l.dot.setLatLng(pos).setStyle({ fillColor: p.car === sel ? '#39ff14' : '#ffe600' });
      if (p.car === sel && !map.current.getBounds().contains(pos)) map.current.panTo(pos);
    }
  }, [cars, sel, trails]);
  return <div ref={el} className="min-h-72 flex-1 rounded-lg" />;
}

// Pitido de alarma cada segundo mientras haya alarmas. El navegador exige un clic previo en la página.
function useBeep(active) {
  const ctx = useRef(null);
  useEffect(() => {
    const unlock = () => { ctx.current ??= new AudioContext(); ctx.current.resume(); };
    addEventListener('pointerdown', unlock);
    return () => removeEventListener('pointerdown', unlock);
  }, []);
  useEffect(() => {
    if (!active) return;
    const beep = () => {
      const c = ctx.current;
      if (!c) return;
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = 1100;
      g.gain.value = 0.3;
      o.connect(g).connect(c.destination);
      o.start();
      o.stop(c.currentTime + 0.25);
    };
    beep();
    const t = setInterval(beep, 1000);
    return () => clearInterval(t);
  }, [active]);
}
