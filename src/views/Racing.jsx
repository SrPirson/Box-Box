// Participar en el evento: un equipo inscrito puede estar corriéndolo (pista del organizador, vueltas para la
// clasificación, banderas) o entrenando con sus propias pistas. Cualquier miembro lo cambia.
import { useState } from 'react';
import Icon from '../icons.jsx';
import { api, setTeam, useSession } from '../lib/session.js';
import { Segmented } from './ui.jsx';

// Tipo de cada vuelta en las estadísticas.
export const KINDS = { free: 'Libre', practice: 'Entrenamiento', race: 'Carrera' };
export const KIND_OPTIONS = [['all', 'Todo'], ...Object.entries(KINDS)];
export const SESSIONS = [['practice', 'Entrenamiento'], ['race', 'Carrera']];

function useRacing() {
  const { team } = useSession();
  const [error, setError] = useState('');
  const set = (racing) => { setError(''); return api('/api/team', { method: 'PATCH', body: { racing } }).then(setTeam).catch((e) => setError(e.message)); };
  return { team, set, error };
}

export function RacingToggle({ label = 'Participando en el evento' }) {
  const { team, set, error } = useRacing();
  if (!team?.event) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <Segmented label={label} value={team.racing ? 'yes' : 'no'} onChange={(v) => set(v === 'yes')} options={[['yes', 'Sí'], ['no', 'No · entreno']]} />
      <span className="text-[13px] leading-snug text-muted">{team.racing
        ? `Pista del organizador; las vueltas cuentan en la clasificación (sesión: ${SESSIONS.find(([k]) => k === team.event.session)?.[1] ?? 'Carrera'}).`
        : 'Entrenáis con vuestras pistas; las vueltas se guardan como libres y el organizador no os ve.'}</span>
      {error && <span role="alert" className="text-[13px] text-crit">{error}</span>}
    </div>
  );
}

// Botón compacto para la barra del mapa de BOX.
export function RacingButton() {
  const { team, set, error } = useRacing();
  if (!team?.event) return null;
  const small = 'flex h-8 items-center gap-1.5 rounded-[4px] border px-2.5 text-[12px] font-semibold uppercase tracking-[0.06em]';
  return <>
    <button onClick={() => set(!team.racing)} className={`${small} ${team.racing ? 'border-line text-fg-2 hover:bg-raised' : 'border-accent bg-accent text-panel'}`}>
      <Icon name="finish" size={14} />{team.racing ? 'Dejar el evento · entrenar' : `Participar · ${team.event.name}`}
    </button>
    {error && <span className="text-[12px] text-crit">{error}</span>}
  </>;
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// El día del evento, si el equipo aún no participa: que no salga a pista sin que cuenten sus vueltas.
export function EventTodayBanner({ big = false }) {
  const { team, set } = useRacing();
  if (!team?.event || team.racing || team.event.startsOn !== today()) return null;
  return (
    <div role="status" className={`flex shrink-0 items-center gap-3 bg-accent-soft px-3 font-bold text-accent ${big ? 'h-14 text-xl' : 'h-10 text-[15px]'}`}>
      <Icon name="finish" size={big ? 26 : 18} />
      <span className="min-w-0 flex-1 truncate">Hoy es {team.event.name}</span>
      <button onClick={() => set(true)} className={`rounded-md bg-accent px-3 font-bold uppercase text-panel ${big ? 'h-11' : 'h-8 text-[13px]'}`}>Participar</button>
    </div>
  );
}
