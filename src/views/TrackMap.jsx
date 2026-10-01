// Mapa en vivo: plantillas de mapa base sin API key, coches con dorsal y color de estado, estela,
// seguir coche, encuadrar todo y dibujo de la meta y del trazado del circuito.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Icon from '../icons.jsx';
import { useTheme } from '../lib/theme.js';

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
const OPTIONS = [['auto', 'Auto'], ...Object.entries(BASEMAPS).map(([id, b]) => [id, b.label])];

export default function TrackMap({ cars, trails, sel, states, focus, line, onSetLine, path, onSetPath }) {
  const theme = useTheme();
  const el = useRef(null);
  const map = useRef(null);
  const base = useRef(null);
  const layers = useRef({});
  const [choice, setChoice] = useState(() => { try { return localStorage.getItem(MAP_KEY) || 'auto'; } catch { return 'auto'; } });
  const [follow, setFollow] = useState(true);
  const [draw, setDraw] = useState(null); // null | { mode: 'line' | 'path', pts: [[lat, lng], ...] }
  const drawRef = useRef(null);
  drawRef.current = draw;
  const finish = useRef(null);
  const route = useRef(null);
  const active = choice === 'auto' ? theme : choice;
  const onSetLineRef = useRef(onSetLine);
  onSetLineRef.current = onSetLine;

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: false, zoomSnap: 0.25 }).setView([40.4, -3.7], 6);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    map.current.createPane('route').style.zIndex = 350; // trazado por debajo de estela y coches
    map.current.on('dragstart', () => setFollow(false));
    // Dibujo: la meta son dos toques; el trazado, tantos como haga falta hasta pulsar Guardar.
    map.current.on('click', (e) => {
      const d = drawRef.current;
      if (!d) return;
      const pts = [...d.pts, [e.latlng.lat, e.latlng.lng]];
      if (d.mode === 'line' && pts.length === 2) { setDraw(null); onSetLineRef.current?.(pts); }
      else setDraw({ ...d, pts });
    });
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

  // Línea de meta (cuadros blanco/negro). Mientras se dibuja, el primer punto ya se ve.
  useEffect(() => {
    finish.current?.remove();
    const pts = draw?.mode === 'line' && draw.pts.length ? draw.pts : line;
    if (!pts) return;
    finish.current = L.layerGroup(pts.length === 2
      ? [L.polyline(pts, { className: 'finish-a', weight: 7, interactive: false }), L.polyline(pts, { className: 'finish-b', weight: 7, interactive: false })]
      : [L.circleMarker(pts[0], { radius: 6, className: 'finish-dot', interactive: false })]).addTo(map.current);
  }, [line, draw]);
  useEffect(() => { el.current.style.cursor = draw ? 'crosshair' : ''; }, [draw]);

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
          dot: L.marker(pos, { icon: L.divIcon({ className: 'car-icon', html: `<div class="car-dot">${p.car}</div>`, iconSize: [28, 28] }), zIndexOffset: 1000 }).addTo(map.current),
        };
      }
      l.trail.setLatLngs(trails[p.car] ?? []);
      l.dot.setLatLng(pos);
      const dot = l.dot.getElement()?.firstChild;
      if (dot) { dot.dataset.state = states[p.car]; dot.dataset.sel = String(p.car === sel); }
      if (follow && p.car === sel) map.current.panTo(pos, { animate: true, duration: 0.25 });
    }
  }, [cars, sel, trails, states, follow]);

  useEffect(() => {
    const p = cars[sel];
    if (p?.gps) map.current.panTo([p.gps.lat, p.gps.lng], { animate: true, duration: 0.25 });
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (focus) { setFollow(false); map.current.flyTo([focus.lat, focus.lng], 18, { duration: 0.6 }); } }, [focus]);

  const fitAll = () => {
    const pts = Object.values(cars).filter((p) => p.gps).map((p) => [p.gps.lat, p.gps.lng]);
    if (!pts.length) return;
    setFollow(false);
    map.current.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 17 });
  };
  const pick = (id) => { setChoice(id); try { localStorage.setItem(MAP_KEY, id); } catch {} };

  return (
    <div className="relative h-full min-h-64">
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
          <Icon name={draw.mode === 'line' ? 'finish' : 'route'} size={18} className="text-accent" />
          <span className="text-[14px] font-semibold">
            {draw.mode === 'line'
              ? (draw.pts.length === 0 ? 'Toca un borde de la pista en la línea de meta' : 'Ahora toca el borde opuesto')
              : <>Toca el centro de la pista vuelta completa, un punto en cada curva <span className="num text-muted">· {draw.pts.length}</span></>}
          </span>
          <span className="ml-auto flex gap-3">
            {draw.mode === 'path' && <>
              <button onClick={() => setDraw({ ...draw, pts: draw.pts.slice(0, -1) })} disabled={!draw.pts.length} className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-2 hover:text-fg disabled:opacity-40"><Icon name="undo" size={13} />Deshacer</button>
              <button onClick={() => { onSetPath(draw.pts); setDraw(null); }} disabled={draw.pts.length < 3} className="text-[12px] font-bold uppercase tracking-[0.06em] text-accent disabled:opacity-40">Guardar</button>
            </>}
            <button onClick={() => setDraw(null)} className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted hover:text-fg">Cancelar</button>
          </span>
        </div>
      )}
      <div className="absolute right-2 top-2 z-[1000] flex gap-2">
        {onSetPath && <MapButton onClick={() => setDraw(draw?.mode === 'path' ? null : { mode: 'path', pts: [] })} active={draw?.mode === 'path'} label={path ? 'Redibujar trazado' : 'Dibujar trazado'} icon="route" />}
        {onSetLine && <MapButton onClick={() => setDraw(draw?.mode === 'line' ? null : { mode: 'line', pts: [] })} active={draw?.mode === 'line'} label={line ? 'Redefinir meta' : 'Definir meta'} icon="finish" />}
        <MapButton onClick={() => setFollow(!follow)} active={follow} label={follow ? 'Siguiendo coche' : 'Seguir coche'} icon="crosshair" />
        <MapButton onClick={fitAll} label="Encuadrar todos" icon="fit" />
      </div>
    </div>
  );
}

const MapButton = ({ active, label, icon, ...p }) => (
  <button {...p} aria-pressed={active} title={label}
    aria-label={label} className={`flex h-8 items-center gap-1.5 rounded-[4px] border px-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] shadow-sm transition-colors ${active ? 'border-accent bg-accent text-panel' : 'border-line bg-panel/95 text-fg-2 hover:bg-raised'}`}>
    <Icon name={icon} size={15} /><span className="hidden sm:inline">{label}</span>
  </button>
);
