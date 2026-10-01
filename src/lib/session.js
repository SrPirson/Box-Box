// Sesión: token + usuario + equipo. Se guarda una copia para abrir la app sin cobertura en pista.
import { useSyncExternalStore } from 'react';

const TOKEN = 'cencerro.token';
const CACHE = 'cencerro.session';
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

let state = { token: read(TOKEN), user: null, team: null, ready: false, offline: false };
const subs = new Set();
const set = (p) => {
  state = { ...state, ...p };
  if (state.user) write(CACHE, JSON.stringify({ user: state.user, team: state.team }));
  subs.forEach((f) => f());
};
export const getSession = () => state;
export const useSession = () => useSyncExternalStore((cb) => (subs.add(cb), () => subs.delete(cb)), getSession);

export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(state.token && { authorization: `Bearer ${state.token}` }) },
    body: body && JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && state.token && !path.endsWith('/login')) logout();
  if (!r.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data;
}

export function setSession(s) {
  if (s.token) { write(TOKEN, s.token); state.token = s.token; }
  set({ user: s.user, team: s.team, offline: false });
}
export const setTeam = (team) => set({ team });

export async function refresh() {
  if (!state.token) return set({ ready: true });
  try {
    setSession(await api('/api/me'));
  } catch (e) {
    // Sin red: seguimos con la última sesión conocida. Con 401, api() ya ha cerrado la sesión.
    if (state.token && e instanceof TypeError) {
      const cached = JSON.parse(read(CACHE) || 'null');
      if (cached) set({ ...cached, offline: true });
    }
  }
  set({ ready: true });
}

export function logout() {
  write(TOKEN, null);
  write(CACHE, null);
  state.token = null;
  set({ user: null, team: null });
}

// Código de invitación recibido por enlace (#join=CODIGO): se guarda hasta que haya sesión.
const m = location.hash.match(/join=([A-Za-z0-9]+)/);
if (m) { sessionStorage.setItem('cencerro.join', m[1].toUpperCase()); history.replaceState(null, '', location.pathname); }
export const pendingInvite = () => sessionStorage.getItem('cencerro.join') || '';
export const clearInvite = () => sessionStorage.removeItem('cencerro.join');

export const inviteLink = (code) => `${location.origin}/#join=${code}`;
