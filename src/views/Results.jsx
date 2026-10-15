// Resultados: el organizador publica el de cada sesión (una instantánea de la clasificación que ya no cambia)
// y lo comparte con un enlace público, #tiempos/<código>, que se ve sin cuenta y se puede imprimir.
import { useEffect, useRef, useState } from 'react';
import TrackMap from './TrackMap.jsx';
import Icon from '../icons.jsx';
import { SESSIONS } from './Racing.jsx';
import { Wordmark } from './Auth.jsx';
import { api } from '../lib/session.js';
import { RACE_FORMATS, embedUrl, targetText } from '../lib/events.js';
import { Card, Segmented, ErrorText, btn, fmtLap, fmtDelta, downloadCsv } from './ui.jsx';

const sessionName = (s) => SESSIONS.find(([v]) => v === s)?.[1] ?? s;
const when = (ts) => new Date(ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDate = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
export const publicLink = (code) => `${location.origin}/#tiempos/${code}`;
export const liveLink = (code) => `${location.origin}/#directo/${code}`;
// Vueltas con la sanción indicada: «48 (−2)».
export const lapsText = (r) => `${r.laps}${r.pen ? ` (−${r.pen})` : ''}`;

function ResultsTable({ rows, sort }) {
  const lead = rows[0];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[14px]">
        <thead className="bg-raised text-left"><tr className="label">
          <th className="px-3 py-2">Pos</th><th className="px-3 py-2">Equipo</th><th className="px-3 py-2 text-right">Vueltas</th>
          <th className="px-3 py-2 text-right">Mejor</th><th className="px-3 py-2 text-right">Dif.</th><th className="px-3 py-2">Piloto de la mejor</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pos} className="border-t border-line">
              <td className="num px-3 py-2 font-bold">{r.retired ? 'RET' : r.pos}</td>
              <td className="px-3 py-2"><span className="num mr-1.5 font-semibold text-fg-2">#{r.dorsal}</span><b>{r.team}</b></td>
              <td className="num px-3 py-2 text-right">{lapsText(r)}</td>
              <td className="num px-3 py-2 text-right font-bold">{fmtLap(r.best)}</td>
              <td className="num px-3 py-2 text-right text-fg-2">{r.retired ? 'Retirado' : r.pos === 1 ? '—' : sort === 'laps' ? `${r.laps - lead.laps} v` : fmtDelta(r.best - lead.best)}</td>
              <td className="px-3 py-2 text-fg-2">{r.bestDriver ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const csv = (name, r) => downloadCsv(`${name}-${sessionName(r.session)}`, [['Pos', 'Dorsal', 'Equipo', 'Vueltas', 'Mejor vuelta', 'Última', 'Piloto de la mejor'],
  ...r.rows.map((x) => [x.retired ? 'RET' : x.pos, x.dorsal, x.team, lapsText(x), fmtLap(x.best), fmtLap(x.last), x.bestDriver ?? ''])]);

// Pestaña Resultados del evento: publicar cada sesión (o volver a publicarla) y el enlace público.
export function ResultsTab({ ev }) {
  const [data, setData] = useState(null); // { publicCode, results }
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { api(`/api/events/${ev.id}/results`).then(setData).catch((e) => setError(e.message)); }, [ev.id]);
  const publish = (session, sort) => api(`/api/events/${ev.id}/results`, { method: 'POST', body: { session, sort } })
    .then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  if (!data) return error ? <ErrorText>{error}</ErrorText> : <p className="text-muted">Cargando…</p>;
  const link = data.publicCode && publicLink(data.publicCode);
  return (
    <div className="flex flex-col gap-4">
      <ErrorText>{error}</ErrorText>
      {link ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[4px] border border-line bg-panel px-4 py-3">
          <div className="min-w-0 flex-1"><div className="label">Enlace público de resultados</div><div className="num truncate text-[14px]">{link}</div></div>
          <button onClick={() => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })} className={btn.ghost}>
            <Icon name={copied ? 'check' : 'copy'} size={15} />{copied ? 'Copiado' : 'Copiar'}</button>
          <a href={link} target="_blank" rel="noreferrer" className={btn.ghost}><Icon name="share" size={15} />Abrir e imprimir</a>
        </div>
      ) : <p className="text-[14px] text-muted">Cuando publiques el primer resultado tendrás un enlace público para compartirlo con los equipos (se ve sin cuenta y no es el código de inscripción).</p>}
      {SESSIONS.map(([s]) => <SessionResult key={s} ev={ev} session={s} result={data.results.find((r) => r.session === s)} onPublish={publish} />)}
    </div>
  );
}

function SessionResult({ ev, session, result, onPublish }) {
  const [sort, setSort] = useState(result?.sort ?? (session === 'race' && ev.raceFormat !== 'best' ? 'laps' : 'best'));
  const [ask, setAsk] = useState(false);
  return (
    <Card icon="chart" color="results" title={`${sessionName(session)}${result ? ` · publicado ${when(result.publishedAt)}${result.publishedBy ? ` por ${result.publishedBy}` : ''}` : ' · sin publicar'}`} flush
      badge={result && <button onClick={() => csv(ev.name, result)} className={`${btn.ghost} h-8`}><Icon name="download" size={14} />CSV</button>}>
      {result && <ResultsTable rows={result.rows} sort={result.sort} />}
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
        <Segmented value={sort} onChange={setSort} options={[['laps', 'Por vueltas (resistencia)'], ['best', 'Por mejor vuelta']]} />
        {ask ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold">{result ? '¿Sustituir el resultado publicado por la clasificación de ahora?' : '¿Publicar la clasificación de ahora?'}</span>
            <button onClick={() => { setAsk(false); onPublish(session, sort); }} className={btn.primary}>Sí, publicar</button>
            <button onClick={() => setAsk(false)} className={btn.ghost}>Cancelar</button>
          </span>
        ) : <button onClick={() => setAsk(true)} className={result ? btn.ghost : btn.primary}>{result ? 'Volver a publicar' : 'Publicar resultado'}</button>}
        <span className="text-[13px] text-muted">Es una foto: las vueltas que lleguen después no lo cambian.</span>
      </div>
    </Card>
  );
}

// Página pública (sin cuenta): los resultados publicados del evento, listos para imprimir.
export function PublicResults({ code }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/api/public/results/${code ?? ''}`).then(setData).catch((e) => setError(e.message)); }, [code]);
  return (
    <div className="h-full overflow-y-auto bg-bg print:h-auto print:overflow-visible">
      <div className="mx-auto flex max-w-[960px] flex-col gap-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Wordmark className="mb-3 h-6" />
            <h1 className="text-2xl font-bold uppercase tracking-[0.06em]">{data?.event.name ?? 'Resultados'}</h1>
            {data && <p className="text-[14px] text-muted">{[fmtDate(data.event.startsOn), data.event.place].filter(Boolean).join(' · ')}</p>}
          </div>
          {data && <button onClick={() => print()} className={`${btn.ghost} print:hidden`}><Icon name="download" size={15} />Imprimir o guardar en PDF</button>}
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        {!data && !error && <p className="text-muted">Cargando…</p>}
        {data?.results.map((r) => (
          <Card icon="chart" color="results" key={r.session} title={`${sessionName(r.session)} · ${r.sort === 'laps' ? 'por vueltas' : 'por mejor vuelta'} · ${when(r.publishedAt)}`} flush>
            <ResultsTable rows={r.rows} sort={r.sort} />
          </Card>
        ))}
      </div>
    </div>
  );
}

// Directo público (#directo/<código>, sin cuenta): la clasificación de la sesión en curso como en un apex-timing,
// con quién está en boxes, la mejor vuelta y las sanciones (cada 5 s), el mapa con los coches (cada segundo) y,
// si el organizador la ha puesto, la retransmisión en vídeo.
const hms = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return [t / 3600, (t % 3600) / 60, t % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':'); };
const hhmm = (ts) => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
export function PublicLive({ code }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [cars, setCars] = useState({});
  const trails = useRef({});
  useEffect(() => {
    const loadCars = () => api(`/api/public/live/${code ?? ''}/cars`).then((list) => {
      for (const c of list) { const t = (trails.current[c.teamId] ??= []); t.push([c.gps.lat, c.gps.lng]); if (t.length > 120) t.shift(); }
      setCars(Object.fromEntries(list.map((c) => [c.teamId, { ...c, key: c.teamId }])));
    }).catch(() => {});
    loadCars();
    const c = setInterval(loadCars, 1000);
    return () => clearInterval(c);
  }, [code]);
  useEffect(() => {
    const load = () => api(`/api/public/live/${code ?? ''}`).then((d) => { setData({ ...d, skew: Date.now() - d.event.now }); setError(''); }).catch((e) => setError(e.message));
    load();
    const a = setInterval(load, 5000);
    const b = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [code]);
  const ev = data?.event;
  const race = ev?.session === 'race';
  const format = race ? ev.raceFormat : 'best';
  // Reloj: en resistencia, lo que queda; si no, lo que lleva la sesión. A N vueltas, además, la vuelta del líder.
  const elapsed = ev?.sessionStartedAt ? now - data.skew - ev.sessionStartedAt : null;
  const countdown = format === 'endurance' && ev?.raceTarget;
  const timer = elapsed == null ? '--:--:--' : countdown ? hms(ev.raceTarget * 60_000 - elapsed) : hms(elapsed);
  const comments = data?.comments ?? [];
  const video = ev?.videoUrl && embedUrl(ev.videoUrl, location.hostname);
  const states = Object.fromEntries(Object.values(cars).map((c) => [c.teamId, c.pit ? 'warn' : 'ok']));
  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className={`mx-auto flex flex-col gap-3 p-3 lg:p-6 ${video || ev?.track ? 'max-w-[1400px]' : 'max-w-[960px]'}`}>
        <Wordmark className="h-6 w-auto self-start" />
        <div style={{ '--tone': 'var(--t-live)' }} className="rise overflow-hidden rounded-[8px] border border-line bg-panel bg-[linear-gradient(120deg,color-mix(in_srgb,var(--tone)_16%,transparent),transparent_60%)]">
          <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <span className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-crit-solid px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-on-crit">
                <span className="pulse h-1.5 w-1.5 rounded-full bg-on-crit" />En directo</span>
              <h1 className="truncate text-[26px] font-bold uppercase leading-tight tracking-[0.04em]">{ev?.name ?? 'Directo'}</h1>
              {ev && <p className="text-[14px] text-fg-2">{[sessionName(ev.session), race && RACE_FORMATS[format]?.label, race && targetText(format, ev.raceTarget), ev.place].filter(Boolean).join(' · ')}</p>}
            </div>
            {ev && (
              <div className="text-right">
                <div className="label">{countdown ? 'Queda' : 'Sesión'}</div>
                <div className="num text-[34px] font-bold leading-none text-[var(--tone)]">{timer}</div>
                {format === 'laps' && ev.raceTarget && data.rows[0] && <div className="num text-[14px] text-fg-2">Vuelta {data.rows[0].laps} de {ev.raceTarget}</div>}
              </div>
            )}
          </div>
          <div className="kerb" aria-hidden="true" />
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        {!data && !error && <p className="text-muted">Cargando…</p>}
        <div className={`grid items-start gap-3 ${video || ev?.track ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
        {(video || ev?.track) && (
          <div className="flex flex-col gap-3 lg:sticky lg:top-0">
            {video && <div className="aspect-video overflow-hidden rounded-[4px] border border-line bg-black">
              <iframe src={video} title={`Retransmisión de ${ev.name}`} className="h-full w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" referrerPolicy="strict-origin-when-cross-origin" />
            </div>}
            {ev?.track && <div className="h-[340px] overflow-hidden rounded-[4px] border border-line lg:h-[420px]">
              <TrackMap cars={cars} trails={trails.current} sel={null} states={states} focus={null} track={ev.track} zones={data?.zones} />
            </div>}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-3">
        {data && (
          <div className="rise overflow-hidden rounded-[8px] border border-line border-t-4 border-t-[var(--t-results)] bg-panel">
            <table className="w-full table-fixed text-[14px] sm:text-[15px]">
              <thead className="bg-raised text-left"><tr className="label">
                <th className="w-1.5 p-0" /><th className="w-12 px-2 py-2">Pos</th><th className="w-14 px-2 py-2">Nº</th><th className="px-2 py-2">Equipo</th>
                <th className="w-28 px-2 py-2 text-right">Gap</th><th className="hidden w-24 px-2 py-2 text-right sm:table-cell">Vueltas</th>
                <th className="hidden w-24 px-2 py-2 text-right sm:table-cell">Mejor</th><th className="hidden w-24 px-2 py-2 text-right md:table-cell">Última</th>
              </tr></thead>
              <tbody>
                {data.rows.length === 0 && <tr><td colSpan={8} className="px-3 py-3 text-muted">Aún no corre ningún equipo.</td></tr>}
                {data.rows.map((r) => (
                  <tr key={r.id} className={`border-t border-line ${r.retired ? 'text-muted' : ''}`}>
                    <td className={`p-0 ${r.pit ? 'bg-crit-solid' : ''}`} title={r.pit ? 'En boxes' : undefined} />
                    <td className="px-2 py-1.5"><span className={`num inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-[13px] font-bold ${r.pos === 1 ? 'bg-[var(--t-results)] text-panel' : ''}`}>{r.pos ?? ''}</span>{r.pit && <span className="ml-1 text-[11px] font-bold text-crit">IN</span>}</td>
                    <td className="num px-2 py-1.5 font-semibold text-fg-2">{r.dorsal}</td>
                    <td className="truncate px-2 py-1.5 font-semibold uppercase">{r.team}</td>
                    <td className="num whitespace-nowrap px-2 py-1.5 text-right">{r.gap}{r.pen ? <span className="ml-1 text-crit" title="Vueltas de sanción">−{r.pen}</span> : null}</td>
                    <td className="num hidden px-2 py-1.5 text-right sm:table-cell">{lapsText(r)}</td>
                    <td className="num hidden px-2 py-1.5 text-right font-semibold sm:table-cell">{fmtLap(r.best)}</td>
                    <td className="num hidden px-2 py-1.5 text-right md:table-cell">{fmtLap(r.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.best && <div className="bg-accent px-3 py-2 text-center text-[14px] font-semibold text-panel">Mejor vuelta: #{data.best.dorsal} {data.best.team} · <span className="num">{fmtLap(data.best.ms)}</span>{data.best.driver && ` · ${data.best.driver}`}</div>}
          </div>
        )}
        {data && (
          <Card icon="alert" color="danger" title="Comentarios" flush>
            {comments.length === 0 ? <p className="px-4 py-3 text-[14px] text-muted">Sin sanciones.</p> : (
              <ul>{comments.map((c) => (
                <li key={c.id} className="flex items-baseline gap-3 border-t border-line px-3 py-1.5 text-[14px] first:border-t-0">
                  <span className="num text-fg-2">{hhmm(c.ts)}</span>
                  <span className="grid h-5 w-5 shrink-0 place-items-center self-center rounded-full bg-crit-solid text-[11px] font-bold text-on-crit">P</span>
                  <span className="num font-semibold">#{c.dorsal}</span>
                  <span className="min-w-0">{c.retired ? 'Retirado' : `Penaliza · ${c.laps} vuelta${c.laps === 1 ? '' : 's'}`}{c.reason && ` · ${c.reason}`}</span>
                </li>
              ))}</ul>
            )}
          </Card>
        )}
        </div>
        </div>
      </div>
    </div>
  );
}
