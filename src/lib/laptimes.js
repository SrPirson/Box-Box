// Tiempos para el piloto: comparación con la mejor, estilo F1 (verde = iguala o mejora, amarillo = peor).
export const tone = (ms, best) => (ms == null || best == null ? null : ms <= best ? 'ok' : 'warn');

// Última vuelta frente a la mejor de las anteriores: delta negativo = nueva mejor vuelta.
export function lastVsBest(laps) {
  const last = laps.at(-1) ?? null;
  const prev = laps.slice(0, -1).reduce((b, l) => (b == null || l.ms < b ? l.ms : b), null);
  const best = last && (prev == null || last.ms < prev) ? last.ms : prev;
  return { last, best, delta: last && prev != null ? last.ms - prev : null };
}

// Tramos cerrados de la vuelta en curso (de corte a corte) a partir de los parciales desde meta.
export const doneSectors = (splits = []) => splits.map((t, i) => t - (splits[i - 1] ?? 0));
