import { useEffect, useState } from 'react';
import Pilot from './views/Pilot.jsx';
import Box from './views/Box.jsx';
import Config from './views/Config.jsx';

const VIEWS = { piloto: Pilot, box: Box, config: Config };
const initial = () => location.hash.slice(1) in VIEWS ? location.hash.slice(1) : innerWidth < 900 ? 'piloto' : 'box';

export default function App() {
  const [view, setView] = useState(initial);
  useEffect(() => { location.hash = view; }, [view]);
  const View = VIEWS[view];
  return (
    <div className="flex h-full flex-col">
      <nav className="flex shrink-0 gap-1 border-b border-white/10 p-1 text-xs font-bold uppercase tracking-wider">
        {Object.keys(VIEWS).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded px-3 py-2 ${v === view ? 'bg-white text-black' : 'text-white/50'}`}>{v}</button>
        ))}
        <span className="ml-auto self-center pr-2 text-white/30">CENCERRO RACING</span>
      </nav>
      <main className="min-h-0 flex-1"><View /></main>
    </div>
  );
}
