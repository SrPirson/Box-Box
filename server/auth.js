// Contraseñas con scrypt y tokens firmados con HMAC (sin dependencias).
import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

const scryptP = promisify(scrypt);
const SECRET = process.env.AUTH_SECRET;
if (!SECRET && (process.env.RENDER || process.env.NODE_ENV === 'production')) throw new Error('Falta AUTH_SECRET');
const KEY = SECRET || 'solo-desarrollo-local';
const TOKEN_DAYS = 30;

export async function hashPassword(pass) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await scryptP(pass, salt, 64)).toString('hex')}`;
}
export async function checkPassword(pass, stored) {
  const [salt, hash] = stored.split(':');
  const got = await scryptP(pass, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(got, Buffer.from(hash, 'hex'));
}

const mac = (body) => createHmac('sha256', KEY).update(body).digest();
// pv = sal de la contraseña: al cambiarla, todos los tokens anteriores dejan de valer.
export function sign(user) {
  const body = Buffer.from(JSON.stringify({ uid: user.id, pv: user.pass.slice(0, 8), exp: Date.now() + TOKEN_DAYS * 864e5 })).toString('base64url');
  return `${body}.${mac(body).toString('base64url')}`;
}
export function verify(token) {
  const [body, sig] = String(token ?? '').split('.');
  if (!body || !sig) return null;
  const got = Buffer.from(sig, 'base64url');
  const want = mac(body);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp > Date.now() ? p : null;
}

export const randomCode = (n = 6) => {
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I: se dictan por radio
  return Array.from(randomBytes(n), (b) => ABC[b % ABC.length]).join('');
};
export const tempPassword = () => randomBytes(9).toString('base64url');
