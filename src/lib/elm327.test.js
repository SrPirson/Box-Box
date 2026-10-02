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
  const replies = { ATRV: '13.9V', '010C': '410C0FA0', '0105': '41055A', '0111': '411133', '0142': 'NO DATA' };
  let emit;
  const sent = [];
  const elm = createElm({
    send: (s) => { const c = s.trim(); sent.push(c); setTimeout(() => emit((replies[c] ?? 'OK') + '\r\r>'), 1); },
    onData: (cb) => (emit = cb),
  }, 50);
  await elm.init();
  assert.deepEqual(await elm.read(), { rpm: 1000, coolant: 50, throttle: 20, voltage: 13.9 });
  assert.equal(sent.filter((c) => c === '0142').length, 1);
  await elm.read();
  assert.equal(sent.filter((c) => c === '0142').length, 1);     // ya no reintenta 0142
});

test('con el contacto quitado no espera a cada PID: solo RPM y la tensión del adaptador', async () => {
  let emit;
  const sent = [];
  const elm = createElm({
    send: (s) => { const c = s.trim(); sent.push(c); setTimeout(() => emit((c === 'ATRV' ? '12.4V' : 'UNABLE TO CONNECT') + '\r\r>'), 1); },
    onData: (cb) => (emit = cb),
  }, 50);
  assert.deepEqual(await elm.read(), { rpm: null, voltage: 12.4 });
  assert.deepEqual(sent, ['010C', '0142', 'ATRV']);
});
