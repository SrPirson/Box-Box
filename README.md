# Cencerro Racing Comms & Telemetry

PWA única: vista **PILOTO** (móvil en el salpicadero), **BOX** (portátil) y **CONFIG** (ajustes + simulador OBD2).

```bash
npm install
npm start          # compila y sirve app + Socket.io en http://0.0.0.0:3300
npm run dev        # desarrollo (Vite con proxy a `npm run server`)
npm test           # parser PIDs ELM327 + driver
```

## Estructura

| Archivo | Qué hace |
|---|---|
| `server/index.js` | Sirve `dist/` y reenvía eventos por canal (sala Socket.io), solo WebSocket |
| `src/lib/elm327.js` | Init AT, decodificación de PIDs (comentada), driver serializado por `>`, transporte BLE |
| `src/lib/gateway.js` | Bucle OBD/sim + GPS + batería + red → paquete JSON; cola offline con ráfaga al reconectar |
| `src/lib/store.js` | Config por dispositivo (localStorage), socket compartido, TTS |
| `src/views/*.jsx` | Piloto, Box, Config |

Eventos: `telemetry`, `telemetry:batch`, `pilot` (botones del piloto), `msg` (BOX→coche), `ack` (respuesta).

## En pista: requisitos reales

- **HTTPS obligatorio** en el móvil: Web Bluetooth, GPS y Wake Lock solo funcionan en contexto seguro. Pon el servidor detrás de un proxy con TLS (Caddy, Cloudflare Tunnel…).
- **Bluetooth clásico vs BLE**: Web Bluetooth solo habla **BLE**. Muchos KUULAA ELM327 v2.2 son Bluetooth *clásico* (SPP, PIN 1234) y **no aparecerán** en el selector. Opciones: comprar la versión BLE 4.0, o empaquetar con Capacitor + un plugin Bluetooth Serial y pasar a `createElm()` un objeto `{ send(str), onData(cb) }`; el resto del código no cambia.
- **Web Bluetooth**: Chrome Android sí; iOS Safari no.
- **Llamada GSM**: `tel:` abre el marcador con el número; el piloto tiene que pulsar llamar (ningún navegador marca solo).
- **Voz**: el navegador exige una pulsación previa para el TTS (basta con tocar OBD al arrancar). En BOX, el pitido de alarma necesita un clic en la página.
- **PID 0142** no existe en muchos coches anteriores a ~2008: el driver cae automáticamente a `ATRV` (tensión en el pin 16).
