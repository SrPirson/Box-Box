# Contexto del proyecto · por dónde vamos

> Última actualización: 2026-10-01. Léelo antes de retomar. El historial día a día está en [`daily/`](daily/).

## Qué es

**Cencerro Racing Comms & Telemetry**: PWA para equipos de carreras. Une el móvil del coche (lector OBD2
ELM327 + GPS) con el portátil del muro de BOX, por WebSocket y con baja latencia.

- **Piloto** (móvil en el salpicadero): 6 botones grandes para usar con guantes. Los mensajes de BOX
  salen a pantalla completa, se leen en voz alta (TTS) y se responden con OK, NO o PROBLEMA. El único
  ajuste visible es el tema claro u oscuro.
- **Box** (portátil): vueltas en vivo, equipo conectado, alarmas por niveles, gauges con la media de
  30 días, mapa con 5 plantillas y línea de meta, y mensajería con acuse de recibo.
- **Estadísticas**: tiempos por vuelta comparados con la media, comparativa entre pilotos y medias de
  telemetría.
- **Equipo**: invitación, miembros, dorsal, teléfono del mecánico y alertas del coche.
- **Ajustes**: sensor (simulador o ELM327 BLE), simulador de fallos, tema y cuenta.
- **Admin**: cuentas y equipos de toda la plataforma.

## Estado actual

| | |
|---|---|
| Repo | `https://github.com/SrPirson/Box-Box` · rama `main` |
| Último commit | `f7d15bd` Cuentas, equipos con invitación, administración y estadísticas de vueltas |
| Despliegue | https://cencerro-racing.onrender.com · servicio `srv-davb06flk1mc739c6vlg` (Frankfurt, free). Creado a mano con el conector, no ligado al Blueprint |
| Base de datos | **Postgres de Render** `cencerro-racing-db` (free, **caduca el 31/10/2026**: pasar a plan de pago antes) |
| Tests | `npm test` → 8 en verde (ELM327, alertas, cronometraje, integración API + tiempo real) |

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
- **Vueltas**: las detecta el servidor cuando la traza GPS cruza la línea de meta, interpolando el
  instante del cruce. Ignora cruces separados por menos de 20 s, que son ruido del GPS.
- **Alertas**: los umbrales son por equipo y viajan en cada paquete. Avisos en ámbar con un tono; críticos
  con banner y pitido cada 5 s hasta que alguien los reconoce.
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

## Pendiente / próximos pasos

1. **Base de datos antes del 31/10/2026**: pasar `cencerro-racing-db` a `basic_256mb` o se borra.
2. **Media de vuelta representativa**: hoy la media incluye vueltas de relevo y de boxes, que la
   distorsionan (en la prueba subió de 30 s a 46 s). Propuesta: excluir las vueltas de más del 107 % de
   la mejor, o usar la mediana. **Pendiente de decidir con el usuario.**
3. **Limitar intentos de login** antes de abrir la app a más equipos.
4. **Persistir el historial de mensajes** de BOX en la base de datos; hoy se pierde al recargar.
5. **Probar con hardware real**: KUULAA ELM327 v2.2. Si es Bluetooth clásico (PIN 1234), Web
   Bluetooth no lo ve y hará falta Capacitor con un plugin Bluetooth Serial (`createElm()` ya acepta otro
   transporte).
6. Opcional: dividir el bundle (unos 550 kB; aviso de Vite) y, si el equipo factura, cuenta gratuita de
   ArcGIS para el mapa de Esri.

## Requisitos de pista (no olvidar)

- **HTTPS** obligatorio en el móvil (Bluetooth, GPS, Wake Lock). Render lo da hecho.
- Web Bluetooth funciona en **Chrome Android**, no en iOS.
- `tel:` abre el marcador, pero el piloto tiene que pulsar llamar.
- La voz (TTS) y el pitido de BOX necesitan una primera pulsación en la página.
- Render free se duerme tras 15 min: los días de carrera, plan **Starter**.
