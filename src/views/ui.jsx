// Piezas de interfaz compartidas por todas las vistas: portada de página, tarjetas con color de sección,
// pestañas, ayudas (?) y controles.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from '../icons.jsx';

// Color de sección (tokens --t-* de index.css): race (carrera, banderas), track (pista, mapa), teams (equipos,
// personas), results (tiempos, estadísticas), live (directo, retransmisión), data (datos, ajustes), danger.
export const tone = (color) => (color ? { '--tone': `var(--t-${color})` } : undefined);
const toneChip = 'bg-[color-mix(in_srgb,var(--tone,var(--accent))_16%,transparent)] text-[var(--tone,var(--accent))]';
export const IconChip = ({ icon, color, size = 'h-8 w-8', iconSize = 16 }) => (
  <span style={tone(color)} className={`grid shrink-0 place-items-center rounded-full ${size} ${toneChip}`}><Icon name={icon} size={iconSize} /></span>
);

// Ayuda (?): se abre al pasar el ratón (con ratón) o al tocar (móvil); se cierra al tocar fuera o con Esc.
// Se recoloca para no salirse de la pantalla.
export function Tip({ children, label = 'Más información' }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const box = useRef(null);
  const pop = useRef(null);
  useEffect(() => {
    if (!open) return;
    const out = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    addEventListener('pointerdown', out);
    addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', out); removeEventListener('keydown', esc); };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return setShift(0);
    const r = pop.current.getBoundingClientRect();
    setShift(r.left < 8 ? 8 - r.left : r.right > innerWidth - 8 ? innerWidth - 8 - r.right : 0);
  }, [open]);
  const hover = () => matchMedia('(hover: hover)').matches;
  return (
    <span ref={box} className="relative inline-flex align-middle normal-case tracking-normal" onMouseEnter={() => hover() && setOpen(true)} onMouseLeave={() => hover() && setOpen(false)}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        className={`grid h-[18px] w-[18px] place-items-center rounded-full border text-[11px] font-bold leading-none transition-colors ${open ? 'border-accent bg-accent text-panel' : 'border-line-strong text-muted hover:border-accent hover:text-accent'}`}>?</button>
      {open && (
        <span ref={pop} role="tooltip" style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
          className="rise absolute left-1/2 top-full z-[3000] mt-2 w-72 max-w-[calc(100vw-16px)] rounded-[6px] border border-line-strong bg-raised p-3 text-left text-[13px] font-medium leading-snug text-fg shadow-2xl">
          {children}
        </span>
      )}
    </span>
  );
}

export const input = 'h-10 w-full rounded-[6px] border border-line-strong bg-sunken px-3 text-[15px] text-fg placeholder:text-muted transition-colors hover:border-fg-2 focus:border-accent';
const press = 'transition-[background-color,border-color,color,filter,transform] active:scale-[0.98] disabled:active:scale-100';
export const btn = {
  primary: `flex h-10 items-center justify-center gap-2 rounded-[6px] bg-accent px-4 text-[14px] font-bold uppercase tracking-[0.06em] text-panel shadow-[0_4px_16px_-6px_var(--accent)] hover:brightness-110 disabled:opacity-50 disabled:shadow-none ${press}`,
  ghost: `flex h-9 items-center justify-center gap-2 rounded-[6px] border border-line-strong bg-panel px-3 text-[13px] font-semibold uppercase tracking-[0.06em] hover:border-accent hover:text-accent disabled:opacity-50 ${press}`,
  danger: `flex h-9 items-center justify-center gap-2 rounded-[6px] border border-crit px-3 text-[13px] font-bold uppercase tracking-[0.06em] text-crit hover:bg-crit-soft ${press}`,
  dangerSolid: `flex h-9 items-center justify-center gap-2 rounded-[6px] bg-crit-solid px-3 text-[13px] font-bold uppercase tracking-[0.06em] text-on-crit hover:brightness-110 ${press}`,
};

// Página con portada: icono en el color de su sección, título, subtítulo, acciones y los pianos de circuito.
// `hero`: contenido extra de la portada (estado, contadores…); `nav`: pestañas bajo ella.
export const Page = ({ title, subtitle, actions, children, max = 'max-w-[1180px]', icon, color, hero, nav }) => (
  <div className="h-full overflow-y-auto">
    <div className={`mx-auto ${max} p-3 sm:p-4 lg:p-6`}>
      <div style={tone(color)} className="rise mb-4 overflow-hidden rounded-[8px] border border-line bg-panel bg-[linear-gradient(120deg,color-mix(in_srgb,var(--tone,var(--accent))_14%,transparent),transparent_55%)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {icon && <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-[var(--tone,var(--accent))] text-panel shadow-[0_6px_20px_-8px_var(--tone,var(--accent))]"><Icon name={icon} size={22} stroke={2.25} /></span>}
            <div className="min-w-0">
              <h1 className="truncate text-[26px] font-bold uppercase leading-tight tracking-[0.04em] sm:text-3xl">{title}</h1>
              {subtitle && <div className="text-[14px] text-fg-2">{subtitle}</div>}
            </div>
          </div>
          {actions}
        </div>
        {hero && <div className="border-t border-line px-4 py-3 sm:px-5">{hero}</div>}
        <div className="kerb" aria-hidden="true" />
      </div>
      {nav}
      {children}
    </div>
  </div>
);

// Tarjeta de sección. Con `color` e `icon`: franja de color a la izquierda e icono en la cabecera, para reconocer
// la sección de un vistazo. `tip`: ayuda (?) junto al título. `tone`: borde de aviso (p. ej. 'border-crit').
export const Card = ({ title, subtitle, badge, tone: border = '', color, icon, tip, children, flush }) => (
  <section style={tone(color)} className={`rise min-w-0 rounded-[8px] border bg-panel ${border || 'border-line'} ${color ? 'border-l-4 border-l-[var(--tone)]' : ''}`}>
    <header className={`flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-t-[7px] border-b border-line px-4 py-2 ${color ? 'bg-[linear-gradient(90deg,color-mix(in_srgb,var(--tone)_10%,transparent),transparent_70%)]' : ''}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${toneChip}`}><Icon name={icon} size={16} /></span>}
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[14px] font-bold uppercase tracking-[0.08em] text-fg">{title}{tip && <Tip>{tip}</Tip>}</h2>
          {subtitle && <p className="text-[13px] leading-snug text-muted">{subtitle}</p>}
        </div>
      </div>
      {badge}
    </header>
    <div className={flush ? '' : 'flex flex-col gap-4 p-4'}>{children}</div>
  </section>
);

// Pestañas: icono en el color de cada sección, contador y desplazamiento lateral en pantallas estrechas.
// items: [{ id, label, icon, color, count }]
export function Tabs({ items, value, onChange, label }) {
  return (
    <nav aria-label={label} className="-mx-3 mb-4 flex gap-1 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
      {items.map((t) => {
        const on = t.id === value;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} aria-current={on ? 'page' : undefined} style={tone(t.color)}
            className={`flex h-10 shrink-0 items-center gap-2 rounded-[6px] border px-3 text-[13px] font-bold uppercase tracking-[0.08em] transition-colors ${on
              ? 'border-[var(--tone,var(--accent))] bg-[color-mix(in_srgb,var(--tone,var(--accent))_14%,var(--panel))] text-fg'
              : 'border-transparent text-muted hover:bg-panel hover:text-fg'}`}>
            {t.icon && <Icon name={t.icon} size={15} className={on ? 'text-[var(--tone,var(--accent))]' : ''} />}
            {t.label}
            {t.count != null && <span className={`num rounded-full px-1.5 text-[11px] ${on ? 'bg-[var(--tone,var(--accent))] text-panel' : 'bg-sunken text-fg-2'}`}>{t.count}</span>}
          </button>
        );
      })}
    </nav>
  );
}

// Estado vacío con icono, título y una acción.
export const Empty = ({ icon = 'flag', color, title, children, action }) => (
  <div style={tone(color)} className="flex flex-col items-center gap-2 px-4 py-8 text-center">
    <span className={`grid h-12 w-12 place-items-center rounded-full ${toneChip}`}><Icon name={icon} size={22} /></span>
    <div className="text-[16px] font-bold uppercase tracking-[0.06em]">{title}</div>
    {children && <p className="max-w-md text-[14px] text-muted">{children}</p>}
    {action}
  </div>
);

export const Pill = ({ tone = 'warn', children }) => {
  const cls = { warn: 'bg-warn-soft text-warn', crit: 'bg-crit-soft text-crit', ok: 'bg-ok-soft text-ok', info: 'bg-info-soft text-info', accent: 'bg-accent-soft text-accent', muted: 'bg-sunken text-muted' }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-[3px] px-1.5 py-px text-[11px] font-bold uppercase tracking-[0.06em] ${cls}`}>{children}</span>;
};

// Campo con etiqueta. La ayuda corta va debajo; la larga (o `tip`) pasa a la ayuda (?) junto a la etiqueta.
const LONG_HELP = 70;
export const Field = ({ label, help, tip, children }) => {
  const long = typeof help === 'string' && help.length > LONG_HELP;
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-fg-2">{label}{(tip || long) && <Tip>{tip ?? help}</Tip>}</span>
      {children}
      {help && !long && <span className="text-[13px] leading-snug text-muted">{help}</span>}
    </label>
  );
};

export const ErrorText = ({ children }) => children ? <p role="alert" className="rounded-[4px] bg-crit-soft px-3 py-2 text-[14px] font-semibold text-crit">{children}</p> : null;

// Selector de opciones: la elegida, en el color de acento. Ocupa lo que necesita (con `full`, todo el ancho) y
// en pantallas estrechas se desplaza de lado.
export function Segmented({ label, value, options, onChange, disabled, tip, full }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {label && <span className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-fg-2">{label}{tip && <Tip>{tip}</Tip>}</span>}
      <div role="radiogroup" aria-label={label} className={`flex max-w-full overflow-x-auto rounded-[6px] border border-line-strong bg-sunken p-0.5 [scrollbar-width:none] ${full ? 'w-full' : 'w-fit'}`}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled} onClick={() => onChange(v)}
            className={`h-9 flex-1 shrink-0 whitespace-nowrap rounded-[4px] px-3 text-[14px] font-semibold uppercase tracking-[0.06em] transition-colors disabled:opacity-50 ${value === v ? 'bg-accent text-panel shadow-[0_2px_10px_-4px_var(--accent)]' : 'text-muted hover:bg-panel hover:text-fg'}`}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export const Switch = ({ label, help, on, onToggle, disabled }) => (
  <div className={`flex items-center gap-4 rounded-[4px] px-3 py-2.5 transition-colors ${on ? 'bg-warn-soft' : ''}`}>
    <div className="flex-1">
      <div className={`text-[15px] font-semibold uppercase tracking-[0.04em] ${on ? 'text-warn' : ''}`}>{label}</div>
      <div className="text-[13px] text-muted">{help}</div>
    </div>
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${on ? 'border-warn-solid bg-warn-solid' : 'border-line-strong bg-sunken'}`}>
      <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full shadow transition-transform ${on ? 'translate-x-5.5 bg-panel' : 'translate-x-0.5 bg-fg-2'}`} />
    </button>
  </div>
);

// Campo numérico que no pisa lo que el usuario está escribiendo ("12," a medias) y solo comunica números válidos.
export function NumInput({ label, tone, unit, value, onCommit, invalid, step }) {
  const [s, setS] = useState(String(value));
  useEffect(() => { if (Number(s) !== value) setS(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className={`flex h-10 items-center rounded-[4px] border bg-sunken focus-within:outline-2 focus-within:outline-accent ${invalid ? 'border-crit' : 'border-line-strong'}`}>
      {tone && <span className={`ml-2.5 h-2 w-2 shrink-0 rounded-full sm:hidden ${tone === 'warn' ? 'bg-warn-solid' : 'bg-crit-solid'}`} aria-hidden="true" />}
      <span className="sr-only">{label}</span>
      <input type="number" inputMode="decimal" step={step} value={s} aria-invalid={invalid}
        onChange={(e) => { setS(e.target.value); const n = e.target.valueAsNumber; if (!Number.isNaN(n)) onCommit(n); }}
        className="num h-full w-full min-w-0 bg-transparent px-2.5 text-[15px] text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
      {unit && <span className="num pr-2.5 text-[12px] text-muted">{unit}</span>}
    </label>
  );
}

// Confirmación en línea (sin diálogos modales): primer clic arma, segundo ejecuta.
export function ConfirmButton({ label, confirm, onConfirm, icon, solid }) {
  const [armed, setArmed] = useState(false);
  if (!armed) return <button type="button" onClick={() => setArmed(true)} className={solid ? btn.dangerSolid : btn.danger}>{icon}{label}</button>;
  return (
    <span className="flex gap-2">
      <button type="button" onClick={() => { setArmed(false); onConfirm(); }} className={btn.dangerSolid}>{confirm}</button>
      <button type="button" onClick={() => setArmed(false)} className={btn.ghost}>Cancelar</button>
    </span>
  );
}

// Descarga una tabla como CSV (separador «;» y BOM, para que Excel en español lo abra bien).
export function downloadCsv(name, rows) {
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const blob = new Blob([`\uFEFF${rows.map((r) => r.map(esc).join(';')).join('\n')}`], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${name.replace(/[^\w-]+/g, '-')}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}

// Formato de tiempos de vuelta: 1:42.358
export const fmtLap = (ms) => {
  if (ms == null) return '—';
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
};
// Parcial de tramo: segundos con milésimas, y minutos solo si pasa de uno (los tramos suelen durar segundos).
export const fmtSplit = (ms) => (ms == null ? '—' : ms < 60000 ? (ms / 1000).toFixed(3) : fmtLap(Math.round(ms)));
export const fmtDelta =(ms) => (ms == null || Number.isNaN(ms) ? '—' : `${ms < 0 ? '−' : '+'}${(Math.abs(ms) / 1000).toFixed(3)}`);
