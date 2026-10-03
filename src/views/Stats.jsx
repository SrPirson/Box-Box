// Estadísticas del equipo: vueltas, comparación con la media, pilotos y medias de telemetría.
import { useEffect, useRef, useState } from 'react';
import Icon from '../icons.jsx';
import { api, useSession } from '../lib/session.js';
import { useSocket } from '../lib/store.js';
import { fmt } from '../lib/limits.js';
import { Page, Card, Segmented, fmtLap, fmtDelta, fmtSplit } from './ui.jsx';

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const RANGES = {
  today: ['Hoy', () => startOfToday()],
  week: ['7 días', () => new Date(Date.now() - 7 * 864e5)],
  month: ['30 días', () => new Date(Date.now() - 30 * 864e5)],
  all: ['Todo', () => new Date(0)],
};

// Carga las estadísticas desde una fecha y añade en vivo las vueltas que se completan.
export function useStats(range) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => api(`/api/stats?since=${RANGES[range][1]().toISOString()}`).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { setData(null); load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [range]); // eslint-disable-line react-hooks/exhaustive-deps
  useSocket({ lap: () => load() });
  return { data, error };
}

export const lapAvg = (laps) => (laps.length ? laps.reduce((a, l) => a + l.ms, 0) / laps.length : null);

// Tramos de la pista activa: solo cuentan sus vueltas con todos los parciales (otra pista u otros cortes no
// son comparables). Por tramo: mejor (y de quién), media, última y dispersión; y la vuelta ideal.
export function sectorStats(laps, track) {
  const n = track?.sectors?.length ? track.sectors.length + 1 : 0;
  const valid = n ? laps.filter((l) => l.sectors?.length === n && (l.track_id ?? null) === (track.id ?? null)) : [];
  const per = Array.from({ length: n }, (_, i) => {
    const v = valid.map((l) => l.sectors[i]);
    const best = valid.reduce((b, l) => (!b || l.sectors[i] < b.sectors[i] ? l : b), null);
    const avg = v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
    return {
      best: best?.sectors[i] ?? null, bestDriver: best?.driver, avg, last: v.at(-1) ?? null,
      sd: v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - avg) ** 2, 0) / (v.length - 1)) : null,
    };
  });
  return { n, laps: valid, per, ideal: valid.length ? per.reduce((a, s) => a + s.best, 0) : null };
}

export default function Stats() {
  const [range, setRange] = useState('today');
  const { data, error } = useStats(range);
  const laps = data?.laps ?? [];
  const avg = lapAvg(laps);
  const best = laps.reduce((b, l) => (!b || l.ms < b.ms ? l : b), null);
  const m = data?.metrics ?? {};
  const { team } = useSession();
  const sec = sectorStats(laps, team.track);

  return (
    <Page title="Estadísticas" subtitle="Vueltas cronometradas al cruzar la línea de meta y telemetría guardada cada segundo."
      actions={<Segmented value={range} onChange={setRange} options={Object.entries(RANGES).map(([k, [l]]) => [k, l])} />}>
      {error && <p role="alert" className="mb-4 rounded-[4px] bg-crit-soft px-3 py-2 text-crit">{error}</p>}
      {!data ? <p className="text-muted">Cargando…</p> : (
        <div className="flex flex-col gap-4">
          {/* KPIs */}
          <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-3 ${team.obd ? 'xl:grid-cols-6' : 'xl:grid-cols-4'}`}>
            <Kpi label="Vueltas" value={laps.length} />
            <Kpi label="Mejor vuelta" value={fmtLap(best?.ms)} sub={best?.driver} />
            <Kpi label="Media de vuelta" value={fmtLap(avg && Math.round(avg))} />
            {team.obd && <Kpi label="Temp. media" value={m.avg_temp == null ? '—' : `${fmt(m.avg_temp)} °C`} sub={m.max_temp != null && `máx ${fmt(m.max_temp)} °C`} />}
            {team.obd && <Kpi label="Batería mínima" value={m.min_volt == null ? '—' : `${fmt(m.min_volt, 2)} V`} sub={m.avg_volt != null && `media ${fmt(m.avg_volt, 2)} V`} />}
            <Kpi label="Velocidad máx." value={m.max_speed == null ? '—' : `${fmt(m.max_speed)} km/h`} sub={m.avg_speed != null && `media ${fmt(m.avg_speed)} km/h`} />
          </div>

          {laps.length === 0 ? (
            <Card title="Tiempos por vuelta">
              <p className="flex items-start gap-3 text-[14px] leading-snug text-fg-2">
                <Icon name="finish" size={20} className="mt-0.5 text-muted" />
                <span>Sin vueltas en este periodo. Para cronometrarlas, define la línea de meta en el mapa de <b className="text-fg">BOX</b> («Meta»): cada cruce cierra una vuelta. La primera solo abre el cronómetro.</span>
              </p>
            </Card>
          ) : (
            <>
              <Card title="Tiempos por vuelta" badge={<span className="num text-[12px] text-muted">media {fmtLap(Math.round(avg))}</span>}>
                <LapChart laps={laps} avg={avg} bestId={best.id} />
              </Card>
              <SectorsCard sec={sec} bestLap={sec.laps.length ? Math.min(...sec.laps.map((l) => l.ms)) : null} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <DriversTable drivers={data.drivers} teamAvg={avg} />
                <MetricsTable m={m} obd={team.obd} />
              </div>
              <LapsTable laps={laps} avg={avg} bestId={best.id} sec={sec} obd={team.obd} />
            </>
          )}
          {laps.length === 0 && <MetricsTable m={m} obd={team.obd} />}
        </div>
      )}
    </Page>
  );
}

export const Kpi = ({ label, value, sub }) => (
  <div className="flex flex-col gap-1 bg-panel px-4 py-3">
    <span className="label">{label}</span>
    <span className="num text-[24px] font-bold leading-none">{value}</span>
    <span className="min-h-4 truncate text-[12px] text-muted">{sub || ''}</span>
  </div>
);

// Diferencia con la media: más rápido = mejor (verde ▼), más lento = ámbar ▲. Signo + flecha, nunca solo color.
export const Delta = ({ ms }) => ms == null ? <span className="text-muted">—</span> : (
  <span className={`num whitespace-nowrap ${ms < 0 ? 'text-ok' : ms > 0 ? 'text-warn' : 'text-muted'}`}>{ms < 0 ? '▼' : ms > 0 ? '▲' : '='} {fmtDelta(ms)}</span>
);

export function LapChart({ laps, avg, bestId }) {
  const ref = useRef(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const H = 260, P = { l: 64, r: 20, t: 20, b: 32 };
  const ms = laps.map((l) => l.ms);
  const pad = Math.max(500, (Math.max(...ms) - Math.min(...ms)) * 0.15);
  const [y0, y1] = [Math.min(...ms) - pad, Math.max(...ms) + pad];
  const step = laps.length > 1 ? (w - P.l - P.r) / (laps.length - 1) : 0;
  const x = (i) => (laps.length > 1 ? P.l + i * step : (P.l + w - P.r) / 2);
  const y = (v) => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
  const ticks = Array.from({ length: 4 }, (_, i) => y0 + ((i + 0.5) * (y1 - y0)) / 4);
  const every = Math.max(1, Math.ceil(laps.length / Math.max(2, Math.floor((w - P.l - P.r) / 44)))); // etiquetas del eje X sin solaparse
  const h = hover != null ? laps[hover] : null;

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      <svg width={w} height={H} role="img" aria-label={`Tiempos de ${laps.length} vueltas; media ${fmtLap(Math.round(avg))}`} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={w - P.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" className="num" fill="var(--muted)">{fmtLap(Math.round(t)).slice(0, -2)}</text>
          </g>
        ))}
        {laps.map((l, i) => i % every === 0 && <text key={l.id} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" className="num" fill="var(--muted)">{i + 1}</text>)}
        <text x={P.l - 8} y={H - 10} textAnchor="end" fontSize="11" fill="var(--muted)">vuelta</text>
        {/* Media */}
        <line x1={P.l} x2={w - P.r} y1={y(avg)} y2={y(avg)} stroke="var(--text-2)" strokeWidth="1.5" strokeDasharray="5 4" />
        <text x={w - P.r} y={y(avg) - 6} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--text-2)">media</text>
        {/* Serie */}
        <polyline points={laps.map((l, i) => `${x(i)},${y(l.ms)}`).join(' ')} fill="none" stroke="var(--chart)" strokeWidth="2" strokeLinejoin="round" />
        {h && <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="var(--border-strong)" strokeWidth="1" />}
        {laps.map((l, i) => (
          <circle key={l.id} cx={x(i)} cy={y(l.ms)} r={l.id === bestId || hover === i ? 6 : 4} fill={l.id === bestId ? 'var(--ok)' : 'var(--chart)'} stroke="var(--panel)" strokeWidth="2" />
        ))}
        {(() => { const i = laps.findIndex((l) => l.id === bestId); return <text x={x(i)} y={y(laps[i].ms) + 20} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ok)">MEJOR</text>; })()}
        {/* Zonas de hover más anchas que el punto */}
        {laps.map((l, i) => (
          <rect key={l.id} x={x(i) - Math.max(step, 24) / 2} y={P.t} width={Math.max(step, 24)} height={H - P.t - P.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {h && (
        <div className="pointer-events-none absolute z-10 rounded-[4px] border border-line bg-panel px-3 py-2 text-[13px] shadow-lg"
          style={{ left: Math.min(x(hover) + 12, w - 170), top: Math.max(0, y(h.ms) - 70) }}>
          <div className="label">Vuelta {hover + 1} · {h.driver ?? '—'}</div>
          <div className="num text-[18px] font-bold">{fmtLap(h.ms)}</div>
          <div className="text-[12px]">vs media <Delta ms={h.ms - avg} /></div>
        </div>
      )}
    </div>
  );
}

export const Th = ({ children, right }) => <th className={`px-4 py-2 font-semibold ${right ? 'text-right' : ''}`}>{children}</th>;

function DriversTable({ drivers, teamAvg }) {
  return (
    <Card title="Pilotos" flush>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-[14px]">
          <thead className="bg-raised text-left"><tr className="label"><Th>Piloto</Th><Th right>Vueltas</Th><Th right>Mejor</Th><Th right>Media</Th><Th right>vs equipo</Th></tr></thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className="border-t border-line">
                <td className="px-4 py-2.5 font-semibold">{d.name}</td>
                <td className="num px-4 py-2.5 text-right">{d.laps}</td>
                <td className="num px-4 py-2.5 text-right">{fmtLap(d.best)}</td>
                <td className="num px-4 py-2.5 text-right">{fmtLap(Math.round(d.avg))}</td>
                <td className="px-4 py-2.5 text-right"><Delta ms={d.avg - teamAvg} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SectorsCard({ sec, bestLap }) {
  if (!sec.n) return (
    <Card title="Tramos">
      <p className="flex items-start gap-3 text-[14px] leading-snug text-fg-2">
        <Icon name="timer" size={20} className="mt-0.5 text-muted" />
        <span>Divide la pista en tramos desde el mapa de <b className="text-fg">BOX</b> («Tramos»): verás el tiempo de cada tramo, el mejor, la media y la vuelta ideal.</span>
      </p>
    </Card>
  );
  if (!sec.laps.length) return <Card title={`Tramos · ${sec.n}`}><p className="text-[14px] text-fg-2">Sin vueltas completas con estos tramos en este periodo.</p></Card>;
  // Mejor parcial de cada piloto en cada tramo.
  const drivers = [...new Set(sec.laps.map((l) => l.driver ?? '—'))].map((name) => {
    const own = sec.laps.filter((l) => (l.driver ?? '—') === name);
    return { name, best: sec.per.map((_, i) => Math.min(...own.map((l) => l.sectors[i]))) };
  });
  return (
    <Card title={`Tramos · ${sec.n}`} flush
      badge={<span className="num text-[12px] text-muted">vuelta ideal <b className="text-fg">{fmtLap(sec.ideal)}</b>{bestLap && <> · {fmtDelta(sec.ideal - bestLap)} vs mejor vuelta</>}</span>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[14px]">
          <thead className="bg-raised text-left"><tr className="label">
            <Th>Tramo</Th><Th right>Mejor</Th><Th>De</Th><Th right>Media</Th><Th right>Última</Th><Th right>Última vs mejor</Th><Th right>Constancia</Th>
          </tr></thead>
          <tbody>
            {sec.per.map((s, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-4 py-2.5"><span className="sector-label inline-grid">{i + 1}</span></td>
                <td className="num px-4 py-2.5 text-right font-bold text-ok">{fmtSplit(s.best)}</td>
                <td className="px-4 py-2.5 font-semibold">{s.bestDriver ?? '—'}</td>
                <td className="num px-4 py-2.5 text-right">{fmtSplit(s.avg)}</td>
                <td className="num px-4 py-2.5 text-right">{fmtSplit(s.last)}</td>
                <td className="px-4 py-2.5 text-right"><Delta ms={s.last - s.best} /></td>
                <td className="num px-4 py-2.5 text-right text-fg-2" title="Desviación típica: cuanto menor, más constante">{s.sd == null ? '—' : `± ${(s.sd / 1000).toFixed(3)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {drivers.length > 1 && (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-[14px]">
            <thead className="bg-raised text-left"><tr className="label"><Th>Mejor tramo por piloto</Th>{sec.per.map((_, i) => <Th key={i} right>T{i + 1}</Th>)}<Th right>Ideal</Th></tr></thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.name} className="border-t border-line">
                  <td className="px-4 py-2 font-semibold">{d.name}</td>
                  {d.best.map((ms, i) => <td key={i} className={`num px-4 py-2 text-right ${ms === sec.per[i].best ? 'font-bold text-ok' : ''}`}>{fmtSplit(ms)}</td>)}
                  <td className="num px-4 py-2 text-right">{fmtLap(d.best.reduce((a, b) => a + b, 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// obd: false si el coche no lleva lector (solo queda la velocidad del GPS).
function MetricsTable({ m, obd }) {
  const rows = [
    obd && ['Temperatura motor', m.avg_temp, 0, '°C', 'máx', m.max_temp],
    obd && ['Batería', m.avg_volt, 2, 'V', 'mín', m.min_volt],
    obd && ['Régimen', m.avg_rpm, 0, 'rpm', 'máx', m.max_rpm],
    ['Velocidad GPS', m.avg_speed, 0, 'km/h', 'máx', m.max_speed],
    obd && ['Acelerador', m.avg_throttle, 0, '%'],
  ].filter(Boolean);
  return (
    <Card title="Telemetría" badge={<span className="num text-[12px] text-muted">{fmt(m.samples ?? 0)} muestras</span>} flush>
      <table className="w-full text-[14px]">
        <thead className="bg-raised text-left"><tr className="label"><Th>Métrica</Th><Th right>Media</Th><Th right>Extremo</Th></tr></thead>
        <tbody>
          {rows.map(([name, avg, d, unit, kind, ext]) => (
            <tr key={name} className="border-t border-line">
              <td className="px-4 py-2.5 font-semibold">{name}</td>
              <td className="num px-4 py-2.5 text-right">{avg == null ? '—' : `${fmt(avg, d)} ${unit}`}</td>
              <td className="num px-4 py-2.5 text-right text-fg-2">{kind && ext != null ? `${kind} ${fmt(ext, d)} ${unit}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function LapsTable({ laps, avg, bestId, sec, obd }) {
  return (
    <Card title="Vueltas" flush>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full min-w-[720px] text-[14px]">
          <thead className="sticky top-0 bg-raised text-left"><tr className="label">
            <Th>#</Th><Th>Hora</Th><Th>Piloto</Th><Th right>Tiempo</Th><Th right>vs media</Th>
            {sec.per.map((_, i) => <Th key={i} right>T{i + 1}</Th>)}
            {obd && <Th right>Temp. media</Th>}<Th right>Vel. máx</Th>{obd && <Th right>Bat. mín</Th>}
          </tr></thead>
          <tbody>
            {laps.map((l, i) => (
              <tr key={l.id} className={`border-t border-line ${l.id === bestId ? 'bg-ok-soft' : ''}`}>
                <td className="num px-4 py-2 text-muted">{i + 1}</td>
                <td className="num px-4 py-2 text-fg-2">{new Date(l.started_at).toLocaleTimeString('es-ES')}</td>
                <td className="px-4 py-2 font-semibold">{l.driver ?? '—'}</td>
                <td className="num px-4 py-2 text-right font-bold">{fmtLap(l.ms)}{l.id === bestId && <span className="ml-1.5 text-[11px] text-ok">MEJOR</span>}</td>
                <td className="px-4 py-2 text-right"><Delta ms={l.ms - avg} /></td>
                {sec.per.map((s, i) => {
                  const ms = sec.laps.includes(l) ? l.sectors[i] : null; // de otra pista o incompleta: sin parcial
                  return <td key={i} className={`num px-4 py-2 text-right ${ms != null && ms === s.best ? 'font-bold text-ok' : ''}`}>{fmtSplit(ms)}</td>;
                })}
                {obd && <td className="num px-4 py-2 text-right">{l.avg_temp == null ? '—' : `${fmt(l.avg_temp)} °C`}</td>}
                <td className="num px-4 py-2 text-right">{l.max_speed == null ? '—' : `${fmt(l.max_speed)} km/h`}</td>
                {obd && <td className="num px-4 py-2 text-right">{l.min_volt == null ? '—' : `${fmt(l.min_volt, 2)} V`}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
