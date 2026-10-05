'use strict';
const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const C = require('../crypto');
const { HttpError, parse, str, z } = require('../http');
const { createSession, destroySession, requireAuth, audit } = require('../session');

const router = express.Router();
const uid = () => crypto.randomUUID();

const limiter = (windowMin, max) => rateLimit({
  windowMs: windowMin * 60 * 1000, limit: max, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});
const loginLimiter = limiter(15, 20);
const registerLimiter = limiter(60, 10);
const mfaLimiter = limiter(15, 20);

// ---------- password policy ----------
const COMMON = new Set(['password', 'password1', '1234567890', 'qwertyuiop', 'letmein123', 'iloveyou12', 'admin12345', 'welcome123', 'passw0rd123', 'changeme123']);
const password = z.string().min(10, 'Use at least 10 characters.').max(128, 'Use at most 128 characters.');
function checkPasswordStrength(pw, email = '') {
  const lower = pw.toLowerCase();
  const local = email.split('@')[0].toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(pw)) throw new HttpError(400, 'That password is too common.', { fields: { password: 'That password is too common.' } });
  if (local.length >= 4 && lower.includes(local)) throw new HttpError(400, 'Password must not contain your email.', { fields: { password: 'Password must not contain your email.' } });
  if (new Set(pw).size < 5) throw new HttpError(400, 'Use a more varied password.', { fields: { password: 'Use a more varied password.' } });
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, totp_enabled: !!u.totp_enabled });

function startSession(req, res, user, event = 'login') {
  const csrf = createSession(req, res, user.id);
  db.prepare('UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?').run(user.id);
  audit(req, user.id, event);
  return { user: publicUser(user), csrf };
}

// ---------- register / login ----------
router.post('/register', registerLimiter, async (req, res) => {
  const { name, email, password: pw } = parse(z.object({
    name: str(100, 1), email: z.email('Enter a valid email.').max(254).transform((s) => s.toLowerCase()), password,
  }).strict(), req.body);
  checkPasswordStrength(pw, email);
  const hash = await C.hashPassword(pw);
  const id = uid();
  try {
    db.transaction(() => {
      db.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?,?,?,?,?)').run(id, email, name, hash, Date.now());
      db.prepare('INSERT INTO profiles (user_id, business_name) VALUES (?,?)').run(id, name);
    })();
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw new HttpError(409, 'An account with this email already exists.', { fields: { email: 'An account with this email already exists.' } });
    throw e;
  }
  res.status(201).json(startSession(req, res, { id, email, name, totp_enabled: 0 }, 'register'));
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password: pw } = parse(z.object({ email: z.string().max(254).transform((s) => s.trim().toLowerCase()), password: z.string().min(1).max(128) }).strict(), req.body);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const generic = new HttpError(401, 'Incorrect email or password.');
  if (!user) { await C.burnPasswordCheck(pw); throw generic; }
  if (user.locked_until > Date.now()) {
    await C.burnPasswordCheck(pw);
    throw new HttpError(429, 'Too many failed attempts. This account is temporarily locked; try again in a few minutes.');
  }
  if (!(await C.verifyPassword(pw, user.password_hash))) {
    const fails = user.failed_logins + 1;
    // Lock for 15 min after 5 consecutive failures; doubles with each further burst (max 24h).
    const lock = fails >= 5 ? Date.now() + Math.min(15 * 60000 * 2 ** Math.floor((fails - 5) / 5), 24 * 3600000) : 0;
    db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(fails, lock, user.id);
    audit(req, user.id, 'login_failed');
    throw generic;
  }
  if (user.totp_enabled) {
    const challenge = C.randomToken(24);
    db.prepare('INSERT INTO mfa_challenges (id_hash, user_id, expires_at) VALUES (?,?,?)').run(C.sha256(challenge), user.id, Date.now() + 5 * 60000);
    return res.json({ mfa_required: true, challenge });
  }
  res.json(startSession(req, res, user));
});

router.post('/login/2fa', mfaLimiter, async (req, res) => {
  const { challenge, code } = parse(z.object({ challenge: z.string().max(100), code: z.string().trim().max(20) }).strict(), req.body);
  const bad = new HttpError(401, 'That code is incorrect or expired.');
  const ch = db.prepare('SELECT * FROM mfa_challenges WHERE id_hash = ?').get(C.sha256(challenge));
  if (!ch || ch.expires_at < Date.now() || ch.attempts >= 5) { if (ch) db.prepare('DELETE FROM mfa_challenges WHERE id_hash = ?').run(ch.id_hash); throw bad; }
  db.prepare('UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id_hash = ?').run(ch.id_hash);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(ch.user_id);
  let ok = false;
  const step = C.verifyTotp(C.decrypt(user.totp_secret_enc), code);
  if (step && step > user.totp_last_step) { // reject replay of an already-used code
    db.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').run(step, user.id);
    ok = true;
  } else if (!step) {
    const r = db.prepare('DELETE FROM recovery_codes WHERE user_id = ? AND code_hash = ?').run(user.id, C.sha256(code.toLowerCase().replace(/\s/g, '')));
    if (r.changes) { ok = true; audit(req, user.id, 'recovery_code_used'); }
  }
  if (!ok) { audit(req, user.id, 'mfa_failed'); throw bad; }
  db.prepare('DELETE FROM mfa_challenges WHERE id_hash = ?').run(ch.id_hash);
  res.json(startSession(req, res, user));
});

router.post('/logout', (req, res) => {
  if (req.user) audit(req, req.user.id, 'logout');
  destroySession(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: publicUser(req.user), csrf: req.session.csrf });
});

// ---------- everything below needs a session ----------
router.use(requireAuth);

async function reauth(userId, pw) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!pw || !(await C.verifyPassword(pw, u.password_hash))) throw new HttpError(403, 'Password is incorrect.', { fields: { password: 'Password is incorrect.' } });
  return u;
}

router.post('/password', mfaLimiter, async (req, res) => {
  const { current, next } = parse(z.object({ current: z.string().max(128), next: password }).strict(), req.body);
  await reauth(req.user.id, current);
  checkPasswordStrength(next, req.user.email);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await C.hashPassword(next), req.user.id);
  // Sign out everywhere else.
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?').run(req.user.id, req.session.id_hash);
  audit(req, req.user.id, 'password_changed');
  res.json({ ok: true });
});

router.post('/profile', (req, res) => {
  const { name } = parse(z.object({ name: str(100, 1) }).strict(), req.body);
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id);
  res.json({ ok: true });
});

// 2FA
router.post('/2fa/setup', mfaLimiter, async (req, res) => {
  if (req.user.totp_enabled) throw new HttpError(409, 'Two-factor authentication is already on.');
  const secret = C.newTotpSecret();
  db.prepare('UPDATE users SET totp_secret_enc = ?, totp_last_step = 0 WHERE id = ?').run(C.encrypt(secret), req.user.id);
  const url = C.otpauthUrl(secret, req.user.email);
  res.json({ secret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) });
});

router.post('/2fa/enable', mfaLimiter, (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().max(10) }).strict(), req.body);
  const u = db.prepare('SELECT totp_secret_enc, totp_enabled FROM users WHERE id = ?').get(req.user.id);
  if (u.totp_enabled || !u.totp_secret_enc) throw new HttpError(409, 'Start 2FA setup first.');
  const step = C.verifyTotp(C.decrypt(u.totp_secret_enc), code);
  if (!step) throw new HttpError(400, 'That code is incorrect.', { fields: { code: 'That code is incorrect.' } });
  const codes = C.newRecoveryCodes();
  db.transaction(() => {
    db.prepare('UPDATE users SET totp_enabled = 1, totp_last_step = ? WHERE id = ?').run(step, req.user.id);
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(req.user.id);
    for (const c of codes) db.prepare('INSERT INTO recovery_codes VALUES (?,?)').run(req.user.id, C.sha256(c));
  })();
  audit(req, req.user.id, '2fa_enabled');
  res.json({ recovery_codes: codes });
});

router.post('/2fa/disable', mfaLimiter, async (req, res) => {
  const { password: pw, code } = parse(z.object({ password: z.string().max(128), code: z.string().trim().max(20) }).strict(), req.body);
  const u = await reauth(req.user.id, pw);
  if (!u.totp_enabled) throw new HttpError(409, 'Two-factor authentication is not on.');
  if (!C.verifyTotp(C.decrypt(u.totp_secret_enc), code)) throw new HttpError(400, 'That code is incorrect.', { fields: { code: 'That code is incorrect.' } });
  db.transaction(() => {
    db.prepare('UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL WHERE id = ?').run(u.id);
    db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(u.id);
  })();
  audit(req, u.id, '2fa_disabled');
  res.json({ ok: true });
});

// Sessions & activity
router.get('/sessions', (req, res) => {
  const rows = db.prepare('SELECT id_hash, ip, user_agent, created_at, last_seen FROM sessions WHERE user_id = ? ORDER BY last_seen DESC').all(req.user.id);
  res.json({ sessions: rows.map((s) => ({ id: s.id_hash.slice(0, 16), ip: s.ip, user_agent: s.user_agent, created_at: s.created_at, last_seen: s.last_seen, current: s.id_hash === req.session.id_hash })) });
});
router.delete('/sessions/:id', (req, res) => {
  const r = db.prepare('DELETE FROM sessions WHERE user_id = ? AND substr(id_hash,1,16) = ? AND id_hash != ?').run(req.user.id, String(req.params.id).slice(0, 16), req.session.id_hash);
  if (!r.changes) throw new HttpError(404, 'Session not found.');
  res.json({ ok: true });
});
router.post('/sessions/revoke-others', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?').run(req.user.id, req.session.id_hash);
  audit(req, req.user.id, 'sessions_revoked');
  res.json({ ok: true });
});
router.get('/activity', (req, res) => {
  res.json({ events: db.prepare('SELECT event, ip, user_agent, at FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id) });
});

// Data portability + account deletion
router.get('/export', (req, res) => {
  const id = req.user.id;
  const invoices = db.prepare('SELECT * FROM invoices WHERE user_id = ?').all(id).map((inv) => ({
    ...inv, share_token_hash: undefined,
    items: db.prepare('SELECT description, quantity_milli, unit_price_cents FROM invoice_items WHERE invoice_id = ? ORDER BY position').all(inv.id),
    payments: db.prepare('SELECT amount_cents, paid_on, method, note FROM payments WHERE invoice_id = ?').all(inv.id),
  }));
  const profile = db.prepare('SELECT business_name, address, tax_id, payment_details, default_currency, default_tax_bp, default_terms_days, default_notes, number_prefix, next_number FROM profiles WHERE user_id = ?').get(id);
  res.setHeader('Content-Disposition', 'attachment; filename="invoicely-export.json"');
  res.json({ exported_at: new Date().toISOString(), user: publicUser(req.user), profile, clients: db.prepare('SELECT * FROM clients WHERE user_id = ?').all(id), invoices });
});

router.delete('/account', mfaLimiter, async (req, res) => {
  const { password: pw } = parse(z.object({ password: z.string().max(128) }).strict(), req.body);
  await reauth(req.user.id, pw);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id); // cascades to everything
  destroySession(req, res);
  res.json({ ok: true });
});

module.exports = router;
