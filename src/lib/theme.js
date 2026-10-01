// Tema claro/oscuro: 'system' sigue al sistema operativo; la elección del usuario se guarda y manda.
import { useSyncExternalStore } from 'react';

const KEY = 'theme';
const mq = matchMedia('(prefers-color-scheme: dark)');
const subs = new Set();
const subscribe = (cb) => (subs.add(cb), () => subs.delete(cb));

export const getMode = () => { try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; } };
const getTheme = () => document.documentElement.dataset.theme;

function apply() {
  const m = getMode();
  const root = document.documentElement;
  root.dataset.theme = m === 'system' ? (mq.matches ? 'dark' : 'light') : m;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim());
  subs.forEach((f) => f());
}
mq.addEventListener('change', apply);
apply();

export function setMode(m) {
  try { m === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, m); } catch {}
  apply();
}
export const toggleTheme = () => setMode(getTheme() === 'dark' ? 'light' : 'dark');
export const useTheme = () => useSyncExternalStore(subscribe, getTheme);
export const useThemeMode = () => useSyncExternalStore(subscribe, getMode);
