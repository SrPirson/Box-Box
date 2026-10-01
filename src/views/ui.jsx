// Piezas de interfaz compartidas por Ajustes, Equipo, Estadísticas y Admin.
import { useEffect, useState } from 'react';

export const input = 'h-10 w-full rounded-[4px] border border-line-strong bg-sunken px-3 text-[15px] text-fg placeholder:text-muted';
export const btn = {
  primary: 'flex h-10 items-center justify-center gap-2 rounded-[4px] bg-accent px-4 text-[14px] font-bold uppercase tracking-[0.06em] text-panel transition-opacity disabled:opacity-50',
  ghost: 'flex h-9 items-center justify-center gap-2 rounded-[4px] border border-line-strong px-3 text-[13px] font-semibold uppercase tracking-[0.06em] hover:bg-raised disabled:opacity-50',
  danger: 'flex h-9 items-center justify-center gap-2 rounded-[4px] border border-crit px-3 text-[13px] font-bold uppercase tracking-[0.06em] text-crit hover:bg-crit-soft',
  dangerSolid: 'flex h-9 items-center justify-center gap-2 rounded-[4px] bg-crit-solid px-3 text-[13px] font-bold uppercase tracking-[0.06em] text-on-crit',
};

export const Page = ({ title, subtitle, actions, children, max = 'max-w-[1180px]' }) => (
  <div className="h-full overflow-y-auto">
    <div className={`mx-auto ${max} p-4 lg:p-6`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-[0.06em]">{title}</h1>
          {subtitle && <p className="text-[13px] text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  </div>
);

export const Card = ({ title, badge, tone = '', children, flush }) => (
  <section className={`min-w-0 rounded-[4px] border bg-panel ${tone || 'border-line'}`}>
    <header className="flex h-10 items-center justify-between gap-2 border-b border-line px-4">
      <h2 className="label">{title}</h2>{badge}
    </header>
    <div className={flush ? '' : 'flex flex-col gap-4 p-4'}>{children}</div>
  </section>
);

export const Pill = ({ tone = 'warn', children }) => {
  const cls = { warn: 'bg-warn-soft text-warn', crit: 'bg-crit-soft text-crit', ok: 'bg-ok-soft text-ok', info: 'bg-info-soft text-info', accent: 'bg-accent-soft text-accent', muted: 'bg-sunken text-muted' }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-[3px] px-1.5 py-px text-[11px] font-bold uppercase tracking-[0.06em] ${cls}`}>{children}</span>;
};

export const Field = ({ label, help, children }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fg-2">{label}</span>
    {children}
    {help && <span className="text-[13px] leading-snug text-muted">{help}</span>}
  </label>
);

export const ErrorText = ({ children }) => children ? <p role="alert" className="rounded-[4px] bg-crit-soft px-3 py-2 text-[14px] font-semibold text-crit">{children}</p> : null;

export function Segmented({ label, value, options, onChange, disabled }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fg-2">{label}</span>}
      <div role="radiogroup" aria-label={label} className="flex rounded-[4px] border border-line-strong bg-sunken p-0.5">
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled} onClick={() => onChange(v)}
            className={`h-9 flex-1 whitespace-nowrap rounded-[3px] px-3 text-[14px] font-semibold uppercase tracking-[0.06em] transition-colors disabled:opacity-50 ${value === v ? 'bg-panel text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg'}`}>
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

// Formato de tiempos de vuelta: 1:42.358
export const fmtLap = (ms) => {
  if (ms == null) return '—';
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
};
export const fmtDelta = (ms) => (ms == null || Number.isNaN(ms) ? '—' : `${ms < 0 ? '−' : '+'}${(Math.abs(ms) / 1000).toFixed(3)}`);
