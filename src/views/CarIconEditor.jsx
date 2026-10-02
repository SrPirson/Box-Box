// Editor del icono del coche: encuadre (arrastrar), zoom, giro y estilo. Lo que se ve en la vista previa
// es lo que se sube: la misma función pinta la vista previa y la imagen final de 96 px.
import { useEffect, useRef, useState } from 'react';
import Icon from '../icons.jsx';
import { Segmented, btn } from './ui.jsx';

const OUT_PX = 96;
const VIEW_PX = 220;

// Círculo: la imagen rellena el cuadro (foto). Silueta: cabe entera (coche visto desde arriba, sin fondo).
function paint(canvas, img, { x, y, zoom, rot, style }, size) {
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = (style === 'round' ? Math.max : Math.min)(size / img.width, size / img.height);
  ctx.translate(size / 2 + x * size, size / 2 + y * size);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(base * zoom, base * zoom);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
}

// Esquinas transparentes = imagen recortada sin fondo → silueta por defecto.
function hasTransparentCorners(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 16, 16);
  return [[0, 0], [15, 0], [0, 15], [15, 15]].every(([px, py]) => ctx.getImageData(px, py, 1, 1).data[3] < 20);
}

export default function CarIconEditor({ img, onSave, onCancel }) {
  const view = useRef(null);
  const drag = useRef(null);
  const [t, setT] = useState(() => ({ x: 0, y: 0, zoom: 1, rot: 0, style: hasTransparentCorners(img) ? 'sprite' : 'round' }));
  const set = (patch) => setT((s) => ({ ...s, ...patch }));
  useEffect(() => { paint(view.current, img, t, VIEW_PX * 2); }, [img, t]); // ×2: nítido en pantallas de alta densidad

  const turn = (deg) => set({ rot: ((t.rot + deg + 540) % 360) - 180 });
  const save = () => {
    const c = document.createElement('canvas');
    paint(c, img, t, OUT_PX);
    onSave(c.toDataURL('image/webp', 0.9), t.style); // sin WebP (Safari antiguo) sale PNG, también válido
  };

  return (
    <div className="flex flex-col gap-4 rounded-[4px] border border-accent bg-sunken p-3">
      <Segmented label="Estilo" value={t.style} onChange={(style) => set({ style })}
        options={[['sprite', 'Silueta'], ['round', 'Foto en círculo']]} />
      <div className="flex flex-wrap items-start gap-4">
        {/* Vista previa: arrastrar para mover */}
        <div className="relative shrink-0 touch-none select-none overflow-hidden rounded-[4px] border border-line"
          style={{ width: VIEW_PX, height: VIEW_PX, background: 'repeating-conic-gradient(var(--raised) 0 25%, var(--panel) 0 50%) 0 0 / 20px 20px' }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, x: t.x, y: t.y }; }}
          onPointerMove={(e) => { const d = drag.current; if (d) set({ x: d.x + (e.clientX - d.px) / VIEW_PX, y: d.y + (e.clientY - d.py) / VIEW_PX }); }}
          onPointerUp={() => { drag.current = null; }}>
          <canvas ref={view} className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing" />
          {t.style === 'round'
            ? <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: '0 0 0 999px rgb(0 0 0 / 0.5)' }} />
            : <span className="pointer-events-none absolute inset-x-0 top-1 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-accent">▲ Frente del coche</span>}
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-3">
          <p className="text-[13px] leading-snug text-muted">
            {t.style === 'sprite'
              ? 'Gíralo hasta que el frontal apunte arriba: en el mapa girará solo según hacia dónde vaya el coche.'
              : 'Arrastra la foto y ajusta el zoom hasta encuadrarla en el círculo.'}
          </p>
          <label className="flex flex-col gap-1">
            <span className="label flex justify-between">Giro <span className="num normal-case">{Math.round(t.rot)}°</span></span>
            <input type="range" min="-180" max="180" step="1" value={t.rot} onChange={(e) => set({ rot: Number(e.target.value) })} className="accent-[var(--accent)]" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => turn(-90)} className={btn.ghost}><Icon name="undo" size={14} />90°</button>
            <button type="button" onClick={() => turn(90)} className={btn.ghost}><Icon name="undo" size={14} className="-scale-x-100" />90°</button>
            <button type="button" onClick={() => set({ x: 0, y: 0, zoom: 1, rot: 0 })} className={btn.ghost}>Restablecer</button>
          </div>
          <label className="flex flex-col gap-1">
            <span className="label flex justify-between">Zoom <span className="num normal-case">{t.zoom.toFixed(2)}×</span></span>
            <input type="range" min="0.3" max="4" step="0.01" value={t.zoom} onChange={(e) => set({ zoom: Number(e.target.value) })} className="accent-[var(--accent)]" />
          </label>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={save} className={btn.primary}>Guardar icono</button>
        <button type="button" onClick={onCancel} className={btn.ghost}>Cancelar</button>
      </div>
    </div>
  );
}
