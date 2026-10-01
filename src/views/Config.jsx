// Configuración en dos vistas: COCHE (este dispositivo: dorsal, sensor, alertas, simulador) y EQUIPO (canal, servidor, apariencia).
import { useEffect, useState } from 'react';
import Icon from '../icons.jsx';
import { useConfig, setConfig, speak, DEFAULTS } from '../lib/store.js';
import { sim, useGateway, start, stop } from '../lib/gateway.js';
import { setMode, useThemeMode } from '../lib/theme.js';
import { LIMITS, limitErrors } from '../lib/limits.js';

const input = 'h-10 w-full rounded-[4px] border border-line-strong bg-sunken px-3 text-[15px] text-fg placeholder:text-muted';
const TABS = [['coche', 'Coche', 'car'], ['equipo', 'Equipo', 'flag']];

export default function Config() {
  const [tab, setTab] = useState('coche');
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1180px] p-4 lg:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-[0.06em]">Configuración</h1>
            <p className="text-[13px] text-muted">
              {tab === 'coche' ? 'Ajustes de este coche. Se guardan en este dispositivo y las alertas viajan a BOX con la telemetría.' : 'Ajustes compartidos con el resto del equipo y del portátil de BOX.'}
            </p>
          </div>
          <div role="tablist" aria-label="Vistas de configuración" className="flex rounded-[4px] border border-line-strong bg-sunken p-0.5">
            {TABS.map(([id, label, icon]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`flex h-9 items-center gap-2 rounded-[3px] px-4 text-[14px] font-semibold uppercase tracking-[0.06em] transition-colors ${tab === id ? 'bg-panel text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg'}`}>
                <Icon name={icon} size={16} />{label}
              </button>
            ))}
          </div>
        </div>
        {tab === 'coche' ? <CarSettings /> : <TeamSettings />}
      </div>
    </div>
  );
}

// ── Vista COCHE ──
function CarSettings() {
  const cfg = useConfig();
  const gw = useGateway();
  const [faults, setFaults] = useState({ ...sim });
  const toggle = (k) => { sim[k] = !sim[k]; setFaults({ ...sim }); };
  const bind = (k, map = (v) => v) => ({ value: cfg[k], onChange: (e) => setConfig({ [k]: map(e.target.value) }) });
  const running = gw.obd === 'on';
  const simulating = cfg.source === 'sim' && Object.values(faults).some(Boolean);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card title="Identificación">
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <Field label="Dorsal"><input className={`${input} num text-lg font-bold`} inputMode="numeric" {...bind('dorsal')} /></Field>
            <Field label="Teléfono del mecánico" help="Se marca al pulsar AVERÍA en la vista Piloto.">
              <input className={`${input} num`} type="tel" placeholder="+34 600 000 000" {...bind('phone')} />
            </Field>
          </div>
        </Card>

        <AlertsCard />

        <Card title="Sensor OBD2">
          <Segmented label="Origen de los datos" value={cfg.source} disabled={running} onChange={(v) => setConfig({ source: v })}
            options={[['sim', 'Simulador'], ['ble', 'ELM327 Bluetooth']]} />
          <p className="flex gap-2 text-[13px] leading-snug text-muted">
            <Icon name="bluetooth" size={15} className="mt-px" />
            <span>
              {cfg.source === 'ble'
                ? 'Necesita Chrome en Android y un adaptador BLE 4.0. Los ELM327 de Bluetooth clásico (PIN 1234) no aparecen.'
                : 'Genera RPM, temperatura y voltaje realistas para probar BOX y Piloto sin coche.'}
              {running && ' Detén la telemetría para cambiar el origen.'}
            </span>
          </p>
          <Field label="Intervalo de lectura y envío" help="Más bajo = datos más fluidos, a cambio de más batería y datos móviles.">
            <div className="flex items-center gap-4">
              <input type="range" min="200" max="500" step="50" list="poll-marks" className="flex-1 accent-[var(--accent)]" {...bind('pollMs', Number)} />
              <datalist id="poll-marks"><option value="200" /><option value="300" /><option value="400" /><option value="500" /></datalist>
              <span className="num w-20 text-right text-[15px]">{cfg.pollMs} ms</span>
            </div>
          </Field>
        </Card>

        <Card title="Simulador · fallos" badge={simulating && <Pill tone="warn">Simulando fallos</Pill>}>
          <div className="-mx-3 -my-1 flex flex-col">
            <Switch label="Sobrecalentamiento" help="El refrigerante sube hasta ~112 °C." on={faults.overheat} onToggle={() => toggle('overheat')} disabled={cfg.source !== 'sim'} />
            <Switch label="Fallo de alternador" help="La tensión cae a ~11,7 V." on={faults.lowVolt} onToggle={() => toggle('lowVolt')} disabled={cfg.source !== 'sim'} />
            <Switch label="Motor calado" help="RPM a 0 y tensión de batería en reposo." on={faults.stall} onToggle={() => toggle('stall')} disabled={cfg.source !== 'sim'} />
          </div>
          {cfg.source !== 'sim' && <p className="text-[13px] text-muted">Solo disponible con el simulador como origen.</p>}
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-0 lg:self-start">
        <TelemetryCard />
      </div>
    </div>
  );
}

// Tabla de umbrales: una fila por alerta, columnas Aviso / Crítico.
const ALERT_ROWS = [
  { id: 'temp', name: 'Temperatura motor', cond: 'Aviso desde · crítico por encima de', unit: '°C', warn: 'tempWarn', crit: 'tempCrit', step: 1 },
  { id: 'volt', name: 'Batería baja', cond: 'Por debajo de', unit: 'V', warn: 'voltWarn', crit: 'voltCrit', step: 0.1 },
  { id: 'voltHigh', name: 'Sobretensión', cond: 'Por encima de (fallo de regulador)', unit: 'V', warn: 'voltHighWarn', crit: 'voltHighCrit', step: 0.1 },
  { id: 'rpm', name: 'Régimen motor', cond: 'Aviso visual desde · crítico en el limitador', unit: 'rpm', warn: 'rpmWarn', crit: 'rpmCrit', step: 100 },
  { id: 'stale', name: 'Sin datos del coche', cond: 'Segundos sin recibir telemetría', unit: 's', warn: 'staleWarn', crit: 'staleCrit', step: 1 },
  { id: 'phone', name: 'Batería del móvil', cond: 'Por debajo de', unit: '%', warn: 'phoneWarn', crit: 'phoneCrit', step: 1 },
];

function AlertsCard() {
  const { limits } = useConfig();
  const errors = limitErrors(limits);
  const set = (k, n) => setConfig({ limits: { ...limits, [k]: n } });
  const isDefault = Object.keys(LIMITS).every((k) => limits[k] === LIMITS[k]);
  return (
    <Card title="Alertas" badge={!isDefault && (
      <button onClick={() => setConfig({ limits: LIMITS })} className="text-[12px] font-semibold uppercase tracking-[0.06em] text-accent hover:underline">Valores por defecto</button>
    )}>
      <p className="-mt-1 text-[13px] leading-snug text-muted">
        Cuándo avisa BOX de este coche. <span className="text-warn">Aviso</span>: indicación ámbar y un tono.{' '}
        <span className="text-crit">Crítico</span>: banner rojo y pitido hasta que alguien lo reconoce.
      </p>
      <div className="-mx-4 border-t border-line">
        <div className="hidden grid-cols-[minmax(0,1fr)_150px_150px] gap-3 border-b border-line bg-raised px-4 py-1.5 sm:grid">
          <span className="label">Métrica</span>
          <span className="label flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warn-solid" />Aviso</span>
          <span className="label flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-crit-solid" />Crítico</span>
        </div>
        {ALERT_ROWS.map((r) => (
          <div key={r.id} className={`grid grid-cols-2 items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_150px_150px] ${errors[r.id] ? 'bg-crit-soft' : ''}`}>
            <div className="col-span-2 sm:col-span-1">
              <div className="text-[15px] font-semibold uppercase tracking-[0.04em]">{r.name}</div>
              <div className="text-[13px] text-muted">{r.cond}</div>
              {errors[r.id] && <div role="alert" className="mt-0.5 text-[13px] font-semibold text-crit">{errors[r.id]}</div>}
            </div>
            <NumInput label={`${r.name} · aviso`} tone="warn" unit={r.unit} step={r.step} value={limits[r.warn]} onCommit={(n) => set(r.warn, n)} invalid={!!errors[r.id]} />
            <NumInput label={`${r.name} · crítico`} tone="crit" unit={r.unit} step={r.step} value={limits[r.crit]} onCommit={(n) => set(r.crit, n)} invalid={!!errors[r.id]} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// Campo numérico que no pisa lo que el usuario está escribiendo ("12," a medias) y solo guarda números válidos.
function NumInput({ label, tone, unit, value, onCommit, invalid, step }) {
  const [s, setS] = useState(String(value));
  useEffect(() => { if (Number(s) !== value) setS(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className={`flex h-10 items-center rounded-[4px] border bg-sunken focus-within:outline-2 focus-within:outline-accent ${invalid ? 'border-crit' : 'border-line-strong'}`}>
      <span className={`ml-2.5 h-2 w-2 shrink-0 rounded-full sm:hidden ${tone === 'warn' ? 'bg-warn-solid' : 'bg-crit-solid'}`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input type="number" inputMode="decimal" step={step} value={s} aria-invalid={invalid}
        onChange={(e) => { setS(e.target.value); const n = e.target.valueAsNumber; if (!Number.isNaN(n)) onCommit(n); }}
        className="num h-full w-full min-w-0 bg-transparent px-2.5 text-[15px] text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
      <span className="num pr-2.5 text-[12px] text-muted">{unit}</span>
    </label>
  );
}

function TelemetryCard() {
  const cfg = useConfig();
  const gw = useGateway();
  const [copied, setCopied] = useState(false);
  const running = gw.obd === 'on';
  const status = {
    on: ['text-ok', 'bg-ok', `Enviando · cada ${cfg.pollMs} ms`],
    connecting: ['text-warn', 'pulse bg-warn-solid', 'Conectando…'],
    error: ['text-crit', 'bg-crit', gw.error || 'Error'],
    off: ['text-muted', 'bg-pending', 'Detenida'],
  }[gw.obd];

  return (
    <Card title="Telemetría">
      <div className={`flex items-center gap-2 text-[15px] font-semibold ${status[0]}`}>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status[1]}`} />{status[2]}
        {gw.queued > 0 && <span className="num ml-auto text-[13px] text-warn">{gw.queued} en cola</span>}
      </div>
      <div className="flex gap-2">
        <button onClick={running ? stop : start}
          className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-[4px] text-[15px] font-bold uppercase tracking-[0.06em] transition-colors ${running ? 'border border-crit text-crit hover:bg-crit-soft' : 'bg-accent text-panel'}`}>
          <Icon name={running ? 'stop' : 'play'} size={16} />{running ? 'Detener' : 'Iniciar telemetría'}
        </button>
        <button onClick={() => speak('Prueba de voz. Entra en box.')} className="flex h-11 items-center gap-2 rounded-[4px] border border-line-strong px-3 text-[13px] font-semibold uppercase tracking-[0.06em] hover:bg-raised">
          <Icon name="speaker" size={16} />Probar voz
        </button>
      </div>
      {gw.data && (
        <dl className="num grid grid-cols-4 gap-px overflow-hidden rounded-[4px] border border-line bg-line text-center">
          {[['RPM', gw.data.obd.rpm], ['°C', gw.data.obd.coolant], ['V', gw.data.obd.voltage], ['ACEL %', gw.data.obd.throttle]].map(([k, v]) => (
            <div key={k} className="bg-sunken px-1 py-2">
              <dt className="text-[10px] tracking-[0.06em] text-muted">{k}</dt>
              <dd className="text-[17px] font-bold">{v ?? '—'}</dd>
            </div>
          ))}
        </dl>
      )}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold uppercase tracking-[0.06em] text-fg-2 hover:text-fg">
          Último paquete JSON <span className="text-muted transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="relative mt-2">
          <pre className="num max-h-80 overflow-auto rounded-[4px] bg-sunken p-3 text-[12px] leading-relaxed text-fg-2">{gw.data ? JSON.stringify(gw.data, null, 2) : 'Sin datos todavía.'}</pre>
          {gw.data && (
            <button onClick={() => { navigator.clipboard?.writeText(JSON.stringify(gw.data, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
              className="absolute right-2 top-2 flex items-center gap-1 rounded-[3px] border border-line bg-panel px-2 py-1 text-[11px] font-semibold uppercase">
              <Icon name={copied ? 'check' : 'copy'} size={12} />{copied ? 'Copiado' : 'Copiar'}
            </button>
          )}
        </div>
      </details>
    </Card>
  );
}

// ── Vista EQUIPO ──
function TeamSettings() {
  const cfg = useConfig();
  const mode = useThemeMode();
  const [confirmReset, setConfirmReset] = useState(false);
  const bind = (k) => ({ value: cfg[k], onChange: (e) => setConfig({ [k]: e.target.value }) });

  return (
    <div className="grid max-w-3xl gap-4">
      <Card title="Canal y servidor">
        <Field label="Canal" help="Todos los coches y portátiles de BOX en el mismo canal se ven entre sí. Usa uno distinto por equipo o por sesión.">
          <input className={`${input} num`} {...bind('channel')} />
        </Field>
        <Field label="Servidor de BOX" help="Déjalo vacío para usar el mismo servidor que sirve esta página. En pista debe ser HTTPS.">
          <input className={`${input} num`} placeholder="https://box.mi-equipo.es" {...bind('serverUrl')} />
        </Field>
      </Card>

      <Card title="Apariencia">
        <Segmented label="Tema" value={mode} onChange={setMode} options={[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']]} />
        <p className="text-[13px] text-muted">Claro para el muro a pleno sol; oscuro para noche o boxes cerrados.</p>
      </Card>

      <Card title="Zona de peligro" tone="border-crit/40">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[200px] flex-1">
            <div className="text-[15px] font-semibold uppercase tracking-[0.04em]">Restablecer configuración</div>
            <div className="text-[13px] text-muted">Vuelve a los valores de fábrica en este dispositivo: dorsal 7, canal «equipo», sin teléfono y alertas por defecto.</div>
          </div>
          {confirmReset ? (
            <span className="flex gap-2">
              <button onClick={() => { setConfig(DEFAULTS); setConfirmReset(false); }} className="h-9 rounded-[4px] bg-crit-solid px-3 text-[13px] font-bold uppercase tracking-[0.06em] text-on-crit">Sí, restablecer</button>
              <button onClick={() => setConfirmReset(false)} className="h-9 rounded-[4px] border border-line-strong px-3 text-[13px] font-semibold uppercase tracking-[0.06em]">Cancelar</button>
            </span>
          ) : (
            <button onClick={() => setConfirmReset(true)} className="h-9 rounded-[4px] border border-crit px-3 text-[13px] font-bold uppercase tracking-[0.06em] text-crit hover:bg-crit-soft">Restablecer…</button>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Piezas de formulario ──
const Card = ({ title, badge, tone = '', children }) => (
  <section className={`rounded-[4px] border bg-panel ${tone || 'border-line'}`}>
    <header className="flex h-10 items-center justify-between border-b border-line px-4">
      <h2 className="label">{title}</h2>{badge}
    </header>
    <div className="flex flex-col gap-4 p-4">{children}</div>
  </section>
);

const Pill = ({ tone, children }) => (
  <span className={`num rounded-[3px] px-1.5 text-[11px] font-bold uppercase ${tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-crit-soft text-crit'}`}>{children}</span>
);

const Field = ({ label, help, children }) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fg-2">{label}</span>
    {children}
    {help && <span className="text-[13px] leading-snug text-muted">{help}</span>}
  </label>
);

function Segmented({ label, value, options, onChange, disabled }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-fg-2">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-[4px] border border-line-strong bg-sunken p-0.5">
        {options.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={value === v} disabled={disabled} onClick={() => onChange(v)}
            className={`h-9 flex-1 rounded-[3px] text-[14px] font-semibold uppercase tracking-[0.06em] transition-colors disabled:opacity-50 ${value === v ? 'bg-panel text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg'}`}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

const Switch = ({ label, help, on, onToggle, disabled }) => (
  <div className={`flex items-center gap-4 rounded-[4px] px-3 py-2.5 transition-colors ${on ? 'bg-warn-soft' : ''}`}>
    <div className="flex-1">
      <div className={`text-[15px] font-semibold uppercase tracking-[0.04em] ${on ? 'text-warn' : ''}`}>{label}</div>
      <div className="text-[13px] text-muted">{help}</div>
    </div>
    <button role="switch" aria-checked={on} aria-label={label} onClick={onToggle} disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${on ? 'border-warn-solid bg-warn-solid' : 'border-line-strong bg-sunken'}`}>
      <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full shadow transition-transform ${on ? 'translate-x-5.5 bg-panel' : 'translate-x-0.5 bg-fg-2'}`} />
    </button>
  </div>
);
