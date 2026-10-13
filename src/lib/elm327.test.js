import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePid, parseAtrv, createElm } from './elm327.js';

test('decodifica PIDs con y sin espacios, SEARCHING y errores', () => {
  assert.equal(parsePid('010C', '41 0C 1A F8'), 1726);          // (0x1A*256+0xF8)/4
  assert.equal(parsePid('010C', 'SEARCHING...\r410C1AF8\r'), 1726);
  assert.equal(parsePid('0105', '41057B'), 83);                 // 0x7B-40
  assert.equal(parsePid('0111', '4111FF'), 100);
  assert.equal(parsePid('0142', '41 42 31 1C'), 12.572);
  assert.equal(parsePid('0105', 'NO DATA'), null);
  assert.equal(parsePid('010C', '410C1A'), null);               // respuesta truncada
  assert.equal(parseAtrv('12.6V'), 12.6);
  assert.equal(parseAtrv('?'), null);
});

test('driver serializa comandos, cae a ATRV y descarta respuestas tardías', async () => {
  const replies = { ATRV: '13.9V', '010C1': '410C0FA0', '01051': '41055A', '01111': '411133', '01421': 'NO DATA' };
  let emit;
  const sent = [];
  const elm = createElm({
    send: (s) => { const c = s.trim(); sent.push(c); setTimeout(() => emit((replies[c] ?? 'OK') + '\r\r>'), 1); },
    onData: (cb) => (emit = cb),
  }, 50);
  await elm.init();
  assert.deepEqual(await elm.read(), { rpm: 1000, coolant: 50, throttle: 20, voltage: 13.9 });
  assert.equal(sent.filter((c) => c === '01421').length, 1);
  await elm.read();
  assert.equal(sent.filter((c) => c === '01421').length, 1);    // ya no reintenta 0142
});

test('con el contacto quitado no espera a cada PID: solo RPM y la tensión del adaptador', async () => {
  let emit;
  const sent = [];
  const elm = createElm({
    send: (s) => { const c = s.trim(); sent.push(c); setTimeout(() => emit((c === 'ATRV' ? '12.4V' : 'UNABLE TO CONNECT') + '\r\r>'), 1); },
    onData: (cb) => (emit = cb),
  }, 50);
  assert.deepEqual(await elm.read(), { rpm: null, voltage: 12.4 });
  assert.deepEqual(sent, ['010C1', '01421', 'ATRV']);
});

test('si el clon no entiende el número de respuestas ("010C1" → "?"), pide sin él', async () => {
  const replies = { '010C': '410C0FA0', '0105': '41055A', '0111': '411133', '0142': '41423174' };
  let emit;
  const sent = [];
  const elm = createElm({
    send: (s) => { const c = s.trim(); sent.push(c); setTimeout(() => emit((replies[c] ?? '?') + '\r\r>'), 1); },
    onData: (cb) => (emit = cb),
  }, 50);
  assert.deepEqual(await elm.read(), { rpm: 1000, coolant: 50, throttle: 20, voltage: 12.66 });
  assert.deepEqual(sent, ['010C1', '010C', '0105', '0111', '0142']);
});

// Adaptador falso que, como el chip real, atiende los comandos de uno en uno. slow(cmd, n) es lo que tarda el
// n-ésimo envío de cmd (1 ms por defecto); reply(cmd), la respuesta.
function fakeElm(reply, slow = () => 1) {
  let emit;
  let busy = Promise.resolve();
  const sent = [];
  const transport = {
    send: (s) => {
      const c = s.trim();
      const n = sent.filter((x) => x === c).length;
      sent.push(c);
      busy = busy.then(() => new Promise((r) => setTimeout(r, slow(c, n)))).then(() => emit(reply(c) + '\r\r>'));
    },
    onData: (cb) => (emit = cb),
  };
  return { transport, sent };
}

test('una respuesta tardía tras un timeout no se queda asignada al comando siguiente', async () => {
  const replies = { ATRV: '13.9V', '010C1': '410C0FA0', '01051': '41055A', '01111': '411133', '01421': 'NO DATA' };
  // El primer 010C1 (ECU lenta un momento) tarda más que el timeout.
  const { transport } = fakeElm((c) => replies[c] ?? 'OK', (c, n) => (c === '010C1' && n === 0 ? 80 : 1));
  const elm = createElm(transport, 50);
  await elm.init();
  await elm.read();
  let last;
  for (let i = 0; i < 4; i++) last = await elm.read(); // seguidas: con un ELM lento el bucle OBD no descansa
  assert.deepEqual(last, { rpm: 1000, coolant: 50, throttle: 20, voltage: 13.9 });
});

test('si la ECU deja de dar RPM, reinicia el chip cada cierto tiempo hasta que vuelve', async () => {
  let ecu = true;
  const { transport, sent } = fakeElm((c) =>
    c === 'ATRV' ? '12.4V' : c.startsWith('AT') ? 'OK' : !ecu ? 'UNABLE TO CONNECT' : c === '010C1' ? '410C0FA0' : 'NO DATA');
  const elm = createElm(transport, 50, 30);
  await elm.init();
  assert.equal((await elm.read()).rpm, 1000);
  ecu = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 100) assert.deepEqual(await elm.read(), { rpm: null, voltage: 12.4 });
  assert.ok(sent.filter((c) => c === 'ATZ').length >= 3); // la inicial y al menos dos reintentos
  ecu = true;
  assert.equal((await elm.read()).rpm, 1000);
});
