# Investigación UX/UI — Box Box (pit wall)

Objetivo: decisiones aplicables a React 19 + Vite + Tailwind v4, sin más librerías de UI. Los ratios de contraste de abajo se han calculado con la fórmula WCAG 2.x (luminancia relativa); no son estimaciones a ojo.

---

## 1. Dirección de diseño

Qué hace que una pantalla de pit wall o de cronometraje parezca profesional (MoTeC i2, AiM Race Studio, Bosch WinDarab, gráficos de tiempos de F1 TV, monitores de tiempos de Al Kamel/WEC e IMSA):

- **Densidad alta, ruido bajo.** Paneles planos sin sombras, separados por **divisores de 1 px** y 1–2 escalones de luminancia de fondo. Nada de glassmorphism, gradientes ni glow neón (el `--color-neon-*` actual es justo lo que hay que quitar).
- **El color significa algo.** El 90 % de la UI es neutra (grises). El color de estado solo aparece cuando hay un estado: verde = OK/confirmado, ámbar = aviso, rojo = crítico, azul = información. El acento de marca solo en la pestaña activa, el foco y el logo.
- **Cifras tabulares y estrechas.** Todos los números con `font-variant-numeric: tabular-nums` para que no "bailen" a 5 Hz. Etiquetas en mayúsculas condensadas, pequeñas y en gris (`TEMP AGUA`, `°C`); el valor grande y en el color del texto.
- **Patrón torre de tiempos** (F1 TV / WEC): lista vertical de filas compactas `posición | dorsal | nombre | dato | estado`, con una banda de color de 3–4 px a la izquierda como único indicador de estado. Es el modelo para el selector de coches.
- **Patrón "canal + valor + unidad"** (MoTeC/AiM): cada lectura es `ETIQUETA` arriba a la izquierda, valor grande, unidad pequeña a su lado, y la franja de límites (min/max) en gris tenue.
- **Jerarquía por tamaño y posición, no por decoración**: alarmas arriba y a todo el ancho, gauges en el centro, mapa y log como contexto.
- **Esquinas casi rectas**: `border-radius` de 2–4 px en paneles y 6 px en botones grandes del piloto. Las esquinas muy redondeadas se ven "app de consumo".

## 2. Tokens de color

Principio: **capas de fondo** (sunken < bg < panel < raised en oscuro; al revés en claro), **3 niveles de texto**, **1 acento** y **5 estados**. Cada estado tiene `fg` (texto/icono sobre el panel), `solid` (relleno de botón o banner) y `soft` (tinte de fondo para filas o badges).

Acento: **índigo de carrera** (`#8f96ff` / `#4b4fd8`). Se descartan el rojo (choca con crítico), el naranja (choca con ámbar al sol) y el verde/teal (choca con OK). Ojo: en F1 el morado significa "vuelta más rápida". Como la app no muestra tiempos por vuelta, no hay conflicto; si algún día los muestra, reservad el morado para eso y pasad el acento a neutro.

```css
/* src/index.css */
@import 'tailwindcss';
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

:root, [data-theme="light"] {
  color-scheme: light;
  --bg:        #eceff3;  /* fondo app */
  --panel:     #ffffff;
  --raised:    #f6f7f9;  /* hover, cabeceras de panel */
  --sunken:    #e2e6eb;  /* pistas de gauge, inputs */
  --border:    #c5ccd5;  /* divisores 1px */
  --border-strong: #8e98a5; /* bordes de controles (2.9:1 ✔ 1.4.11) */
  --text:      #0e1318;  /* 18.7:1 sobre panel */
  --text-2:    #3c4550;  /*  9.7:1 */
  --muted:     #5c6672;  /*  5.8:1 */
  --accent:    #4b4fd8;  /*  6.2:1 */
  --ok:        #11793a;  /*  5.5:1 */
  --warn:      #8f5b00;  /*  5.7:1 (texto ámbar legible) */
  --crit:      #c4142b;  /*  6.0:1 */
  --info:      #0b5bd3;  /*  6.1:1 */
  --pending:   #5c6672;  /*  5.8:1 */
  --ok-solid:  #11793a;  --on-ok:   #ffffff; /* 5.5:1 */
  --warn-solid:#f5b81c;  --on-warn: #0e1318; /* 10.4:1 */
  --crit-solid:#c4142b;  --on-crit: #ffffff; /* 6.0:1 */
  --ok-soft:   #e3f4e8;  --warn-soft:#fdf1d3; --crit-soft:#fbe3e5; --info-soft:#e2ecfb;
  /* arcos de gauge (objetos gráficos ≥3:1) */
  --arc-track: #e2e6eb;
  --arc-ok:    #1f9d4f;  /* 3.5:1 */
  --arc-warn:  #b87c00;  /* 3.6:1 */
  --arc-crit:  #c4142b;  /* 6.0:1 */
}

[data-theme="dark"] {
  color-scheme: dark;
  --bg:        #0b0e12;
  --panel:     #12161c;
  --raised:    #1a2029;
  --sunken:    #07090c;
  --border:    #2a313b;
  --border-strong: #3d4653;
  --text:      #e8ecf1;  /* 15.3:1 sobre panel */
  --text-2:    #a6b0bd;  /*  8.3:1 */
  --muted:     #7d8896;  /*  5.0:1 (4.5 sobre raised) */
  --accent:    #8f96ff;  /*  6.9:1 */
  --ok:        #3ccf6e;  /*  8.9:1 */
  --warn:      #f5b81c;  /* 10.2:1 */
  --crit:      #ff5a52;  /*  5.9:1 */
  --info:      #4ea1ff;  /*  6.8:1 */
  --pending:   #8b96a6;  /*  6.1:1 */
  --ok-solid:  #3ccf6e;  --on-ok:   #0b0e12; /* 9.5:1 */
  --warn-solid:#f5b81c;  --on-warn: #0b0e12; /* 10.8:1 */
  --crit-solid:#ff5a52;  --on-crit: #0b0e12; /* 6.3:1 */
  --ok-soft:   #12291b;  --warn-soft:#2e2510; --crit-soft:#331516; --info-soft:#13233a;
  --arc-track: #232a33;
  --arc-ok:    #3ccf6e;
  --arc-warn:  #f5b81c;
  --arc-crit:  #ff5a52;
}

@theme inline {
  --color-bg: var(--bg);           --color-panel: var(--panel);
  --color-raised: var(--raised);   --color-sunken: var(--sunken);
  --color-line: var(--border);     --color-line-strong: var(--border-strong);
  --color-fg: var(--text);         --color-fg-2: var(--text-2);  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --color-ok: var(--ok);  --color-warn: var(--warn);  --color-crit: var(--crit);
  --color-info: var(--info);  --color-pending: var(--pending);
  --color-ok-solid: var(--ok-solid);     --color-on-ok: var(--on-ok);
  --color-warn-solid: var(--warn-solid); --color-on-warn: var(--on-warn);
  --color-crit-solid: var(--crit-solid); --color-on-crit: var(--on-crit);
  --color-ok-soft: var(--ok-soft);  --color-warn-soft: var(--warn-soft);
  --color-crit-soft: var(--crit-soft);  --color-info-soft: var(--info-soft);
}
```

Uso: `bg-panel border-line text-fg`, `text-crit`, `bg-crit-solid text-on-crit`. `@theme inline` hace que las utilidades lean la variable en tiempo de ejecución, así que basta con cambiar `data-theme` para cambiar todo el tema.

Notas:
- En claro, el ámbar **como texto** es `#8f5b00` (marrón oscuro). El amarillo `#f5b81c` solo como relleno con texto oscuro encima. El amarillo sobre blanco da 1.7:1 y no se lee.
- `--ok` en claro sobre `--sunken` baja a 4.4:1. Para texto de estado, usad siempre `panel`.
- `--border` no cumple 3:1 a propósito: es un divisor decorativo. Los controles interactivos (inputs, toggles) usan `--border-strong`, que en claro llega a 2.9:1 sobre panel. Para los inputs de claro, usad `--muted` (`#5c6672`, 5.8:1) si queréis cumplir 1.4.11 estrictamente.

**Secuencia del arco del gauge**: pista `--arc-track` en todo el recorrido; las **zonas** se dibujan como una banda fina exterior de 3 px con la tinta al 35 % de opacidad (ámbar entre aviso y crítico, rojo de crítico en adelante). El **arco de valor** (grueso, 10–12 px) se pinta entero en el color de la zona en que está el valor **ahora**: `arc-ok` → `arc-warn` → `arc-crit`. No uséis degradados: un color sólido por estado se lee mejor de un vistazo y ese color significa algo.

**Banderas** (solo como badges, nunca como color de UI): verde `#00a650`, amarilla `#ffd200` (texto `#0e1318`), roja `#e10600` (texto blanco), azul `#0067ff` (texto blanco), SC/VSC = amarilla con el texto "SC"/"VSC" y borde negro de 2 px, bandera a cuadros = patrón `repeating-conic-gradient`. Vale la pena añadirlas si se amplían los mensajes rápidos (p. ej. "AMARILLA S2").

## 3. Tipografía (offline: @fontsource, nada de CDN)

| Rol | Familia | Paquete | Por qué |
|---|---|---|---|
| Display/UI | **Barlow Condensed** 500/600/700 | `@fontsource/barlow-condensed` | Grotesca condensada de aire DIN/rotulación de carretera, legible en tamaños pequeños y en mayúsculas, muy usada en deporte. Rajdhani y Chakra Petch son más "gamer"; Titillium Web recuerda a F1 pero no es condensada y ocupa más. |
| Números | **JetBrains Mono** variable | `@fontsource-variable/jetbrains-mono` | Cifras tabulares por diseño, 0 con barra (no se confunde con O), alta altura de x, un solo archivo variable. IBM Plex Mono es una alternativa válida, pero es más ancha. |
| Texto largo (config, ayudas) | Barlow (no condensada) 400/500 | `@fontsource/barlow` | Misma familia, más cómoda para leer frases. Opcional: si queréis ahorrar peso, usad Barlow Condensed 500 también aquí. |

```js
// main.jsx
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource-variable/jetbrains-mono';
```
```css
@theme {
  --font-sans: 'Barlow Condensed', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono Variable', ui-monospace, monospace;
}
.num { font-family: var(--font-mono); font-variant-numeric: tabular-nums slashed-zero; letter-spacing: -0.02em; }
.label { font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
```
Importad solo el subconjunto `latin` para ahorrar peso (los CSS por peso de fontsource ya lo separan por `unicode-range`). Comprobad después de `vite build` que los `.woff2` acaban en `dist/assets`.

**Escala** (px, BOX en portátil): 11 etiqueta · 13 tabla/log · 15 cuerpo · 18 título de panel · 24 valor secundario · 40 valor de gauge · 56 alarma/banner. Piloto: 20 secundario · 32 etiqueta de botón · 64–96 mensaje del overlay. Interlineado 1.1 para números, 1.35 para texto.

## 4. Layout de BOX

**1280–1920 px** (CSS Grid, `height: 100dvh`, sin scroll de página; solo hacen scroll el log y la lista de coches):

```
┌──────────────────────── header 40px ─────────────────────────────┐
│ BOX BOX · CANAL 7 · ● CONECTADO 182ms · SESIÓN 00:42:13 · 14:32:07 · ☾ │
├──────────────── banner de alarma (0 o 56px, ancho completo) ─────┤
├──────────┬───────────────────────────────────┬───────────────────┤
│ TORRE    │  GAUGES 4 en fila (2×2 <1440px)   │  MENSAJES         │
│ coches   │  ─ fila de estado secundaria ─    │  botones rápidos  │
│ 220px    │  bat. móvil · red · acelerador    │  input libre      │
│          ├───────────────────────────────────┤  ───────────────  │
│          │  MAPA (Leaflet)                    │  LOG (scroll)     │
└──────────┴───────────────────────────────────┴───────────────────┘
```
```css
.box { display:grid; height:100dvh;
  grid-template: "hdr hdr hdr" 40px "alm alm alm" auto "cars main msg" 1fr / 220px 1fr 360px; }
.main { display:grid; grid-template-rows: auto auto 1fr; gap:1px; background:var(--border); } /* gap de 1px = divisores gratis */
@media (min-width:1600px){ .box{ grid-template-columns: 260px 1fr 420px; } }
@media (max-width:1100px){ /* tablet */
  .box{ grid-template: "hdr" 40px "alm" auto "cars" auto "main" 1fr "msg" auto / 1fr; }
}
```
- **Primario**: banner de alarma, gauges del coche seleccionado y botones de mensaje (sobre todo ENTRA YA EN BOX). **Secundario**: mapa y estado del teléfono. **Terciario**: log.
- **Torre de coches**: cada fila de 44 px muestra `#dorsal` (mono, 20 px), una mini-lectura de temperatura y voltaje (13 px), la antigüedad del dato ("0.4s") y una banda izquierda de 4 px con el peor estado del coche. La fila seleccionada lleva fondo `raised` y un borde izquierdo con el acento. **Un coche en alarma que no está seleccionado tiene que verse igual**: banda roja e icono. Si no, en la pista se pierden avisos.
- En tablet, la torre pasa a ser una fila horizontal de chips con scroll y los mensajes van en un panel fijo abajo.
- **Header**: punto de conexión (verde/ámbar/rojo con texto, nunca solo color), latencia, canal, reloj de sesión (mono) y hora local, y el conmutador de tema. Nada más.

## 5. Gauges

| Métrica | Forma | Rango | Zonas |
|---|---|---|---|
| Temp. agua °C | **Arco 240°** + digital | 40–130 | aviso ≥95, crítico >100 |
| RPM | **Barra horizontal segmentada** (estilo luces de cambio) + digital | 0–8000 (configurable) | aviso ≥90 % del corte, crítico en el corte |
| Batería V | **Digital grande** + mini-barra | 10–15 | crítico <12.2, aviso <12.6, aviso alto >14.8 (regulador) |
| Velocidad GPS km/h | **Solo digital** | — | sin zonas (no hay estado, así que no hay color) |

Por qué: el arco funciona cuando importa la posición relativa respecto a un límite (temperatura). Las RPM cambian deprisa, y la barra lineal de LEDs es el lenguaje de los volantes de carreras. Con voltaje y velocidad lo que se mira es el número exacto.

- SVG inline: `<path>` de pista + banda de zonas + arco de valor con `stroke-dasharray`/`pathLength="100"`. Transición `stroke-dashoffset 150ms linear`. Con lecturas cada 200–500 ms, una animación más larga va por detrás del dato.
- El valor va en mono 40 px, la unidad en 15 px `--muted`, y las etiquetas min/max de 11 px en los extremos del arco. Para aviso y crítico, poned además una muesca en el umbral.
- **Dato caducado (>3 s)**: el valor pasa a `--muted` con opacidad 0.5, el arco a la pista sola, y aparece el badge `SIN DATOS 4.2s` (ámbar) en la esquina. Se mantiene el último valor, tachado o con el prefijo "~". **No dejéis el último color verde**: un verde caducado es una mentira peligrosa.
- Formato de números: temperatura con 0 decimales, voltaje con 2 (`12.18`), RPM con miles agrupados (`6 450`, usando espacio fino ` `) y velocidad con 0 decimales. Usad `Intl.NumberFormat('es-ES')` creado una sola vez a nivel de módulo.

## 6. Alarmas

Niveles:
1. **Info**: badge azul, sin sonido.
2. **Aviso** (temperatura en zona ámbar, voltaje <12.6, dato caducado): badge y fila ámbar fijos, sin parpadeo, con un "tick" sonoro corto una sola vez.
3. **Crítico** (temperatura >100, voltaje <12.2, caducado >10 s): borde rojo en el gauge y la fila, banner rojo `solid`, pitido repetido cada 5 s hasta que se reconoce.
4. **Avería** (motor parado o avería con GPS): banner de 56 px a todo el ancho con las coordenadas y un botón "VER EN MAPA" que centra el mapa.

- **Parpadeo**: WCAG 2.3.1 permite como mucho 3 destellos por segundo. El `.blink` actual (0.6 s, unos 1.7 Hz) cumple, pero parpadea el contenido entero. Mejor: que parpadee solo un **borde o un punto de 8 px** a 1 Hz (`animation: pulse 1s steps(2) infinite`), con el texto siempre fijo y legible. **Después de reconocerla, la alarma deja de parpadear y se queda en rojo fijo** mientras la condición siga activa. Respetad `@media (prefers-reduced-motion: reduce)` dejándolo sin parpadeo.
- **Reconocimiento**: botón `RECONOCER` en el banner (y tecla `Espacio`) que silencia el sonido y para el parpadeo. Si la condición desaparece y vuelve a aparecer, la alarma se rearma. Registrad en el log "ALARMA TEMP 103°C · reconocida 14:32:10".
- **Sonido**: Web Audio con `OscillatorNode`, sin archivos. Aviso: 880 Hz durante 120 ms, una vez. Crítico: dos tonos 880/660 Hz cada 5 s. Poned un mute global en el header. Al aire libre en el pit wall el sonido es secundario: el canal principal es el visual.
- Nunca uséis solo el color: cada estado lleva icono y texto ("CRÍTICO", "AVISO").

## 7. Mensajes y log

- **Botones rápidos**: rejilla de 2 columnas y botones de 48 px de alto, en texto condensado 600 y mayúsculas.
  - `ENTRA YA EN BOX`: **destructivo-primario**, a todo el ancho, `bg-crit-solid text-on-crit`, 56 px. Es el único botón relleno de color.
  - `ENTRA SIGUIENTE VUELTA`: borde `--warn` sobre fondo `warn-soft`.
  - `APRIETA / MAX PACE`, `MODO ECO` y `SANCIÓN`: neutros (`bg-raised border-line-strong`). Diferenciarlos con color sería ruido.
  - Para evitar envíos por accidente de ENTRA YA EN BOX, **no uséis un modal**: mantened pulsado 400 ms con una barra de progreso dentro del botón, o pedid doble clic en menos de 1 s. Lo más rápido que siga siendo seguro.
- **Input libre**: input mono, Enter envía, contador de 60 caracteres (lo que cabe en el overlay del piloto).
- **Log**: tabla densa de filas de 28 px: `14:32:07` (mono, `--muted`) · mensaje · badge de ACK alineado a la derecha.
  - Badges: `PENDIENTE` (borde `--pending` y punto pulsante; tras 10 s pasa a ámbar con el texto "SIN RESPUESTA 12s"), `OK` (`ok-soft` + `--ok`), `NO` (`crit-soft` + `--crit`), `PROBLEMA` (`warn-soft` + `--warn`, la fila entera tintada, porque exige acción).
  - El más nuevo arriba. Mostrad el tiempo de respuesta ("OK · 3.1s").
- **Estado vacío**: el texto "Sin mensajes. Los avisos enviados al piloto aparecerán aquí." en `--muted`, centrado y sin ilustraciones.

## 8. Config

- Tarjetas (`bg-panel border-line rounded-[4px]`) con cabecera `.label`:
  1. **Coche y equipo**: dorsal, teléfono del mecánico, canal.
  2. **Conexión**: URL del servidor, intervalo de lectura.
  3. **Fuente de datos**: segmented control.
  4. **Telemetría**: iniciar/detener y probar voz.
  5. **Simulador · inyección de fallos**.
  6. **Paquete JSON**.
- Las etiquetas van **encima** del campo y el texto de ayuda debajo, en 13 px `--muted` (p. ej. "Más bajo = más fluido, más batería y datos"). Ancho máximo del formulario: 720 px.
- **Slider 200–500 ms**: `<input type="range" step="50">` con `accent-color: var(--accent)` y el valor en mono al lado ("300 ms"). Añadid marcas con `<datalist>`.
- **Fuente de datos**: segmented control nativo, hecho con `<fieldset>` y dos `<input type="radio">` estilizados (`SIMULADOR | ELM327 BLE`). Debajo, el estado BLE (emparejado / buscando / error).
- **Fallos del simulador**: **toggle switches** (`<button role="switch" aria-checked>`), porque son estados persistentes on/off y no acciones. Cada toggle activo tiñe su fila con `warn-soft` y la tarjeta muestra el badge "SIMULANDO FALLOS". Desactivad la sección con un texto explicativo cuando la fuente es ELM327.
- **Iniciar/detener**: un único botón primario que cambia de estado: `INICIAR TELEMETRÍA` (acento) ↔ `DETENER` (borde rojo). Al lado va el estado en vivo: "● Enviando · 3.3 Hz".
- **Zona de peligro** (restablecer config, olvidar dispositivo BLE): tarjeta al final con borde `--crit` al 40 %, botón en contorno rojo y confirmación inline.
- **JSON**: `<pre>` mono 12 px sobre `bg-sunken`, plegado por defecto (`<details>`), con un botón para copiar.

## 9. Vista Piloto

Lo que dicen las normas: NHTSA pide que una tarea se complete con miradas de **≤2 s** y **≤12 s** en total. Con un mensaje del box, la meta es **una sola mirada de menos de 1.5 s**. ISO 15008 fija el contraste mínimo símbolo/fondo en **5:1 de noche, 3:1 de día y 2:1 con sol directo**. Al sol, el reflejo de la pantalla del móvil se come el contraste, así que hay que partir del máximo posible.

- **Tema claro (sol)**: fondo `#ffffff`, texto `#000000` (21:1), pesos **700** y sin grises intermedios en la información (como mucho `#3c4550` en las etiquetas). Los botones de respuesta usan rellenos saturados con texto de alto contraste: OK `#11793a`/blanco, NO `#c4142b`/blanco, PROBLEMA `#f5b81c`/negro. Bordes de 3 px en `#000` para que los botones se distingan aunque el color se lave.
- **Tema oscuro (noche)**: fondo `#000000` (OLED, sin halo), texto `#d0d5dc` (14:1) en lugar de blanco puro para evitar deslumbramiento, y los colores de estado del token oscuro. Sin superficies grandes en blanco: el overlay de prioridad usa un fondo de color oscuro (`crit-soft`) con texto en color, no un rojo sólido a pantalla completa, salvo para ENTRA YA EN BOX.
- **Objetivos táctiles con guantes**: mínimo **15 mm** (unos 60 CSS px), objetivo de 72–96 px y 12 px de separación. Rejilla de 6 botones a pantalla completa, `touch-action: manipulation`. Los 3 botones de respuesta del overlay ocupan cada uno un tercio del ancho y como mínimo el 25 % del alto.
- **Overlay**: mensaje en 64–96 px condensado 700, en 2 líneas como máximo, con la hora de envío y un icono. Tiene que funcionar también sin TTS. Tras responder, el overlay se cierra y aparece un toast de confirmación de 1 s.
- **Qué quitar**: animaciones decorativas, sombras, cualquier dato numérico que el piloto no pueda usar (RPM, voltaje), y cualquier ajuste salvo el tema. Mantened `wakeLock` y el modo pantalla completa.

## 10. Implementación del tema

```html
<!-- index.html, en <head>, antes de que cargue CSS/JS: evita el flash de tema incorrecto -->
<script>
  try { var t = localStorage.getItem('theme'); } catch (e) {}
  document.documentElement.dataset.theme =
    t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
</script>
```
```js
// toggle (sin contexto React; el DOM es la fuente de verdad)
export function toggleTheme() {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('theme', t); } catch {}
}
```
- El valor por defecto sigue a `prefers-color-scheme`. Lo que elija el usuario se guarda en `localStorage` y manda sobre el sistema. Añadid `<meta name="theme-color">` y actualizadlo al cambiar de tema.
- **Leaflet**: tiles CartoDB Positron (claro) / Dark Matter (oscuro), o bien `filter: invert(1) hue-rotate(180deg) brightness(.9)` sobre `.leaflet-tile-pane` en oscuro (un CSS, sin otra fuente de tiles). Los puntos de los coches en el color de su estado con un contorno de 2 px en `--panel`. La estela, en `--accent` al 60 %. Al estar en una pista sin red, las tiles necesitan caché: precargadlas o mostrad un fondo `--sunken` con solo la estela.

## 11. Micro-detalles

- **Sin texturas** de carbono ni rejillas de fondo: restan contraste al sol y quedan anticuadas. La única "textura" son los divisores de 1 px.
- **Iconos**: SVG inline. Hacen falta unos 12 (alerta, check, x, señal, batería, termómetro, mapa, enviar, sol/luna, volumen, ajustes, coche). Copiad los paths de **Lucide** (licencia ISC) a un `icons.jsx` con un componente de 10 líneas, `stroke="currentColor"` y `stroke-width` 2. No añadáis `lucide-react` como dependencia: el brief prohíbe más librerías y con 12 iconos no compensa.
- **Foco**: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`. Nunca `outline: none` sin sustituto (WCAG 2.4.7 y 2.4.11 de 2.2).
- **Duraciones**: 100–150 ms en hover/press, 150 ms en arcos, 200 ms al entrar el banner y **0 ms** en cambios de valor numérico (no animéis los números).
- **Carga**: placeholders con skeleton estático (`bg-sunken`) y el texto "Esperando telemetría…". Nada de spinners que giren indefinidamente.
- **Números**: `tabular-nums` en todas partes, unidades separadas por espacio fino, `—` cuando no hay valor (nunca `NaN` ni `0` falso), y antigüedad del dato relativa ("hace 0.4s") en mono.
- **Botón pulsado**: `active:translate-y-px` y un cambio de fondo; sin efecto ripple.
- **Tamaño mínimo de objetivo** en BOX: 24×24 px (WCAG 2.5.8); los botones de mensaje, 48 px.

---

## Checklist priorizado

**P0, seguridad y legibilidad**
1. Sustituir los tokens `neon-*` por el sistema de tokens de §2 (`@theme inline` + `data-theme`) y el script anti-flash.
2. Tratamiento de dato caducado en gauges y torre (gris, badge "SIN DATOS", nunca verde caducado).
3. Alarmas por niveles con reconocimiento. Parpadeo solo del borde a 1 Hz y fijo tras reconocer; `prefers-reduced-motion`.
4. Tema claro del Piloto de alto contraste (negro sobre blanco, bordes de 3 px) y tema oscuro OLED.
5. Mantener pulsado 400 ms para ENTRA YA EN BOX.

**P1, estructura**
6. Grid de BOX (§4) con torre de coches lateral que muestre la alarma de los coches no seleccionados.
7. Gauges SVG: arco para temperatura, barra segmentada para RPM, digital para voltaje y velocidad, con bandas de zona.
8. Fuentes vía @fontsource (Barlow Condensed + JetBrains Mono) y la clase `.num` con tabular-nums.
9. Log con badges de ACK, tiempo de respuesta y "SIN RESPUESTA" tras 10 s.

**P2, pulido**
10. Config en tarjetas: segmented control, switches de fallos, zona de peligro, JSON plegable.
11. Header con conexión, latencia, reloj de sesión, mute y tema.
12. Iconos SVG inline (paths de Lucide), anillos de foco y estados vacíos.
13. Tiles de Leaflet por tema y fallback sin red.
14. Sonido con Web Audio (tick de aviso y repetición de crítico).

---

### Fuentes
- [ISO 15008:2017 — muestra oficial (iteh)](https://cdn.standards.iteh.ai/samples/62784/ac1daa21f49545c69dc9a5b33259a059/ISO-15008-2017.pdf) · [Voelz 2025, evaluación de contraste ISO 15008 (SID)](https://sid.onlinelibrary.wiley.com/doi/full/10.1002/msid.1549)
- [NHTSA Visual-Manual Driver Distraction Guidelines (Federal Register)](https://www.federalregister.gov/documents/2013/04/26/2013-09883/visual-manual-nhtsa-driver-distraction-guidelines-for-in-vehicle-electronic-devices)
- [IBM Carbon — tokens de color / support colors](https://carbondesignsystem.com/elements/color/tokens/) · [Carbon data-viz palettes](https://carbondesignsystem.com/data-visualization/color-palettes/)
- WCAG 2.2: 1.4.3, 1.4.11, 2.3.1, 2.4.7, 2.4.11, 2.5.8 (w3.org/TR/WCAG22)
- Versiones verificadas en npm: `@fontsource/barlow-condensed` 5.3.0, `@fontsource-variable/jetbrains-mono` 5.3.0
