// Aviso de versión nueva de la app Android (solo dentro de la app). La release "apk" lleva el versionCode
// al final del título; si es mayor que el instalado, se ofrece descargarla e instalarla encima.
import { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import Icon from '../icons.jsx';

// La compila y publica .github/workflows/android.yml.
export const APK_URL = 'https://github.com/SrPirson/Box-Box/releases/download/apk/cencerro.apk';
const RELEASE_API = 'https://api.github.com/repos/SrPirson/Box-Box/releases/tags/apk';
const Updater = registerPlugin('Updater');

export default function UpdateBanner() {
  const [latest, setLatest] = useState(null);
  const [status, setStatus] = useState(''); // '' | 'loading' | mensaje de error
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    // Las apps instaladas antes de este aviso no tienen el plugin: version() falla y no se avisa.
    Promise.all([Updater.version(), fetch(RELEASE_API).then((r) => r.json())])
      .then(([{ code }, rel]) => { const n = Number(rel.name?.match(/(\d+)$/)?.[1]); if (n > code) setLatest(n); })
      .catch(() => {});
  }, []);
  if (!latest) return null;

  const update = () => {
    setStatus('loading');
    Updater.install({ url: APK_URL }).then(() => setStatus(''), (e) => setStatus(e.message));
  };
  return (
    <div role="status" className="flex shrink-0 items-center gap-3 bg-accent px-3 py-2 text-panel">
      <Icon name="download" size={22} />
      <div className="min-w-0 flex-1 text-[15px] font-bold uppercase leading-tight tracking-[0.04em]">
        Versión nueva de la app
        {status && status !== 'loading' && <div className="text-[13px] font-semibold normal-case">{status}</div>}
      </div>
      <button onClick={update} disabled={status === 'loading'}
        className="h-11 rounded-md bg-panel px-4 text-[15px] font-bold uppercase tracking-[0.04em] text-accent disabled:opacity-60">
        {status === 'loading' ? 'Descargando…' : 'Actualizar'}
      </button>
      <button onClick={() => setLatest(null)} className="grid h-11 w-9 place-items-center" aria-label="Ahora no">
        <Icon name="x" size={20} />
      </button>
    </div>
  );
}
