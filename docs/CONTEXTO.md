# Contexto del proyecto · por dónde vamos

> Última actualización: 2026-10-03. Léelo antes de retomar. El historial día a día está en [`daily/`](daily/).

## Qué es

**Box Box · Comms & Telemetry** (antes «Cencerro Racing»): app para equipos de carreras y para cualquier
evento. Une el móvil del coche (lector OBD2 ELM327 + GPS) con el portátil del muro de BOX por WebSocket, con
baja latencia, y permite organizar eventos con varios equipos. Web (PWA) + app Android (Capacitor) que
carga la web desplegada.

### Roles y modos

Roles en escalera: **admin** ⊃ **organizador** ⊃ **piloto**. El organizador lo asigna el admin (Cuentas).
Quien tiene varios roles elige el **modo** en su perfil (se recuerda por dispositivo; por defecto el más
alto) y cada modo solo muestra sus vistas (`src/lib/mode.js`, `MODE_VIEWS` en `src/App.jsx`).

| Modo | Vistas |
|---|---|
| Admin | **Cuentas** (usuarios, roles, contraseñas, bajas, equipos) y **Eventos** (todos: abrir, cambiar organizador, cerrar, borrar; no crea) |
| Organizador | **Mis eventos**: crear (nombre, fecha, lugar), público/privado, abrir/cerrar inscripciones, código, pista común (trazado, meta, tramos), clasificación en vivo, mapa con todos los coches, **dirección de carrera** (bandera verde, amarilla, safety car, roja o aviso de texto), echar equipos, sacar pilotos, añadir pilotos registrados por email |
| Piloto | **Piloto** (fila grande bajo la cabecera), **Box**, **Estadísticas**, **Eventos** (lista por fecha con buscador, próximos/pasados, inscripción; sin equipo: «Tengo un código» y «Equipo para entrenar»), **Equipo** (personas: evento, invitar, miembros, nombre, salir) y **Ajustes** (coche: dorsal, icono, con/sin OBD, teléfono del mecánico, alertas; móvil: adaptador BLE/clásico/simulador, intervalo, telemetría, permisos, APK) |
| Todos | **Perfil** (botón con la inicial): nombre, email (con contraseña), contraseña, modo, tema, cerrar sesión, eliminar cuenta y estadísticas personales |

Sin equipo, el piloto solo ve Eventos y Perfil.

### Pantallas clave

- **Piloto**: 4 botones grandes (Avería, Salgo a box, Repostar, Pinchazo), «Anular vuelta» (doble toque),
  fila Coche (temp. motor, rpm) / Móvil (batería, temperatura) en directo. Mensajes de BOX a pantalla
  completa con voz (nativa en la APK) y respuestas OK / NO / PROBLEMA. Aviso si falta el permiso de ubicación.
- **Dirección de carrera**: la bandera del evento llega a todos sus equipos. En Piloto sale a pantalla completa con
  voz hasta pulsar «Visto»; después queda una franja fija de su color (también en Box). La verde se anuncia
  3 s y la retira. El organizador ve en la clasificación qué equipos la han visto.
- **Sin OBD** (`teams.obd = false`): el coche solo manda GPS y móvil; Piloto, Box, Estadísticas y Alertas
  ocultan los datos de motor y el botón de la barra de Piloto dice «GPS».
- **Box**: vueltas y parciales en vivo, alarmas por niveles, gauges, mapa (barra de pista: pistas guardadas,
  trazado, meta, tramos; en un evento, la del organizador sin editar), mensajería, «Viene a boxes / En boxes».
- **Estadísticas**: vueltas, pilotos, telemetría y tramos (mejor, media, última, constancia, vuelta ideal).

## Estado actual

| | |
|---|---|
| Repo | `https://github.com/SrPirson/Box-Box` · rama `main` |
| Último commit | Dirección de carrera: banderas del organizador a todos los equipos del evento |
| Despliegue | **https://boxracing.onrender.com** · servicio `boxracing` `srv-db02jqad0e5s739s56gg` (Frankfurt, free, autodeploy de `main`). La antigua https://cencerro-racing.onrender.com (servicio `cencerro` `srv-davb06flk1mc739c6vlg`) sigue activa con `REDIRECT_TO`: los navegadores van a la nueva y las APK antiguas (WebView, `; wv)`) la siguen cargando para actualizarse. **Borrarla cuando todos los móviles tengan la APK v9 o posterior.** `box-box` y `boxbox` en Render estaban cogidas |
| Base de datos | **Neon** `box-box` (Postgres 18, Frankfurt `eu-central-1`, gratis sin caducidad; creada desde la integración de Vercel). `DATABASE_URL` con `sslmode=verify-full`. Migrada desde Render el 02/10 con `server/migrate.js`. El Postgres de Render (`cencerro-racing-db`) caduca el 31/10/2026 y ya no se usa |
| APK | Release `apk` de GitHub, **versión 11** (`cencerro.apk`). La compila `.github/workflows/android.yml` en cada cambio de `android/`, `capacitor.config.json` o `package.json`; firma fija con el secreto `ANDROID_KEYSTORE` (CN=Cencerro Racing), verificada con apksigner antes de publicar. La app avisa de versión nueva e instala encima |
| Tests | `npm test` → **18 en verde** (banderas, ELM327, alertas, rumbo, cronometraje y tramos, migración, integración API + tiempo real: equipos, pistas, eventos, roles, perfil, boxes, anular vuelta) |

## Cómo arrancar

```bash
npm install
npm start            # build + servidor en http://localhost:3300 (sin DATABASE_URL → PGlite en .data/)
npm run dev          # Vite :5173  +  `npm run server` en otra terminal (proxy de /socket.io)
npm test
```

- El puerto 3000 lo ocupa otro proyecto Next.js en este equipo. Por eso este usa el **3300**.
- Para ser admin en local: `ADMIN_EMAIL=tu@email npm start` y registrarse con ese email.
- Pruebas en local sin tocar datos: `PGLITE_DIR=memory:// PORT=3477 node server/index.js`.
- Para probar sin coche: Ajustes → Simulador, y en Piloto «Tomar el volante».
- Variables del servicio en Render: `NODE_VERSION`, `DATABASE_URL` (Neon), `AUTH_SECRET`; opcionales
  `ADMIN_EMAIL`, `REDIRECT_TO` (solo el servicio antiguo), `MIGRATE_TO` (solo para una migración).

## Arquitectura (resumen)

```
Móvil piloto ──WebSocket──▶ server (Node) ──▶ sala "team:<id>"  ──▶ BOX / miembros del equipo
  ELM327 BLE (nativo en APK)   │                └▶ sala "event:<id>" (resumen 1 Hz + vueltas) ──▶ organizador
  GPS · brújula · batería      │ api.js   REST: cuentas, perfil, equipos, pistas, eventos, admin, stats
  cola offline (ráfaga)        │ live.js  piloto al volante, presencia, boxes, vueltas, muestreo 1 Hz
                               └ db.js    Postgres Neon (prod) · PGlite (local)
```

- **Autenticación**: scrypt + tokens HMAC de 30 días (stdlib). Cambiar contraseña invalida los tokens.
- **Un coche por equipo**, un único piloto «al volante». Un **relevo** reinicia la vuelta y abre la parada.
- **Pista** (`track = { line?, path?, sectors?, id?, name? }`): en equipos de entrenamiento, la del equipo
  (pistas guardadas en `tracks`); en un evento, la del organizador (`events.track`), igual para todos.
- **Vueltas y tramos**: el servidor detecta el cruce de meta interpolando el instante; cortes de tramo →
  parciales en el orden en que se cruzan. Cada vuelta guarda `sectors`, `track_id` y `event_id`.
- **Boxes**: «Salgo a box»/«Repostar» → viene de camino (alarmas normales); BOX confirma «Coche en boxes» →
  cuenta y se callan sin señal/batería/rpm/pista; termina a ≥ 40 km/h o con «Fin de boxes».
- **Eventos**: `events` (organizador, código, pista, cerrado, privado) y `teams.event_id`. Códigos de equipo y
  de evento únicos entre ambos; `/api/code/:code` dice cuál es. Clasificación en `/api/events/:id/standings`.
- **Banderas**: `flags` en `live.js`, en memoria (eventId → bandera + equipos que la han visto). Se emite a la
  sala de cada equipo del evento (`flag`) y a la del organizador (`event:flag`); quien conecta la recibe al entrar.
- **Perfil**: las vueltas y muestras son también del piloto; si el equipo se borra, quedan con `team_id` null.
- **App Android (Capacitor 8)**: carga `server.url` remoto. Plugins propios en
  `android/app/src/main/java/com/cencerro/racing/`: `Thermal` (temperatura y nivel de batería), `Updater`
  (versión y descarga/instalación del APK), `Background` (servicio en primer plano con GPS nativo y pulso
  de 250 ms para la pantalla apagada; pedir el permiso de ubicación y abrir los ajustes de la app), `ClassicBt`
  (ELM327 de Bluetooth clásico por SPP: emparejados, conexión, lectura y escritura). Comunidad: `bluetooth-le` (OBD en la
  APK, el WebView no tiene Web Bluetooth) y `text-to-speech`. Pide ubicación, Bluetooth y notificaciones al
  abrir; pantalla siempre encendida.
- **Mapa**: Esri + OpenStreetMap sin API key. Icono propio del coche (foto en círculo o silueta que gira con
  el rumbo: GPS en marcha, brújula parado). En eventos, cada coche se identifica por su equipo (`p.key`).
- **Diseño**: tokens en `src/index.css`, Barlow Condensed + JetBrains Mono. Logotipo e iconos generados del
  PNG del usuario (`public/logo-*.png`, `icon-*.png`, mipmaps de Android).

## Decisiones tomadas (y por qué)

| Decisión | Motivo |
|---|---|
| React + Vite (no Next.js) | Es una SPA; Next no aportaba nada |
| Render (no Vercel) | Vercel no mantiene WebSockets ni estado en memoria |
| Neon gratis (no Postgres de Render) | El de Render gratis caduca a los 30 días |
| Una instancia en Render | El estado en vivo (equipo y evento) vive en memoria |
| `ADMIN_EMAIL` por variable de entorno | Que nadie se haga admin por registrarse el primero |
| Roles en escalera y modo elegido en el perfil | El admin también corre; cada modo solo enseña lo suyo |
| Organizador asignado por el admin | Que no cualquiera cree eventos |
| Pista del evento común a sus equipos | Tiempos comparables en la clasificación |
| Un equipo activo por piloto; sin evento = entrenamiento | Simple; el historial queda en el perfil |
| El capitán inscribe a su propio equipo en eventos | Conserva pilotos y configuración del coche |
| El organizador recibe un resumen a 1 Hz, nunca los mensajes | Seguir el evento sin invadir la radio de cada equipo |
| Parada en boxes confirmada por BOX | Avisar de que entra no significa que ya esté parado |
| Confirmaciones en dos toques, nunca `confirm()` | Los diálogos del navegador bloquean y quedan mal en la APK |
| APK con firma fija y verificada en CI | Si cambia la firma, Android obliga a desinstalar |
| ENTRA YA EN BOX con pulsación mantenida; Anular vuelta con doble toque | Evitar envíos accidentales con guantes |

## Pendiente / próximos pasos

1. **Borrar el servicio antiguo `cencerro`** y el Postgres `cencerro-racing-db` en Render (ya se puede: todos
   tienen la APK v9+). El MCP de Render no permite borrar: desde el panel.
2. Probar las banderas en pista con varios móviles.
3. ~~Icono propio de cada coche en el mapa del evento~~ (hecho el 03/10).
4. **Probar el Bluetooth clásico con un adaptador real** (plugin `ClassicBt`, APK v12) y el permiso de
   ubicación pedido desde Ajustes → Permisos. Más adelante, si hace falta: ELM327 WiFi.
5. **Gestión de stints y combustible** (tiempo al volante por piloto, consumo, ventana de boxes) y tiempos
   en la vista Piloto (última vuelta y delta).
6. **Media de vuelta representativa** (excluir vueltas > 107 % de la mejor o usar la mediana): pendiente de decidir.
7. **Limitar intentos de login** y **persistir el historial de mensajes** de BOX (y la bandera activa).
8. Probar en un móvil real: pantalla apagada (y ajuste de batería «Sin restricciones» en Xiaomi/Samsung),
   brújula en el soporte, OBD BLE nativo, permisos y actualización encima con la v11.
9. Opcional: dividir el bundle (aviso de Vite) y actualizar las acciones de GitHub a v5.

## Requisitos de pista (no olvidar)

- **HTTPS** obligatorio en el móvil (Bluetooth, GPS, Wake Lock). Render lo da hecho.
- En la APK: ubicación «Permitir mientras se usa la app» y batería sin restricciones para la pantalla apagada.
- Web Bluetooth solo en **Chrome Android**; en la APK, Bluetooth nativo. iOS no está soportado.
- `tel:` abre el marcador, pero el piloto tiene que pulsar llamar.
- Render free se duerme tras 15 min: los días de carrera, un ping cada 10 min (cron-job.org) o plan Starter.
- Antes de un evento, que todo el equipo use la dirección nueva y la APK v9+ (el estado en vivo es por servicio).
