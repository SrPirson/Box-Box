// Mapa en vivo: plantillas de mapa base sin API key, coches con dorsal y color de estado, estela,
// seguir coche, encuadrar todo y dibujo de la meta y del trazado del circuito.
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Icon from '../icons.jsx';
import { useTheme } from '../lib/theme.js';
import { createRoute } from '../../server/laps.js';
import { ConfirmButton } from './ui.jsx';

// Ninguna plantilla requiere API key (CARTO ya la exige desde el navegador): Esri + OpenStreetMap.
// ponytail: uso no comercial tolerado sin cuenta; si el equipo lo comercializa, cuenta gratuita ArcGIS Location Platform.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const t = (path) => `${ESRI}/${path}/MapServer/tile/{z}/{y}/{x}`;
const ATTR_CANVAS = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';
const ATTR_SAT = 'Tiles &copy; Esri &mdash; Esri, Vantor, Earthstar Geographics';
const ATTR_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// maxNativeZoom: último nivel con datos reales; por encima Leaflet escala (los lienzos grises solo llegan a z16).
const BASEMAPS = {
  dark: { label: 'Oscuro', url: t('Canvas/World_Dark_Gray_Base'), attribution: ATTR_CANVAS, maxNativeZoom: 16, overlays: [t('Canvas/World_Dark_Gray_Reference')] },
  light: { label: 'Claro', url: t('Canvas/World_Light_Gray_Base'), attribution: ATTR_CANVAS, maxNativeZoom: 16, overlays: [t('Canvas/World_Light_Gray_Reference')] },
  sat: { label: 'Satélite', url: t('World_Imagery'), attribution: ATTR_SAT, maxNativeZoom: 18, className: 'tiles-sat' },
  hybrid: { label: 'Híbrido', url: t('World_Imagery'), attribution: ATTR_SAT, maxNativeZoom: 18, className: 'tiles-sat',
    overlays: [t('Reference/World_Transportation'), t('Reference/World_Boundaries_and_Places')] },
  // OpenStreetMap: datos abiertos (ODbL). Su política permite uso ligero desde navegador, no descarga masiva.
  street: { label: 'Callejero', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: ATTR_OSM, maxNativeZoom: 19 },
};
const MAP_KEY = 'cencerro.basemap';
const NO_CUTS = []; // estable entre renders: los cortes solo se redibujan si cambian
const OPTIONS = [['auto', 'Auto'], ...Object.entries(BASEMAPS).map(([id, b]) => [id, b.label])];

// track: pista activa { line?, path?, sectors?, id?, name? }; onTrack(nueva) la guarda. `toolbar`: selector de pistas.
export default function TrackMap({ cars, trails, sel, states, focus, track, onTrack, toolbar, carIcon, carIconStyle }) {
  const { line, path, sectors = NO_CUTS } = track ?? {};
  const theme = useTheme();
  const el = useRef(null);
  const map = useRef(null);
  const base = useRef(null);
  const layers = useRef({});
  const [choice, setChoice] = useState(() => { try { return localStorage.getItem(MAP_KEY) || 'auto'; } catch { return 'auto'; } });
  const [follow, setFollow] = useState(true);
  const [draw, setDraw] = useState(null); // null | { mode: 'line' | 'path' | 'sector', pts: [[lat, lng], ...] }
  const drawRef = useRef(null);
  drawRef.current = draw;
  const finish = useRef(null);
  const route = useRef(null);
  const cuts = useRef(null);
  const [hover, setHover] = useState(null); // puntero sobre el mapa mientras se coloca la meta o un corte (vista previa)
  const geo = useMemo(() => (path?.length >= 3 ? createRoute(path) : null), [path]);
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const active = choice === 'auto' ? theme : choice;
  const latest = useRef(null);
  latest.current = { track: track ?? {}, onTrack };
  const save = (patch) => onTrack({ ...track, ...patch });

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: false, zoomSnap: 0.25 }).setView([40.4, -3.7], 6);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    map.current.createPane('route').style.zIndex = 350; // trazado por debajo de estela y coches
    map.current.on('dragstart', () => setFollow(false));
    // Dibujo. Meta y cortes de tramo: con trazado, un toque sobre él (la línea se pone perpendicular a la pista);
    // sin trazado, un toque en cada borde. Los cortes se encadenan hasta pulsar Listo.
    // Trazado: tantos toques como haga falta hasta pulsar Guardar.
    map.current.on('click', (e) => {
      const d = drawRef.current;
      if (!d) return;
      const pt = [e.latlng.lat, e.latlng.lng];
      const pts = [...d.pts, pt];
      if (d.mode !== 'path' && (geoRef.current || pts.length === 2)) {
        const cut = geoRef.current ? geoRef.current.lineAt(pt) : pts;
        const { track: t, onTrack: set } = latest.current;
        if (d.mode === 'line') { setDraw(null); set({ ...t, line: cut }); }
        else { setDraw({ mode: 'sector', pts: [] }); set({ ...t, sectors: [...(t.sectors ?? []), cut] }); }
      } else setDraw({ ...d, pts });
    });
    map.current.on('mousemove', (e) => { if (['line', 'sector'].includes(drawRef.current?.mode)) setHover([e.latlng.lat, e.latlng.lng]); });
    map.current.on('mouseout', () => setHover(null));
    return () => map.current.remove();
  }, []);

  // Cambio de plantilla.
  useEffect(() => {
    const { overlays = [], label, ...opts } = BASEMAPS[active];
    base.current?.remove();
    base.current = L.layerGroup([
      L.tileLayer(opts.url, { maxZoom: 20, ...opts }),
      ...overlays.map((u) => L.tileLayer(u, { maxZoom: 20, maxNativeZoom: 16, pane: 'overlayPane' })),
    ]).addTo(map.current);
  }, [active]);

  // Línea de meta (cuadros blanco/negro). Mientras se coloca, vista previa bajo el puntero.
  useEffect(() => {
    finish.current?.remove();
    const placing = draw?.mode === 'line';
    const preview = placing && hover && (geo ? geo.lineAt(hover) : draw.pts.length ? [draw.pts[0], hover] : null);
    const pts = preview || (placing ? (draw.pts.length ? draw.pts : null) : line ?? geo?.line); // sin meta propia: el inicio del trazado
    if (!pts) return;
    finish.current = L.layerGroup(pts.length === 2
      ? [L.polyline(pts, { className: 'finish-a', weight: 7, interactive: false }), L.polyline(pts, { className: 'finish-b', weight: 7, interactive: false })]
      : [L.circleMarker(pts[0], { radius: 6, className: 'finish-dot', interactive: false })]).addTo(map.current);
  }, [line, draw, hover, geo]);
  useEffect(() => { el.current.style.cursor = draw ? 'crosshair' : ''; if (!['line', 'sector'].includes(draw?.mode)) setHover(null); }, [draw]);

  // Cortes de tramo: líneas ámbar numeradas en el orden en que se colocaron. Mientras se colocan, vista previa.
  useEffect(() => {
    cuts.current?.remove();
    const placing = draw?.mode === 'sector';
    const preview = placing && (hover ? (geo ? geo.lineAt(hover) : draw.pts.length ? [draw.pts[0], hover] : null) : null);
    const all = preview ? [...sectors, preview] : sectors;
    const opts = { className: 'sector-cut', weight: 6, interactive: false };
    cuts.current = L.layerGroup(all.flatMap((c, i) => [
      L.polyline(c, opts),
      L.marker([(c[0][0] + c[1][0]) / 2, (c[0][1] + c[1][1]) / 2], { interactive: false,
        icon: L.divIcon({ className: '', html: `<div class="sector-label">${i + 1}</div>`, iconSize: [22, 22] }) }),
    ])).addTo(map.current);
    if (placing && draw.pts.length) cuts.current.addLayer(L.circleMarker(draw.pts[0], { radius: 5, className: 'route-dot', interactive: false }));
  }, [sectors, draw, hover, geo]);

  // Trazado del circuito: lazo cerrado. Mientras se dibuja, abierto y con sus puntos.
  useEffect(() => {
    route.current?.remove();
    const editing = draw?.mode === 'path';
    const pts = editing ? draw.pts : path;
    if (!pts?.length) return;
    const opts = { pane: 'route', interactive: false };
    route.current = L.layerGroup([
      L.polyline(editing ? pts : [...pts, pts[0]], { ...opts, className: 'route', weight: 12, opacity: 0.35, lineJoin: 'round', lineCap: 'round' }),
      ...(editing ? pts.map((p) => L.circleMarker(p, { ...opts, radius: 4, className: 'route-dot' })) : []),
    ]).addTo(map.current);
  }, [path, draw]);

  // Coches: se crean una vez y se mueven con setLatLng.
  useEffect(() => {
    for (const p of Object.values(cars)) {
      if (!p.gps) continue;
      const pos = [p.gps.lat, p.gps.lng];
      let l = layers.current[p.car];
      if (!l) {
        if (!Object.keys(layers.current).length) map.current.setView(pos, 17);
        l = layers.current[p.car] = {
          trail: L.polyline([], { className: 'trail', weight: 3, opacity: 0.6, lineCap: 'round' }).addTo(map.current),
          dot: L.marker(pos, { icon: carMarker(p.car, carIcon, carIconStyle), zIndexOffset: 1000 }).addTo(map.current),
          icon: carIcon + carIconStyle,
          from: pos, heading: 0,
        };
      }
      if (l.icon !== carIcon + carIconStyle) { l.dot.setIcon(carMarker(p.car, carIcon, carIconStyle)); l.icon = carIcon + carIconStyle; } // el equipo cambió el icono
      l.trail.setLatLngs(trails[p.car] ?? []);
      l.dot.setLatLng(pos);
      // Rumbo. En marcha: el del GPS del móvil (como el puntero de Google Maps) o, si no lo da, el calculado entre
      // posiciones; la brújula, como último recurso (dentro del coche la desvían el metal y la electrónica).
      // Parado: hacia donde mira el móvil según la brújula. Acumulado sin saltos (179° → −179° gira 2°, no 358°)
      // para que la transición CSS no dé la vuelta entera.
      const moved = bearing(l.from, pos);
      if (moved != null) l.from = pos;
      const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
      const gpsHeading = num(p.gps.heading);
      const compass = num(p.compass);
      const h = (p.gps.speed ?? 0) >= MIN_SPEED_KMH ? gpsHeading ?? moved ?? compass : compass ?? moved;
      if (h != null) l.heading += ((h - l.heading + 540) % 360) - 180;
      const dot = l.dot.getElement()?.firstChild;
      if (dot) {
        dot.dataset.state = states[p.car]; dot.dataset.sel = String(p.car === sel);
        const img = dot.classList.contains('car-sprite') && dot.firstChild;
        if (img) img.style.transform = `rotate(${l.heading}deg)`;
      }
      if (follow && p.car === sel) map.current.panTo(pos, { animate: true, duration: 0.25 });
    }
  }, [cars, sel, trails, states, follow, carIcon, carIconStyle]);

  useEffect(() => {
    const p = cars[sel];
    if (p?.gps) map.current.panTo([p.gps.lat, p.gps.lng], { animate: true, duration: 0.25 });
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al elegir otra pista guardada (y al abrir el mapa), encuadrarla.
  useEffect(() => {
    const pts = [...(path ?? []), ...(line ?? []), ...sectors.flat()];
    if (pts.length) map.current.fitBounds(L.latLngBounds(pts).pad(0.1), { maxZoom: 18 });
  }, [track?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (focus) { setFollow(false); map.current.flyTo([focus.lat, focus.lng], 18, { duration: 0.6 }); } }, [focus]);

  const fitAll = () => {
    const pts = Object.values(cars).filter((p) => p.gps).map((p) => [p.gps.lat, p.gps.lng]);
    if (!pts.length) return;
    setFollow(false);
    map.current.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 17 });
  };
  const pick = (id) => { setChoice(id); try { localStorage.setItem(MAP_KEY, id); } catch {} };

  const tool = (mode) => () => setDraw(draw?.mode === mode ? null : { mode, pts: [] });
  return (
    <div className="flex h-full flex-col">
      {/* Barra de pista: pistas guardadas a la izquierda, herramientas de dibujo a la derecha */}
      {onTrack && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-2 py-1.5" aria-label="Pista">
          {toolbar}
          <span className="ml-auto flex gap-2">
            <MapButton onClick={tool('path')} active={draw?.mode === 'path'} label="Trazado" icon="route" />
            <MapButton onClick={tool('line')} active={draw?.mode === 'line'} label="Meta" icon="finish" />
            <MapButton onClick={tool('sector')} active={draw?.mode === 'sector'} label={sectors.length ? `Tramos · ${sectors.length + 1}` : 'Tramos'} icon="timer" />
          </span>
        </div>
      )}
    <div className="relative min-h-64 flex-1">
      <div ref={el} className="absolute inset-0" />
      <div className="absolute left-2 top-2 z-[1000]">
        <div role="radiogroup" aria-label="Plantilla de mapa" className="hidden overflow-hidden rounded-[4px] border border-line bg-panel/95 shadow-sm xl:flex">
          <span className="grid place-items-center pl-2 pr-1 text-muted"><Icon name="layers" size={15} /></span>
          {OPTIONS.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={choice === id} onClick={() => pick(id)}
              className={`px-2.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors ${choice === id ? 'bg-accent text-panel' : 'text-fg-2 hover:bg-raised'}`}>
              {label}
            </button>
          ))}
        </div>
        {/* En pantallas estrechas, el mismo selector como desplegable nativo */}
        <label className="flex items-center gap-1.5 rounded-[4px] border border-line bg-panel/95 pl-2 text-fg-2 shadow-sm xl:hidden">
          <Icon name="layers" size={15} /><span className="sr-only">Plantilla de mapa</span>
          <select value={choice} onChange={(e) => pick(e.target.value)} className="h-8 bg-transparent pr-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-fg">
            {OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
      {draw && (
        <div role="status" className="absolute inset-x-2 bottom-8 z-[1000] mx-auto flex max-w-lg flex-wrap items-center gap-x-3 gap-y-2 rounded-[4px] border border-accent bg-panel px-3 py-2 shadow-lg">
          <Icon name={{ line: 'finish', path: 'route', sector: 'timer' }[draw.mode]} size={18} className="text-accent" />
          <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">
            {draw.mode === 'path'
              ? <>Toca el centro de la pista dando una vuelta completa, un punto en cada curva <span className="num text-muted">· {draw.pts.length} puntos</span></>
              : draw.mode === 'sector'
                ? geo ? <>Toca el trazado azul donde termina cada tramo, en orden desde la meta. Cada toque añade un corte <span className="num text-muted">· {sectors.length + 1} tramos</span></>
                  : draw.pts.length === 0 ? 'Cada corte va de lado a lado de la pista: toca un borde donde termina el tramo…'
                    : '…y ahora el borde de enfrente. (Si dibujas antes el trazado, basta un toque.)'
                : geo ? 'Toca el trazado azul justo donde está la meta. La línea se coloca sola, de lado a lado de la pista.'
                  : draw.pts.length === 0 ? 'La meta se marca de lado a lado de la pista: toca un borde a la altura de la meta…'
                    : '…y ahora el borde de enfrente. (Si dibujas antes el trazado, basta un toque.)'}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-3">
            {draw.mode === 'sector' ? <>
              {sectors.length > 0 && <>
                <button onClick={() => save({ sectors: sectors.slice(0, -1) })} className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-2 hover:text-fg"><Icon name="undo" size={13} />Quitar último</button>
                <ConfirmButton label="Borrar tramos" confirm="Sí, borrar" icon={<Icon name="trash" size={14} />} onConfirm={() => { save({ sectors: null }); setDraw(null); }} />
              </>}
              <button onClick={() => setDraw(null)} className="text-[12px] font-bold uppercase tracking-[0.06em] text-accent">Listo</button>
            </> : <>
              {(draw.mode === 'line' ? line : path) && (
                <ConfirmButton label={draw.mode === 'line' ? 'Borrar meta' : 'Borrar trazado'} confirm="Sí, borrar"
                  icon={<Icon name="trash" size={14} />}
                  onConfirm={() => { save({ [draw.mode]: null }); setDraw(null); }} />
              )}
              {draw.mode === 'path' && <>
                <button onClick={() => setDraw({ ...draw, pts: draw.pts.slice(0, -1) })} disabled={!draw.pts.length} className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-2 hover:text-fg disabled:opacity-40"><Icon name="undo" size={13} />Deshacer</button>
                <button onClick={() => { save({ path: draw.pts }); setDraw(null); }} disabled={draw.pts.length < 3} className="text-[12px] font-bold uppercase tracking-[0.06em] text-accent disabled:opacity-40">Guardar</button>
              </>}
              <button onClick={() => setDraw(null)} className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted hover:text-fg">Cancelar</button>
            </>}
          </span>
        </div>
      )}
      <div className="absolute right-2 top-2 z-[1000] flex gap-2">
        <MapButton onClick={() => setFollow(!follow)} active={follow} label={follow ? 'Siguiendo coche' : 'Seguir coche'} icon="crosshair" />
        <MapButton onClick={fitAll} label="Encuadrar todos" icon="fit" />
      </div>
    </div>
    </div>
  );
}

// Marcador del coche: el dorsal en un círculo de color de estado, o el icono del equipo con el dorsal en una pastilla.
// `img` viene validado por el servidor (data URL base64 de imagen), así que no puede romper el HTML.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const carMarker = (car, img, style) => L.divIcon({
  className: 'car-icon',
  html: !img ? `<div class="car-dot">${esc(car)}</div>`
    : style === 'sprite' ? `<div class="car-sprite"><img src="${img}" alt=""><span>${esc(car)}</span></div>`
      : `<div class="car-dot has-img"><img src="${img}" alt=""><span>${esc(car)}</span></div>`,
  iconSize: !img ? [28, 28] : style === 'sprite' ? [52, 52] : [44, 44],
});

// Rumbo (grados desde el norte, sentido horario) entre dos posiciones; null si apenas se ha movido
// (parado, el ruido del GPS haría girar el coche sobre sí mismo).
const MIN_MOVE_M = 3;
const MIN_SPEED_KMH = 5; // por debajo, el rumbo del GPS es ruido
function bearing(a, b) {
  const dy = (b[0] - a[0]) * 110540;
  const dx = (b[1] - a[1]) * 111320 * Math.cos((b[0] * Math.PI) / 180);
  return Math.hypot(dx, dy) < MIN_MOVE_M ? null : (Math.atan2(dx, dy) * 180) / Math.PI;
}

const MapButton =({ active, label, icon, ...p }) => (
  <button {...p} aria-pressed={active} title={label}
    aria-label={label} className={`flex h-8 items-center gap-1.5 rounded-[4px] border px-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] shadow-sm transition-colors ${active ? 'border-accent bg-accent text-panel' : 'border-line bg-panel/95 text-fg-2 hover:bg-raised'}`}>
    <Icon name={icon} size={15} /><span className="hidden sm:inline">{label}</span>
  </button>
);
