'use strict';
const db = require('./db');
const config = require('./config');
const { randomToken, sha256, safeEqual } = require('./crypto');
const { HttpError } = require('./http');

const COOKIE = config.secureCookies ? '__Host-sid' : 'sid';

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

const cookieOpts = () => ({
  httpOnly: true, sameSite: 'strict', secure: config.secureCookies, path: '/', maxAge: config.sessionAbsoluteMs,
});

function createSession(req, res, userId) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const now = Date.now();
  db.prepare('INSERT INTO sessions (id_hash, user_id, csrf, ip, user_agent, created_at, last_seen) VALUES (?,?,?,?,?,?,?)')
    .run(sha256(token), userId, csrf, req.ip, (req.get('user-agent') || '').slice(0, 200), now, now);
  res.cookie(COOKIE, token, cookieOpts());
  return csrf;
}

function destroySession(req, res) {
  if (req.session) db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(req.session.id_hash);
  res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });
}

/** Attaches req.user / req.session when a valid session cookie is present. */
function loadSession(req, _res, next) {
  const token = readCookie(req, COOKIE);
  if (token) {
    const now = Date.now();
    const s = db.prepare('SELECT * FROM sessions WHERE id_hash = ?').get(sha256(token));
    if (s && now - s.last_seen < config.sessionIdleMs && now - s.created_at < config.sessionAbsoluteMs) {
      const user = db.prepare('SELECT id, email, name, totp_enabled FROM users WHERE id = ?').get(s.user_id);
      if (user) {
        if (now - s.last_seen > 60000) db.prepare('UPDATE sessions SET last_seen = ? WHERE id_hash = ?').run(now, s.id_hash);
        req.session = s;
        req.user = user;
      }
    }
  }
  next();
}

function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please sign in to continue.'));
  next();
}

/** CSRF defence in depth: SameSite=Strict cookie + Origin check + per-session token header. */
function csrfProtect(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let ok = false;
    try { ok = new URL(origin).host === req.get('host'); } catch { /* invalid */ }
    if (!ok) return next(new HttpError(403, 'Cross-origin request blocked.'));
  }
  if (req.session) {
    if (!safeEqual(req.get('x-csrf-token') || '', req.session.csrf)) return next(new HttpError(403, 'Invalid CSRF token. Refresh the page and try again.'));
  }
  next();
}

function audit(req, userId, event) {
  db.prepare('INSERT INTO audit_log (user_id, event, ip, user_agent, at) VALUES (?,?,?,?,?)')
    .run(userId, event, req.ip, (req.get('user-agent') || '').slice(0, 200), Date.now());
}

module.exports = { createSession, destroySession, loadSession, requireAuth, csrfProtect, audit, COOKIE };
