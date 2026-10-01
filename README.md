# Cencerro Racing Comms & Telemetry

PWA de comunicaciones y telemetría para equipos de carreras. Vistas **Box** (muro), **Piloto** (móvil en el
salpicadero), **Estadísticas**, **Equipo**, **Ajustes** y **Admin**.

- Cuentas propias; los pilotos se unen a un equipo solo con código o enlace de invitación.
- Cada equipo es un coche con un piloto al volante a la vez («Tomar el volante» hace el relevo).
- Vueltas cronometradas automáticamente al cruzar la línea de meta (se dibuja en el mapa de Box).
- Telemetría guardada a 1 Hz: medias por periodo y comparación en vivo con la media de 30 días.

```bash
npm install
npm start          # compila y sirve en http://localhost:3300 (sin DATABASE_URL usa PGlite en .data/)
npm run dev        # desarrollo: Vite en :5173 + `npm run server` en otra terminal
npm test           # parser ELM327, alertas, cronometraje y test de integración de la API
```

Variables de entorno (producción): `DATABASE_URL` (Neon Postgres), `AUTH_SECRET` (firma de sesiones),
`ADMIN_EMAIL` (esa cuenta será administradora). `render.yaml` las declara.

## Estructura

| Archivo | Qué hace |
|---|---|
| `server/index.js` | API + PWA compilada + Socket.io (solo WebSocket) |
| `server/api.js` | Registro/login, equipos e invitaciones, administración, estadísticas |
| `server/live.js` | Sala por equipo: piloto al volante, presencia, relevo de telemetría, vueltas y muestreo a 1 Hz |
| `server/laps.js` | Detección del cruce de meta con interpolación del instante |
| `server/auth.js` · `server/db.js` | scrypt + tokens HMAC · Postgres (Neon) o PGlite local, con el esquema |
| `src/lib/elm327.js` | Init AT, decodificación de PIDs (comentada), driver serializado por `>`, transporte BLE |
| `src/lib/gateway.js` | Bucle OBD/sim + GPS + batería + red → paquete JSON; cola offline con ráfaga al reconectar |
| `src/lib/limits.js` | Umbrales de alerta y evaluación aviso/crítico (compartido con el servidor) |
| `src/lib/session.js` · `store.js` | Sesión (con copia para abrir sin cobertura) · socket del equipo y ajustes del dispositivo |
| `src/views/*.jsx` | Box (+ `TrackMap`), Piloto, Estadísticas, Equipo, Ajustes, Admin, acceso |
| `docs/investigacion-ux-ui.md` | Investigación UX/UI: paleta, tipografía, layout, alarmas |

Mapas: plantillas Esri (oscuro, claro, satélite, híbrido) y OpenStreetMap (callejero), todas sin API key.
Esri sin cuenta solo cubre uso no comercial; OSM no permite descarga masiva de teselas.

Eventos: `telemetry`, `telemetry:batch`, `pilot` (botones del piloto), `msg` (BOX→coche), `ack` (respuesta).

## En pista: requisitos reales

- **HTTPS obligatorio** en el móvil: Web Bluetooth, GPS y Wake Lock solo funcionan en contexto seguro. Pon el servidor detrás de un proxy con TLS (Caddy, Cloudflare Tunnel…).
- **Bluetooth clásico vs BLE**: Web Bluetooth solo habla **BLE**. Muchos KUULAA ELM327 v2.2 son Bluetooth *clásico* (SPP, PIN 1234) y **no aparecerán** en el selector. Opciones: comprar la versión BLE 4.0, o empaquetar con Capacitor + un plugin Bluetooth Serial y pasar a `createElm()` un objeto `{ send(str), onData(cb) }`; el resto del código no cambia.
- **Web Bluetooth**: Chrome Android sí; iOS Safari no.
- **Llamada GSM**: `tel:` abre el marcador con el número; el piloto tiene que pulsar llamar (ningún navegador marca solo).
- **Voz**: el navegador exige una pulsación previa para el TTS (basta con tocar OBD al arrancar). En BOX, el pitido de alarma necesita un clic en la página.
- **PID 0142** no existe en muchos coches anteriores a ~2008: el driver cae automáticamente a `ATRV` (tensión en el pin 16).
