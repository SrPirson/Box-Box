// Equipo: invitación, miembros y ajustes del coche compartidos (dorsal, teléfono, alertas, línea de meta).
import { useEffect, useState } from 'react';
import Icon from '../icons.jsx';
import { api, inviteLink, setSession, setTeam, useSession } from '../lib/session.js';
import { useLive } from '../lib/store.js';
import { LIMITS, limitErrors } from '../lib/limits.js';
import { Page, Card, Field, Pill, NumInput, ConfirmButton, ErrorText, input, btn } from './ui.jsx';

export default function Team() {
  const { user, team } = useSession();
  const owner = user.role === 'admin' || team.ownerId === user.id;
  const [error, setError] = useState('');
  const save = async (patch) => {
    setError('');
    try { setTeam(await api('/api/team', { method: 'PATCH', body: patch })); return true; } catch (e) { setError(e.message); return false; }
  };

  return (
    <Page title={team.name} subtitle={owner ? 'Eres el capitán: gestionas invitaciones y miembros.' : 'Los ajustes del coche los puede cambiar cualquier miembro.'}>
      <ErrorText>{error}</ErrorText>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          <CarCard team={team} save={save} />
          <AlertsCard team={team} save={save} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <InviteCard team={team} owner={owner} setError={setError} />
          <MembersCard team={team} user={user} owner={owner} setError={setError} />
          {owner && <RenameCard team={team} save={save} />}
          <LeaveCard team={team} />
        </div>
      </div>
    </Page>
  );
}

// Campo de texto que guarda al salir del campo (o con Enter).
function SavedInput({ value, onSave, className = '', ...p }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input {...p} value={v} onChange={(e) => setV(e.target.value)} className={`${input} ${className}`}
      onBlur={() => v !== value && onSave(v)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  );
}

function CarCard({ team, save }) {
  return (
    <Card title="Coche">
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <Field label="Dorsal"><SavedInput className="num text-lg font-bold" inputMode="numeric" maxLength={6} value={team.dorsal} onSave={(dorsal) => save({ dorsal })} /></Field>
        <Field label="Teléfono del mecánico" help="Se marca cuando el piloto pulsa AVERÍA.">
          <SavedInput className="num" type="tel" placeholder="+34 600 000 000" value={team.phone} onSave={(phone) => save({ phone })} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-[4px] bg-sunken px-3 py-2.5">
        <Icon name="finish" size={18} className="text-muted" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold uppercase tracking-[0.04em]">Línea de meta</div>
          <div className="text-[13px] text-muted">{team.track?.line ? 'Definida: las vueltas se cronometran solas.' : 'Sin definir. Dibújala en el mapa de BOX con «Definir meta».'}</div>
        </div>
        {team.track?.line && <ConfirmButton label="Borrar" confirm="Sí, borrar" onConfirm={() => save({ track: null })} />}
      </div>
    </Card>
  );
}

const ALERT_ROWS = [
  { id: 'temp', name: 'Temperatura motor', cond: 'Aviso desde · crítico por encima de', unit: '°C', warn: 'tempWarn', crit: 'tempCrit', step: 1 },
  { id: 'volt', name: 'Batería baja', cond: 'Por debajo de', unit: 'V', warn: 'voltWarn', crit: 'voltCrit', step: 0.1 },
  { id: 'voltHigh', name: 'Sobretensión', cond: 'Por encima de (fallo de regulador)', unit: 'V', warn: 'voltHighWarn', crit: 'voltHighCrit', step: 0.1 },
  { id: 'rpm', name: 'Régimen motor', cond: 'Aviso visual desde · crítico en el limitador', unit: 'rpm', warn: 'rpmWarn', crit: 'rpmCrit', step: 100 },
  { id: 'stale', name: 'Sin datos del coche', cond: 'Segundos sin recibir telemetría', unit: 's', warn: 'staleWarn', crit: 'staleCrit', step: 1 },
  { id: 'phone', name: 'Batería del móvil', cond: 'Por debajo de', unit: '%', warn: 'phoneWarn', crit: 'phoneCrit', step: 1 },
];

// Borrador local: las alertas se comparten con todo el equipo, así que se guardan de una vez y solo si son coherentes.
function AlertsCard({ team, save }) {
  const [draft, setDraft] = useState(team.limits);
  useEffect(() => setDraft(team.limits), [team.limits]);
  const errors = limitErrors(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(team.limits);
  const isDefault = Object.keys(LIMITS).every((k) => draft[k] === LIMITS[k]);
  return (
    <Card title="Alertas del coche" badge={!isDefault && <button onClick={() => setDraft(LIMITS)} className="text-[12px] font-semibold uppercase tracking-[0.06em] text-accent hover:underline">Valores por defecto</button>}>
      <p className="-mt-1 text-[13px] leading-snug text-muted">
        Cuándo avisa BOX. <span className="text-warn">Aviso</span>: indicación ámbar y un tono.{' '}
        <span className="text-crit">Crítico</span>: banner rojo y pitido hasta que alguien lo reconoce.
      </p>
      <div className="-mx-4 border-y border-line">
        <div className="hidden grid-cols-[minmax(0,1fr)_150px_150px] gap-3 border-b border-line bg-raised px-4 py-1.5 sm:grid">
          <span className="label">Métrica</span>
          <span className="label flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warn-solid" />Aviso</span>
          <span className="label flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-crit-solid" />Crítico</span>
        </div>
        {ALERT_ROWS.map((r) => (
          <div key={r.id} className={`grid grid-cols-2 items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_150px_150px] ${errors[r.id] ? 'bg-crit-soft' : ''}`}>
            <div className="col-span-2 sm:col-span-1">
              <div className="text-[15px] font-semibold uppercase tracking-[0.04em]">{r.name}</div>
              <div className="text-[13px] text-muted">{r.cond}</div>
              {errors[r.id] && <div role="alert" className="mt-0.5 text-[13px] font-semibold text-crit">{errors[r.id]}</div>}
            </div>
            <NumInput label={`${r.name} · aviso`} tone="warn" unit={r.unit} step={r.step} value={draft[r.warn]} onCommit={(n) => setDraft((d) => ({ ...d, [r.warn]: n }))} invalid={!!errors[r.id]} />
            <NumInput label={`${r.name} · crítico`} tone="crit" unit={r.unit} step={r.step} value={draft[r.crit]} onCommit={(n) => setDraft((d) => ({ ...d, [r.crit]: n }))} invalid={!!errors[r.id]} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="mr-auto text-[13px] text-warn">Cambios sin guardar</span>}
        {dirty && <button onClick={() => setDraft(team.limits)} className={btn.ghost}>Descartar</button>}
        <button disabled={!dirty || Object.keys(errors).length > 0} onClick={() => save({ limits: draft })} className={btn.primary}>Guardar alertas</button>
      </div>
    </Card>
  );
}

function InviteCard({ team, owner, setError }) {
  const [copied, setCopied] = useState('');
  const copy = (what, text) => { navigator.clipboard?.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); };
  const link = inviteLink(team.inviteCode);
  const title = `Únete a ${team.name}`;
  const text = `${title} en Cencerro Racing (código ${team.inviteCode})`;
  const msg = `${text}: ${link}`;
  const enc = encodeURIComponent;
  const channels = [
    ['WhatsApp', 'message', `https://wa.me/?text=${enc(msg)}`],
    ['Telegram', 'send', `https://t.me/share/url?url=${enc(link)}&text=${enc(text)}`],
    ['Correo', 'mail', `mailto:?subject=${enc(title)}&body=${enc(msg)}`],
  ];
  const regen = async () => { try { setTeam(await api('/api/team/invite', { method: 'POST' })); } catch (e) { setError(e.message); } };
  return (
    <Card title="Invitar pilotos">
      <div className="flex items-center gap-3">
        <span className="num flex-1 rounded-[4px] bg-sunken py-3 text-center text-3xl font-bold tracking-[0.25em]">{team.inviteCode}</span>
        <button onClick={() => copy('code', team.inviteCode)} className={btn.ghost} aria-label="Copiar código"><Icon name={copied === 'code' ? 'check' : 'copy'} size={15} /></button>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => copy('link', link)} className={`${btn.primary} flex-1`}><Icon name={copied === 'link' ? 'check' : 'link'} size={15} />{copied === 'link' ? 'Enlace copiado' : 'Copiar enlace'}</button>
        {owner && <ConfirmButton label="Renovar" confirm="Sí, renovar" onConfirm={regen} icon={<Icon name="refresh" size={15} />} />}
      </div>
      <div className="flex flex-wrap gap-2">
        {channels.map(([label, icon, href]) => (
          <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className={`${btn.ghost} flex-1`}><Icon name={icon} size={15} />{label}</a>
        ))}
        {navigator.share && <button onClick={() => navigator.share({ title, text, url: link }).catch(() => {})} className={`${btn.ghost} flex-1`}><Icon name="share" size={15} />Más</button>}
      </div>
      <p className="text-[13px] text-muted">Solo se puede entrar con este código o enlace.{owner && ' Renovarlo invalida el anterior.'}</p>
    </Card>
  );
}

function MembersCard({ team, user, owner, setError }) {
  const live = useLive();
  const remove = async (id) => { try { setTeam(await api(`/api/team/members/${id}`, { method: 'DELETE' })); } catch (e) { setError(e.message); } };
  return (
    <Card title="Miembros" badge={<span className="num text-[12px] text-muted">{team.members.length}</span>} flush>
      <ul>
        {team.members.map((m) => {
          const online = live.online.includes(m.id);
          return (
            <li key={m.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
              <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunken text-[14px] font-bold uppercase">
                {m.name.slice(0, 1)}
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-panel ${online ? 'bg-ok' : 'bg-pending'}`} title={online ? 'Conectado' : 'Desconectado'} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{m.name}{m.id === user.id && <span className="text-muted"> (tú)</span>}</span>
                <span className="flex flex-wrap gap-1">
                  {m.id === team.ownerId && <Pill tone="accent"><Icon name="crown" size={11} />Capitán</Pill>}
                  {live.driver?.id === m.id && <Pill tone="ok"><Icon name="wheel" size={11} />Al volante</Pill>}
                  {m.role === 'admin' && <Pill tone="info">Admin</Pill>}
                </span>
              </span>
              {owner && m.id !== user.id && <ConfirmButton label="Sacar" confirm="Sacar" onConfirm={() => remove(m.id)} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function RenameCard({ team, save }) {
  return (
    <Card title="Nombre del equipo">
      <SavedInput maxLength={60} value={team.name} onSave={(name) => save({ name })} />
    </Card>
  );
}

function LeaveCard({ team }) {
  const last = team.members.length === 1;
  return (
    <Card title="Salir del equipo" tone="border-crit/40">
      <p className="text-[13px] text-muted">
        {last ? 'Eres el último miembro: si sales, el equipo y todas sus estadísticas se eliminan.' : 'Podrás volver a entrar con una invitación.'}
      </p>
      <div><ConfirmButton label="Salir del equipo" confirm={last ? 'Salir y eliminar' : 'Sí, salir'} icon={<Icon name="logout" size={15} />}
        onConfirm={async () => setSession(await api('/api/team/leave', { method: 'POST' }))} /></div>
    </Card>
  );
}
