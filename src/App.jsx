import { useEffect, useState } from 'react';
import Pilot from './views/Pilot.jsx';
import Box from './views/Box.jsx';
import Config from './views/Config.jsx';
import Icon from './icons.jsx';
import { useSocket } from './lib/store.js';
import { toggleTheme, useTheme } from './lib/theme.js';

const VIEWS = { box: 'Box', config: 'Configuración', piloto: 'Piloto' };
const SHORT = { config: 'Config' };
const initial = () => (location.hash.slice(1) in VIEWS ? location.hash.slice(1) : innerWidth < 900 ? 'piloto' : 'box');

export default function App() {
  const [view, setView] = useState(initial);
  const [muted, setMuted] = useState(false);
  useEffect(() => { location.hash = view; }, [view]);
  useEffect(() => {
    const onHash = () => location.hash.slice(1) in VIEWS && setView(location.hash.slice(1));
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  if (view === 'piloto') return <Pilot onNav={setView} />;
  return (
    <div className="flex h-full flex-col">
      <Header view={view} setView={setView} muted={muted} setMuted={setMuted} />
      <main className="min-h-0 flex-1">{view === 'box' ? <Box muted={muted} /> : <Config />}</main>
    </div>
  );
}

function Header({ view, setView, muted, setMuted }) {
  const { connected, cfg } = useSocket();
  const theme = useTheme();
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  return (
    <header className="flex h-11 shrink-0 items-stretch gap-2 border-b border-line bg-panel px-2 sm:gap-4 sm:px-3">
      <div className="flex items-center gap-2 sm:pr-2">
        <img src="/icon.svg" alt="" className="h-6 w-6 rounded-[3px]" />
        <span className="hidden text-lg font-bold uppercase tracking-[0.12em] sm:inline">Cencerro</span>
        <span className="hidden text-lg font-semibold uppercase tracking-[0.12em] text-muted lg:inline">Racing</span>
      </div>
      <nav className="flex items-stretch" aria-label="Vistas">
        {Object.entries(VIEWS).map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} aria-current={id === view ? 'page' : undefined}
            className={`border-b-2 px-2 text-[13px] sm:px-3 font-semibold uppercase tracking-[0.08em] transition-colors ${id === view ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}>
            {SHORT[id] ? <><span className="hidden sm:inline">{label}</span><span className="sm:hidden">{SHORT[id]}</span></> : label}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2 text-[13px] sm:gap-4">
        <span className="hidden items-center gap-1.5 md:flex"><span className="label">Canal</span><span className="num text-fg-2">{cfg.channel}</span></span>
        <span className={`flex items-center gap-1.5 font-semibold uppercase tracking-[0.06em] ${connected ? 'text-ok' : 'text-crit'}`} title={connected ? 'Conectado' : 'Sin conexión'}>
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-ok' : 'pulse bg-crit'}`} />
          <span className="hidden md:inline">{connected ? 'Conectado' : 'Sin conexión'}</span>
        </span>
        <span className="num hidden text-fg-2 lg:inline">{clock.toLocaleTimeString('es-ES')}</span>
        {view === 'box' && (
          <IconButton onClick={() => setMuted(!muted)} label={muted ? 'Activar sonido de alarmas' : 'Silenciar alarmas'} active={muted}>
            <Icon name={muted ? 'mute' : 'volume'} />
          </IconButton>
        )}
        <IconButton onClick={toggleTheme} label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </IconButton>
      </div>
    </header>
  );
}

export const IconButton = ({ label, active, className = '', ...p }) => (
  <button {...p} title={label} aria-label={label}
    className={`grid h-8 w-8 place-items-center rounded-[4px] border transition-colors ${active ? 'border-warn bg-warn-soft text-warn' : 'border-line text-fg-2 hover:bg-raised hover:text-fg'} ${className}`} />
);
