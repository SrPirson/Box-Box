// Ciclo de vida de un evento, derivado de sus datos (no se guarda): Borrador → Inscripción → Hoy → Terminado.
// La fecha se compara con el día local del organizador (YYYY-MM-DD).
export const EVENT_STATES = {
  draft: { label: 'Borrador', tone: 'muted' },
  open: { label: 'Inscripción', tone: 'accent' },
  today: { label: 'Hoy', tone: 'ok' },
  done: { label: 'Terminado', tone: 'muted' },
};
export const localDay = (d = new Date()) => d.toLocaleDateString('sv-SE'); // sv-SE da YYYY-MM-DD
export function eventState(e, today = localDay()) {
  if (e.draft) return 'draft';
  if (!e.startsOn || e.startsOn > today) return 'open';
  return e.startsOn === today ? 'today' : 'done';
}
// Lo que falta para publicar un borrador (vacío: se puede publicar). Lo mismo que exige el servidor.
export const missingToPublish = (e) => [!e.startsOn && 'fecha', !(e.track?.line ?? e.hasFinish) && 'línea de meta'].filter(Boolean);

// Checklist «evento listo» en dos fases. publish: lo que hace falta para publicar (required: lo exige el
// servidor). raceDay: lo que conviene comprobar antes de la salida. cars: último resumen en vivo por equipo;
// log: registro del evento (la bandera de prueba cuenta si la han visto todos los equipos que participan).
const SIGNAL_MS = 5 * 60_000;
export function readiness(ev, { cars = {}, log = [], now = Date.now() } = {}) {
  const teams = ev.teams ?? [];
  const racing = teams.filter((t) => t.racing);
  const idle = teams.filter((t) => !t.racing);
  const withSignal = racing.filter((t) => cars[t.id] && now - cars[t.id].ts < SIGNAL_MS);
  const seenBy = (ts) => new Set(log.filter((l) => l.kind === 'seen' && l.data.flagTs === ts).map((l) => l.data.teamId));
  const tested = racing.length > 0 && log.some((l) => l.kind === 'flag' && l.data.type !== 'green'
    && racing.every((t) => seenBy(l.data.ts).has(t.id)));
  const name = (t) => `#${t.dorsal} ${t.name}`;
  return {
    publish: [
      { key: 'date', label: 'Nombre y fecha', ok: !!ev.name && !!ev.startsOn, required: true, step: 1, tab: 'ajustes' },
      { key: 'finish', label: 'Línea de meta', ok: !!ev.track?.line, required: true, step: 2, tab: 'pista' },
      { key: 'path', label: 'Trazado del circuito (avisa si un coche se sale)', ok: (ev.track?.path?.length ?? 0) >= 3, step: 2, tab: 'pista' },
      { key: 'access', label: `Inscripción ${ev.private ? 'privada (con código)' : 'pública'} · ${ev.maxTeams ? `cupo de ${ev.maxTeams}` : 'sin cupo'}`, ok: true, step: 3, tab: 'ajustes' },
    ],
    raceDay: [
      { key: 'racing', label: racing.length ? `${racing.length} equipo${racing.length === 1 ? '' : 's'} participando` : 'Ningún equipo participa todavía', ok: racing.length > 0 },
      { key: 'idle', label: idle.length ? `No participan: ${idle.map(name).join(', ')}` : 'Todos los inscritos participan', ok: idle.length === 0, teams: idle },
      { key: 'signal', label: `Con señal en los últimos 5 min: ${withSignal.length} de ${racing.length}`, ok: racing.length > 0 && withSignal.length === racing.length },
      { key: 'flag', label: 'Bandera de prueba dada y vista por todos los que participan', ok: tested },
    ],
  };
}
