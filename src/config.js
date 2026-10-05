'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Minimal .env loader (no dependency). Existing env vars win.
try {
  const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env */ }

const isProd = process.env.NODE_ENV === 'production';
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

function loadSecret() {
  if (process.env.APP_SECRET && process.env.APP_SECRET.length >= 32) return process.env.APP_SECRET;
  if (process.env.APP_SECRET) throw new Error('APP_SECRET must be at least 32 characters');
  const file = path.join(dataDir, '.app_secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const s = crypto.randomBytes(48).toString('base64url');
    fs.writeFileSync(file, s, { mode: 0o600 });
    return s;
  }
}

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 3001,
  dataDir,
  dbFile: process.env.DB_FILE || path.join(dataDir, 'app.db'),
  secret: loadSecret(),
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  // Cookie `Secure` flag: on in production unless explicitly disabled (e.g. plain-HTTP LAN testing).
  secureCookies: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === '1' : isProd,
  sessionIdleMs: 7 * 24 * 3600 * 1000,
  sessionAbsoluteMs: 30 * 24 * 3600 * 1000,
};
