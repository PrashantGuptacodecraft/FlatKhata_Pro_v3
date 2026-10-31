'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { JWT_SECRET, TOKEN_TTL } = require('./config');
const store = require('./store');

const MIN_LENGTH = 8;
const MAX_LENGTH = 72; // bcrypt ignores anything past 72 bytes, so we cap it.

// Easy to read aloud: no I, l, O, 0 or 1.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const failures = new Map();

// Returns an error message, or null when the password is acceptable.
function passwordProblem(password, name = '') {
  if (typeof password !== 'string' || password.length === 0) return 'Enter a password.';
  if (password.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`;
  if (password.length > MAX_LENGTH) return `Keep it under ${MAX_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.';
  if (name && password.toLowerCase().includes(name.toLowerCase())) {
    return 'Do not put your name inside the password.';
  }
  return null;
}

const hash = (password) => bcrypt.hashSync(password, 10);
const matches = (password, passwordHash) => bcrypt.compareSync(String(password), passwordHash);

// Passwords must be unique across the flat. Nobody can share one with another member.
function usedByOther(password, members, exceptId) {
  return members.some((m) => m.id !== exceptId && matches(password, m.passwordHash));
}

function generateTempPassword(members) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const bytes = crypto.randomBytes(12);
    let pw = '';
    for (const b of bytes) pw += ALPHABET[b % ALPHABET.length];
    if (!passwordProblem(pw) && !usedByOther(pw, members, null)) return pw;
  }
  throw new Error('Could not generate a unique password. Try again.');
}

function issueToken(member) {
  return jwt.sign({ sub: member.id, tv: member.tokenVersion || 0 }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Authenticates the request. `tokenVersion` is bumped on password change or reset,
// which signs out every old token for that member.
function requireAuth({ allowPendingChange = false } = {}) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Please sign in to continue.', code: 'AUTH_REQUIRED' });
    }
    const member = store.db().members.find((m) => m.id === payload.sub);
    if (!member || member.tokenVersion !== payload.tv) {
      return res.status(401).json({ error: 'Your session has ended. Sign in again.', code: 'AUTH_REQUIRED' });
    }
    if (member.mustChangePassword && !allowPendingChange) {
      return res.status(403).json({ error: 'Set your own password to continue.', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    req.user = member;
    return next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only the flat admin can do this.' });
  }
  return next();
}

function loginRateLimited(key) {
  const rec = failures.get(key);
  if (!rec || Date.now() - rec.start > LOGIN_WINDOW_MS) return false;
  return rec.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(key) {
  const now = Date.now();
  const rec = failures.get(key);
  if (!rec || now - rec.start > LOGIN_WINDOW_MS) failures.set(key, { start: now, count: 1 });
  else rec.count += 1;
}

const clearLoginFailures = (key) => failures.delete(key);

module.exports = {
  passwordProblem,
  hash,
  matches,
  usedByOther,
  generateTempPassword,
  issueToken,
  requireAuth,
  requireAdmin,
  loginRateLimited,
  recordLoginFailure,
  clearLoginFailures,
};
