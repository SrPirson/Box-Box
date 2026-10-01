// Vista PILOTO (móvil en el salpicadero): rejilla de botones gigantes + overlay prioritario de BOX.
import { useState } from 'react';
import { useSocket, speak } from '../lib/store.js';
import { useGateway, start, stop, lastGps } from '../lib/gateway.js';

const ACTIONS = [
  { type: 'breakdown', label: 'AVERÍA / LLAMAR MECÁNICO', cls: 'border-neon-red text-neon-red', critical: true },
  { type: 'pit', label: 'SALGO A BOX', cls: 'border-neon-green text-neon-green' },
  { type: 'fuel', label: 'REPOSTAR Y CAMBIO', cls: 'border-neon-blue text-neon-blue' },
  { type: 'damage', label: 'PINCHAZO / DAÑO', cls: 'border-neon-orange text-neon-orange' },
  { type: 'rain', label: 'LLUVIA EN PISTA', cls: 'border-neon-pink text-neon-pink' },
  { type: 'sc', label: 'SAFETY CAR', cls: 'border-neon-yellow text-neon-yellow' },
];

const LED = { on: 'bg-neon-green', connecting: 'bg-neon-yellow blink', error: 'bg-neon-red', off: 'bg-neon-red' };

export default function Pilot() {
  const gw = useGateway();
  const [inbox, setInbox] = useState([]); // mensajes pendientes de responder (el primero se muestra)
  const [sent, setSent] = useState(null);

  const push = (m) => {
    setInbox((q) => [...q, m]);
    speak(m.text);
    navigator.vibrate?.([300, 100, 300]);
  };
  const { socket, connected, cfg } = useSocket({
    msg: (m) => (m.to === 'all' || m.to === cfg.dorsal) && push(m),
    // Aviso crítico de otro coche del equipo (avería): se muestra igual, sin acuse a BOX.
    pilot: (e) => e.critical && e.car !== cfg.dorsal && push({ id: null, text: `COCHE ${e.car}: ${e.label}` }),
  });

  const fire = (a) => {
    socket.emit('pilot', { car: cfg.dorsal, type: a.type, label: a.label, critical: !!a.critical, gps: lastGps(), ts: Date.now() });
    const noPhone = a.critical && !cfg.phone;
    setSent({ type: a.type, text: noPhone ? 'AVISO ENVIADO · SIN TELÉFONO EN CONFIG' : 'ENVIADO ✓' });
    setTimeout(() => setSent(null), 2500);
    if (a.critical && cfg.phone) location.href = `tel:${cfg.phone.replace(/[^\d+]/g, '')}`;
  };

  const reply = (answer) => {
    const m = inbox[0];
    if (m.id) socket.emit('ack', { id: m.id, car: cfg.dorsal, answer, ts: Date.now() });
    speechSynthesis.cancel();
    setInbox((q) => q.slice(1));
  };

  const o = gw.data?.obd ?? {};
  return (
    <div className="flex h-full flex-col bg-black">
      {/* Indicadores flotantes de estado */}
      <div className="flex shrink-0 items-center gap-4 px-3 py-2 font-mono text-lg font-bold whitespace-nowrap">
        <button onClick={gw.obd === 'on' ? stop : start} className="flex items-center gap-2 rounded border border-white/20 px-3 py-1">
          <span className={`h-4 w-4 rounded-full ${LED[gw.obd]}`} />
          OBD {cfg.source === 'sim' && <span className="text-neon-yellow">SIM</span>}
        </button>
        <span className="flex items-center gap-2"><span className={`h-4 w-4 rounded-full ${connected ? 'bg-neon-green' : 'bg-neon-red blink'}`} />BOX</span>
        <span className={o.coolant > 100 ? 'text-neon-red blink' : ''}>{o.coolant ?? '--'}°C</span>
        <span className="text-neon-blue">{o.rpm ?? '----'} rpm</span>
        <span className="ml-auto text-sm text-white/50">#{cfg.dorsal}{gw.queued > 0 && ` · cola ${gw.queued}`}</span>
      </div>
      {gw.error && <div className="bg-neon-red px-3 py-1 font-bold text-black">{gw.error}</div>}

      {/* Rejilla táctil para guantes */}
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-2 p-2 landscape:grid-cols-3 landscape:grid-rows-2">
        {ACTIONS.map((a) => (
          <button key={a.type} onClick={() => fire(a)}
            className={`rounded-2xl border-4 p-2 text-2xl font-black leading-tight active:scale-95 sm:text-4xl ${a.cls} ${sent?.type === a.type ? 'bg-white/25' : 'bg-white/5'}`}>
            {sent?.type === a.type ? sent.text : a.label}
          </button>
        ))}
      </div>

      {/* Interrupción prioritaria de BOX */}
      {inbox[0] && (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-black p-3">
          <button onClick={() => speak(inbox[0].text)} className="flex flex-1 items-center justify-center text-center text-5xl font-black uppercase leading-tight text-neon-yellow sm:text-7xl">
            {inbox[0].text}
          </button>
          {inbox.length > 1 && <div className="pb-2 text-center text-white/50">+{inbox.length - 1} mensajes en cola</div>}
          <div className="grid h-1/2 grid-rows-3 gap-3 landscape:h-2/5 landscape:grid-cols-3 landscape:grid-rows-1">
            <button onClick={() => reply('OK')} className="rounded-2xl bg-neon-green text-3xl font-black text-black sm:text-5xl">RECIBIDO (OK)</button>
            <button onClick={() => reply('NO')} className="rounded-2xl bg-neon-red text-3xl font-black text-black sm:text-5xl">NEGATIVO (NO)</button>
            <button onClick={() => reply('PROBLEMA')} className="rounded-2xl bg-neon-yellow text-3xl font-black text-black sm:text-5xl">PROBLEMA</button>
          </div>
        </div>
      )}
    </div>
  );
}
