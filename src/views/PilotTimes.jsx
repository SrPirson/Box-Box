// Vista TIEMPOS del piloto: cronómetro, última, mejor y tramos frente al mejor, para leer de un vistazo.
import { useEffect, useState } from 'react';
import { useSocket } from '../lib/store.js';
import { useSession } from '../lib/session.js';
import { tone, lastVsBest, doneSectors } from '../lib/laptimes.js';
import { useStats, sectorStats } from './Stats.jsx';
import { fmtLap, fmtSplit, fmtDelta } from './ui.jsx';

// Relleno sólido: se ve aunque el sol lave la pantalla.
const TONE = { ok: 'bg-ok-solid text-on-ok', warn: 'bg-warn-solid text-on-warn' };

export default function PilotTimes() {
  const { team } = useSession();
  const laps = useStats('today').data?.laps ?? []; // vueltas de hoy (se recarga con cada 'lap')
  const [live, setLive] = useState({ lapStartedAt: null, lapSplits: [] });
  const [now, setNow] = useState(Date.now());
  // El móvil al volante recibe 'lap:live'; cualquier otro, la telemetría del que conduce.
  useSocket({
    'lap:live': setLive,
    telemetry: setLive,
    'telemetry:batch': ({ packets }) => packets.length && setLive(packets.at(-1)),
    'lap:reset': () => setLive({ lapStartedAt: null, lapSplits: [] }),
  });
  const started = live.lapStartedAt;
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [started]);

  const { last, best, delta } = lastVsBest(laps);
  const sec = sectorStats(laps, team.track);
  // Tramos: los ya cerrados de la vuelta en curso; sin vuelta en curso, los de la última completa.
  const rows = started ? doneSectors(live.lapSplits) : sec.laps.at(-1)?.sectors ?? [];
  const bigNum = 'num font-bold leading-none tabular-nums';
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-3 overflow-y-auto p-3 landscape:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="rounded-md border-[3px] border-line px-3 py-2">
          <div className="text-lg font-bold uppercase tracking-[0.06em]">Vuelta en curso</div>
          <div className={`${bigNum} text-[min(19vw,22vh)]`}>{started ? fmtLap(Math.max(0, now - started)).slice(0, -2) : '—'}</div>
        </div>
        {/* Delta de la última frente a la mejor anterior: verde = nueva mejor, amarillo = más lenta */}
        <div className={`flex items-center justify-between gap-2 rounded-md border-[3px] px-3 py-2 ${delta == null ? 'border-line' : `border-transparent ${TONE[tone(delta, 0)]}`}`}>
          <span className="text-lg font-bold uppercase leading-tight tracking-[0.06em]">Δ vs<br />mejor</span>
          <span className={`${bigNum} text-[min(13vw,13vh)]`}>{fmtDelta(delta)}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 rounded-md border-[3px] border-line px-3 py-2">
          <span className="text-lg font-bold uppercase tracking-[0.06em]">Última</span>
          <span className={`${bigNum} text-right text-[min(10vw,10vh)]`}>{fmtLap(last?.ms)}</span>
          <span className="text-lg font-bold uppercase tracking-[0.06em] text-ok">Mejor</span>
          <span className={`${bigNum} text-right text-[min(10vw,10vh)] text-ok`}>{fmtLap(best)}</span>
        </div>
        {sec.n > 0 ? (
          <div className="grid gap-2">
            {sec.per.map((s, i) => {
              const ms = rows[i];
              const t = tone(ms, s.best);
              return (
                <div key={i} className={`flex items-baseline gap-3 rounded-md border-[3px] px-3 py-1.5 ${t ? `border-transparent ${TONE[t]}` : 'border-line'}`}>
                  <span className="text-2xl font-bold">T{i + 1}</span>
                  <span className={`${bigNum} text-[min(9vw,9vh)]`}>{ms != null ? fmtSplit(ms) : started && i === rows.length ? 'en curso' : '—'}</span>
                  {t && <span className="num ml-auto text-xl font-bold">{fmtDelta(ms - s.best)}</span>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-lg font-semibold">Sin tramos: márcalos en el trazado de la pista para ver los parciales.</div>
        )}
      </div>
    </div>
  );
}
