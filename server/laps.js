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
const SECTORS = 20;       // con trazado dibujado: un cruce solo cierra vuelta si se ha recorrido el 80 % de ellos
const MIN_COVER = 0.8;

// Trazado del circuito (lazo cerrado de puntos [lat, lng]), en metros alrededor de su primer punto.
export function createRoute(path) {
  const o = path[0];
  const mLng = 111320 * Math.cos((o[0] * Math.PI) / 180);
  const xy = ([lat, lng]) => [(lng - o[1]) * mLng, (lat - o[0]) * 110540];
  const ll = ([x, y]) => [o[0] + y / 110540, o[1] + x / mLng];
  const P = [...path, path[0]].map(xy);
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = cum.at(-1) || 1;
  const route = {
    // Distancia (m) al trazado y progreso a lo largo de él (0-1) del punto más cercano.
    locate(pt) {
      const [x, y] = xy(pt);
      let best = { dist: Infinity, at: 0 };
      for (let i = 1; i < P.length; i++) {
        const [ax, ay] = P[i - 1];
        const sx = P[i][0] - ax, sy = P[i][1] - ay, len2 = sx * sx + sy * sy;
        const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * sx + (y - ay) * sy) / len2)) : 0;
        const d = Math.hypot(x - ax - t * sx, y - ay - t * sy);
        if (d < best.dist) best = { dist: d, at: (cum[i - 1] + t * (cum[i] - cum[i - 1])) / total, p: [ax + t * sx, ay + t * sy], dir: [sx, sy] };
      }
      return best;
    },
    // Línea de meta en el punto del trazado más cercano a `pt`: perpendicular a la pista, 15 m a cada lado.
    lineAt(pt) {
      const { p, dir: [sx, sy] } = route.locate(pt);
      const k = 15 / (Math.hypot(sx, sy) || 1);
      return [-1, 1].map((sg) => ll([p[0] - sg * k * sy, p[1] + sg * k * sx]));
    },
  };
  route.line = route.lineAt(path[0]); // meta por defecto: el inicio del trazado
  return route;
}

// Parciales de una vuelta: tiempo de cada tramo entre meta → corte 1 → … → corte n → meta, en el orden
// en que se cruzaron. null si no se cruzaron todos los cortes (vuelta sin parciales fiables).
export function splitTimes(start, end, marks, count) {
  if (!count || marks.length !== count) return null;
  const pts = [start, ...marks.map((m) => m.at).sort((a, b) => a - b), end];
  return pts.slice(1).map((t, i) => Math.round(t - pts[i]));
}

export function createLapTimer() {
  let prev = null;
  let start = null;
  let acc = null;
  let seen = new Set(); // sectores del trazado recorridos en la vuelta en curso
  let marks = []; // cortes de tramo cruzados en la vuelta en curso: { i, at }
  let prevAt = null;
  const reset = () => { acc = { n: 0, temp: 0, maxTemp: -Infinity, rpm: 0, maxRpm: 0, maxSpeed: 0, minVolt: Infinity }; seen = new Set(); marks = []; };
  reset();
  // Marca los sectores entre dos muestras por el arco más corto: sirve con muestreo lento y en ambos sentidos de dibujo.
  const cover = (a, b) => {
    if (a == null || ((b - a + 1) % 1) > 0.5) [a, b] = [b, a ?? b];
    let i = Math.floor(a * SECTORS) % SECTORS;
    const j = Math.floor(b * SECTORS) % SECTORS;
    seen.add(j);
    while (i !== j) { seen.add(i); i = (i + 1) % SECTORS; }
  };

  return {
    // s: { ts, lat, lng, coolant, rpm, speed, voltage, at? }. `at`: progreso en el trazado, si lo hay.
    // `cuts`: líneas de corte de tramo ([[A, B], ...]). Devuelve la vuelta completada o null.
    push(s, line, cuts = []) {
      let lap = null;
      // Cortes de tramo: cuenta el primer cruce de cada uno en la vuelta (el ruido del GPS no duplica).
      if (start != null && prev && s.lat != null) {
        cuts.forEach(([A, B], i) => {
          if (marks.some((m) => m.i === i)) return;
          const t = crossing(prev, s, A, B);
          if (t != null) marks.push({ i, at: prev.ts + t * (s.ts - prev.ts) });
        });
      }
      if (line && prev && s.lat != null) {
        const t = crossing(prev, s, line[0], line[1]);
        if (t != null) {
          const at = prev.ts + t * (s.ts - prev.ts);
          if (start == null) { start = at; reset(); }
          else if (at - start >= MIN_LAP_MS && (!seen.size || seen.size >= SECTORS * MIN_COVER)) {
            const n = acc.n || 1;
            lap = {
              startedAt: Math.round(start), ms: Math.round(at - start),
              avgTemp: acc.temp / n, maxTemp: Number.isFinite(acc.maxTemp) ? acc.maxTemp : null,
              avgRpm: acc.rpm / n, maxRpm: acc.maxRpm, maxSpeed: acc.maxSpeed,
              minVolt: Number.isFinite(acc.minVolt) ? acc.minVolt : null,
              sectors: splitTimes(start, at, marks, cuts.length),
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
      if (s.at != null) { if (start != null) cover(prevAt, s.at); prevAt = s.at; }
      if (s.lat != null) prev = s;
      return lap;
    },
    // Vuelta en curso (para el cronómetro en vivo de BOX).
    get startedAt() { return start == null ? null : Math.round(start); },
    // Tiempo desde la meta en cada corte cruzado de la vuelta en curso (parciales en vivo).
    get splits() { return start == null ? [] : marks.map((m) => Math.round(m.at - start)).sort((a, b) => a - b); },
    restart() { prev = null; prevAt = null; start = null; reset(); },
  };
}
