// Acceso: entrar / crear cuenta, cambio obligatorio de contraseña y unirse o crear un equipo.
import { useState } from 'react';
import Icon from '../icons.jsx';
import { api, setSession, logout, pendingInvite, clearInvite, useSession } from '../lib/session.js';

const input = 'h-11 w-full rounded-[4px] border border-line-strong bg-sunken px-3 text-[16px] text-fg placeholder:text-muted';

export const Shell = ({ children, wide }) => (
  <div className="flex min-h-full flex-col items-center justify-center gap-6 bg-bg p-4">
    <div className="flex items-center gap-3">
      <img src="/icon.svg" alt="" className="h-10 w-10 rounded-md" />
      <div className="leading-none">
        <div className="text-2xl font-bold uppercase tracking-[0.14em]">Box Box</div>
        <div className="text-[13px] font-semibold uppercase tracking-[0.3em] text-muted">Racing · Comms & Telemetry</div>
      </div>
    </div>
    <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-sm'}`}>{children}</div>
  </div>
);

const Panel = ({ title, children }) => (
  <section className="rounded-[4px] border border-line bg-panel">
    {title && <header className="flex h-10 items-center border-b border-line px-4"><h2 className="label">{title}</h2></header>}
    <div className="flex flex-col gap-4 p-4">{children}</div>
  </section>
);

function Field({ label, type, ...p }) {
  const [shown, setShown] = useState(false);
  const isPass = type === 'password';
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fg-2">{label}</span>
      {isPass ? (
        <div className="relative">
          <input className={`${input} pr-11`} type={shown ? 'text' : 'password'} {...p} />
          <button type="button" tabIndex={-1} onClick={() => setShown(!shown)} aria-label={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={shown}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted hover:text-fg">
            <Icon name={shown ? 'eyeOff' : 'eye'} />
          </button>
        </div>
      ) : <input className={input} type={type} {...p} />}
    </label>
  );
}

const ErrorText = ({ children }) => children ? <p role="alert" className="rounded-[4px] bg-crit-soft px-3 py-2 text-[14px] font-semibold text-crit">{children}</p> : null;

const Submit = ({ busy, children }) => (
  <button disabled={busy} className="h-11 rounded-[4px] bg-accent text-[15px] font-bold uppercase tracking-[0.08em] text-panel transition-opacity disabled:opacity-60">
    {busy ? 'Un momento…' : children}
  </button>
);

// Envuelve un envío: estado ocupado + mensaje de error del servidor.
function useSubmit(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await fn(new FormData(e.currentTarget)); } catch (err) { setError(err instanceof TypeError ? 'Sin conexión con el servidor.' : err.message); }
    setBusy(false);
  };
  return { busy, error, onSubmit };
}

export function Login() {
  const [mode, setMode] = useState('login');
  const login = useSubmit(async (f) => setSession(await api('/api/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } })));
  const register = useSubmit(async (f) => {
    if (f.get('password') !== f.get('password2')) throw new Error('Las contraseñas no coinciden.');
    setSession(await api('/api/register', { method: 'POST', body: { name: f.get('name'), email: f.get('email'), password: f.get('password') } }));
  });
  const invite = pendingInvite();

  return (
    <Shell>
      {invite && <p className="mb-3 rounded-[4px] bg-info-soft px-3 py-2 text-[14px] text-info">Te han invitado a un equipo (código <b className="num">{invite}</b>). Entra o crea tu cuenta para unirte.</p>}
      <div role="tablist" className="mb-3 flex rounded-[4px] border border-line-strong bg-sunken p-0.5">
        {[['login', 'Entrar'], ['register', 'Crear cuenta']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
            className={`h-10 flex-1 rounded-[3px] text-[14px] font-semibold uppercase tracking-[0.06em] ${mode === id ? 'bg-panel text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg'}`}>
            {label}
          </button>
        ))}
      </div>
      {mode === 'login' ? (
        <form onSubmit={login.onSubmit}>
          <Panel>
            <Field label="Email" name="email" type="email" autoComplete="email" required />
            <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required />
            <ErrorText>{login.error}</ErrorText>
            <Submit busy={login.busy}>Entrar</Submit>
            <p className="text-[13px] text-muted">¿Olvidaste la contraseña? Pide al administrador que la restablezca.</p>
          </Panel>
        </form>
      ) : (
        <form onSubmit={register.onSubmit}>
          <Panel>
            <Field label="Nombre" name="name" autoComplete="name" maxLength={60} required placeholder="Como te verá el equipo" />
            <Field label="Email" name="email" type="email" autoComplete="email" required />
            <Field label="Contraseña" name="password" type="password" autoComplete="new-password" minLength={8} required placeholder="Mínimo 8 caracteres" />
            <Field label="Repite la contraseña" name="password2" type="password" autoComplete="new-password" minLength={8} required />
            <ErrorText>{register.error}</ErrorText>
            <Submit busy={register.busy}>Crear cuenta</Submit>
          </Panel>
        </form>
      )}
    </Shell>
  );
}

export function ForcedPassword() {
  const { user } = useSession();
  const f = useSubmit(async (d) => {
    if (d.get('next') !== d.get('next2')) throw new Error('Las contraseñas no coinciden.');
    setSession(await api('/api/password', { method: 'POST', body: { next: d.get('next') } }));
  });
  return (
    <Shell>
      <form onSubmit={f.onSubmit}>
        <Panel title="Nueva contraseña">
          <p className="text-[14px] text-fg-2">Hola, {user.name}. Un administrador ha restablecido tu contraseña: elige una nueva para continuar.</p>
          <Field label="Nueva contraseña" name="next" type="password" autoComplete="new-password" minLength={8} required />
          <Field label="Repítela" name="next2" type="password" autoComplete="new-password" minLength={8} required />
          <ErrorText>{f.error}</ErrorText>
          <Submit busy={f.busy}>Guardar y continuar</Submit>
        </Panel>
      </form>
    </Shell>
  );
}

export function TeamGate({ onAdmin }) {
  const { user } = useSession();
  const join = useSubmit(async (f) => { setSession(await api('/api/teams/join', { method: 'POST', body: { code: f.get('code') } })); clearInvite(); });
  const create = useSubmit(async (f) => setSession(await api('/api/teams', { method: 'POST', body: { name: f.get('name') } })));
  return (
    <Shell wide>
      <p className="mb-4 text-center text-[15px] text-fg-2">Hola, <b className="text-fg">{user.name}</b>. Para ver la carrera necesitas un equipo.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={join.onSubmit}>
          <Panel title="Unirme con invitación">
            <p className="text-[13px] text-muted">Pide al equipo su código o su enlace de invitación.</p>
            <Field label="Código" name="code" defaultValue={pendingInvite()} required maxLength={12} autoCapitalize="characters" className={`${input} num uppercase tracking-[0.2em]`} placeholder="ABC123" />
            <ErrorText>{join.error}</ErrorText>
            <Submit busy={join.busy}>Unirme</Submit>
          </Panel>
        </form>
        <form onSubmit={create.onSubmit}>
          <Panel title="Crear un equipo">
            <p className="text-[13px] text-muted">Serás el capitán: podrás invitar pilotos y gestionar el equipo.</p>
            <Field label="Nombre del equipo" name="name" required maxLength={60} placeholder="Mi equipo Racing" />
            <ErrorText>{create.error}</ErrorText>
            <Submit busy={create.busy}>Crear equipo</Submit>
          </Panel>
        </form>
      </div>
      <div className="mt-6 flex justify-center gap-4 text-[13px] font-semibold uppercase tracking-[0.06em]">
        {user.role === 'admin' && <button onClick={onAdmin} className="flex items-center gap-1.5 text-accent hover:underline"><Icon name="shield" size={15} />Panel de administración</button>}
        <button onClick={logout} className="flex items-center gap-1.5 text-muted hover:text-fg"><Icon name="logout" size={15} />Cerrar sesión</button>
      </div>
    </Shell>
  );
}
