// Banderas locales: una zona del trazado entre dos puntos (progreso 0-1 a lo largo del dibujo) recorrida en el
// sentido de la marcha (dir: +1 si coincide con el del dibujo, −1 si no). Safety car, roja y cuadros son siempre
// de toda la pista. route: createRoute(track.path).
export const ZONE_TYPES = {
  yellow: { label: 'Amarilla', say: 'Bandera amarilla. No adelantar', cls: 'bg-warn-solid text-on-warn', color: '#f5b81c' },
  dyellow: { label: 'Doble amarilla', say: 'Doble amarilla. Reduce y prepárate para parar', cls: 'bg-warn-solid text-on-warn', color: '#f5b81c' },
  oil: { label: 'Aceite', say: 'Aceite en pista. Cuidado, poco agarre', cls: 'bg-crit-solid text-on-crit', color: '#ff5a52' },
};
const fwd = (a, b) => (((b - a) % 1) + 1) % 1; // avance de a hasta b en el sentido del dibujo
const mid = ([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// Sentido de la marcha: los cortes de tramo se marcan en orden desde la meta. Sin tramos, el del dibujo.
export function travelDir(route, track) {
  const cut = track?.sectors?.[0];
  if (!route || !cut || !track.line) return 1;
  return fwd(route.locate(mid(track.line)).at, route.locate(mid(cut)).at) < 0.5 ? 1 : -1;
}
// Zona de los tramos i a j (desde 1, ambos incluidos): del corte anterior a i al corte final de j.
export function sectorsZone(route, track, i, j) {
  const b = [track.line ? route.locate(mid(track.line)).at : 0, ...(track.sectors ?? []).map((c) => route.locate(mid(c)).at)];
  return { from: b[i - 1], to: b[j % b.length], dir: travelDir(route, track), label: i === j ? `T${i}` : `T${i}–T${j}` };
}
// Zona entre dos puntos tocados en el mapa, en el sentido de la marcha.
export const pointsZone = (route, track, a, b) => ({ from: route.locate(a).at, to: route.locate(b).at, dir: travelDir(route, track), label: 'Zona' });
const span = (z) => (z.dir > 0 ? fwd(z.from, z.to) : fwd(z.to, z.from));
export const inZone = (z, at) => at != null && (z.dir > 0 ? fwd(z.from, at) : fwd(at, z.from)) <= span(z);
// Puntos para pintar la zona sobre el trazado.
export const zonePoints = (route, z, n = 80) => Array.from({ length: n + 1 }, (_, k) => route.pointAt(z.from + (z.dir * span(z) * k) / n));
export const zoneText = (z) => `${ZONE_TYPES[z.type]?.label ?? 'Bandera'} en ${z.label === 'Zona' ? 'una zona' : z.label}`;
