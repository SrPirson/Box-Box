// Copia única de todos los datos a otra base de datos Postgres (de Render a Neon). Se lanza al arrancar si
// existe MIGRATE_TO: lee de la base actual (DATABASE_URL) y escribe en MIGRATE_TO. La base actual no se toca,
// y si el destino ya tiene datos no se copia nada. Al acabar, se cambia DATABASE_URL al destino y se quita MIGRATE_TO.
import { q, SCHEMA } from './db.js';

// En orden de dependencias (los pilotos apuntan a equipos; vueltas y muestras, a ambos).
const TABLES = [
  ['teams', ['id', 'name', 'invite_code', 'owner_id', 'dorsal', 'phone', 'limits', 'track', 'created_at', 'car_icon', 'car_icon_style']],
  ['users', ['id', 'email', 'name', 'pass', 'role', 'must_reset', 'team_id', 'created_at']],
  ['tracks', ['id', 'team_id', 'name', 'track', 'created_at']],
  ['laps', ['id', 'team_id', 'driver_id', 'started_at', 'ms', 'avg_temp', 'max_temp', 'avg_rpm', 'max_rpm', 'max_speed', 'min_volt', 'sectors', 'track_id']],
  ['samples', ['team_id', 'driver_id', 'ts', 'rpm', 'coolant', 'throttle', 'voltage', 'speed', 'lat', 'lng']],
];
const JSON_COLS = new Set(['limits', 'track', 'sectors']); // como texto: pg mandaría un array JS como array de Postgres
const BATCH = 500;

// src y dst: { q(text, params) → filas, exec(text) } sobre cualquier Postgres (pg o PGlite).
export async function copyAll(src, dst, log = console.log) {
  await dst.exec(SCHEMA());
  if ((await dst.q('select count(*)::int as n from teams'))[0].n > 0) {
    log('migración: el destino ya tiene datos, no se copia nada');
    return null;
  }
  const counts = {};
  for (const [table, cols] of TABLES) {
    counts[table] = 0;
    for (let offset = 0; ; offset += BATCH) {
      const rows = await src.q(`select ${cols.join(', ')} from ${table} order by ${cols.slice(0, 3).join(', ')} limit ${BATCH} offset ${offset}`);
      if (!rows.length) break;
      const params = rows.flatMap((r) => cols.map((c) => (JSON_COLS.has(c) && r[c] != null ? JSON.stringify(r[c]) : r[c])));
      const values = rows.map((_, i) => `(${cols.map((_, j) => `$${i * cols.length + j + 1}`).join(', ')})`).join(', ');
      await dst.q(`insert into ${table} (${cols.join(', ')}) values ${values}`, params);
      counts[table] += rows.length;
    }
  }
  // Los ids nuevos siguen después de los copiados.
  for (const table of ['teams', 'users', 'tracks', 'laps']) {
    await dst.q(`select setval(pg_get_serial_sequence('${table}', 'id'), coalesce((select max(id) from ${table}), 0) + 1, false)`);
  }
  for (const [table] of TABLES) {
    const [s, d] = await Promise.all([src.q(`select count(*)::int as n from ${table}`), dst.q(`select count(*)::int as n from ${table}`)]);
    if (s[0].n !== d[0].n) throw new Error(`${table}: ${s[0].n} filas en origen y ${d[0].n} en destino`);
  }
  log(`migración completa y verificada: ${Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(', ')}`);
  return counts;
}

export async function migrateTo(url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  try {
    await copyAll({ q }, { q: (t, p) => pool.query(t, p).then((r) => r.rows), exec: (t) => pool.query(t) });
  } catch (e) {
    console.error('migración fallida (la app sigue con la base actual):', e.message);
  } finally {
    await pool.end();
  }
}
