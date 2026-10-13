// Resultados: el organizador publica el de cada sesión (una instantánea de la clasificación que ya no cambia)
// y lo comparte con un enlace público, #tiempos/<código>, que se ve sin cuenta y se puede imprimir.
import { useEffect, useState } from 'react';
import Icon from '../icons.jsx';
import { SESSIONS } from './Racing.jsx';
import { Wordmark } from './Auth.jsx';
import { api } from '../lib/session.js';
import { Card, Segmented, ErrorText, btn, fmtLap, fmtDelta, downloadCsv } from './ui.jsx';

const sessionName = (s) => SESSIONS.find(([v]) => v === s)?.[1] ?? s;
const when = (ts) => new Date(ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDate = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
export const publicLink = (code) => `${location.origin}/#tiempos/${code}`;

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
              <td className="num px-3 py-2 font-bold">{r.pos}</td>
              <td className="px-3 py-2"><span className="num mr-1.5 text-muted">#{r.dorsal}</span><b>{r.team}</b></td>
              <td className="num px-3 py-2 text-right">{r.laps}</td>
              <td className="num px-3 py-2 text-right font-bold">{fmtLap(r.best)}</td>
              <td className="num px-3 py-2 text-right text-fg-2">{r.pos === 1 ? '—' : sort === 'laps' ? `${r.laps - lead.laps} v` : fmtDelta(r.best - lead.best)}</td>
              <td className="px-3 py-2 text-fg-2">{r.bestDriver ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const csv = (name, r) => downloadCsv(`${name}-${sessionName(r.session)}`, [['Pos', 'Dorsal', 'Equipo', 'Vueltas', 'Mejor vuelta', 'Última', 'Piloto de la mejor'],
  ...r.rows.map((x) => [x.pos, x.dorsal, x.team, x.laps, fmtLap(x.best), fmtLap(x.last), x.bestDriver ?? ''])]);

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
  const [sort, setSort] = useState(result?.sort ?? (session === 'race' ? 'laps' : 'best'));
  const [ask, setAsk] = useState(false);
  return (
    <Card title={`${sessionName(session)}${result ? ` · publicado ${when(result.publishedAt)}${result.publishedBy ? ` por ${result.publishedBy}` : ''}` : ' · sin publicar'}`} flush
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
          <Card key={r.session} title={`${sessionName(r.session)} · ${r.sort === 'laps' ? 'por vueltas' : 'por mejor vuelta'} · ${when(r.publishedAt)}`} flush>
            <ResultsTable rows={r.rows} sort={r.sort} />
          </Card>
        ))}
      </div>
    </div>
  );
}
