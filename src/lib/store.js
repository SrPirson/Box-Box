// Ajustes de este dispositivo + conexión Socket.io del equipo + estado en vivo (piloto al volante, presencia).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { io } from 'socket.io-client';
import { api, getSession, refresh, setTeam, useSession } from './session.js';

const KEY = 'cencerro.config';
export const DEFAULTS = {
  source: 'sim',       // 'sim' | 'ble'
  pollMs: 250,         // ciclo de lectura OBD + envío (200 ms - 5 min; lo largo, para medir consumo)
};

let config = DEFAULTS;
try { config = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
const cfgSubs = new Set();
export const getConfig = () => config;
export function setConfig(patch) {
  config = { ...config, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(config)); } catch {}
  cfgSubs.forEach((f) => f());
}
export const useConfig = () => useSyncExternalStore((cb) => (cfgSubs.add(cb), () => cfgSubs.delete(cb)), getConfig);

// Estado en vivo del equipo.
let live = { driver: null, online: [] };
const liveSubs = new Set();
const setLive = (p) => { live = { ...live, ...p }; liveSubs.forEach((f) => f()); };
export const getLive = () => live;
export const useLive = () => useSyncExternalStore((cb) => (liveSubs.add(cb), () => liveSubs.delete(cb)), getLive);

// Un socket por sesión (token). Socket.io reconecta solo; lo emitido sin conexión (mensajes, acuses, avisos)
// queda en su buffer y sale al reconectar. La telemetría usa su propia cola.
let socket, socketToken;
export function getSocket() {
  const { token } = getSession();
  if (token !== socketToken) {
    socket?.disconnect();
    socket = io({ transports: ['websocket'], auth: { token }, reconnectionDelay: 300, reconnectionDelayMax: 2000 });
    socketToken = token;
    socket.on('driver', (driver) => setLive({ driver }));
    socket.on('presence', (online) => setLive({ online }));
    socket.on('team', () => api('/api/team').then(setTeam).catch(refresh));
    // El servidor nos echa al cambiar de equipo o de contraseña: recargar sesión y reconectar.
    socket.on('disconnect', (reason) => { if (reason === 'io server disconnect') refresh().then(() => setTimeout(() => getSocket().connect(), 500)); });
    socket.on('connect_error', (e) => e.message === 'unauthorized' && refresh());
  }
  return socket;
}

// Socket actual + si está conectado, con suscripción a eventos y limpieza automática.
export function useSocket(handlers = {}) {
  useSession(); // al cambiar de sesión, getSocket() devuelve el socket nuevo
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
  return { socket: s, connected };
}

export const speak = (text) => {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  u.rate = 1.05;
  speechSynthesis.speak(u);
};
