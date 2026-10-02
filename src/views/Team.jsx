// Equipo: las personas (invitar, miembros, nombre, evento y salir). Lo del coche (dorsal, icono, alertas,
// teléfono del mecánico) está en Ajustes: CarCard y AlertsCard se exportan para usarlas allí.
import { useEffect, useState } from 'react';
import Icon from '../icons.jsx';
import { api, inviteLink, setSession, setTeam, useSession } from '../lib/session.js';
import { useLive } from '../lib/store.js';
import { LIMITS, limitErrors } from '../lib/limits.js';
import { Page, Card, Field, Pill, NumInput, ConfirmButton, ErrorText, input, btn } from './ui.jsx';
import CarIconEditor from './CarIconEditor.jsx';

// Guardar cambios del equipo: devuelve true si se guardó y deja el error a la vista.
export function useTeamSave() {
  const [error, setError] = useState('');
  const save = async (patch) => {
    setError('');
    try { setTeam(await api('/api/team', { method: 'PATCH', body: patch })); return true; } catch (e) { setError(e.message); return false; }
  };
  return { error, setError, save };
}

export default function Team({ onNav }) {
  const { user, team } = useSession();
  const owner = user.role === 'admin' || team.ownerId === user.id;
  const { error, setError, save } = useTeamSave();

  return (
    <Page title={team.name} subtitle={owner ? 'Eres el capitán: gestionas invitaciones, miembros y la inscripción en eventos.' : 'El coche se configura en Ajustes; cualquier miembro puede hacerlo.'}>
      <ErrorText>{error}</ErrorText>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <EventCard team={team} owner={owner} setError={setError} onNav={onNav} />
          <InviteCard team={team} owner={owner} setError={setError} />
          {owner && <RenameCard team={team} save={save} />}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <MembersCard team={team} user={user} owner={owner} setError={setError} />
          <LeaveCard team={team} />
        </div>
      </div>
    </Page>
  );
}

// Evento en el que corre el equipo; el capitán puede sacarlo (vuelve a ser de entrenamiento).
function EventCard({ team, owner, setError, onNav }) {
  const ev = team.event;
  return (
    <Card title="Evento">
      {ev ? <>
        <div className="flex items-center gap-3">
          <Icon name="finish" size={22} className="text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold uppercase tracking-[0.04em]">{ev.name}</div>
            <div className="text-[13px] text-muted">{[ev.startsOn && new Date(`${ev.startsOn}T12:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }), ev.place].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        {owner && <ConfirmButton label="Sacar al equipo del evento" confirm="Sí, sacarlo"
          onConfirm={() => api('/api/team/enroll', { method: 'POST', body: { eventId: null } }).then(setTeam).catch((e) => setError(e.message))} />}
      </> : <>
        <p className="text-[14px] text-fg-2">Equipo de entrenamiento: no está inscrito en ningún evento.</p>
        <button onClick={() => onNav?.('eventos')} className={btn.ghost}><Icon name="finish" size={15} />{owner ? 'Buscar un evento para inscribirlo' : 'Ver eventos'}</button>
      </>}
    </Card>
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

export function CarCard({ team, save }) {
  return (
    <Card title="Coche">
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <Field label="Dorsal"><SavedInput className="num text-lg font-bold" inputMode="numeric" maxLength={6} value={team.dorsal} onSave={(dorsal) => save({ dorsal })} /></Field>
        <Field label="Teléfono del mecánico" help="Se marca cuando el piloto pulsa AVERÍA.">
          <SavedInput className="num" type="tel" placeholder="+34 600 000 000" value={team.phone} onSave={(phone) => save({ phone })} />
        </Field>
      </div>
      <CarIconField team={team} save={save} />
      {team.event ? (
        // En un evento la pista es la del organizador: aquí solo se informa.
        <div className="flex flex-wrap items-center gap-3 rounded-[4px] border border-accent/40 bg-accent-soft px-3 py-2.5">
          <Icon name="finish" size={20} className="text-accent" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold uppercase tracking-[0.04em]">{team.event.name}</div>
            <div className="text-[13px] text-fg-2">
              {[team.event.startsOn && new Date(`${team.event.startsOn}T12:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }), team.event.place].filter(Boolean).join(' · ')}
              {team.event.startsOn || team.event.place ? ' · ' : ''}La pista (meta, trazado y tramos) la define el organizador.
            </div>
          </div>
        </div>
      ) : <>
      {team.track?.name && <p className="flex items-center gap-2 text-[14px]"><Icon name="flag" size={16} className="text-muted" />Pista activa: <b>{team.track.name}</b></p>}
      {[
        ['line', 'finish', 'Línea de meta', 'Definida: cada cruce cierra una vuelta.', team.track?.path ? 'Sin definir: hace de meta el primer punto del trazado.' : 'Sin definir. Dibújala en el mapa de BOX con «Meta».'],
        ['path', 'route', 'Trazado del circuito', 'Dibujado: BOX avisa si el coche se sale y solo cuenta vueltas completas.', 'Sin dibujar. Dibújalo en el mapa de BOX con «Trazado».'],
        ['sectors', 'timer', 'Tramos', `${(team.track?.sectors?.length ?? 0) + 1} tramos: BOX y Estadísticas muestran el parcial de cada uno.`, 'Sin tramos. Márcalos en el mapa de BOX con «Tramos».'],
      ].map(([key, icon, name, yes, no]) => (
        <div key={key} className="flex flex-wrap items-center gap-3 rounded-[4px] bg-sunken px-3 py-2.5">
          <Icon name={icon} size={18} className="text-muted" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold uppercase tracking-[0.04em]">{name}</div>
            <div className="text-[13px] text-muted">{team.track?.[key] ? yes : no}</div>
          </div>
          {team.track?.[key] && <ConfirmButton label="Borrar" confirm="Sí, borrar" onConfirm={() => save({ track: { ...team.track, [key]: undefined } })} />}
        </div>
      ))}
      </>}
    </Card>
  );
}

// Icono del coche en el mapa: se encuadra en el editor y se sube ya reducido a 96 px.
function CarIconField({ team, save }) {
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // imagen elegida, pendiente de encuadrar
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    setError('');
    try { setEditing(await createImageBitmap(file)); } catch { setError('No se pudo leer la imagen. Prueba con una foto JPG o PNG.'); }
  };
  if (editing) return (
    <CarIconEditor img={editing} onCancel={() => setEditing(null)}
      onSave={async (carIcon, carIconStyle) => { if (await save({ carIcon, carIconStyle })) setEditing(null); }} />
  );
  const sprite = team.carIconStyle === 'sprite';
  return (
    <div className="flex flex-wrap items-center gap-3">
      {team.carIcon && sprite
        ? <div className="car-sprite" data-state="ok"><img src={team.carIcon} alt="" /><span>{team.dorsal}</span></div>
        : <div className="car-dot has-img" data-state="ok">{team.carIcon ? <img src={team.carIcon} alt="" /> : <Icon name="car" size={22} />}<span>{team.dorsal}</span></div>}
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold uppercase tracking-[0.04em]">Icono en el mapa</div>
        <div className="text-[13px] text-muted">
          {team.carIcon ? (sprite ? 'Silueta: en el mapa gira según hacia dónde va el coche.' : 'Foto en círculo.')
            : 'Una foto de tu coche, o un coche visto desde arriba sin fondo, para seguirlo en el mapa de BOX.'}
        </div>
        {error && <div className="text-[13px] text-crit">{error}</div>}
      </div>
      <label className={`${btn.ghost} cursor-pointer`}>
        <Icon name="download" size={15} className="rotate-180" />{team.carIcon ? 'Cambiar' : 'Subir imagen'}
        <input type="file" accept="image/*" onChange={pick} className="sr-only" />
      </label>
      {team.carIcon && <ConfirmButton label="Quitar" confirm="Sí, quitar" onConfirm={() => save({ carIcon: null })} />}
    </div>
  );
}

const ALERT_ROWS = [
  { id: 'temp', name: 'Temperatura motor', cond: 'Aviso desde · crítico por encima de', unit: '°C', warn: 'tempWarn', crit: 'tempCrit', step: 1 },
  { id: 'volt', name: 'Batería baja', cond: 'Por debajo de', unit: 'V', warn: 'voltWarn', crit: 'voltCrit', step: 0.1 },
  { id: 'voltHigh', name: 'Sobretensión', cond: 'Por encima de (fallo de regulador)', unit: 'V', warn: 'voltHighWarn', crit: 'voltHighCrit', step: 0.1 },
  { id: 'rpm', name: 'Régimen motor', cond: 'Aviso visual desde · crítico en el limitador', unit: 'rpm', warn: 'rpmWarn', crit: 'rpmCrit', step: 100 },
  { id: 'stale', name: 'Sin datos del coche', cond: 'Segundos sin recibir telemetría', unit: 's', warn: 'staleWarn', crit: 'staleCrit', step: 1 },
  { id: 'phone', name: 'Batería del móvil', cond: 'Por debajo de', unit: '%', warn: 'phoneWarn', crit: 'phoneCrit', step: 1 },
  { id: 'off', name: 'Fuera del trazado', cond: 'Metros desde el trazado dibujado (descontando el error del GPS)', unit: 'm', warn: 'offWarn', crit: 'offCrit', step: 5 },
];

// Borrador local: las alertas se comparten con todo el equipo, así que se guardan de una vez y solo si son coherentes.
export function AlertsCard({ team, save }) {
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
  const text = `${title} en Box Box (código ${team.inviteCode})`;
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
        {last ? 'Eres el último miembro: si sales, el equipo se elimina. Cada piloto conserva sus vueltas en su perfil.' : 'Podrás volver a entrar con una invitación.'}
      </p>
      <div><ConfirmButton label="Salir del equipo" confirm={last ? 'Salir y eliminar' : 'Sí, salir'} icon={<Icon name="logout" size={15} />}
        onConfirm={async () => setSession(await api('/api/team/leave', { method: 'POST' }))} /></div>
    </Card>
  );
}
