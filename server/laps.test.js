import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossing, createLapTimer, createRoute } from './laps.js';

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

// Circuito circular de ~110 m de radio en Madrid, dibujado con 64 puntos.
const C = [40, -3.7], R = 0.001;
const ring = (a, r = R) => [C[0] + r * Math.sin(a), C[1] + (r * Math.cos(a)) / Math.cos((C[0] * Math.PI) / 180)];
const PATH = Array.from({ length: 64 }, (_, i) => ring((2 * Math.PI * i) / 64));

test('mide la distancia al trazado y el progreso a lo largo de él', () => {
  const route = createRoute(PATH);
  assert.ok(route.locate(ring(1)).dist < 1);
  const out = route.locate(ring(1, R + 0.0002)).dist; // 0,0002° de latitud ≈ 22 m hacia fuera
  assert.ok(Math.abs(out - 22) < 2, `${out} m`);
  assert.ok(Math.abs(route.locate(ring(Math.PI)).at - 0.5) < 0.01);
  // Meta con un toque cerca del trazado: 30 m de lado a lado, cortándolo.
  const [A, B] = route.lineAt(ring(1, R + 0.00005));
  assert.ok(crossing({ lat: ring(0.95)[0], lng: ring(0.95)[1] }, { lat: ring(1.05)[0], lng: ring(1.05)[1] }, A, B) != null);
  const len = Math.hypot((A[0] - B[0]) * 110540, (A[1] - B[1]) * 111320 * Math.cos((40 * Math.PI) / 180));
  assert.ok(Math.abs(len - 30) < 0.5, `${len} m`);
});

// Vueltas de 60 s alrededor del trazado; `step` = muestras por vuelta, `dir` = sentido de giro.
function drive(route, { laps = 3, step = 240, dir = 1, line = route.line, cuts } = {}) {
  const timer = createLapTimer();
  const done = [];
  for (let i = 1; i <= laps * step; i++) {
    const pt = ring(dir * ((2 * Math.PI * i) / step + 0.01));
    const lap = timer.push({ ts: (i * 60000) / step, lat: pt[0], lng: pt[1], at: route.locate(pt).at }, line, cuts);
    if (lap) done.push(lap);
  }
  return done;
}

test('con trazado y sin meta, la meta es el inicio del trazado; da igual el sentido o un muestreo lento', () => {
  const route = createRoute(PATH);
  for (const opts of [{}, { dir: -1 }, { step: 12 }]) {
    const laps = drive(route, opts);
    assert.equal(laps.length, 2, JSON.stringify(opts));
    for (const l of laps) assert.ok(Math.abs(l.ms - 60000) < 300, `${JSON.stringify(opts)}: ${l.ms} ms`);
  }
});

test('parciales por tramo: dos cortes a un tercio y dos tercios dan tres tramos de 20 s', () => {
  const route = createRoute(PATH);
  // Cortes colocados en orden inverso: los parciales siguen el orden en que se cruzan.
  const cuts = [route.lineAt(ring((4 * Math.PI) / 3)), route.lineAt(ring((2 * Math.PI) / 3))];
  const laps = drive(route, { cuts });
  assert.equal(laps.length, 2);
  for (const l of laps) {
    assert.equal(l.sectors.length, 3);
    for (const s of l.sectors) assert.ok(Math.abs(s - 20000) < 300, `tramo de ${s} ms`);
    assert.ok(Math.abs(l.sectors.reduce((a, b) => a + b) - l.ms) <= 2); // redondeo por tramo
  }
  // Sin cortes, la vuelta no lleva parciales.
  assert.equal(drive(route)[0].sectors, null);
});

test('con trazado, un cruce de meta sin recorrer el circuito no es vuelta', () => {
  const route = createRoute(PATH);
  const timer = createLapTimer();
  // Cruza la meta, recorre un cuarto de circuito, da media vuelta y vuelve a cruzarla 40 s después.
  const arc = [...Array(40).keys()].map((i) => -0.1 + (i / 40) * (Math.PI / 2));
  const pts = [...arc, ...arc.reverse()].map((a, i) => ({ ts: i * 1000, a }));
  const out = pts.map(({ ts, a }) => { const p = ring(a); return timer.push({ ts, lat: p[0], lng: p[1], at: route.locate(p).at }, route.line); });
  assert.ok(timer.startedAt != null);
  assert.deepEqual(out.filter(Boolean), []);
});
