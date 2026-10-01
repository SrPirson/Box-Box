// Ajustes de ESTE dispositivo (sensor, simulador, telemetría, tema) y de la cuenta.
import { useState } from 'react';
import Icon from '../icons.jsx';
import { useConfig, setConfig, speak } from '../lib/store.js';
import { sim, useGateway, start, stop } from '../lib/gateway.js';
import { setMode, useThemeMode } from '../lib/theme.js';
import { api, logout, setSession, useSession } from '../lib/session.js';
import { Page, Card, Field, Segmented, Switch, Pill, ErrorText, input, btn } from './ui.jsx';

const POLL_STEPS = [200, 250, 300, 400, 500, 1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000];
const pollIndex = (ms) => { const i = POLL_STEPS.findIndex((s) => s >= ms); return i < 0 ? POLL_STEPS.length - 1 : i; };
const fmtPoll = (ms) => (ms < 1000 ? `${ms} ms` : ms < 60000 ? `${ms / 1000} s` : `${ms / 60000} min`);

export default function Settings() {
  const cfg = useConfig();
  const gw = useGateway();
  const mode = useThemeMode();
  const [faults, setFaults] = useState({ ...sim });
  const toggle = (k) => { sim[k] = !sim[k]; setFaults({ ...sim }); };
  const running = gw.obd === 'on';
  const simulating = cfg.source === 'sim' && Object.values(faults).some(Boolean);

  return (
    <Page title="Ajustes" subtitle="Solo afectan a este dispositivo. Los ajustes del coche (dorsal, alertas, meta) están en Equipo.">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
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
            <Field label="Intervalo de lectura y envío" help="Más bajo = datos más fluidos, a cambio de más batería y datos móviles. En carrera, 250-500 ms; los intervalos largos son para medir el consumo del móvil.">
              <div className="flex items-center gap-4">
                <input type="range" min="0" max={POLL_STEPS.length - 1} step="1" className="flex-1 accent-[var(--accent)]" aria-valuetext={fmtPoll(cfg.pollMs)}
                  value={pollIndex(cfg.pollMs)} onChange={(e) => setConfig({ pollMs: POLL_STEPS[e.target.value] })} />
                <span className="num w-20 text-right text-[15px]">{fmtPoll(cfg.pollMs)}</span>
              </div>
              {cfg.pollMs > 500 && <p className="text-[13px] text-warn">Intervalo de pruebas: BOX verá los datos con retraso y las vueltas no se cronometrarán bien.</p>}
            </Field>
          </Card>

          <Card title="Simulador · fallos" badge={simulating && <Pill>Simulando fallos</Pill>}>
            <div className="-mx-3 -my-1 flex flex-col">
              <Switch label="Sobrecalentamiento" help="El refrigerante sube hasta ~112 °C." on={faults.overheat} onToggle={() => toggle('overheat')} disabled={cfg.source !== 'sim'} />
              <Switch label="Fallo de alternador" help="La tensión cae a ~11,7 V." on={faults.lowVolt} onToggle={() => toggle('lowVolt')} disabled={cfg.source !== 'sim'} />
              <Switch label="Motor calado" help="RPM a 0 y tensión de batería en reposo." on={faults.stall} onToggle={() => toggle('stall')} disabled={cfg.source !== 'sim'} />
            </div>
            {cfg.source !== 'sim' && <p className="text-[13px] text-muted">Solo disponible con el simulador como origen.</p>}
          </Card>

          <Card title="Apariencia">
            <Segmented label="Tema" value={mode} onChange={setMode} options={[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']]} />
            <p className="text-[13px] text-muted">Claro para el muro a pleno sol; oscuro para noche o boxes cerrados.</p>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-0 lg:self-start">
          <TelemetryCard />
          <AccountCard />
        </div>
      </div>
    </Page>
  );
}

function TelemetryCard() {
  const cfg = useConfig();
  const gw = useGateway();
  const [copied, setCopied] = useState(false);
  const running = gw.obd === 'on';
  const status = {
    on: ['text-ok', 'bg-ok', `Enviando · cada ${fmtPoll(cfg.pollMs)}`],
    connecting: ['text-warn', 'pulse bg-warn-solid', 'Conectando…'],
    error: ['text-crit', 'bg-crit', 'Error'],
    off: ['text-muted', 'bg-pending', 'Detenida'],
  }[gw.obd];

  return (
    <Card title="Telemetría de este móvil">
      <div className={`flex items-center gap-2 text-[15px] font-semibold ${status[0]}`}>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status[1]}`} />{status[2]}
        {gw.queued > 0 && <span className="num ml-auto text-[13px] text-warn">{gw.queued} en cola</span>}
      </div>
      {gw.error && <p className="text-[13px] text-crit">{gw.error}</p>}
      <div className="flex gap-2">
        <button onClick={running ? stop : start}
          className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-[4px] text-[15px] font-bold uppercase tracking-[0.06em] transition-colors ${running ? 'border border-crit text-crit hover:bg-crit-soft' : 'bg-accent text-panel'}`}>
          <Icon name={running ? 'stop' : 'wheel'} size={16} />{running ? 'Detener' : 'Tomar el volante'}
        </button>
        <button onClick={() => speak('Prueba de voz. Entra en box.')} className={`${btn.ghost} h-11`}>
          <Icon name="speaker" size={16} />Probar voz
        </button>
      </div>
      <p className="text-[13px] text-muted">Al tomar el volante, este móvil pasa a ser el del coche y el anterior deja de enviar.</p>
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

function AccountCard() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError('');
    try {
      if (f.get('next') !== f.get('next2')) throw new Error('Las contraseñas no coinciden.');
      setSession(await api('/api/password', { method: 'POST', body: { current: f.get('current'), next: f.get('next') } }));
      setOpen(false);
      setDone(true);
    } catch (err) { setError(err.message); }
  };
  return (
    <Card title="Cuenta" badge={user.role === 'admin' && <Pill tone="accent">Administrador</Pill>}>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-lg font-bold uppercase text-accent">{user.name.slice(0, 1)}</span>
        <div className="min-w-0">
          <div className="truncate text-[16px] font-semibold">{user.name}</div>
          <div className="num truncate text-[13px] text-muted">{user.email}</div>
        </div>
      </div>
      {done && <p className="text-[13px] text-ok">Contraseña cambiada. Las demás sesiones se han cerrado.</p>}
      {open ? (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Contraseña actual"><input className={input} name="current" type="password" autoComplete="current-password" required /></Field>
          <Field label="Nueva contraseña"><input className={input} name="next" type="password" autoComplete="new-password" minLength={8} required /></Field>
          <Field label="Repítela"><input className={input} name="next2" type="password" autoComplete="new-password" minLength={8} required /></Field>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2"><button className={btn.primary}>Guardar</button><button type="button" onClick={() => setOpen(false)} className={btn.ghost}>Cancelar</button></div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setOpen(true); setDone(false); }} className={btn.ghost}><Icon name="key" size={15} />Cambiar contraseña</button>
          <button onClick={() => { stop(); logout(); }} className={btn.ghost}><Icon name="logout" size={15} />Cerrar sesión</button>
        </div>
      )}
    </Card>
  );
}
