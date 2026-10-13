// Vista PILOTO (móvil en el salpicadero): minimalista, máximo contraste, objetivos táctiles para guantes.
// Único ajuste visible: tema claro (sol) / oscuro (noche).
import { useEffect, useState } from 'react';
import Icon from '../icons.jsx';
import { useSocket, useLive, speak, hush } from '../lib/store.js';
import { useSession } from '../lib/session.js';
import { useGateway, usePhone, start, stop, lastGps, locationStatus, locationOk, fixLocation } from '../lib/gateway.js';
import { getConfig } from '../lib/store.js';
import { toggleTheme, useTheme } from '../lib/theme.js';
import { PHONE_HOT } from '../lib/limits.js';
import { RaceFlagScreen, RaceFlagBanner } from './RaceFlag.jsx';
import { EventTodayBanner } from './Racing.jsx';

// Cada acción tiene un color fijo para memoria muscular. Solo AVERÍA va rellena: es la única que llama.
const ACTIONS = [
  { type: 'breakdown', label: 'Avería · llamar mecánico', icon: 'wrench', critical: true, cls: 'bg-crit-solid text-on-crit border-crit-solid' },
  { type: 'pit', label: 'Salgo a box', icon: 'pitIn', cls: 'text-ok border-ok' },
  { type: 'fuel', label: 'Repostar y cambio', icon: 'fuel', cls: 'text-info border-info' },
  { type: 'damage', label: 'Pinchazo / daño', icon: 'damage', cls: 'text-crit border-crit' },
];

export default function Pilot({ onNav }) {
  const gw = useGateway();
  const busy = gw.obd === 'on' || gw.obd === 'connecting';
  const theme = useTheme();
  const { user, team } = useSession();
  const { driver } = useLive();
  const isDriver = driver?.id === user.id;
  const [inbox, setInbox] = useState([]); // mensajes pendientes de responder (el primero se muestra)
  const [sent, setSent] = useState(null);
  // Permiso de ubicación (app Android): se mira al entrar y cada vez que se vuelve a la app, p. ej. desde Ajustes.
  const [loc, setLoc] = useState(null);
  const noLocation = !locationOk(loc);
  useEffect(() => {
    const check = () => locationStatus().then(setLoc);
    check();
    addEventListener('visibilitychange', check);
    return () => removeEventListener('visibilitychange', check);
  }, []);

  const push = (m) => {
    setInbox((q) => [...q, m]);
    speak(m.text);
    navigator.vibrate?.([300, 100, 300]);
  };
  // Los mensajes de BOX van al coche: los recibe quien está al volante.
  const { socket, connected } = useSocket({
    msg: (m) => isDriver && push(m),
  });

  const fire = (a) => {
    socket.emit('pilot', { car: team.dorsal, type: a.type, label: a.label.toUpperCase(), critical: !!a.critical, gps: lastGps(), ts: Date.now() });
    const noPhone = a.critical && !team.phone;
    setSent({ type: a.type, text: noPhone ? 'Aviso enviado · falta teléfono' : 'Enviado' });
    setTimeout(() => setSent(null), 2500);
    if (a.critical && team.phone) location.href = `tel:${team.phone.replace(/[^\d+]/g, '')}`;
  };

  const [armed, setArmed] = useState(false);
  const [lapDone, setLapDone] = useState(false);
  const resetLap = () => {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); return; }
    socket.emit('lap:reset');
    setArmed(false);
    setLapDone(true);
    navigator.vibrate?.(200);
    setTimeout(() => setLapDone(false), 2500);
  };

  const reply = (answer) => {
    const m = inbox[0];
    if (m.id) socket.emit('ack', { id: m.id, car: team.dorsal, answer, ts: Date.now() });
    hush();
    setInbox((q) => q.slice(1));
  };

  const o = gw.data?.obd ?? {};
  const { battery: bat, temp } = usePhone(); // en directo, aunque este móvil no esté enviando telemetría
  return (
    <div className="pilot flex h-full flex-col bg-bg text-fg">
      {/* Estado: solo lo que el piloto puede usar de un vistazo */}
      <div className="num flex h-14 shrink-0 items-center gap-3 whitespace-nowrap border-b border-line px-3 text-lg font-bold sm:gap-4">
        <button onClick={busy ? stop : start} className="flex h-10 items-center gap-2 rounded-md border-2 border-line px-3"
          aria-label={gw.obd === 'on' ? 'Detener telemetría' : busy ? 'Cancelar conexión' : 'Iniciar telemetría'}>
          <span className={`h-3.5 w-3.5 rounded-full ${gw.obd === 'on' ? (gw.obdLink === 'lost' ? 'pulse bg-warn-solid' : 'bg-ok') : gw.obd === 'connecting' ? 'pulse bg-warn-solid' : 'bg-crit'}`} />
          {getConfig().source === 'sim' ? 'SIM' : team.obd && getConfig().source !== 'gps' ? 'OBD' : 'GPS'}
        </button>
        <span className="flex items-center gap-2" title="Conexión con BOX">
          <span className={`h-3.5 w-3.5 rounded-full ${connected ? 'bg-ok' : 'pulse bg-crit'}`} />BOX
        </span>
        <span className="ml-auto text-muted">#{team.dorsal}</span>
        <button onClick={toggleTheme} className="grid h-10 w-10 place-items-center" aria-label="Cambiar tema">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={22} />
        </button>
        <button onClick={() => onNav('ajustes')} className="grid h-10 w-10 place-items-center text-muted" aria-label="Configuración">
          <Icon name="sliders" size={22} />
        </button>
        {/* Salir de Piloto al resto de vistas (Box, Estadísticas…); la telemetría sigue si está en marcha */}
        <button onClick={() => onNav('box')} className="grid h-10 w-10 place-items-center text-muted" aria-label="Salir de Piloto">
          <Icon name="x" size={22} />
        </button>
      </div>
      {/* Coche a la izquierda (azul), móvil a la derecha (violeta): dos temperaturas que no se pueden confundir */}
      <div className="num flex shrink-0 justify-between whitespace-nowrap border-b border-line text-xl font-bold">
        {team.obd ? <div className="flex items-center gap-3 border-l-4 border-info px-3 py-2" title="Coche">
          <span className="flex flex-col items-center text-info"><Icon name="car" size={22} /><span className="text-[11px] tracking-[0.08em]">COCHE</span></span>
          <span className={`flex items-center ${o.coolant > team.limits.tempCrit ? 'text-crit' : ''}`} title="Temperatura del motor">
            <Icon name="thermo" size={20} className="text-info" />{o.coolant ?? '—'}°
          </span>
          <span className="hidden min-[430px]:inline">{o.rpm ?? '—'}<span className="text-sm text-muted"> rpm</span></span>
        </div> : <span />}
        <div className="flex items-center justify-end gap-2 border-r-4 border-accent px-3 py-2" title="Móvil">
          <span className={`flex items-center ${bat != null && bat < team.limits.phoneWarn ? 'text-crit' : ''}`} title="Batería del móvil">
            <Icon name="battery" size={20} className="mr-1 text-accent" />{bat ?? '—'}<span className="text-sm text-muted">%</span>
          </span>
          <span className={`flex items-center ${temp >= PHONE_HOT ? 'text-crit' : ''}`} title="Temperatura del móvil">
            <Icon name="thermo" size={20} className="text-accent" />{temp ?? '—'}°
          </span>
          <span className="flex flex-col items-center text-accent"><Icon name="phone" size={22} /><span className="text-[11px] tracking-[0.08em]">MÓVIL</span></span>
        </div>
      </div>
      <RaceFlagBanner big />
      <EventTodayBanner big />
      {noLocation && (
        <div role="alert" className="flex flex-wrap items-center gap-3 bg-crit-solid px-3 py-2 text-on-crit">
          <Icon name="pin" size={24} stroke={2.5} />
          <span className="min-w-0 flex-1 text-lg font-bold leading-tight">{loc?.granted ? 'Ubicación del móvil apagada' : 'Sin permiso de ubicación'}: BOX no verá el coche en el mapa.
            <span className="block text-[14px] font-semibold">{loc?.granted ? 'Enciende la ubicación del móvil.' : 'Elige «Permitir mientras se usa la app» y ubicación precisa.'}</span>
          </span>
          <button onClick={fixLocation} className="h-12 rounded-md bg-on-crit px-4 text-lg font-bold uppercase text-crit-solid">{loc?.granted ? 'Encender' : 'Dar permiso'}</button>
        </div>
      )}
      {gw.error && <div role="alert" className="bg-crit-solid px-3 py-2 text-lg font-bold text-on-crit">{gw.error}</div>}
      {gw.notice && <div role="status" className="bg-info-soft px-3 py-2 text-lg font-bold text-info">{gw.notice}</div>}
      {gw.obd === 'on' && gw.obdLink === 'lost' && (
        <div role="status" className="bg-warn-soft px-3 py-2 text-lg font-bold text-warn">OBD sin conexión · reconectando. El GPS se sigue enviando.</div>
      )}
      {gw.queued > 0 && <div className="num bg-warn-soft px-3 py-1 text-warn">Sin cobertura · {gw.queued} paquetes en cola</div>}

      {/* Quién conduce: solo el móvil del piloto al volante manda telemetría y recibe los mensajes de BOX */}
      {!isDriver && (
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-raised px-3 py-3">
          <Icon name="wheel" size={26} className="text-muted" />
          <div className="min-w-0 flex-1 text-lg font-bold uppercase leading-tight">
            {driver ? <>Conduce {driver.name}</> : 'Nadie al volante'}
            <div className="text-[14px] font-semibold normal-case text-muted">Toma el volante para enviar la telemetría desde este móvil.</div>
          </div>
          <button onClick={busy ? stop : start} className="h-12 rounded-md bg-accent px-5 text-lg font-bold uppercase tracking-[0.04em] text-panel">{busy ? 'Conectando · cancelar' : 'Tomar el volante'}</button>
        </div>
      )}

      {/* Rejilla táctil para guantes */}
      <div inert={!isDriver} className={`grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3 p-3 ${isDriver ? '' : 'opacity-35'}`}>
        {ACTIONS.map((a) => {
          const done = sent?.type === a.type;
          return (
            <button key={a.type} onClick={() => fire(a)}
              className={`flex flex-col items-center justify-center gap-2 rounded-md border-[3px] p-2 text-center text-[26px] font-bold uppercase leading-[1.05] tracking-[0.02em] transition-transform active:scale-[0.97] sm:text-4xl ${a.cls} ${done ? 'opacity-70' : ''}`}>
              <Icon name={done ? 'check' : a.icon} size={36} stroke={2.5} />
              {done ? sent.text : a.label}
            </button>
          );
        })}
      </div>

      {/* Anular la vuelta en curso (me he salido, he tenido que parar): la siguiente empieza en meta, desde el T1.
          Doble toque para no perder una vuelta buena por un roce con los guantes. */}
      {isDriver && (
        <button onClick={resetLap}
          className={`mx-3 mb-3 flex h-16 shrink-0 items-center justify-center gap-3 rounded-md border-[3px] text-2xl font-bold uppercase tracking-[0.04em] active:scale-[0.98] ${armed ? 'border-warn-solid bg-warn-solid text-on-warn' : 'border-line text-fg-2'}`}>
          <Icon name={lapDone ? 'check' : 'undo'} size={28} stroke={2.5} />
          {lapDone ? 'Vuelta anulada · empieza en meta' : armed ? 'Toca otra vez para anular' : 'Anular vuelta'}
        </button>
      )}

      {/* Dirección de carrera: por encima de todo, también de los mensajes de BOX */}
      <RaceFlagScreen />

      {/* Interrupción prioritaria de BOX */}
      {inbox[0] && (
        <div role="alertdialog" aria-label="Mensaje de BOX" className="safe fixed inset-0 z-[2000] bg-bg"><div className="flex h-full flex-col p-3">
          <div className="num flex items-center justify-between text-lg text-muted">
            <span>{inbox[0].id ? 'BOX' : 'EQUIPO'} · {new Date(inbox[0].ts ?? Date.now()).toLocaleTimeString('es-ES')}</span>
            {inbox.length > 1 && <span>+{inbox.length - 1} en cola</span>}
          </div>
          <button onClick={() => speak(inbox[0].text)} aria-label="Repetir mensaje"
            className="flex flex-1 items-center justify-center text-center text-[clamp(44px,14vmin,96px)] font-bold uppercase leading-[0.95]">
            {inbox[0].text}
          </button>
          <div className="grid h-1/2 grid-rows-3 gap-3 landscape:h-2/5 landscape:grid-cols-3 landscape:grid-rows-1">
            <ReplyButton onClick={() => reply('OK')} cls="bg-ok-solid text-on-ok" icon="check">Recibido (OK)</ReplyButton>
            <ReplyButton onClick={() => reply('NO')} cls="bg-crit-solid text-on-crit" icon="x">Negativo (NO)</ReplyButton>
            <ReplyButton onClick={() => reply('PROBLEMA')} cls="bg-warn-solid text-on-warn" icon="alert">Problema</ReplyButton>
          </div>
        </div></div>
      )}
    </div>
  );
}

const ReplyButton = ({ cls, icon, children, ...p }) => (
  <button {...p} className={`flex items-center justify-center gap-3 rounded-md border-[3px] border-fg dark:border-transparent text-4xl font-bold uppercase tracking-[0.02em] active:scale-[0.98] sm:text-5xl ${cls}`}>
    <Icon name={icon} size={36} stroke={3} />{children}
  </button>
);
