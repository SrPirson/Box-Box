// Postgres: Render en producción (DATABASE_URL); PGlite embebido en local para desarrollar sin servicios externos.
import { join } from 'node:path';

const url = process.env.DATABASE_URL;
let db;
if (url) {
  const { default: pg } = await import('pg');
  db = new pg.Pool({ connectionString: url, max: 5 });
} else {
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR ?? join(import.meta.dirname, '..', '.data');
  db = new PGlite(dir);
  if (dir !== 'memory://') console.log(`Sin DATABASE_URL: base de datos local PGlite en ${dir}`);
}

export const q = (text, params) => db.query(text, params).then((r) => r.rows);
export const one = async (text, params) => (await q(text, params))[0];

await (db.exec ? db.exec(SCHEMA()) : db.query(SCHEMA()));

function SCHEMA() {
  return `
  create table if not exists teams (
    id serial primary key,
    name text not null,
    invite_code text unique not null,
    owner_id int,
    dorsal text not null default '1',
    phone text not null default '',
    limits jsonb,
    track jsonb,
    created_at timestamptz not null default now()
  );
  create table if not exists users (
    id serial primary key,
    email text unique not null,
    name text not null,
    pass text not null,
    role text not null default 'pilot',
    must_reset boolean not null default false,
    team_id int references teams(id) on delete set null,
    created_at timestamptz not null default now()
  );
  create table if not exists laps (
    id bigserial primary key,
    team_id int not null references teams(id) on delete cascade,
    driver_id int references users(id) on delete set null,
    started_at timestamptz not null,
    ms int not null,
    avg_temp real, max_temp real, avg_rpm real, max_rpm real, max_speed real, min_volt real
  );
  create index if not exists laps_team_time on laps (team_id, started_at);
  -- Pistas guardadas del equipo: trazado, meta y cortes de tramo. La activa se copia en teams.track.
  create table if not exists tracks (
    id serial primary key,
    team_id int not null references teams(id) on delete cascade,
    name text not null,
    track jsonb not null,
    created_at timestamptz not null default now()
  );
  -- Parciales por tramo (ms) y pista en la que se hizo la vuelta (null: pista sin guardar).
  alter table laps add column if not exists sectors jsonb;
  alter table laps add column if not exists track_id int;
  -- Icono del coche en el mapa: imagen pequeña (data URL) que sube el equipo.
  alter table teams add column if not exists car_icon text;
  -- 'round': foto en círculo; 'sprite': silueta sin fondo que gira con el rumbo del coche.
  alter table teams add column if not exists car_icon_style text not null default 'round';
  -- Telemetría muestreada a 1 Hz para estadísticas (la de 4 Hz solo va en directo).
  create table if not exists samples (
    team_id int not null references teams(id) on delete cascade,
    driver_id int references users(id) on delete set null,
    ts timestamptz not null,
    rpm real, coolant real, throttle real, voltage real, speed real,
    lat double precision, lng double precision
  );
  create index if not exists samples_team_time on samples (team_id, ts);`;
}
