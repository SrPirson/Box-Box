// Eventos para el piloto: buscar e inscribirse (los privados solo con su código). Sin equipo, además, entrar con
// un código (de equipo o de evento) o crear un equipo para entrenar.
import { useEffect, useState } from 'react';
import Icon from '../icons.jsx';
import { api, setSession, setTeam, pendingInvite, clearInvite, useSession } from '../lib/session.js';
import { Page, Card, Field, Segmented, Pill, ErrorText, input, btn } from './ui.jsx';

const fmtDate = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : 'Sin fecha');

// Envío con estado de error.
function useAction() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e.message); } setBusy(false); };
  return { error, busy, run };
}

export default function EventsBrowse() {
  const { user, team } = useSession();
  const owner = team && (team.ownerId === user.id || user.role === 'admin');
  const [tab, setTab] = useState('next');
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null); // evento con el formulario de inscripción abierto (sin equipo)
  const act = useAction();

  useEffect(() => {
    const t = setTimeout(() => {
      api(`/api/events/public?past=${tab === 'past' ? 1 : 0}&q=${encodeURIComponent(q)}`).then((l) => setList(Object.values(l))).catch(() => setList([]));
    }, 250); // al escribir en el buscador, no en cada letra
    return () => clearTimeout(t);
  }, [tab, q]);

  const enrollTeam = (eventId) => act.run(async () => setTeam(await api('/api/team/enroll', { method: 'POST', body: { eventId } })));
  const createIn = (eventId) => (e) => {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get('name');
    act.run(async () => setSession(await api('/api/teams', { method: 'POST', body: { name, eventId } })));
  };

  return (
    <Page title="Eventos" subtitle={team ? `Tu equipo: ${team.name}${team.event ? ` · inscrito en ${team.event.name}` : ' · de entrenamiento'}` : 'Inscríbete en un evento o únete a un equipo para correr.'}>
      {!team && <NoTeam />}
      {team && owner && <EventCode />}
      <div className="mb-3 mt-6 flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[4px] border border-line-strong bg-sunken px-3">
          <Icon name="crosshair" size={16} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o lugar" aria-label="Buscar eventos"
            className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" />
        </label>
        <Segmented value={tab} onChange={setTab} options={[['next', 'Próximos'], ['past', 'Pasados']]} />
      </div>
      <ErrorText>{act.error}</ErrorText>
      {!list ? <p className="text-muted">Cargando…</p> : list.length === 0 ? (
        <Card title={tab === 'next' ? 'Próximos eventos' : 'Eventos pasados'}>
          <p className="text-[14px] text-muted">{q ? 'Ningún evento coincide con la búsqueda.' : tab === 'next' ? 'No hay eventos abiertos ahora mismo. Si te han dado un código, úsalo arriba.' : 'Aún no hay eventos pasados.'}</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((e) => {
            const mine = team?.event?.id === e.id;
            return (
              <Card key={e.id} title={fmtDate(e.startsOn)} badge={mine ? <Pill tone="ok">Inscrito</Pill> : e.closed ? <Pill tone="muted">Cerrado</Pill> : null}>
                <div>
                  <div className="text-[18px] font-bold uppercase leading-tight tracking-[0.03em]">{e.name}</div>
                  <div className="text-[13px] text-muted">{[e.place, e.organizer && `organiza ${e.organizer}`].filter(Boolean).join(' · ')}</div>
                  <div className="mt-1 text-[13px] text-fg-2">{e.teams} equipo{e.teams === 1 ? '' : 's'} inscrito{e.teams === 1 ? '' : 's'}</div>
                </div>
                {tab === 'next' && !mine && (
                  !team ? (open === e.id ? (
                    <form onSubmit={createIn(e.id)} className="flex flex-col gap-2">
                      <Field label="Nombre de tu equipo"><input className={input} name="name" required maxLength={60} autoFocus placeholder="Mi equipo Racing" /></Field>
                      <div className="flex gap-2"><button disabled={act.busy} className={btn.primary}>Inscribir y ser capitán</button><button type="button" onClick={() => setOpen(null)} className={btn.ghost}>Cancelar</button></div>
                    </form>
                  ) : <button onClick={() => setOpen(e.id)} className={btn.primary}><Icon name="plus" size={15} />Inscribir mi equipo</button>)
                    : owner ? <button disabled={act.busy} onClick={() => enrollTeam(e.id)} className={btn.primary}>
                      <Icon name="finish" size={15} />{team.event ? `Pasar a «${team.name}» a este evento` : `Inscribir a «${team.name}»`}</button>
                      : <p className="text-[13px] text-muted">Pide a tu capitán que inscriba al equipo.</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}

// Capitán con equipo: inscribirlo en un evento privado con su código.
function EventCode() {
  const act = useAction();
  const submit = (e) => {
    e.preventDefault();
    const eventCode = new FormData(e.currentTarget).get('code');
    act.run(async () => setTeam(await api('/api/team/enroll', { method: 'POST', body: { eventCode } })));
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 rounded-[4px] border border-line bg-panel p-3">
      <Field label="¿Evento privado? Código del evento">
        <input name="code" required maxLength={12} autoCapitalize="characters" placeholder="ABC123" className={`${input} num w-40 uppercase tracking-[0.2em]`} />
      </Field>
      <button disabled={act.busy} className={btn.ghost}>Inscribir a mi equipo</button>
      <ErrorText>{act.error}</ErrorText>
    </form>
  );
}

// Sin equipo: entrar con un código (equipo → unirse; evento → inscribir uno) o crear un equipo para entrenar.
function NoTeam() {
  const [found, setFound] = useState(null); // { code, event } tras buscar un código de evento
  const act = useAction();
  const lookup = (e) => {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code')).trim().toUpperCase();
    act.run(async () => {
      const r = await api(`/api/code/${encodeURIComponent(code)}`);
      if (r.kind === 'team') { setSession(await api('/api/teams/join', { method: 'POST', body: { code } })); clearInvite(); }
      else setFound({ code, event: r.event });
    });
  };
  const enroll = (e) => {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get('name');
    act.run(async () => { setSession(await api('/api/teams', { method: 'POST', body: { name, eventCode: found.code } })); clearInvite(); });
  };
  const mk = useAction();
  const create = (e) => {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get('name');
    mk.run(async () => setSession(await api('/api/teams', { method: 'POST', body: { name } })));
  };
  const ev = found?.event;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title={ev ? 'Inscribir mi equipo' : 'Tengo un código'}>
        {ev ? (
          <form onSubmit={enroll} className="flex flex-col gap-3">
            <div className="rounded-[4px] bg-sunken px-3 py-2.5">
              <div className="flex items-center gap-2 text-[17px] font-bold uppercase tracking-[0.04em]"><Icon name="finish" size={18} className="text-accent" />{ev.name}</div>
              <div className="text-[13px] text-muted">{[ev.startsOn && fmtDate(ev.startsOn), ev.place].filter(Boolean).join(' · ') || 'Sin fecha ni lugar'}</div>
              {ev.closed && <div className="mt-1 text-[13px] font-semibold text-crit">Inscripciones cerradas.</div>}
            </div>
            {ev.teams.length > 0 && <p className="text-[13px] text-fg-2">{ev.teams.length} equipo{ev.teams.length === 1 ? '' : 's'} inscrito{ev.teams.length === 1 ? '' : 's'}. ¿El tuyo ya está? Pide a su capitán el código del equipo.</p>}
            <Field label="Nombre de tu equipo"><input className={input} name="name" required maxLength={60} placeholder="Mi equipo Racing" /></Field>
            <ErrorText>{act.error}</ErrorText>
            <div className="flex flex-wrap gap-2"><button disabled={act.busy} className={btn.primary}>Inscribir y ser capitán</button><button type="button" onClick={() => setFound(null)} className={btn.ghost}>Usar otro código</button></div>
          </form>
        ) : (
          <form onSubmit={lookup} className="flex flex-col gap-3">
            <p className="text-[13px] text-muted">El de un equipo, para unirte a él, o el de un evento privado, para inscribir tu equipo. Te lo da el capitán o el organizador.</p>
            <Field label="Código"><input className={`${input} num uppercase tracking-[0.2em]`} name="code" defaultValue={pendingInvite()} required maxLength={12} autoCapitalize="characters" placeholder="ABC123" /></Field>
            <ErrorText>{act.error}</ErrorText>
            <button disabled={act.busy} className={btn.primary}>Continuar</button>
          </form>
        )}
      </Card>
      <Card title="Equipo para entrenar">
        <form onSubmit={create} className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">Sin evento: tus propias pistas y tus vueltas. Serás el capitán y podrás invitar pilotos, e inscribirlo en un evento cuando quieras.</p>
          <Field label="Nombre del equipo"><input className={input} name="name" required maxLength={60} placeholder="Mi equipo Racing" /></Field>
          <ErrorText>{mk.error}</ErrorText>
          <button disabled={mk.busy} className={btn.primary}>Crear equipo</button>
        </form>
      </Card>
    </div>
  );
}
