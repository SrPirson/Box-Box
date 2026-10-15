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

test('clasificación: resistencia con sanciones, a N vueltas, mejor vuelta y retirados', async () => {
  const { rank } = await import('./events.js');
  const t = (s) => `2026-10-10T16:00:${String(s).padStart(2, '0')}Z`;
  const rows = [
    { id: 1, laps: 96, best: 148000, last_at: t(10) },
    { id: 2, laps: 97, best: 149000, last_at: t(5), pen: 2 }, // sancionado: 95 cuentan
    { id: 3, laps: 96, best: 147000, last_at: t(12) },
    { id: 4, laps: 99, best: 146000, last_at: t(1), retired: true },
  ];
  const e = rank(rows, 'endurance');
  assert.deepEqual(e.map((r) => [r.id, r.pos, r.eff]), [[1, 1, 96], [3, 2, 96], [2, 3, 95], [4, null, 99]]);
  assert.deepEqual(e.map((r) => r.gap), ['Vuelta 96', '+2.000', '1 Vuelta', 'Retirado']);
  // A 95 vueltas: los tres han terminado; gana quien cruzó antes (sin contar vueltas de más).
  assert.deepEqual(rank(rows, 'laps', 95).map((r) => r.id), [2, 1, 3, 4]);
  const b = rank(rows, 'best');
  assert.deepEqual(b.map((r) => r.id), [3, 1, 2, 4]);
  assert.equal(b[1].gap, '+1.000');
});

test('retransmisión: enlaces de YouTube, Twitch y Kick a su reproductor', async () => {
  const { embedUrl } = await import('./events.js');
  const yt = 'https://www.youtube.com/embed/abc123?autoplay=1&mute=1';
  assert.equal(embedUrl('https://www.youtube.com/watch?v=abc123', 'x.es'), yt);
  assert.equal(embedUrl('https://youtu.be/abc123', 'x.es'), yt);
  assert.equal(embedUrl('https://youtube.com/live/abc123?si=z', 'x.es'), yt);
  assert.equal(embedUrl('https://www.twitch.tv/lacencerro', 'boxracing.onrender.com'), 'https://player.twitch.tv/?channel=lacencerro&parent=boxracing.onrender.com&muted=true');
  assert.equal(embedUrl('https://kick.com/lacencerro', 'x.es'), 'https://player.kick.com/lacencerro');
  assert.equal(embedUrl('https://otra.tv/directo', 'x.es'), 'https://otra.tv/directo');
  assert.equal(embedUrl('http://inseguro.tv', 'x.es'), null);
  assert.equal(embedUrl('no es un enlace', 'x.es'), null);
});
