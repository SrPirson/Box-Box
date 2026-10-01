// Cronometraje automático: una vuelta termina cuando la traza GPS cruza la línea de meta.
// Coordenadas lat/lng tratadas como planas: a escala de un circuito el error es despreciable.

// Fracción t∈[0,1] del segmento P→Q donde corta al segmento A-B, o null si no se cortan.
export function crossing(P, Q, A, B) {
  const r = [Q.lng - P.lng, Q.lat - P.lat];
  const s = [B[1] - A[1], B[0] - A[0]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (den === 0) return null;
  const ap = [A[1] - P.lng, A[0] - P.lat];
  const t = (ap[0] * s[1] - ap[1] * s[0]) / den;
  const u = (ap[0] * r[1] - ap[1] * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

const MIN_LAP_MS = 20000; // filtra dobles cruces por ruido del GPS junto a la línea

export function createLapTimer() {
  let prev = null;
  let start = null;
  let acc = null;
  const reset = () => (acc = { n: 0, temp: 0, maxTemp: -Infinity, rpm: 0, maxRpm: 0, maxSpeed: 0, minVolt: Infinity });
  reset();

  return {
    // s: { ts, lat, lng, coolant, rpm, speed, voltage }. Devuelve la vuelta completada o null.
    push(s, line) {
      let lap = null;
      if (line && prev && s.lat != null) {
        const t = crossing(prev, s, line[0], line[1]);
        if (t != null) {
          const at = prev.ts + t * (s.ts - prev.ts);
          if (start == null) { start = at; reset(); }
          else if (at - start >= MIN_LAP_MS) {
            const n = acc.n || 1;
            lap = {
              startedAt: Math.round(start), ms: Math.round(at - start),
              avgTemp: acc.temp / n, maxTemp: Number.isFinite(acc.maxTemp) ? acc.maxTemp : null,
              avgRpm: acc.rpm / n, maxRpm: acc.maxRpm, maxSpeed: acc.maxSpeed,
              minVolt: Number.isFinite(acc.minVolt) ? acc.minVolt : null,
            };
            start = at;
            reset();
          }
        }
      }
      if (start != null) {
        acc.n++;
        if (s.coolant != null) { acc.temp += s.coolant; acc.maxTemp = Math.max(acc.maxTemp, s.coolant); }
        if (s.rpm != null) { acc.rpm += s.rpm; acc.maxRpm = Math.max(acc.maxRpm, s.rpm); }
        if (s.speed != null) acc.maxSpeed = Math.max(acc.maxSpeed, s.speed);
        if (s.voltage != null) acc.minVolt = Math.min(acc.minVolt, s.voltage);
      }
      if (s.lat != null) prev = s;
      return lap;
    },
    // Vuelta en curso (para el cronómetro en vivo de BOX).
    get startedAt() { return start == null ? null : Math.round(start); },
    restart() { prev = null; start = null; reset(); },
  };
}
