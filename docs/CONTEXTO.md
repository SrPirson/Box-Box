# Contexto del proyecto · por dónde vamos

> Última actualización: 2026-10-02. Léelo antes de retomar. El historial día a día está en [`daily/`](daily/).

## Qué es

**Box Box · Comms & Telemetry** (antes «Cencerro Racing»; app para cualquier evento de carreras): PWA para equipos de carreras. Une el móvil del coche (lector OBD2
ELM327 + GPS) con el portátil del muro de BOX, por WebSocket y con baja latencia.

- **Piloto** (móvil en el salpicadero): 6 botones grandes para usar con guantes. Los mensajes de BOX
  salen a pantalla completa, se leen en voz alta (TTS) y se responden con OK, NO o PROBLEMA. El único
  ajuste visible es el tema claro u oscuro.
- **Box** (portátil): vueltas en vivo, equipo conectado, alarmas por niveles, gauges con la media de
  30 días, mapa con 5 plantillas, trazado del circuito y línea de meta, y mensajería con acuse de recibo.
- **Estadísticas**: tiempos por vuelta comparados con la media, comparativa entre pilotos y medias de
  telemetría.
- **Equipo**: invitación (copiar enlace, WhatsApp, Telegram, correo, menú nativo), miembros, dorsal,
  teléfono del mecánico, meta y trazado (borrar) y alertas del coche.
- **Ajustes**: sensor (simulador o ELM327 BLE), intervalo de envío (200 ms a 5 min, lo largo para medir
  consumo), simulador de fallos, tema y cuenta.
- **Admin**: cuentas y equipos de toda la plataforma.

## Estado actual

| | |
|---|---|
| Repo | `https://github.com/SrPirson/Box-Box` · rama `main` |
| Último commit | `5310d77` Meta con un toque sobre el trazado y borrado de meta y trazado desde el mapa |
| Despliegue | **https://boxracing.onrender.com** · servicio `boxracing` `srv-db02jqad0e5s739s56gg` (Frankfurt, free), creado con el conector. La dirección antigua https://cencerro-racing.onrender.com (servicio `cencerro` `srv-davb06flk1mc739c6vlg`; borrarlo cuando todos los móviles tengan la APK v9 o posterior) sigue activa durante la transición: con `REDIRECT_TO` manda los navegadores a la nueva, y las APK antiguas la siguen cargando para actualizarse a la que apunta a la nueva. `box-box` y `boxbox` en Render estaban cogidas |
| Base de datos | **Neon** `box-box` (Postgres 18, Frankfurt `eu-central-1`, plan gratuito sin caducidad; creada desde la integración de Vercel). Migrada desde el Postgres de Render el 02/10/2026 con `server/migrate.js`. El de Render (`cencerro-racing-db`) queda como copia hasta que caduque el 31/10/2026 |
| Tests | `npm test` → 11 en verde (ELM327, alertas, cronometraje con y sin trazado, integración API + tiempo real) |
| Sin commitear | `package-lock.json` local sin campos `libc` (npm antiguo en Windows). **No subirlo**: descartar con `git checkout package-lock.json` |

## Cómo arrancar

```bash
npm install
npm start            # build + servidor en http://localhost:3300 (sin DATABASE_URL → PGlite en .data/)
npm run dev          # Vite :5173  +  `npm run server` en otra terminal (proxy de /socket.io)
npm test
```

- El puerto 3000 lo ocupa otro proyecto Next.js en este equipo. Por eso este usa el **3300**.
- Para ser admin en local: `ADMIN_EMAIL=tu@email npm start` y registrarse con ese email.
- Para probar sin coche: Ajustes → Simulador, y en Piloto «Tomar el volante».

## Arquitectura (resumen)

```
Móvil piloto ──WebSocket──▶ server (Node) ──▶ sala "team:<id>" ──▶ portátiles BOX / otros miembros
  ELM327 BLE / simulador       │ api.js   REST: cuentas, equipos, admin, stats
  GPS · batería · red          │ live.js  piloto al volante, presencia, vueltas, muestreo 1 Hz
  cola offline (ráfaga)        └ db.js    Postgres Render (prod) · PGlite (local)
```

- **Autenticación**: contraseñas con scrypt y tokens HMAC de 30 días (stdlib, sin librerías). Al cambiar
  la contraseña se invalidan todos los tokens anteriores.
- **Un coche por equipo**, con un único piloto «al volante». El servidor rechaza la telemetría de
  cualquier otro móvil.
- **Circuito** (`team.track = { line?, path? }`): la meta son 2 puntos; el trazado, un lazo cerrado de
  puntos dibujado en BOX. Con trazado, la meta se pone con un toque (perpendicular, 30 m) y, si no hay
  meta propia, hace de meta el inicio del trazado. Geometría en `server/laps.js` (`createRoute`), que
  también importa el cliente.
- **Vueltas**: las detecta el servidor cuando la traza GPS cruza la meta, interpolando el instante del
  cruce. Ignora cruces a menos de 20 s. Con trazado, además, solo cuenta si se ha recorrido el 80 % de los
  20 sectores (sirve en ambos sentidos de dibujo y con muestreo lento).
- **Fuera de pista**: el servidor añade `offTrack` (m al trazado menos la precisión del GPS) a cada
  paquete; aviso a 25 m y crítico a 50 m por defecto.
- **Alertas**: los umbrales son por equipo y viajan en cada paquete. Avisos en ámbar con un tono; críticos
  con banner y pitido cada 5 s hasta que alguien los reconoce. «Sin datos» descuenta el intervalo de envío
  del móvil (`pollMs` va en el paquete).
- **Gateway**: el OBD se lee al ritmo del intervalo; con intervalos > 1 s cada fix GPS nuevo se envía al
  momento. La pantalla del piloto se mantiene encendida (Wake Lock, que se vuelve a pedir al volver a la app).
- **Mapas sin API key**: Esri (oscuro, claro, satélite, híbrido) y OpenStreetMap (callejero). CARTO se
  descartó porque ya exige key desde el navegador.
- **Diseño**: tokens claro/oscuro en `src/index.css`; tipografías Barlow Condensed y JetBrains Mono
  (empaquetadas, funcionan sin red). Los motivos están en `docs/investigacion-ux-ui.md`.

## Decisiones tomadas (y por qué)

| Decisión | Motivo |
|---|---|
| React + Vite (no Next.js) | Es una SPA; Next no aportaba nada |
| Render (no Vercel) | Vercel no mantiene WebSockets abiertos |
| Postgres de Render | El disco de Render free se borra y PGlite no cabe en 512 MB (OOM) |
| `ADMIN_EMAIL` por variable de entorno | Que nadie se haga admin por registrarse el primero |
| Una instancia en Render | El estado en vivo de cada equipo vive en memoria |
| ENTRA YA EN BOX con pulsación mantenida de 400 ms | Evita envíos accidentales sin usar diálogos |
| Ajustes del coche editables por cualquier miembro | En pista, el capitán puede estar conduciendo |
| Fuera de pista calculado en el servidor | Allí ya están el trazado y la traza; BOX solo compara con umbrales |
| Meta perpendicular automática con trazado | Marcar «borde a borde» con dos toques no se entendía |

## Pendiente / próximos pasos

1. ~~Base de datos antes del 31/10/2026~~: hecho, migrada a Neon el 02/10/2026.
2. **Media de vuelta representativa**: hoy la media incluye vueltas de relevo y de boxes, que la
   distorsionan (en la prueba subió de 30 s a 46 s). Propuesta: excluir las vueltas de más del 107 % de
   la mejor, o usar la mediana. **Pendiente de decidir con el usuario.**
3. **Limitar intentos de login** antes de abrir la app a más equipos.
4. **Persistir el historial de mensajes** de BOX en la base de datos; hoy se pierde al recargar.
5. **Probar con hardware real**: KUULAA ELM327 v2.2. Si es Bluetooth clásico (PIN 1234), Web
   Bluetooth no lo ve y hará falta Capacitor con un plugin Bluetooth Serial (`createElm()` ya acepta otro
   transporte).
6. **Probar en pista el trazado**: la entrada a boxes saltará como «fuera de pista» si el pit lane no
   está en el trazado. Idea: crear el trazado a partir de la estela de una vuelta real.
7. Opcional: dividir el bundle (unos 550 kB; aviso de Vite) y, si el equipo factura, cuenta gratuita de
   ArcGIS para el mapa de Esri.

## Requisitos de pista (no olvidar)

- **HTTPS** obligatorio en el móvil (Bluetooth, GPS, Wake Lock). Render lo da hecho.
- Web Bluetooth funciona en **Chrome Android**, no en iOS.
- `tel:` abre el marcador, pero el piloto tiene que pulsar llamar.
- La voz (TTS) y el pitido de BOX necesitan una primera pulsación en la página.
- Render free se duerme tras 15 min: los días de carrera, plan **Starter**.
