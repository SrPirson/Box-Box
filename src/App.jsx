import { useEffect, useState } from 'react';
import Pilot from './views/Pilot.jsx';
import Box from './views/Box.jsx';
import Settings from './views/Settings.jsx';
import Team from './views/Team.jsx';
import Stats from './views/Stats.jsx';
import Admin from './views/Admin.jsx';
import UpdateBanner from './views/Update.jsx';
import Profile from './views/Profile.jsx';
import Events from './views/Events.jsx';
import EventsBrowse from './views/EventsBrowse.jsx';
import { Login, ForcedPassword, Wordmark } from './views/Auth.jsx';
import Icon from './icons.jsx';
import { useSocket } from './lib/store.js';
import { refresh, useSession } from './lib/session.js';
import { useGateway } from './lib/gateway.js';
import { toggleTheme, useTheme } from './lib/theme.js';
import { MODES, modesOf, useMode } from './lib/mode.js';

// Vistas de cada modo (team: solo con equipo). «piloto» (la vista del coche) y «perfil» (el botón con la inicial)
// van aparte: la primera solo en modo Piloto con equipo; el perfil, en todos.
const AdminEvents = (p) => <Events admin {...p} />;
const MODE_VIEWS = {
  pilot: {
    box: { label: 'Box', icon: 'flag', team: true, Page: Box },
    stats: { label: 'Estadísticas', icon: 'chart', team: true, Page: Stats },
    eventos: { label: 'Eventos', icon: 'finish', Page: EventsBrowse },
    equipo: { label: 'Equipo', icon: 'users', team: true, Page: Team },
    ajustes: { label: 'Ajustes', icon: 'sliders', team: true, Page: Settings },
  },
  organizer: { eventos: { label: 'Mis eventos', icon: 'finish', Page: Events } },
  admin: {
    cuentas: { label: 'Cuentas', icon: 'users', Page: Admin },
    eventos: { label: 'Eventos', icon: 'finish', Page: AdminEvents },
  },
};
const fromHash = () => location.hash.slice(1);
const home = (mode, hasTeam) => (mode === 'admin' ? 'cuentas' : mode === 'organizer' || !hasTeam ? 'eventos' : innerWidth < 900 ? 'piloto' : 'box');
// ¿Se puede abrir esta vista en este modo? (si no, se abre la principal del modo)
const valid = (view, mode, hasTeam) => view === 'perfil'
  || (view === 'piloto' && mode === 'pilot' && hasTeam)
  || (MODE_VIEWS[mode][view] && (!MODE_VIEWS[mode][view].team || hasTeam));

export default function App() {
  return (
    <div className="flex h-full flex-col">
      <UpdateBanner />
      <div className="min-h-0 flex-1"><Views /></div>
    </div>
  );
}

function Views() {
  const session = useSession();
  const mode = useMode(session.user?.role);
  const [view, setView] = useState(fromHash);
  const [muted, setMuted] = useState(false);
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const onHash = () => setView(fromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const hasTeam = !!session.team;
  const current = session.user && (valid(view, mode, hasTeam) ? view : home(mode, hasTeam));
  useEffect(() => { if (current && location.hash.slice(1) !== current) history.replaceState(null, '', `#${current}`); }, [current]);

  if (!session.ready) return null;
  if (!session.user) return <Login />;
  if (session.user.mustReset) return <ForcedPassword />;
  if (current === 'piloto') return <Pilot onNav={setView} />;

  const Page = current === 'perfil' ? Profile : MODE_VIEWS[mode][current].Page;
  return (
    <Frame view={current} setView={setView} mode={mode} muted={muted} setMuted={setMuted}>
      <Page muted={muted} onNav={setView} />
    </Frame>
  );
}

function Frame({ view, setView, mode, muted, setMuted, children }) {
  const gw = useGateway();
  const { team } = useSession();
  return (
    <div className="flex h-full flex-col">
      <Header view={view} setView={setView} mode={mode} muted={muted} setMuted={setMuted} />
      {/* Fila propia para volver a Piloto: se tiene que poder acertar conduciendo, con guantes y en movimiento */}
      {mode === 'pilot' && team && (
        <button onClick={() => setView('piloto')}
          className={`flex h-24 shrink-0 items-center justify-center gap-4 bg-accent text-4xl font-bold uppercase tracking-[0.04em] text-panel active:opacity-80 lg:h-12 lg:text-2xl`}>
          <Icon name="wheel" size={40} />{gw.obd === 'on' ? 'Volver a Piloto' : 'Piloto'}
        </button>
      )}
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}

function Header({ view, setView, mode, muted, setMuted }) {
  const { user, team, offline } = useSession();
  const theme = useTheme();
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);
  const items = Object.entries(MODE_VIEWS[mode]).filter(([, v]) => !v.team || team);
  // Sin equipo, un piloto no tiene tiempo real (el servidor no lo admitiría): sin indicador de conexión.
  const live = team || mode !== 'pilot';

  return (
    <header className="flex h-11 shrink-0 items-stretch gap-2 border-b border-line bg-panel px-2 sm:gap-4 sm:px-3">
      <div className="flex items-center gap-2 sm:pr-2">
        {/* Pantallas estrechas: solo el símbolo; anchas: el logotipo completo */}
        <img src="/icon-192.png" alt="Box Box" className="h-7 w-7 xl:hidden" />
        <span className="hidden xl:contents"><Wordmark className="h-6" /></span>
        {/* Con varios modos, cuál está activo (se cambia en el perfil) */}
        {modesOf(user.role).length > 1 && (
          <button onClick={() => setView('perfil')} title="Cambiar de modo en tu perfil"
            className="rounded-[3px] bg-accent-soft px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-accent">{MODES[mode]}</button>
        )}
        {mode === 'pilot' && team && <span className="hidden max-w-40 truncate text-[13px] font-semibold uppercase tracking-[0.08em] text-muted 2xl:inline">· {team.name}</span>}
      </div>
      <nav className="-mb-px flex min-w-0 items-stretch overflow-x-auto" aria-label="Vistas">
        {items.map(([id, v]) => (
          <button key={id} onClick={() => setView(id)} aria-current={id === view ? 'page' : undefined} title={v.label}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2 text-[13px] font-semibold uppercase tracking-[0.08em] transition-colors sm:px-3 ${id === view ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}>
            <Icon name={v.icon} size={15} className="lg:hidden" />
            <span className="hidden lg:inline">{v.label}</span>
          </button>
        ))}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2 text-[13px] sm:gap-4">
        {live && <Connection offline={offline} />}
        <span className="num hidden text-fg-2 xl:inline">{clock.toLocaleTimeString('es-ES')}</span>
        {view === 'box' && (
          <IconButton onClick={() => setMuted(!muted)} label={muted ? 'Activar sonido de alarmas' : 'Silenciar alarmas'} active={muted}>
            <Icon name={muted ? 'mute' : 'volume'} />
          </IconButton>
        )}
        <IconButton onClick={toggleTheme} label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </IconButton>
        <button onClick={() => setView('perfil')} title={`${user.name} · Mi perfil`}
          className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-[14px] font-bold uppercase text-accent">
          {user.name.slice(0, 1)}
        </button>
      </div>
    </header>
  );
}

function Connection({ offline }) {
  const { connected } = useSocket();
  const ok = connected && !offline;
  return (
    <span className={`flex items-center gap-1.5 font-semibold uppercase tracking-[0.06em] ${ok ? 'text-ok' : 'text-crit'}`} title={ok ? 'Conectado' : 'Sin conexión'}>
      <span className={`h-2 w-2 rounded-full ${ok ? 'bg-ok' : 'pulse bg-crit'}`} />
      <span className="hidden md:inline">{ok ? 'Conectado' : 'Sin conexión'}</span>
    </span>
  );
}

export const IconButton = ({ label, active, className = '', ...p }) => (
  <button {...p} title={label} aria-label={label}
    className={`grid h-8 w-8 place-items-center rounded-[4px] border transition-colors ${active ? 'border-warn bg-warn-soft text-warn' : 'border-line text-fg-2 hover:bg-raised hover:text-fg'} ${className}`} />
);
