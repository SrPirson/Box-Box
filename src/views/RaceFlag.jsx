// Dirección de carrera: la bandera del evento. En Piloto, a pantalla completa hasta pulsar «Visto»; después, y
// en el resto de vistas, una franja fija de su color mientras siga activa. La verde se anuncia 3 s y la retira.
import { useEffect } from 'react';
import Icon from '../icons.jsx';
import { useLive, seeFlag, FLAG_INFO, speak } from '../lib/store.js';

const title = (f) => (f.type === 'text' ? f.text : FLAG_INFO[f.type].label);

// La verde no se confirma: se quita sola.
function useGreenTimeout(f, seen) {
  useEffect(() => {
    if (f?.type !== 'green' || seen) return;
    const t = setTimeout(seeFlag, 3000);
    return () => clearTimeout(t);
  }, [f?.ts, seen]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function RaceFlagScreen() {
  const { flag: f, flagSeen } = useLive();
  const seen = !f || f.ts === flagSeen;
  useGreenTimeout(f, seen);
  if (seen) return null;
  const info = FLAG_INFO[f.type];
  return (
    <div role="alertdialog" aria-label={info.label} className={`safe fixed inset-0 z-[2100] ${info.cls}`}><div className="flex h-full flex-col p-3">
      <div className="text-lg font-bold uppercase tracking-[0.08em]">Dirección de carrera · {new Date(f.ts).toLocaleTimeString('es-ES')}</div>
      <button onClick={() => speak(f.type === 'text' ? f.text : info.say)} aria-label="Repetir aviso"
        className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-[clamp(44px,14vmin,110px)] font-bold uppercase leading-[0.95]">
        <Icon name="flag" size={96} stroke={2.5} />{title(f)}
      </button>
      {f.type !== 'green' && (
        <button onClick={seeFlag} className="flex h-1/4 items-center justify-center gap-3 rounded-md border-[3px] border-current text-5xl font-bold uppercase active:scale-[0.98]">
          <Icon name="check" size={40} stroke={3} />Visto
        </button>
      )}
    </div></div>
  );
}

// big: más alta, para la vista Piloto. Mientras no se ha visto, con botón «Visto» (lo puede marcar BOX).
export function RaceFlagBanner({ big = false }) {
  const { flag: f, flagSeen } = useLive();
  const seen = !f || f.ts === flagSeen;
  useGreenTimeout(f, seen);
  if (!f || (f.type === 'green' && seen)) return null;
  return (
    <div role="status" className={`flex shrink-0 items-center gap-3 px-3 font-bold uppercase ${FLAG_INFO[f.type].cls} ${big ? 'h-14 text-2xl' : 'h-10 text-lg'}`}>
      <Icon name="flag" size={big ? 28 : 20} stroke={2.5} />
      <span className="min-w-0 flex-1 truncate">{title(f)}</span>
      {!seen && f.type !== 'green' && (
        <button onClick={seeFlag} className={`rounded-md border-2 border-current px-3 font-bold uppercase ${big ? 'h-11' : 'h-8 text-base'}`}>Visto</button>
      )}
    </div>
  );
}
