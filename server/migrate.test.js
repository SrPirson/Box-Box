// Migración entre dos Postgres en memoria (PGlite): todo copiado, ids y JSON intactos, secuencias al día.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PGLITE_DIR = 'memory://';
delete process.env.DATABASE_URL;
const { PGlite } = await import('@electric-sql/pglite');
const { q } = await import('./db.js'); // origen: la base de la app (PGlite en memoria)
const { copyAll } = await import('./migrate.js');

test('copia todas las tablas al destino vacío y no repite si ya tiene datos', async () => {
  await q("insert into teams (id, name, invite_code, limits, track) values (7, 'Equipo', 'ABC123', '{\"tempWarn\": 90}', $1)", [JSON.stringify({ name: 'Jarama', sectors: [[[1, 2], [3, 4]]] })]);
  await q("insert into users (id, email, name, pass, team_id) values (3, 'a@x.es', 'Ana', 'h', 7)");
  await q("insert into tracks (team_id, name, track) values (7, 'Jarama', '{}')");
  await q("insert into laps (team_id, driver_id, started_at, ms, sectors) values (7, 3, now(), 60000, '[20000, 40000]')");
  for (let i = 0; i < 1203; i++) await q('insert into samples (team_id, driver_id, ts, speed) values (7, 3, to_timestamp($1), 100)', [i]);

  const db = new PGlite();
  const dst = { q: (t, p) => db.query(t, p).then((r) => r.rows), exec: (t) => db.exec(t) };
  const counts = await copyAll({ q }, dst, () => {});
  assert.deepEqual(counts, { teams: 1, users: 1, tracks: 1, laps: 1, samples: 1203 });

  const [team] = await dst.q('select * from teams');
  assert.equal(team.id, 7);
  assert.deepEqual(team.track.sectors, [[[1, 2], [3, 4]]]);
  assert.equal(team.limits.tempWarn, 90);
  assert.deepEqual((await dst.q('select sectors from laps'))[0].sectors, [20000, 40000]);
  // Un equipo nuevo en el destino no choca con los ids copiados.
  assert.equal((await dst.q("insert into teams (name, invite_code) values ('Otro', 'XYZ999') returning id"))[0].id, 8);
  // Segunda vez: el destino ya tiene datos, no se toca.
  assert.equal(await copyAll({ q }, dst, () => {}), null);
});
