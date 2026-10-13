import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tone, lastVsBest, doneSectors } from './laptimes.js';

test('tono de tramo: verde si iguala o mejora la mejor, amarillo si es peor', () => {
  assert.equal(tone(30000, 30500), 'ok');
  assert.equal(tone(30500, 30500), 'ok');
  assert.equal(tone(31000, 30500), 'warn');
  assert.equal(tone(31000, null), null);
});

test('última frente a la mejor de las anteriores', () => {
  assert.deepEqual(lastVsBest([]), { last: null, best: null, delta: null });
  assert.equal(lastVsBest([{ ms: 60000 }]).delta, null);
  const peor = lastVsBest([{ ms: 60000 }, { ms: 59000 }, { ms: 59500 }]);
  assert.equal(peor.best, 59000);
  assert.equal(peor.delta, 500);
  const record = lastVsBest([{ ms: 60000 }, { ms: 58000 }]);
  assert.equal(record.best, 58000);
  assert.equal(record.delta, -2000);
});

test('tramos cerrados desde los parciales', () => {
  assert.deepEqual(doneSectors([20000, 45000]), [20000, 25000]);
  assert.deepEqual(doneSectors(), []);
});
