// Driver ELM327 (KUULAA v2.2 y clones).
//
// Cómo habla el chip:
//  - Recibe comandos ASCII terminados en '\r'. Los "AT ..." configuran el propio chip;
//    los hexadecimales ("010C") son peticiones OBD2: modo 01 (datos en vivo) + PID.
//  - Responde con texto y termina SIEMPRE con el prompt '>' cuando está listo para otro comando.
//    Por eso los comandos se serializan: nunca se envía el siguiente antes de ver '>'.
//  - La respuesta a "01XX" empieza por "41 XX" (0x40 + modo = respuesta positiva, eco del PID)
//    seguida de los bytes de datos A, B, ... Ej.: "010C" → "41 0C 1A F8" → A=0x1A, B=0xF8.
//  - Respuestas de error: "NO DATA" (la ECU no soporta el PID o no contestó), "?" (comando no
//    entendido), "SEARCHING..." (buscando protocolo tras ATSP0), "UNABLE TO CONNECT" (contacto
//    quitado / ECU dormida), "STOPPED" (se interrumpió el comando), "CAN ERROR".

// Secuencia de inicialización.
export const INIT = [
  'ATZ',   // Reset completo del chip (responde "ELM327 v2.2"). Tarda ~1 s.
  'ATE0',  // Echo off: el chip deja de repetir el comando en la respuesta.
  'ATL0',  // Linefeeds off: solo '\r' como separador.
  'ATS0',  // Spaces off: "410C1AF8" en lugar de "41 0C 1A F8" (menos bytes por BLE).
  'ATH0',  // Headers off: no incluir la dirección CAN de la ECU en la respuesta.
  'ATSP0', // Protocolo automático: el chip prueba CAN, KWP, ISO9141... en el primer PID.
];

// PIDs consultados en cada ciclo y su fórmula SAE J1979.
export const PIDS = {
  '010C': { key: 'rpm', bytes: 2, decode: (a, b) => (a * 256 + b) / 4 },         // RPM = (256A+B)/4
  '0105': { key: 'coolant', bytes: 1, decode: (a) => a - 40 },                   // °C = A-40 (offset para negativos)
  '0111': { key: 'throttle', bytes: 1, decode: (a) => Math.round((a * 100) / 255) }, // % = A·100/255
  '0142': { key: 'voltage', bytes: 2, decode: (a, b) => (a * 256 + b) / 1000 },  // V = (256A+B)/1000 (tensión módulo de control)
};

// Extrae el valor de un PID de la respuesta cruda. Devuelve null si no hay dato válido.
export function parsePid(pid, raw) {
  const def = PIDS[pid];
  // Quita espacios, prompt y "SEARCHING..." y busca "41"+PID; tolera respuestas multi-ECU.
  const hex = raw.toUpperCase().replace(/SEARCHING\.\.\.|[\s>]/g, '');
  const at = hex.indexOf('41' + pid.slice(2));
  if (at < 0) return null;
  const data = hex.slice(at + 4, at + 4 + def.bytes * 2);
  if (data.length < def.bytes * 2 || /[^0-9A-F]/.test(data)) return null;
  const bytes = data.match(/../g).map((h) => parseInt(h, 16));
  return def.decode(...bytes);
}

// "ATRV" lee la tensión en el pin 16 del conector OBD (batería directa). Respuesta: "12.6V".
// Se usa como respaldo porque muchos coches anteriores a ~2008 no soportan el PID 0142.
export function parseAtrv(raw) {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*V/i);
  return m ? parseFloat(m[1]) : null;
}

// Crea un driver sobre cualquier transporte de bytes: { send(str), onData(cb) }.
// BLE abajo; un plugin Bluetooth Serial de Capacitor encaja con la misma forma.
export function createElm(transport, timeoutMs = 1500) {
  let buffer = '';
  let pending = null;
  let chain = Promise.resolve();

  transport.onData((chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('>')) >= 0) {
      const out = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      // Sin comando pendiente = respuesta tardía de un comando que ya expiró: se descarta.
      if (pending) { const p = pending; pending = null; p(out); }
    }
  });

  // Serializa comandos: cada uno espera al '>' del anterior (o a su timeout).
  const send = (cmd, ms = timeoutMs) =>
    (chain = chain.then(
      () =>
        new Promise((resolve) => {
          const t = setTimeout(() => { pending = null; buffer = ''; resolve(''); }, ms);
          pending = (r) => { clearTimeout(t); resolve(r); };
          transport.send(cmd + '\r');
        }),
    ));

  let voltageViaAtrv = false;
  return {
    async init() {
      for (const cmd of INIT) await send(cmd, cmd === 'ATZ' ? 3000 : timeoutMs);
      // Primera consulta con margen: con ATSP0 la búsqueda de protocolo puede tardar varios segundos.
      await send('0100', 8000);
    },
    // Lee todos los PIDs; devuelve { rpm, coolant, throttle, voltage } (null en los que fallen).
    async read() {
      const out = {};
      for (const [pid, { key }] of Object.entries(PIDS)) {
        if (key === 'voltage' && voltageViaAtrv) { out.voltage = parseAtrv(await send('ATRV')); continue; }
        out[key] = parsePid(pid, await send(pid));
        if (key === 'voltage' && out.voltage == null) { voltageViaAtrv = true; out.voltage = parseAtrv(await send('ATRV')); }
      }
      return out;
    },
  };
}

// Transporte Web Bluetooth (BLE). Solo funciona con adaptadores BLE 4.0; ver README para Bluetooth clásico.
// Los clones ELM327 BLE usan uno de estos servicios "UART"; las características se detectan por propiedades.
const BLE_SERVICES = [0xfff0, 0xffe0, 0x18f0, 'e7810a71-73ae-499d-8c15-faa9aef0c3f2'];

export async function connectBle(onDisconnect) {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: 'OBD' }, { namePrefix: 'KUULAA' }, { namePrefix: 'V-LINK' }, { namePrefix: 'IOS-Vlink' }, { services: [0xfff0] }, { services: [0xffe0] }],
    optionalServices: BLE_SERVICES,
  });
  device.addEventListener('gattserverdisconnected', onDisconnect);
  const server = await device.gatt.connect();
  let rx, tx;
  for (const svc of await server.getPrimaryServices()) {
    for (const ch of await svc.getCharacteristics()) {
      if (!rx && (ch.properties.notify || ch.properties.indicate)) rx = ch;
      if (!tx && (ch.properties.write || ch.properties.writeWithoutResponse)) tx = ch;
    }
    if (rx && tx) break;
  }
  if (!rx || !tx) throw new Error('El adaptador no expone un canal serie BLE compatible');
  await rx.startNotifications();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  return {
    device,
    send: (s) => (tx.properties.writeWithoutResponse ? tx.writeValueWithoutResponse(enc.encode(s)) : tx.writeValue(enc.encode(s))),
    onData: (cb) => rx.addEventListener('characteristicvaluechanged', (e) => cb(dec.decode(e.target.value))),
  };
}
