// Ajustes: el coche con el que corre el equipo (dorsal, icono, teléfono del mecánico, alertas) y este móvil
// (sensor OBD, intervalo, simulador, telemetría, app Android). La cuenta y el tema están en el perfil.
import { useState } from 'react';
import Icon from '../icons.jsx';
import { useConfig, setConfig, speak } from '../lib/store.js';
import { sim, useGateway, start, stop } from '../lib/gateway.js';
import { useSession } from '../lib/session.js';
import { Capacitor } from '@capacitor/core';
import { APK_URL } from './Update.jsx';
import { CarCard, AlertsCard, useTeamSave } from './Team.jsx';
import { Page, Card, Field, Segmented, Switch, Pill, ErrorText, btn } from './ui.jsx';

const POLL_STEPS = [200, 250, 300, 400, 500, 1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000];
const pollIndex = (ms) => { const i = POLL_STEPS.findIndex((s) => s >= ms); return i < 0 ? POLL_STEPS.length - 1 : i; };
const fmtPoll = (ms) => (ms < 1000 ? `${ms} ms` : ms < 60000 ? `${ms / 1000} s` : `${ms / 60000} min`);

export default function Settings() {
  const cfg = useConfig();
  const gw = useGateway();
  const { team } = useSession();
  const { error, save } = useTeamSave();
  const [faults, setFaults] = useState({ ...sim });
  const toggle = (k) => { sim[k] = !sim[k]; setFaults({ ...sim }); };
  const running = gw.obd === 'on';
  const simulating = cfg.source === 'sim' && Object.values(faults).some(Boolean);

  return (
    <Page title="Ajustes" subtitle="El coche con el que corres (lo comparte todo el equipo) y este móvil (solo este dispositivo).">
      <ErrorText>{error}</ErrorText>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <CarCard team={team} save={save} />
          <AlertsCard team={team} save={save} />
          <Card title="Sensor OBD2">
            <Segmented label="Origen de los datos" value={cfg.source} disabled={running} onChange={(v) => setConfig({ source: v })}
              options={[['sim', 'Simulador'], ['ble', 'ELM327 Bluetooth']]} />
            <p className="flex gap-2 text-[13px] leading-snug text-muted">
              <Icon name="bluetooth" size={15} className="mt-px" />
              <span>
                {cfg.source === 'ble'
                  ? 'Necesita un adaptador BLE 4.0 y la app Android (o Chrome en Android). Los ELM327 de Bluetooth clásico (PIN 1234) no aparecen. Si se desconecta (contacto quitado al repostar), el GPS sigue enviándose y se reconecta solo.'
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
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-0 lg:self-start">
          <TelemetryCard />
          {!Capacitor.isNativePlatform() && <AppCard />}
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

function AppCard() {
  return (
    <Card title="App Android">
      <p className="text-[13px] text-muted">El móvil del coche necesita la app para mandar la temperatura del teléfono. Al instalarla, Android pedirá permitir apps de origen desconocido.</p>
      <a href={APK_URL} className={btn.primary}><Icon name="download" size={16} />Descargar APK</a>
    </Card>
  );
}
