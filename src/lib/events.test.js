import test from 'node:test';
import assert from 'node:assert/strict';
import { eventState, missingToPublish } from './events.js';

test('estado del evento: borrador, inscripción, hoy y terminado', () => {
  const day = '2026-10-05';
  assert.equal(eventState({ draft: true, startsOn: day }, day), 'draft');
  assert.equal(eventState({ startsOn: '2026-10-06' }, day), 'open');
  assert.equal(eventState({ startsOn: null }, day), 'open'); // publicado antes de exigir fecha
  assert.equal(eventState({ startsOn: day }, day), 'today');
  assert.equal(eventState({ startsOn: '2026-10-04' }, day), 'done');
  assert.deepEqual(missingToPublish({ startsOn: null, track: null }), ['fecha', 'línea de meta']);
  assert.deepEqual(missingToPublish({ startsOn: day, track: { line: [[0, 0], [1, 1]] } }), []);
  assert.deepEqual(missingToPublish({ startsOn: day, hasFinish: true }), []); // fila de la lista
});
