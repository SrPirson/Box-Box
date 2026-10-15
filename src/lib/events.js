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

// Formato de la carrera, que elige el organizador. El entrenamiento siempre va por mejor vuelta.
// target: minutos (resistencia) o vueltas (a N vueltas).
export const RACE_FORMATS = {
  endurance: { label: 'Resistencia', unit: 'min', help: 'Gana quien más vueltas da en el tiempo; a igualdad, quien cruzó antes la meta.' },
  laps: { label: 'A N vueltas', unit: 'vueltas', help: 'Gana quien completa antes las vueltas; después, por vueltas y quién cruzó antes.' },
  best: { label: 'Mejor vuelta', unit: null, help: 'Clasificación por la vuelta más rápida.' },
};
export const formatOf = (ev, session = ev.session) => (session === 'practice' ? 'best' : ev.raceFormat ?? 'endurance');

// Clasificación: filas de la sesión ({ id, laps, best, last_at, pen, retired, ... }) ordenadas según el formato.
// eff: vueltas que cuentan (menos las de sanción; a N vueltas, como mucho N). Los retirados van al final sin
// posición. gap: texto de la diferencia con el líder («Vuelta 96», «2 Vueltas», «+1.234»).
export function rank(rows, format, target) {
  const at = (r) => (r.last_at ? new Date(r.last_at).getTime() : Infinity);
  const out = rows.map((r) => {
    let eff = Math.max(0, r.laps - (r.pen ?? 0));
    if (format === 'laps' && target) eff = Math.min(eff, target);
    return { ...r, eff };
  });
  const byBest = (a, b) => (a.best ?? Infinity) - (b.best ?? Infinity);
  const byLaps = (a, b) => b.eff - a.eff || at(a) - at(b);
  out.sort((a, b) => !!a.retired - !!b.retired || (format === 'best' ? byBest : byLaps)(a, b));
  const lead = out[0];
  let pos = 0;
  for (const r of out) {
    r.pos = r.retired ? null : ++pos;
    if (r.retired) r.gap = 'Retirado';
    else if (r === lead) r.gap = format === 'best' ? '' : `Vuelta ${r.eff}`;
    else if (format === 'best') r.gap = r.best != null && lead.best != null ? `+${((r.best - lead.best) / 1000).toFixed(3)}` : '';
    else if (r.eff < lead.eff) r.gap = `${lead.eff - r.eff} Vuelta${lead.eff - r.eff === 1 ? '' : 's'}`;
    else r.gap = Number.isFinite(at(r)) && Number.isFinite(at(lead)) ? `+${((at(r) - at(lead)) / 1000).toFixed(3)}` : '';
  }
  return out;
}
