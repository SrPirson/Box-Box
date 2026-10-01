import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossing, createLapTimer } from './laps.js';

test('detecta el corte de segmentos', () => {
  const A = [0, -1], B = [0, 1]; // [lat, lng]: meta horizontal en lat 0, de lng -1 a 1
  assert.equal(crossing({ lat: -1, lng: 0 }, { lat: 1, lng: 0 }, A, B), 0.5);     // la cruza por la mitad
  assert.equal(crossing({ lat: -1, lng: 0 }, { lat: 3, lng: 0 }, A, B), 0.25);
  assert.equal(crossing({ lat: 0.5, lng: -1 }, { lat: 0.5, lng: 1 }, A, B), null); // paralelo
  assert.equal(crossing({ lat: -1, lng: 2 }, { lat: 1, lng: 2 }, A, B), null);     // fuera de la línea
});

test('cronometra vueltas en un circuito circular e interpola el instante del cruce', () => {
  const line = [[0, 0.9], [0, 1.1]]; // meta cortando el círculo de radio 1 en (lat 0, lng 1)
  const lap = createLapTimer();
  const laps = [];
  // 3 vueltas de 60 s a 4 Hz, empezando justo después de la meta.
  for (let i = 1; i <= 3 * 240; i++) {
    const a = (2 * Math.PI * i) / 240 + 0.01;
    const done = lap.push({ ts: i * 250, lat: Math.sin(a), lng: Math.cos(a), coolant: 90, rpm: 6000, speed: 150, voltage: 13.8 }, line);
    if (done) laps.push(done);
  }
  assert.equal(laps.length, 2); // la 1ª vuelta abre el cronómetro (vuelta de salida)
  for (const l of laps) assert.ok(Math.abs(l.ms - 60000) < 5, `vuelta de ${l.ms} ms`);
  assert.equal(laps[0].avgTemp, 90);
  assert.equal(laps[0].maxSpeed, 150);
});

test('ignora cruces dobles por ruido junto a la línea', () => {
  const line = [[0, -1], [0, 1]];
  const lap = createLapTimer();
  const pts = [[-0.1, 0], [0.1, 0], [-0.1, 0], [0.1, 0]]; // zigzag sobre la meta en 3 s
  const out = pts.map(([lat, lng], i) => lap.push({ ts: i * 1000, lat, lng }, line));
  assert.deepEqual(out, [null, null, null, null]);
});
