// Modo de uso: cada uno muestra solo sus vistas. Los roles van en escalera: un admin puede usar los tres
// modos, un organizador Organizador y Piloto, y un piloto solo Piloto. El elegido se recuerda en este dispositivo;
// por defecto, el más alto.
import { useSyncExternalStore } from 'react';

const KEY = 'cencerro.mode';
export const MODES = { admin: 'Admin', organizer: 'Organizador', pilot: 'Piloto' };
export const modesOf = (role) => (role === 'admin' ? ['admin', 'organizer', 'pilot'] : role === 'organizer' ? ['organizer', 'pilot'] : ['pilot']);

let stored = null;
try { stored = localStorage.getItem(KEY); } catch {}
const subs = new Set();
export function setMode(m) {
  stored = m;
  try { localStorage.setItem(KEY, m); } catch {}
  subs.forEach((f) => f());
}
// Modo activo para un rol: el guardado si ese rol lo permite; si no, el más alto que tenga.
export const useMode = (role) => {
  const m = useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), () => stored);
  return modesOf(role).includes(m) ? m : modesOf(role)[0];
};
