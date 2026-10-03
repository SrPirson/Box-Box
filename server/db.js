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

export function SCHEMA() {
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
  -- false: el coche no lleva lector OBD (solo GPS); la app oculta los datos de motor.
  alter table teams add column if not exists obd boolean not null default true;
  -- Inscrito en un evento no es lo mismo que correrlo: con racing = false el equipo entrena con sus pistas.
  -- Los ya inscritos al crear la columna quedan participando (true); los que se inscriben después, no.
  alter table teams add column if not exists racing boolean not null default true;
  -- Telemetría muestreada a 1 Hz para estadísticas (la de 4 Hz solo va en directo).
  create table if not exists samples (
    team_id int not null references teams(id) on delete cascade,
    driver_id int references users(id) on delete set null,
    ts timestamptz not null,
    rpm real, coolant real, throttle real, voltage real, speed real,
    lat double precision, lng double precision
  );
  create index if not exists samples_team_time on samples (team_id, ts);
  -- Las vueltas y la telemetría también son del piloto (su perfil): si el equipo se elimina, se quedan sin
  -- equipo en vez de borrarse. "not valid": no revisa las filas existentes en cada arranque (todas cumplen).
  alter table laps alter column team_id drop not null;
  alter table laps drop constraint if exists laps_team_id_fkey;
  alter table laps add constraint laps_team_id_fkey foreign key (team_id) references teams(id) on delete set null not valid;
  alter table samples alter column team_id drop not null;
  alter table samples drop constraint if exists samples_team_id_fkey;
  alter table samples add constraint samples_team_id_fkey foreign key (team_id) references teams(id) on delete set null not valid;
  create index if not exists laps_driver_time on laps (driver_id, started_at);
  create index if not exists samples_driver_time on samples (driver_id, ts);
  -- Eventos: los crea un organizador (rol 'organizer') con su pista; los pilotos se inscriben creando un equipo
  -- en el evento o uniéndose a uno. Un equipo sin evento es un equipo de entrenamiento, como antes.
  create table if not exists events (
    id serial primary key,
    name text not null,
    starts_on date,
    place text not null default '',
    organizer_id int references users(id) on delete set null,
    invite_code text unique not null,
    track jsonb,
    closed boolean not null default false,
    created_at timestamptz not null default now()
  );
  alter table teams add column if not exists event_id int references events(id) on delete set null;
  create index if not exists teams_event on teams (event_id);
  -- Evento de cada vuelta: el historial por evento se conserva aunque el equipo salga de él o se elimine.
  alter table laps add column if not exists event_id int;
  create index if not exists laps_event on laps (event_id, started_at);
  -- Privado: no sale en la lista de eventos de los pilotos; solo se entra con su código.
  alter table events add column if not exists private boolean not null default false;
  -- Sesión en curso del evento, que marca el organizador: 'practice' (entrenamiento) o 'race' (carrera).
  alter table events add column if not exists session text not null default 'race';
  -- Tipo de cada vuelta y muestra: 'free' (libre, fuera de un evento), 'practice' o 'race' (sesión del evento).
  -- Las vueltas de antes con evento eran de carrera (idempotente: las nuevas de evento nunca son 'free').
  alter table laps add column if not exists kind text not null default 'free';
  update laps set kind = 'race' where event_id is not null and kind = 'free';
  alter table samples add column if not exists kind text not null default 'free';`;
}
