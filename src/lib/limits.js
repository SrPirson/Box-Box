// Umbrales de alerta de cada coche. Se configuran en el móvil del coche y viajan en cada paquete,
// así BOX evalúa cada coche con sus propios límites.
export const LIMITS = {
  tempWarn: 95, tempCrit: 100,          // °C refrigerante (aviso ≥, crítico >)
  voltWarn: 12.6, voltCrit: 12.2,       // V batería baja (<)
  voltHighWarn: 14.8, voltHighCrit: 15.5, // V sobretensión del regulador (>)
  rpmWarn: 7000, rpmCrit: 7800,         // rpm (≥); el crítico es el corte/limitador
  staleWarn: 3, staleCrit: 10,          // s sin recibir datos (>)
  phoneWarn: 20, phoneCrit: 10,         // % batería del móvil (<)
  offWarn: 25, offCrit: 50,             // m fuera del trazado dibujado (>)
};
export const limitsOf = (p) => ({ ...LIMITS, ...p?.limits });
// Retraso del paquete respecto a cuando tocaba el siguiente: con intervalos largos (pruebas) no es "sin señal".
export const lateMs = (p, now) => now - p.ts - (p.pollMs ?? 0);

const NF = [0, 1, 2].map((d) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' }));
export const fmt = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : NF[d].format(v));
export const fmtAge = (ms) => { ms = Math.max(0, ms); return `${fmt(ms / 1000, ms < 10000 ? 1 : 0)} s`; };

// Alarmas activas de un paquete: [{ key, level: 'warn'|'crit', text, silent? }]
export function carAlarms(p, now) {
  const L = limitsOf(p);
  const o = p.obd ?? {};
  const out = [];
  const add = (key, level, text, silent) => out.push({ key, level, text, silent });
  const age = now - p.ts;
  const late = lateMs(p, now);
  if (late > L.staleCrit * 1000) add('stale', 'crit', `Sin señal ${fmtAge(age)}`);
  else if (late > L.staleWarn * 1000) add('stale', 'warn', `Sin datos ${fmtAge(age)}`);
  if (o.coolant > L.tempCrit) add('temp', 'crit', `Temp ${o.coolant} °C`);
  else if (o.coolant >= L.tempWarn) add('temp', 'warn', `Temp ${o.coolant} °C`);
  if (o.voltage != null) {
    const v = `${fmt(o.voltage, 2)} V`;
    if (o.voltage < L.voltCrit) add('volt', 'crit', `Batería ${v}`);
    else if (o.voltage < L.voltWarn) add('volt', 'warn', `Batería ${v}`);
    else if (o.voltage > L.voltHighCrit) add('volt', 'crit', `Sobretensión ${v}`);
    else if (o.voltage > L.voltHighWarn) add('volt', 'warn', `Sobretensión ${v}`);
  }
  // El aviso de RPM es solo visual: oscila en cada recta y un pitido por vuelta sería ruido.
  if (o.rpm >= L.rpmCrit) add('rpm', 'crit', `Limitador ${fmt(o.rpm)} rpm`);
  else if (o.rpm >= L.rpmWarn) add('rpm', 'warn', `Régimen ${fmt(o.rpm)} rpm`, true);
  if (p.offTrack > L.offCrit) add('off', 'crit', `Fuera de pista ${fmt(p.offTrack)} m`);
  else if (p.offTrack > L.offWarn) add('off', 'warn', `Fuera de trazado ${fmt(p.offTrack)} m`);
  if (p.phoneBattery != null) {
    if (p.phoneBattery < L.phoneCrit) add('phone', 'crit', `Móvil ${p.phoneBattery} %`);
    else if (p.phoneBattery < L.phoneWarn) add('phone', 'warn', `Móvil ${p.phoneBattery} %`);
  }
  return out;
}
export const worst = (alarms) => (alarms.some((a) => a.level === 'crit') ? 'crit' : alarms.length ? 'warn' : 'ok');

// Errores de coherencia entre umbrales (el aviso debe saltar antes que el crítico).
export function limitErrors(L) {
  const e = {};
  if (!(L.tempWarn < L.tempCrit)) e.temp = 'El aviso debe ser menor que el crítico.';
  if (!(L.voltCrit < L.voltWarn)) e.volt = 'El crítico debe ser menor que el aviso.';
  if (!(L.voltWarn < L.voltHighWarn)) e.voltHigh = 'La sobretensión debe estar por encima de la batería baja.';
  else if (!(L.voltHighWarn < L.voltHighCrit)) e.voltHigh = 'El aviso debe ser menor que el crítico.';
  if (!(L.rpmWarn < L.rpmCrit)) e.rpm = 'El aviso debe ser menor que el limitador.';
  if (!(L.staleWarn < L.staleCrit)) e.stale = 'El aviso debe ser menor que el crítico.';
  if (!(L.phoneCrit < L.phoneWarn)) e.phone = 'El crítico debe ser menor que el aviso.';
  if (!(L.offWarn < L.offCrit)) e.off = 'El aviso debe ser menor que el crítico.';
  return e;
}
