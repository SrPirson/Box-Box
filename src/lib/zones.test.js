import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoute } from '../../server/laps.js';
import { sectorsZone, inZone, travelDir, zonePoints } from './zones.js';

// Cuadrado de 4 lados dibujado en un sentido; meta en el lado 1 y cortes en los lados 2 y 3 (3 tramos).
const path = [[40, -3], [40, -2.99], [40.01, -2.99], [40.01, -3]];
const route = createRoute(path);
const at = (pt) => route.locate(pt).at;
const line = [[39.999, -2.995], [40.001, -2.995]]; // mitad del lado 1 (progreso 0,125)
const cut = (pt) => [[pt[0] - 0.0005, pt[1] - 0.0005], [pt[0] + 0.0005, pt[1] + 0.0005]];

test('zona de tramos en el sentido del dibujo y en el contrario', () => {
  const track = { path, line, sectors: [cut([40.005, -2.99]), cut([40.01, -2.995])] };
  assert.equal(travelDir(route, track), 1);
  const t2 = sectorsZone(route, track, 2, 2); // del corte 1 (0,375) al corte 2 (0,625)
  assert.equal(t2.label, 'T2');
  assert.ok(inZone(t2, 0.5) && !inZone(t2, 0.2) && !inZone(t2, 0.7));
  const t3 = sectorsZone(route, track, 3, 3); // del corte 2 a la meta, pasando por el inicio del dibujo
  assert.ok(inZone(t3, 0.9) && inZone(t3, 0.05) && !inZone(t3, 0.3));
  // Mismos cortes recorridos al revés: el T1 va de la meta hacia atrás.
  const back = { path, line, sectors: [cut([40.005, -3]), cut([40.01, -2.995])] };
  assert.equal(travelDir(route, back), -1);
  const b1 = sectorsZone(route, back, 1, 1); // de 0,125 hacia atrás hasta 0,875
  assert.ok(inZone(b1, 0.0) && inZone(b1, 0.95) && !inZone(b1, 0.5));
  assert.ok(Math.abs(at(zonePoints(route, t2, 4)[2]) - (t2.from + t2.to) / 2) < 0.01); // el punto medio, sobre el trazado
});
