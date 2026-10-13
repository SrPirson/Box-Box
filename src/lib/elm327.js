import { Capacitor, registerPlugin } from '@capacitor/core';
import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';

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
// reinitMs: sin RPM durante ese tiempo, se reinicia el chip (y se reintenta cada tanto mientras siga sin RPM).
// onLost: el enlace está muerto aunque el transporte no lo haya dicho (escritura fallida o el chip mudo); desde
// entonces el driver no manda nada más.
export function createElm(transport, timeoutMs = 1500, reinitMs = 10000, onLost = () => {}) {
  let buffer = '';
  let pending = null;
  let late = false; // el último comando expiró: su '>' puede llegar todavía
  let silent = 0; // timeouts seguidos sin ningún '>': con el chip vivo nunca pasa (hasta sin ECU contesta)
  let dead = false;
  let chain = Promise.resolve();
  const lose = () => {
    if (dead) return;
    dead = true;
    if (pending) { const p = pending; pending = null; p(''); }
    onLost();
  };

  transport.onData((chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('>')) >= 0) {
      silent = 0;
      const out = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      // Sin comando pendiente = respuesta tardía de un comando que ya expiró: se descarta.
      if (pending) { const p = pending; pending = null; p(out); } else late = false;
    }
  });

  // Espera al próximo '>' (o a su timeout, y entonces queda uno tardío en camino).
  const wait = (ms) => new Promise((resolve) => {
    const t = setTimeout(() => {
      pending = null; buffer = ''; late = true; resolve('');
      if (++silent >= 4) lose();
    }, ms);
    pending = (r) => { clearTimeout(t); resolve(r); };
  });

  // Serializa comandos: cada uno espera al '>' del anterior (o a su timeout).
  // Si el anterior expiró, antes de mandar otro se espera (y descarta) su respuesta tardía: si no, se le
  // asignaría a este y desde ahí cada comando recibiría la del anterior para siempre (y RPM siempre null).
  // Además así no se interrumpe al chip a medias (un "BUS INIT" lento acabaría en "STOPPED").
  const send = (cmd, ms = timeoutMs) =>
    (chain = chain.then(async () => {
      if (dead) return '';
      if (late) { await wait(ms); late = false; }
      if (dead) return '';
      const r = wait(ms);
      Promise.resolve().then(() => transport.send(cmd + '\r')).catch(lose); // escritura fallida = enlace caído
      return r;
    }));

  let voltageViaAtrv = false;
  // "010C1": el 1 final le dice al chip que vuelva en cuanto conteste una ECU, en vez de esperar su timeout
  // por si contestan más (en CAN, ~5 veces más rápido por PID). Los clones que no lo entienden dicen "?":
  // entonces se pide sin él.
  let single = true;
  const ask = async (pid) => {
    if (single) {
      const r = await send(pid + '1');
      if (!r.includes('?')) return r;
      single = false;
    }
    return send(pid);
  };
  let rpmAt = Date.now(); // última vez que la ECU dio RPM (o que se reinició el chip)
  return {
    async init() {
      for (const cmd of INIT) await send(cmd, cmd === 'ATZ' ? 2 * timeoutMs : timeoutMs); // ATZ tarda ~1 s
      // Primera consulta con margen: con ATSP0 la búsqueda de protocolo puede tardar varios segundos.
      await send('0100', 8000);
    },
    // Lee todos los PIDs; devuelve { rpm, coolant, throttle, voltage } (null en los que fallen).
    // Con el contacto quitado (repostaje, cambio de piloto) la ECU no contesta: si falla el primero, no se
    // esperan los demás (serían varios segundos de timeouts); solo la tensión, que la mide el propio adaptador.
    async read() {
      const out = {};
      for (const [pid, { key }] of Object.entries(PIDS)) {
        if (key !== 'rpm' && key !== 'voltage' && out.rpm == null) continue;
        if (key === 'voltage' && voltageViaAtrv) { out.voltage = parseAtrv(await send('ATRV')); continue; }
        out[key] = parsePid(pid, await ask(pid));
        if (key === 'voltage' && out.voltage == null) { voltageViaAtrv = true; out.voltage = parseAtrv(await send('ATRV')); }
      }
      // Sin RPM un rato: el chip puede haberse quedado colgado con la ECU (apagón momentáneo, se reinició y perdió
      // la configuración...). Se reinicia; con el contacto quitado es inocuo y solo se repite cada reinitMs.
      if (out.rpm != null) rpmAt = Date.now();
      else if (Date.now() - rpmAt > reinitMs) {
        await this.init();
        rpmAt = Date.now();
      }
      return out;
    },
    // Retira el driver (enlace perdido): no vuelve a escribir, ni en la conexión nueva.
    close() { dead = true; },
  };
}

// Mantiene el OBD enlazado: si el adaptador se cae (coche apagado al repostar, fuera de alcance, enlace mudo),
// reconecta solo cada retryMs mientras active(), tantas veces como haga falta y nunca dos intentos a la vez.
// connect(onLost) abre el transporte; cada conexión nueva hace la inicialización completa del chip.
// Devuelve { ready: primera conexión (falla si no conecta), read() }. onChange(true|false): enlazado o no.
export function keepLinked(connect, { active = () => true, onChange = () => {}, retryMs = 3000, timeoutMs, reinitMs } = {}) {
  let elm = null;
  let linking = false;
  let up = false; // si la primera conexión falla, lo dice ready y no se reintenta por detrás
  const retry = () => {
    if (!up || !active() || elm || linking) return;
    link().catch(() => setTimeout(retry, retryMs));
  };
  const link = async () => {
    linking = true;
    const me = {}; // este enlace: el aviso de uno viejo no tumba al nuevo
    const lost = () => {
      if (me.dead) return;
      me.dead = true;
      me.elm?.close();
      Promise.resolve().then(() => me.t?.close?.()).catch(() => {}); // libera el enlace zombi antes de reconectar
      if (elm && elm === me.elm) { elm = null; onChange(false); }
      setTimeout(retry, retryMs);
    };
    try {
      me.t = await connect(lost);
      if (me.dead) { Promise.resolve().then(() => me.t.close?.()).catch(() => {}); throw new Error('Adaptador perdido al conectar'); }
      me.elm = createElm(me.t, timeoutMs, reinitMs, lost);
      await me.elm.init();
      if (me.dead) throw new Error('Adaptador perdido al iniciar');
      elm = me.elm;
      up = true;
      onChange(true);
    } finally {
      linking = false;
    }
  };
  return { ready: link(), read: async () => (elm ? elm.read() : {}) };
}

// Transporte BLE: adaptadores BLE 4.0 (el clásico va por connectClassic, más abajo).
// Los clones ELM327 BLE usan uno de estos servicios "UART"; las características se detectan por propiedades.
const BLE_SERVICES = [0xfff0, 0xffe0, 0x18f0, 'e7810a71-73ae-499d-8c15-faa9aef0c3f2'];

// Abre el canal serie BLE del adaptador. Con `device` (el de una conexión anterior) reconecta sin volver a
// preguntar cuál. En Chrome usa Web Bluetooth; en la app Android, el Bluetooth nativo (el WebView no lo trae).
export const connectBle = (onDisconnect, device) =>
  (Capacitor.isNativePlatform() ? connectNative : connectWeb)(onDisconnect, device);

async function connectNative(onDisconnect, device) {
  const ids = BLE_SERVICES.map((s) => (typeof s === 'number' ? numberToUUID(s) : s));
  await BleClient.initialize(); // pide los permisos de Bluetooth si aún no se dieron al abrir la app
  device ??= await BleClient.requestDevice({ optionalServices: ids }); // selector nativo con los dispositivos cerca
  const id = device.deviceId;
  await BleClient.connect(id, () => onDisconnect());
  let rx, tx;
  // Solo los servicios UART conocidos: los genéricos (1800/1801) también tienen características "indicate".
  for (const svc of (await BleClient.getServices(id)).filter((s) => ids.includes(s.uuid.toLowerCase()))) {
    for (const ch of svc.characteristics) {
      if (!rx && (ch.properties.notify || ch.properties.indicate)) rx = [svc.uuid, ch.uuid];
      if (!tx && (ch.properties.write || ch.properties.writeWithoutResponse)) tx = [svc.uuid, ch.uuid, ch.properties.writeWithoutResponse];
    }
    if (rx && tx) break;
  }
  if (!rx || !tx) { await BleClient.disconnect(id).catch(() => {}); throw new Error('El adaptador no expone un canal serie BLE compatible'); }
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let listener = () => {};
  await BleClient.startNotifications(id, rx[0], rx[1], (v) => listener(dec.decode(v)));
  return {
    device,
    send: (s) => {
      const v = new DataView(enc.encode(s).buffer);
      return tx[2] ? BleClient.writeWithoutResponse(id, tx[0], tx[1], v) : BleClient.write(id, tx[0], tx[1], v);
    },
    onData: (cb) => { listener = cb; },
    close: () => BleClient.disconnect(id),
  };
}

async function connectWeb(onDisconnect, device) {
  if (!navigator.bluetooth) throw new Error('Este navegador no tiene Bluetooth: usa Chrome en Android o la app.');
  device ??= await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: 'OBD' }, { namePrefix: 'KUULAA' }, { namePrefix: 'V-LINK' }, { namePrefix: 'IOS-Vlink' }, { services: [0xfff0] }, { services: [0xffe0] }],
    optionalServices: BLE_SERVICES,
  });
  device.ongattserverdisconnected = onDisconnect; // propiedad, no listener: al reconectar no se acumulan
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
    close: () => device.gatt.disconnect(),
  };
}

// Transporte Bluetooth clásico (SPP, los ELM327 que piden PIN 1234): solo en la app Android, con el plugin
// ClassicBt (APK v12+). El adaptador se empareja antes en Android; aquí se elige de la lista de emparejados.
const ClassicBt = registerPlugin('ClassicBt');
const needsUpdate = (e) => (e?.code === 'UNIMPLEMENTED' ? new Error('Actualiza la app (Ajustes → App Android) para usar Bluetooth clásico.') : e);
export const pairedClassic = () => ClassicBt.paired().then((r) => r.devices, (e) => { throw needsUpdate(e); });

export async function connectClassic(onDisconnect, address) {
  if (!Capacitor.isNativePlatform()) throw new Error('El Bluetooth clásico solo funciona en la app Android.');
  if (!address) throw new Error('Elige el adaptador en Ajustes → Sensor OBD2.');
  let listener = () => {};
  await ClassicBt.removeAllListeners();
  await ClassicBt.addListener('data', (d) => listener(d.value));
  await ClassicBt.addListener('disconnected', () => onDisconnect());
  await ClassicBt.connect({ address }).catch((e) => { throw needsUpdate(e); });
  return { device: address, send: (s) => ClassicBt.write({ value: s }), onData: (cb) => { listener = cb; }, close: () => ClassicBt.disconnect() };
}
