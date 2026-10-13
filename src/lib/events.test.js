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

test('checklist del evento: publicar y día de carrera', async () => {
  const { readiness } = await import('./events.js');
  const teams = [{ id: 1, dorsal: '1', name: 'A', racing: true }, { id: 2, dorsal: '2', name: 'B', racing: true }, { id: 3, dorsal: '3', name: 'C', racing: false }];
  const ev = { name: 'X', startsOn: '2026-10-05', track: { line: [[0, 0], [1, 1]] }, teams };
  const ok = (list) => Object.fromEntries(list.map((i) => [i.key, i.ok]));
  assert.deepEqual(ok(readiness(ev).publish), { date: true, finish: true, path: false, access: true });
  const now = 1e12;
  const log = [
    { kind: 'flag', data: { type: 'yellow', ts: 5 } }, { kind: 'seen', data: { flagTs: 5, teamId: 1 } },
    { kind: 'flag', data: { type: 'green', ts: 9 } }, { kind: 'seen', data: { flagTs: 9, teamId: 2 } }, // la verde no cuenta
  ];
  let r = readiness(ev, { cars: { 1: { ts: now - 1000 }, 2: { ts: now - 10 * 60_000 } }, log, now });
  assert.deepEqual(ok(r.raceDay), { racing: true, idle: false, signal: false, flag: false });
  assert.deepEqual(r.raceDay[1].teams.map((t) => t.id), [3]);
  r = readiness(ev, { cars: { 1: { ts: now }, 2: { ts: now } }, log: [...log, { kind: 'seen', data: { flagTs: 5, teamId: 2 } }], now });
  assert.deepEqual(ok(r.raceDay), { racing: true, idle: false, signal: true, flag: true });
});
