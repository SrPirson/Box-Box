// Configuración del dispositivo y modo test (simulador OBD2).
import { useState } from 'react';
import { useConfig, setConfig, speak } from '../lib/store.js';
import { sim, useGateway, start, stop } from '../lib/gateway.js';

const Field = ({ label, children }) => (
  <label className="flex flex-col gap-1 text-sm font-bold uppercase tracking-wider text-white/60">{label}{children}</label>
);
const input = 'rounded bg-white/10 px-3 py-3 text-xl font-mono text-white normal-case tracking-normal';

export default function Config() {
  const cfg = useConfig();
  const gw = useGateway();
  const [faults, setFaults] = useState({ ...sim });
  const toggle = (k) => { sim[k] = !sim[k]; setFaults({ ...sim }); };
  const bind = (k, map = (v) => v) => ({ value: cfg[k], onChange: (e) => setConfig({ [k]: map(e.target.value) }) });

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col gap-4 overflow-auto p-4">
      <Field label="Dorsal del coche"><input className={input} inputMode="numeric" {...bind('dorsal')} /></Field>
      <Field label="Teléfono del mecánico"><input className={input} type="tel" placeholder="+34 600 000 000" {...bind('phone')} /></Field>
      <Field label="Canal (multidifusión con otros coches)"><input className={input} {...bind('channel')} /></Field>
      <Field label="Servidor BOX (vacío = este mismo)"><input className={input} placeholder="https://box.mi-equipo.es" {...bind('serverUrl')} /></Field>
      <Field label={`Ciclo OBD / envío: ${cfg.pollMs} ms`}>
        <input type="range" min="200" max="500" step="50" {...bind('pollMs', Number)} />
      </Field>
      <Field label="Fuente de datos OBD2">
        <select className={input} {...bind('source')} disabled={gw.obd === 'on'}>
          <option value="sim">Simulador</option>
          <option value="ble">ELM327 Bluetooth (BLE)</option>
        </select>
      </Field>

      <section className="rounded-lg border border-neon-yellow/50 p-3">
        <h2 className="mb-2 font-black text-neon-yellow">MODO TEST · SIMULADOR</h2>
        <div className="grid grid-cols-3 gap-2">
          {[['overheat', 'SOBRECALENTAR'], ['lowVolt', 'FALLO ALTERNADOR'], ['stall', 'MOTOR CALADO']].map(([k, l]) => (
            <button key={k} onClick={() => toggle(k)} className={`rounded py-3 text-sm font-black ${faults[k] ? 'bg-neon-red text-black' : 'bg-white/10'}`}>{l}</button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={gw.obd === 'on' ? stop : start} className="flex-1 rounded bg-neon-green py-3 font-black text-black">
            {gw.obd === 'on' ? 'PARAR TELEMETRÍA' : 'INICIAR TELEMETRÍA'}
          </button>
          <button onClick={() => speak('Prueba de voz. Entra en box.')} className="rounded bg-white/10 px-4 font-bold">PROBAR VOZ</button>
        </div>
        {gw.data && <pre className="mt-2 overflow-auto text-xs text-white/60">{JSON.stringify(gw.data, null, 1)}</pre>}
      </section>
    </div>
  );
}
