// Configuración persistente por dispositivo + conexión Socket.io compartida.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { io } from 'socket.io-client';
import { LIMITS } from './limits.js';

const KEY = 'cencerro.config';
export const DEFAULTS = {
  dorsal: '7',
  phone: '',           // teléfono del mecánico para la llamada GSM
  channel: 'equipo',   // sala multidifusión: todos los coches y BOX del mismo canal se ven
  serverUrl: '',       // vacío = mismo servidor que sirve la app
  source: 'sim',       // 'sim' | 'ble'
  pollMs: 250,         // ciclo de lectura OBD + envío (200-500 ms)
  limits: LIMITS,      // umbrales de alerta de este coche (viajan en cada paquete)
};

let config = DEFAULTS;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  config = { ...DEFAULTS, ...saved, limits: { ...LIMITS, ...saved.limits } };
} catch {}
const subs = new Set();
const subscribe = (cb) => (subs.add(cb), () => subs.delete(cb));

export const getConfig = () => config;
export function setConfig(patch) {
  config = { ...config, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(config)); } catch {}
  subs.forEach((f) => f());
}
export const useConfig = () => useSyncExternalStore(subscribe, getConfig);

// Un único socket por (servidor, canal). Socket.io reconecta solo; los emit hechos sin conexión
// (mensajes, acuses, alertas) quedan en su buffer y salen al reconectar. La telemetría usa su propia cola.
let socket, socketKey;
export function getSocket() {
  const key = config.serverUrl + '|' + config.channel;
  if (key !== socketKey) {
    socket?.disconnect();
    socket = io(config.serverUrl || undefined, {
      transports: ['websocket'],
      query: { channel: config.channel },
      reconnectionDelay: 300,
      reconnectionDelayMax: 2000,
    });
    socketKey = key;
  }
  return socket;
}

// Socket actual + si está conectado, y suscripción a eventos con limpieza automática.
export function useSocket(handlers = {}) {
  const cfg = useConfig();
  const s = getSocket();
  const [connected, setConnected] = useState(s.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    setConnected(s.connected);
    s.on('connect', on).on('disconnect', off);
    for (const [ev, fn] of Object.entries(handlers)) s.on(ev, fn);
    return () => {
      s.off('connect', on).off('disconnect', off);
      for (const [ev, fn] of Object.entries(handlers)) s.off(ev, fn);
    };
  });
  return { socket: s, connected, cfg };
}

export const speak = (text) => {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  u.rate = 1.05;
  speechSynthesis.speak(u);
};
