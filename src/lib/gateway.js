// Gateway móvil: lee OBD2 (real o simulado) + GPS + batería + red, empaqueta y envía a BOX.
// Si no hay conexión, encola los paquetes y los retransmite en ráfaga al recuperar señal.
import { useSyncExternalStore } from 'react';
import { createElm, connectBle } from './elm327.js';
import { getConfig, getSocket } from './store.js';
import { getSession } from './session.js';
import { registerPlugin } from '@capacitor/core';

// Temperatura del móvil (de la batería): solo existe en la app Android; en el navegador queda en null.
const Thermal = registerPlugin('Thermal');
const phoneTemp = () => Thermal.read().then((r) => Math.round(r.celsius), () => null);

const QUEUE_KEY = 'cencerro.queue';
const QUEUE_MAX = 5000; // ponytail: ~20 min a 4 Hz en memoria; IndexedDB si hacen falta tandas más largas sin cobertura
const BATCH = 500;

let state = { obd: 'off', error: '', data: null, queued: 0 };
const subs = new Set();
const set = (p) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const useGateway = () => useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), () => state);

// --- Cola offline: en memoria, volcada a localStorage al cerrar/ocultar la app ---
let queue = [];
try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch {}
addEventListener('pagehide', () => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch {} });

function flush(socket) {
  while (queue.length && socket.connected) socket.emit('telemetry:batch', { packets: queue.splice(0, BATCH) });
  try { localStorage.removeItem(QUEUE_KEY); } catch {}
  set({ queued: queue.length });
}

// --- Simulador OBD2 (modo test) ---
export const sim = { overheat: false, lowVolt: false, stall: false };
let simS = { rpm: 3000, coolant: 85, throttle: 40, target: 90, t: 0 };
function simRead() {
  const r = (a) => (Math.random() - 0.5) * a;
  // Alterna rectas (gas a fondo) y frenadas; RPM sigue al acelerador con inercia.
  if (Math.random() < 0.08) simS.target = simS.target > 50 ? 5 + Math.random() * 20 : 80 + Math.random() * 20;
  simS.throttle = Math.min(100, Math.max(0, simS.throttle + (simS.target - simS.throttle) * 0.3 + r(6)));
  const rpmTarget = sim.stall ? 0 : 1800 + simS.throttle * 58;
  simS.rpm += (rpmTarget - simS.rpm) * 0.35 + (sim.stall ? 0 : r(150));
  const target = sim.overheat ? 112 : 88;
  simS.coolant += (target - simS.coolant) * 0.05 + r(0.4);
  return {
    rpm: Math.round(simS.rpm),
    coolant: Math.round(simS.coolant),
    throttle: Math.round(simS.throttle),
    voltage: +(sim.lowVolt || sim.stall ? 11.7 + r(0.2) : 13.9 + r(0.3)).toFixed(2),
  };
}
// Vuelta simulada (óvalo de ~1,2 km) cuando no hay GPS real, para probar el mapa de BOX.
function simGps() {
  simS.t += 0.01;
  return { lat: 40.617 + 0.004 * Math.sin(simS.t), lng: -3.585 + 0.006 * Math.cos(simS.t), speed: Math.round(80 + 60 * Math.abs(Math.sin(simS.t * 2))), acc: 5 };
}

// --- Sensores del móvil ---
let gps = null;
let battery = null;
let watchId = null;

let running = false;
const watched = new WeakSet();
let wakeLock = null;
// Pantalla siempre encendida mientras este móvil conduce. El sistema suelta el bloqueo al ocultar la app
// (llamada, cambio de app, botón de apagado), así que se vuelve a pedir en cuanto se ve de nuevo.
async function keepAwake() {
  if (running && document.visibilityState === 'visible' && (!wakeLock || wakeLock.released)) {
    wakeLock = await navigator.wakeLock?.request('screen').catch(() => null);
  }
}
addEventListener('visibilitychange', keepAwake);
let loopId = 0; // cada start() abre un bucle nuevo; el anterior, si sigue esperando, se retira

export async function start() {
  if (running) return;
  const cfg = getConfig();
  set({ obd: 'connecting', error: '' });
  let read;
  try {
    if (cfg.source === 'ble') {
      if (!navigator.bluetooth) throw new Error('Web Bluetooth no disponible (usa Chrome Android o la app Capacitor)');
      const elm = createElm(await connectBle(() => { running = false; set({ obd: 'error', error: 'Bluetooth desconectado' }); }));
      await elm.init();
      read = () => elm.read();
    } else {
      read = async () => simRead();
    }
  } catch (e) {
    return set({ obd: 'error', error: e.message });
  }

  watchId ??= navigator.geolocation?.watchPosition(
    (p) => {
      // (0, 0) es el valor de "sin fix" de algunos navegadores/emuladores: no es una posición real.
      if (!p.coords.latitude && !p.coords.longitude) return;
      gps = { lat: p.coords.latitude, lng: p.coords.longitude, speed: p.coords.speed == null ? null : Math.round(p.coords.speed * 3.6), acc: Math.round(p.coords.accuracy) };
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 0 },
  );
  battery ??= await navigator.getBattery?.().catch(() => null);

  // Tomar el volante: desde ahora la telemetría del coche es la de este móvil.
  const sock = getSocket();
  sock.emit('drive');
  if (!watched.has(sock)) {
    watched.add(sock);
    sock.on('driver', (d) => {
      if (running && d && d.id !== getSession().user?.id) { stop(); set({ obd: 'off', error: `Ahora conduce ${d.name}. Tu móvil ha dejado de enviar telemetría.` }); }
    });
  }

  running = true;
  set({ obd: 'on' });
  keepAwake();
  const id = ++loopId;
  let obd = {};
  let readAt = -Infinity;
  let sentFix = null;
  while (running && id === loopId) {
    // El OBD se lee al ritmo del intervalo; con intervalos largos, cada fix nuevo del GPS se envía al momento
    // (con la última lectura OBD) para que BOX siga la posición en tiempo real.
    if (performance.now() - readAt >= getConfig().pollMs - 5) {
      readAt = performance.now();
      try { obd = await read(); } catch { obd = {}; }
    }
    const s = getSocket(); // por si se cambió de canal en caliente
    const packet = {
      ts: Date.now(),
      pollMs: getConfig().pollMs, // BOX lo usa para no dar "sin señal" con intervalos largos
      obd,
      gps: gps ?? (cfg.source === 'sim' ? simGps() : null),
      phoneBattery: battery ? Math.round(battery.level * 100) : null,
      phoneTemp: await phoneTemp(),
      net: { online: navigator.onLine, type: navigator.connection?.effectiveType ?? null, socket: s.connected },
    };
    if (s.connected && queue.length) flush(s); // señal recuperada: ráfaga con lo pendiente
    if (s.connected) s.emit('telemetry', packet);
    else { queue.push(packet); if (queue.length > QUEUE_MAX) queue.shift(); }
    set({ data: packet, queued: queue.length });
    sentFix = gps;
    // Espera a trozos: con intervalos de minutos, Detener o bajar el intervalo surten efecto al momento.
    let left;
    while (running && id === loopId && (left = getConfig().pollMs - (performance.now() - readAt)) > 0
      && !(gps !== sentFix && getConfig().pollMs > 1000)) await new Promise((r) => setTimeout(r, Math.min(left, 250)));
  }
}

export function stop() {
  running = false;
  wakeLock?.release();
  wakeLock = null;
  set({ obd: 'off' });
}

export const lastGps = () => gps ?? (state.data?.gps || null);
