import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carAlarms, worst, limitErrors, LIMITS } from './limits.js';

const pkt = (obd, extra = {}) => ({ car: '7', ts: 1000, obd, phoneBattery: 80, ...extra });

test('evalúa niveles con los límites por defecto y con los del coche', () => {
  assert.deepEqual(carAlarms(pkt({ coolant: 90, voltage: 13.9, rpm: 5000 }), 1000), []);
  assert.equal(worst(carAlarms(pkt({ coolant: 97 }), 1000)), 'warn');
  assert.equal(worst(carAlarms(pkt({ coolant: 101 }), 1000)), 'crit');
  // El mismo 101 °C es normal para un coche con límites propios más altos.
  assert.equal(worst(carAlarms(pkt({ coolant: 101 }, { limits: { tempWarn: 105, tempCrit: 110 } }), 1000)), 'ok');
  assert.equal(carAlarms(pkt({ voltage: 12.0 }), 1000)[0].text.startsWith('Batería'), true);
  assert.equal(carAlarms(pkt({ voltage: 15.6 }), 1000)[0].level, 'crit');
  assert.equal(carAlarms(pkt({ rpm: 7200 }), 1000)[0].silent, true);
  assert.equal(carAlarms(pkt({}), 1000 + 4000)[0].level, 'warn');   // 4 s sin datos
  assert.equal(carAlarms(pkt({}), 1000 + 11000)[0].level, 'crit');  // 11 s sin señal
  assert.equal(carAlarms(pkt({}, { phoneBattery: 5 }), 1000)[0].key, 'phone');
  assert.equal(carAlarms(pkt({}, { offTrack: 30 }), 1000)[0].level, 'warn');
  assert.equal(carAlarms(pkt({}, { offTrack: 60 }), 1000)[0].key, 'off');
  // En boxes: sin datos, motor parado y pit lane no son alarma; el sobrecalentamiento sí.
  assert.deepEqual(carAlarms(pkt({ voltage: 12.0, rpm: 0 }, { offTrack: 60 }), 1000 + 60000, true), []);
  assert.equal(carAlarms(pkt({ coolant: 105 }), 1000 + 60000, true)[0].key, 'temp');
  assert.deepEqual(carAlarms(pkt({}, { offTrack: null }), 1000), []);
  // Enviando cada minuto: 50 s sin datos es lo esperado; 64 s ya es aviso.
  assert.deepEqual(carAlarms(pkt({}, { pollMs: 60000 }), 1000 + 50000), []);
  assert.equal(carAlarms(pkt({}, { pollMs: 60000 }), 1000 + 64000)[0].level, 'warn');
});

test('detecta umbrales incoherentes', () => {
  assert.deepEqual(limitErrors(LIMITS), {});
  assert.ok(limitErrors({ ...LIMITS, tempWarn: 110 }).temp);
  assert.ok(limitErrors({ ...LIMITS, voltCrit: 13 }).volt);
});

test('el desfase de reloj del móvil no cuenta como «sin datos»', async () => {
  const { withSkew, lateMs } = await import('./limits.js');
  const now = 100_000;
  // Reloj del móvil 5 s atrasado: el paquete llega al momento.
  const p = withSkew({ car: 'skew', ts: now - 5000, pollMs: 250 }, true, now);
  assert.ok(lateMs(p, now) <= 0);
  assert.equal(carAlarms(p, now).length, 0);
  // 4 s después sin paquetes nuevos sí es aviso.
  assert.equal(carAlarms(p, now + 4000)[0].key, 'stale');
  // Un paquete viejo de la cola offline no cambia el desfase medido.
  assert.equal(withSkew({ car: 'skew', ts: now - 60_000 }, false, now + 100).skew, 5000);
});
