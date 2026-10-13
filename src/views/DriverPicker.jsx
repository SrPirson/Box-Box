// Quién conduce, en la vista PILOTO. El móvil se queda en el coche con el OBD conectado y desde él se elige
// qué miembro del equipo va al volante (relevo sin tocar el Bluetooth): un toque en «Cambiar» y otro en el nombre.
import { useState } from 'react';
import Icon from '../icons.jsx';
import { useLive, getSocket } from '../lib/store.js';
import { useSession } from '../lib/session.js';
import { start, stop } from '../lib/gateway.js';

export default function DriverPicker({ isDriver, busy }) {
  const { team } = useSession();
  const { driver, online } = useLive();
  const [open, setOpen] = useState(false);
  const pick = (m) => {
    if (m.id !== driver?.id) getSocket().emit('drive', { driverId: m.id });
    navigator.vibrate?.(100);
    setOpen(false);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-raised px-3 py-3">
        <Icon name="wheel" size={26} className={isDriver ? 'text-accent' : 'text-muted'} />
        <div className="min-w-0 flex-1 text-lg font-bold uppercase leading-tight">
          {driver ? <>Conduce {driver.name}</> : 'Nadie al volante'}
          {!isDriver && <div className="text-[14px] font-semibold normal-case text-muted">Toma el volante para enviar la telemetría desde este móvil.</div>}
        </div>
        {isDriver
          ? <button onClick={() => setOpen(true)} className="h-12 rounded-md border-2 border-accent px-5 text-lg font-bold uppercase tracking-[0.04em] text-accent">Cambiar</button>
          : <button onClick={busy ? stop : start} className="h-12 rounded-md bg-accent px-5 text-lg font-bold uppercase tracking-[0.04em] text-panel">{busy ? 'Conectando · cancelar' : 'Tomar el volante'}</button>}
      </div>

      {open && (
        <div role="dialog" aria-label="Quién conduce" className="safe fixed inset-0 z-[1500] bg-bg"><div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
          <div className="text-xl font-bold uppercase text-muted">¿Quién conduce?</div>
          {team.members.map((m) => {
            const on = driver?.id === m.id;
            return (
              <button key={m.id} onClick={() => pick(m)}
                className={`flex min-h-20 shrink-0 items-center gap-3 rounded-md border-[3px] px-4 text-left text-3xl font-bold uppercase active:scale-[0.98] ${on ? 'border-accent bg-accent text-panel' : 'border-line'}`}>
                <Icon name={on ? 'wheel' : 'user'} size={32} stroke={2.5} />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                {online.includes(m.id) && !on && <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-ok" title="Conectado" />}
              </button>
            );
          })}
          <button onClick={() => setOpen(false)} className="mt-auto flex h-16 shrink-0 items-center justify-center gap-3 rounded-md border-[3px] border-line text-2xl font-bold uppercase text-fg-2">
            <Icon name="x" size={28} stroke={2.5} />Cancelar
          </button>
        </div></div>
      )}
    </>
  );
}
