// Ajustes de este dispositivo + conexión Socket.io del equipo + estado en vivo (piloto al volante, presencia).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { io } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
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

// Estado en vivo del equipo. pit: null | { since, reason } mientras el coche está en boxes.
// flag: bandera del evento ({ type, text, ts, age }); flagSeen: ts de la última que se ha marcado como vista.
let live = { driver: null, online: [], pit: null, flag: null, flagSeen: null };
const liveSubs = new Set();
const setLive = (p) => { live = { ...live, ...p }; liveSubs.forEach((f) => f()); };
export const getLive = () => live;
export const useLive = () => useSyncExternalStore((cb) => (liveSubs.add(cb), () => liveSubs.delete(cb)), getLive);

// Banderas de dirección de carrera: nombre, frase hablada y colores (fondo y texto).
export const FLAG_INFO = {
  green: { label: 'Bandera verde', say: 'Bandera verde. Pista libre', cls: 'bg-ok-solid text-on-ok' },
  yellow: { label: 'Bandera amarilla', say: 'Bandera amarilla. Precaución, no adelantar', cls: 'bg-warn-solid text-on-warn' },
  sc: { label: 'Safety car', say: 'Safety car en pista. No adelantar', cls: 'bg-warn-solid text-on-warn' },
  red: { label: 'Bandera roja', say: 'Bandera roja. Carrera detenida, vuelve a boxes despacio', cls: 'bg-crit-solid text-on-crit' },
  text: { label: 'Dirección de carrera', say: 'Dirección de carrera', cls: 'bg-info text-panel' },
};
const flagSpeech = (f) => (f.type === 'text' ? `${FLAG_INFO.text.say}: ${f.text}` : FLAG_INFO[f.type]?.say ?? '');
export function seeFlag() {
  const f = live.flag;
  if (!f || f.ts === live.flagSeen) return;
  setLive({ flagSeen: f.ts });
  if (f.type !== 'green') getSocket().emit('flag:seen', f.ts);
}

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
    socket.on('pit', (pit) => setLive({ pit }));
    // Bandera de dirección de carrera (solo en eventos). La verde solo se anuncia recién dada (age: ms desde
    // que se dio); al conectar más tarde se da por vista.
    socket.on('flag', (flag) => {
      const fresh = flag && flag.ts !== live.flag?.ts && flag.ts !== live.flagSeen && (flag.type !== 'green' || flag.age < 5000);
      setLive({ flag, ...(flag?.type === 'green' && !fresh && { flagSeen: flag.ts }) });
      if (fresh) { speak(flagSpeech(flag)); navigator.vibrate?.([500, 150, 500]); }
    });
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

// El WebView de la app Android no trae síntesis de voz: ahí habla el motor de voz nativo de Android.
// Sin ninguno de los dos (navegador raro) no se habla, pero tampoco se rompe nada.
const native = Capacitor.isNativePlatform();
export const hush = () => (native ? TextToSpeech.stop().catch(() => {}) : globalThis.speechSynthesis?.cancel());
export const speak = (text) => {
  if (native) return void TextToSpeech.speak({ text, lang: 'es-ES', rate: 1.05 }).catch(() => {}); // Flush: corta lo anterior
  if (!globalThis.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  u.rate = 1.05;
  speechSynthesis.speak(u);
};
