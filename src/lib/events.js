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
