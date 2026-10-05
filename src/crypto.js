'use strict';
const crypto = require('crypto');
const { promisify } = require('util');
const config = require('./config');

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLen: 64, maxmem: 128 * 1024 * 1024 };

// ---------- passwords (scrypt, per-password random salt, constant-time compare) ----------
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, SCRYPT.keyLen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [alg, N, r, p, saltB64, hashB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem,
  });
  return crypto.timingSafeEqual(actual, expected);
}

// Used so "unknown email" costs the same as "wrong password" (no timing oracle).
let dummyHash;
async function burnPasswordCheck(password) {
  dummyHash ||= await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummyHash).catch(() => {});
}

// ---------- tokens ----------
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const safeEqual = (a, b) => {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

// ---------- encryption at rest (AES-256-GCM) for TOTP secrets ----------
const encKey = crypto.hkdfSync('sha256', config.secret, 'invoice-app', 'totp-secret-encryption', 32);
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(encKey), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob) {
  const [iv, tag, ct] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(encKey), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

// ---------- TOTP (RFC 6238, SHA-1, 6 digits, 30s) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
function base32Decode(str) {
  let bits = '';
  for (const ch of str.replace(/=+$/, '')) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
const newTotpSecret = () => base32Encode(crypto.randomBytes(20));
function totpAt(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}
/** Returns the matching time-step (for replay protection) or null. Accepts ±1 step of clock drift. */
function verifyTotp(secret, code, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30000);
  for (const s of [step, step - 1, step + 1]) {
    if (safeEqual(totpAt(secret, s), code)) return s;
  }
  return null;
}
const otpauthUrl = (secret, email) =>
  `otpauth://totp/Invoicely:${encodeURIComponent(email)}?secret=${secret}&issuer=Invoicely&algorithm=SHA1&digits=6&period=30`;

function newRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => {
    const r = crypto.randomBytes(5).toString('hex');
    return `${r.slice(0, 5)}-${r.slice(5)}`;
  });
}

module.exports = {
  hashPassword, verifyPassword, burnPasswordCheck, randomToken, sha256, safeEqual,
  encrypt, decrypt, newTotpSecret, verifyTotp, totpAt, otpauthUrl, newRecoveryCodes,
};
