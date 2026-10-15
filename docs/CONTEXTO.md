# Contexto del proyecto · por dónde vamos

> Última actualización: 2026-10-08. Plan de negocio, precios, escalado y pagos: [`plan-negocio-y-escalado.md`](plan-negocio-y-escalado.md). Léelo antes de retomar. El historial día a día está en [`daily/`](daily/).

## Qué es

**Box Box · Comms & Telemetry** (antes «Cencerro Racing»): app para equipos de carreras y para cualquier
evento. Une el móvil del coche (lector OBD2 ELM327 + GPS) con el portátil del muro de BOX por WebSocket, con
baja latencia, y permite organizar eventos con varios equipos. Web (PWA) + app Android (Capacitor) que
carga la web desplegada.

### Roles y modos

Roles en escalera: **admin** ⊃ **organizador** ⊃ **piloto**. El organizador lo asigna el admin (Cuentas).
Quien tiene varios roles elige el **modo** en su perfil (se recuerda por dispositivo; por defecto el más
alto; también se cambia en la cabecera) y cada modo solo muestra sus vistas (`src/lib/mode.js`, `MODE_VIEWS` en
`src/App.jsx`). La URL lleva la vista y su ruta interna (`#eventos/12/pista`, `#control/12`, `#cuentas/7`).

| Modo | Vistas |
|---|---|
| Admin | **Resumen** (métricas, en vivo, necesita atención, actividad), **Cuentas** (búsqueda y páginas en el servidor, acciones masivas, panel lateral, «Ver como» en solo lectura), **Equipos**, **Eventos** (todos: abrir, cambiar organizador, cerrar, borrar; no crea) y **Auditoría** |
| Organizador | **Mis eventos**: lista por estado (Borrador, Inscripción, Hoy, Terminado) con el siguiente paso; **asistente** de 4 pasos para crear (datos, pista copiable, inscripción y cupo, publicar); espacio del evento con pestañas **Resumen** (código, comprobaciones del día de carrera, banderas, sesión, clasificación, mapa), **Pista**, **Inscritos**, **Resultados** (publicar por sesión, CSV, enlace público) y **Ajustes** (zona de peligro); **Race Control** a pantalla completa |
| Piloto | **Piloto** (fila grande bajo la cabecera), **Box**, **Estadísticas**, **Eventos** (lista por fecha con buscador, próximos/pasados, inscripción; sin equipo: «Tengo un código» y «Equipo para entrenar»), **Equipo** (personas: evento, invitar, miembros, nombre, salir) y **Ajustes** (coche: dorsal, icono, con/sin OBD, teléfono del mecánico, alertas; móvil: adaptador BLE/clásico/simulador, intervalo, telemetría, permisos, APK) |
| Todos | **Perfil** (botón con la inicial): nombre, email (con contraseña), contraseña, modo, tema, cerrar sesión, eliminar cuenta y estadísticas personales |

Sin equipo, el piloto solo ve Eventos y Perfil.

### Pantallas clave

- **Piloto**: 4 botones grandes (Avería, Salgo a box, Repostar, Pinchazo), «Anular vuelta» (doble toque),
  fila Coche (temp. motor, rpm) / Móvil (batería, temperatura) en directo. Mensajes de BOX a pantalla
  completa con voz (nativa en la APK) y respuestas OK / NO / PROBLEMA. Aviso si falta el permiso de ubicación.
- **Race Control** (`#control/12`, `src/views/RaceControl.jsx`): torre de tiempos, mapa, banderas (G/Y/S/F dos veces o
  + Enter; roja manteniendo pulsado o la R; bandera a cuadros), reloj de sesión, cambio de sesión manteniendo
  pulsado y registro con hora exportable a CSV. Pantalla siempre encendida; sin conexión no envía banderas.
- **Resultados**: el organizador publica una instantánea por sesión (por vueltas o por mejor vuelta); se ven sin cuenta
  en `#tiempos/<public_code>` (código propio, no el de inscripción) y se imprimen o se guardan en PDF.
- **Directo público** (`#directo/<public_code>`, sin cuenta, como apex-timing): clasificación de la sesión en curso según el
  formato, IN si está en boxes, mejor vuelta y comentarios (sanciones). Se refresca cada 5 s. Lo abren el organizador
  (Resumen, Race Control) y los equipos (botón «Clasificación» en Box y Eventos). Todos los eventos tienen `public_code`.
  Lleva también el mapa con los coches (`/api/public/live/<código>/cars`, en memoria, cada segundo) y, si el organizador
  pone un enlace en Ajustes → Retransmisión (`events.video_url`), el vídeo: YouTube, Twitch y Kick van a su reproductor
  (`embedUrl` en `src/lib/events.js`); cualquier otra web https se incrusta tal cual (si esa web lo permite).
- **Formato de carrera** (`events.race_format` + `race_target`): resistencia (minutos; Race Control y el directo cuentan lo
  que queda), a N vueltas o mejor vuelta. El entrenamiento siempre por mejor vuelta. Lo ordena `rank()` en `src/lib/events.js`.
- **Sanciones** (`penalties`): el organizador resta N vueltas en la sesión en curso o retira a un equipo (Resumen y Race
  Control, dos toques, anulables). Al equipo le llega como una bandera roja con voz hasta «Visto» (Piloto a pantalla
  completa, franja en el resto); BOX muestra «(−N sanción)». Quedan en el registro.
- **Calle de boxes** (`track.pitIn` / `track.pitOut`, herramienta «Boxes» del mapa): al cruzar la entrada, «En boxes»
  automático; al cruzar la salida se cierra la vuelta (cuenta aunque la calle no cruce la meta) y termina la parada.
  Con calle dibujada el relevo no anula la vuelta. Sin ella, todo sigue como antes (BOX confirma, ≥ 40 km/h).
- **Dirección de carrera**: la bandera del evento llega a todos sus equipos. En Piloto sale a pantalla completa con
  voz hasta pulsar «Visto»; después queda una franja fija de su color (también en Box). La verde se anuncia
  3 s y la retira. El organizador ve en la clasificación qué equipos la han visto.
- **Participar en el evento**: inscrito no es participar. Con «Participando» el equipo usa la pista del
  organizador, sus vueltas cuentan en la sesión en curso, sale en su mapa y recibe banderas; sin participar,
  entrena con sus pistas (vueltas libres). Lo cambia cualquier miembro (Box, Equipo, Eventos). Al inscribirse
  empieza sin participar; el día del evento sale una franja «Hoy es … · Participar».
- **Tipos de vuelta** (`laps.kind`, `samples.kind`): **Libre** (fuera del evento), **Entrenamiento** y **Carrera**
  (la sesión que marca el organizador en `events.session`). Estadísticas, perfil y clasificación filtran por tipo.
- **Sin OBD** (`teams.obd = false`): el coche solo manda GPS y móvil; Piloto, Box, Estadísticas y Alertas
  ocultan los datos de motor y el botón de la barra de Piloto dice «GPS».
- **Box**: vueltas y parciales en vivo, alarmas por niveles, gauges, mapa (barra de pista: pistas guardadas,
  trazado, meta, tramos; en un evento, la del organizador sin editar), mensajería, «Viene a boxes / En boxes».
- **Estadísticas**: vueltas, pilotos, telemetría y tramos (mejor, media, última, constancia, vuelta ideal).

## Estado actual

| | |
|---|---|
| Repo | `https://github.com/SrPirson/Box-Box` · rama `main` |
| Último commit | merge de `47507e2` Resultados publicados y nuevo panel de administración (05/10) con `a83db65` Box: gauges siempre pintados y sin «sin datos» por desfase de reloj (08/10). **Sin push**: lo del 05/10 no está desplegado |
| Despliegue | **https://boxracing.onrender.com** · servicio `boxracing` `srv-db02jqad0e5s739s56gg` (Frankfurt, free, autodeploy de `main`). La antigua https://cencerro-racing.onrender.com (servicio `cencerro` `srv-davb06flk1mc739c6vlg`) sigue activa con `REDIRECT_TO`: los navegadores van a la nueva y las APK antiguas (WebView, `; wv)`) la siguen cargando para actualizarse. **Borrarla cuando todos los móviles tengan la APK v9 o posterior.** `box-box` y `boxbox` en Render estaban cogidas |
| Base de datos | **Neon** `box-box` (Postgres 18, Frankfurt `eu-central-1`, gratis sin caducidad; creada desde la integración de Vercel). `DATABASE_URL` con `sslmode=verify-full`. Migrada desde Render el 02/10 con `server/migrate.js`. El Postgres de Render (`cencerro-racing-db`) caduca el 31/10/2026 y ya no se usa |
| APK | Release `apk` de GitHub, **versión 13** (`cencerro.apk`; v12 trajo Bluetooth clásico y pedir ubicación, v13 la ubicación por red y el aviso de GPS apagado; la siguiente conecta el Bluetooth clásico en un hilo propio, porque bloqueaba a todos los plugins y dejaba «Conectando…» y «Comprobando…» colgados). La compila `.github/workflows/android.yml` en cada cambio de `android/`, `capacitor.config.json` o `package.json`; firma fija con el secreto `ANDROID_KEYSTORE` (CN=Cencerro Racing), verificada con apksigner antes de publicar. La app avisa de versión nueva e instala encima |
| Tests | `npm test` → **24 en verde** (reloj del móvil desfasado, ELM327 sin «1» final, borradores y publicación, cupo, registro y resultados del evento, bandera recuperada tras reiniciar (`server/flags.test.js`), checklist del evento, administración y «Ver como», banderas, participar en eventos y tipos de vuelta, estadísticas por pista, sin OBD, ELM327, alertas, rumbo, cronometraje y tramos, migración, integración API + tiempo real: equipos, pistas, eventos, roles, perfil, boxes, anular vuelta) |

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
- **Local contra producción (Neon)**: `.env` en la raíz (ignorado por git) con `DATABASE_URL` (`sslmode=verify-full`),
  `AUTH_SECRET` y `PORT=3300`; arrancar con `npm run build && node --env-file=.env server/index.js`. Son los datos
  reales, y al arrancar se aplica el esquema (los `alter table` / `create table`) a producción.
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
- **Pista** (`track = { line?, path?, sectors?, id?, name? }`): la del equipo (pistas guardadas en `tracks`);
  participando en un evento (`teams.racing`), la del organizador (`events.track`), igual para todos.
- **Vueltas y tramos**: el servidor detecta el cruce de meta interpolando el instante; cortes de tramo →
  parciales en el orden en que se cruzan. Cada vuelta guarda `sectors`, `track_id` y `event_id`.
- **Telemetría y tiempos**: el OBD se lee en su propio bucle (un ciclo por Bluetooth clásico tardaba ~4-5 s
  y retrasaba todo el paquete); cada paquete lleva la última lectura con `obdTs` y `obdMs`. Los PIDs se piden con
  «1» final (`010C1`: vuelve con la primera ECU); si el clon dice «?», sin él. BOX no compara la hora del móvil con
  la suya: mide el desfase por coche con los paquetes en directo (`withSkew` en `limits.js`) y lo descuenta. Con
  dato viejo, los gauges se pintan igual pero atenuados y con «~».
- **Boxes**: «Salgo a box»/«Repostar» → viene de camino (alarmas normales); BOX confirma «Coche en boxes» →
  cuenta y se callan sin señal/batería/rpm/pista; termina a ≥ 40 km/h o con «Fin de boxes».
- **Eventos**: `events` (organizador, código, pista, cerrado, privado) y `teams.event_id`. Códigos de equipo y
  de evento únicos entre ambos; `/api/code/:code` dice cuál es. Clasificación en `/api/events/:id/standings`.
- **Eventos (ciclo de vida)**: nacen en `draft` (ni en la lista ni inscripciones); se publican con fecha y meta (lo
  exige el servidor). El estado (Borrador, Inscripción, Hoy, Terminado) se deriva en `src/lib/events.js`, igual que
  la checklist `readiness()`. `max_teams` limita la inscripción; `session_started_at` es el reloj de Race Control.
- **Registro del evento** (`event_log`): banderas, «visto» y cambios de sesión; llega en vivo (`event:log`) y al
  arrancar el servidor recupera la última bandera (no verde, del último día) con quién la ha visto.
- **Auditoría** (`audit_log`): roles, contraseñas, bajas, eventos, resultados y «Ver como». **«Ver como»**: token de
  30 min con `imp` (el admin), solo lectura (`handleApi` rechaza todo lo que no sea GET; por socket no emite ni cuenta
  como conectado); el cliente guarda el token del admin en `cencerro.admin` y vuelve a él al salir o al caducar.
- **Banderas**: `flags` en `live.js`, en memoria y en `event_log` (eventId → bandera + equipos que la han visto). El
  panel espera el acuse del servidor (`emitWithAck`) y nunca emite sin conexión. Se emite a la
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
- **Diseño** (16/10, «motorsport vivo»): cada sección tiene color e icono (tokens `--t-race`, `--t-track`, `--t-teams`,
  `--t-results`, `--t-live`, `--t-data`, `--t-danger` en `src/index.css`). En `src/views/ui.jsx`: `Page` con portada
  (icono, `hero`, pianos `.kerb`, `nav`), `Card` con `color`/`icon`/`subtitle`/`tip`, `Tabs`, `Tip` (ayuda «?»: ratón o
  toque), `Empty`, `IconChip`; `Field` pasa la ayuda larga (> 70 caracteres) a un `Tip`. Selectores con la opción en el
  acento. Sustituye al «90 % neutro» de `investigacion-ux-ui.md` en las vistas de gestión; Piloto mantiene el máximo
  contraste (botones con tinte de su color). Capturas sin navegador: Chrome sin ventana por CDP (script en la sesión).
  Tokens base en `src/index.css`, Barlow Condensed + JetBrains Mono. Logotipo e iconos generados del
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
| Eventos en borrador hasta publicarlos con fecha y meta | Que nadie se inscriba en un evento sin pista que cronometre |
| Preparar (espacio del evento) separado de correr (Race Control) | El día de carrera, nada destructivo a la vista y todo a un toque |
| Bandera roja manteniendo pulsado; banderas con acuse y sin envío sin conexión | Una roja por error o una bandera que llega tarde son peligrosas |
| Resultados como instantánea con enlace propio | El resultado no cambia con vueltas tardías y el código de inscripción no circula |
| «Ver como» solo lectura, con motivo y auditado | Soporte sin poder actuar en nombre de nadie |
| Pagos con Stripe (no Paddle) | Más barato (~3,6 % con Tax), cubre suscripción, pase por evento y Connect; el IVA OSS lo declara la gestoría |

## Pendiente / próximos pasos

**Próximo día — empezar por aquí:**

1. **Reiniciar el servidor local contra Neon** (lo dejé con el servidor de antes, a la espera de confirmación): aplica a
   producción solo cambios que añaden (columnas `draft`, `max_teams`, `session_started_at`, `public_code` en `events`;
   `last_seen_at` en `users`; tablas `event_log`, `event_results`, `audit_log`). Repasar en pantalla con datos reales
   todo lo del 05/10 y, si va bien, **push** (autodeploy a Render).
2. **Borrar en Render** (desde el panel; el MCP no permite borrar) el servicio antiguo `cencerro`
   (`srv-davb06flk1mc739c6vlg`) y el Postgres `cencerro-racing-db` (caduca el 31/10). Todos tienen la APK v9+.
3. **Repasar en pantalla lo hecho el 03/10** (nada se vio en el navegador, solo tests y build):
   banderas (pantalla completa en Piloto, franja, panel del organizador), «Participar en el evento» (Box, Equipo,
   Eventos, franja del día), sesión y clasificación por sesión del organizador, filtros de Estadísticas
   (tipo y pista) y perfil, Sin OBD (Piloto, Box, Estadísticas, Alertas) y la tarjeta Ubicación.
4. **Probar con varios móviles** el botón ✕ para salir de Piloto, la ubicación y las banderas. El OBD por
   Bluetooth clásico (KUULAA) **ya funciona en el coche** (08/10): conecta, y BOX pinta temperatura, RPM y batería.
   Si algún día vuelve el «~»/SIN DATOS, mirar `obdMs` en Ajustes del móvil (lo que tarda un ciclo de PIDs).
5. **Antes de vender** (ver `plan-negocio-y-escalado.md`): dominio propio y APK nueva que apunte a él (hoy lleva fija
   `boxracing.onrender.com`), Render de pago (el gratis se duerme), límite de intentos de login, privacidad/RGPD y
   condiciones (las banderas de la app no sustituyen a los comisarios).
6. **Pagos con Stripe** (Parte B del plan, ~11 días; Connect para inscripciones, ~5,5 más).

**Después:**

7. **Gestión de stints y combustible** (tiempo al volante por piloto, consumo, ventana de boxes) y tiempos
   en la vista Piloto (última vuelta y delta).
8. **Media de vuelta representativa** (excluir vueltas > 107 % de la mejor o usar la mediana): pendiente de decidir.
9. **Persistir** el historial de mensajes de BOX (las banderas ya se guardan en `event_log`).
10. Escalado (Parte 4 del plan): `INSERT` de muestras por lotes, retención/particionado de `samples`, CI con tests antes
   del deploy, backups; después, varias instancias con Valkey.
11. Probar en un móvil real: pantalla apagada (batería «Sin restricciones» en Xiaomi/Samsung) y brújula en el soporte.
12. Opcional: ELM327 WiFi, que el organizador pueda poner a todos los equipos a participar, versión en inglés,
    dividir el bundle (aviso de Vite) y actualizar las acciones de GitHub a v5.

## Requisitos de pista (no olvidar)

- **HTTPS** obligatorio en el móvil (Bluetooth, GPS, Wake Lock). Render lo da hecho.
- En la APK: ubicación «Permitir mientras se usa la app» y batería sin restricciones para la pantalla apagada.
- Web Bluetooth solo en **Chrome Android**; en la APK, Bluetooth nativo. iOS no está soportado.
- `tel:` abre el marcador, pero el piloto tiene que pulsar llamar.
- Render free se duerme tras 15 min: los días de carrera, un ping cada 10 min (cron-job.org) o plan Starter.
- Antes de un evento, que todo el equipo use la dirección nueva y la APK v9+ (el estado en vivo es por servicio).
