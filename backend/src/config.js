'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BACKEND_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(BACKEND_DIR, process.env.DATA_DIR || 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Use JWT_SECRET from .env when it is long enough. Otherwise create one once and keep it in data/.
function loadJwtSecret() {
  const fromEnv = (process.env.JWT_SECRET || '').trim();
  if (fromEnv.length >= 32) return fromEnv;
  if (fromEnv) {
    console.warn('[config] JWT_SECRET is shorter than 32 characters, so a stored secret is used instead.');
  }
  const file = path.join(DATA_DIR, 'secret.key');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

const PORT = Number(process.env.PORT) || 3000;

module.exports = {
  BACKEND_DIR,
  FRONTEND_DIR: path.resolve(BACKEND_DIR, '..', 'frontend'),
  DATA_DIR,
  DATABASE_URL: (process.env.DATABASE_URL || '').trim(),
  HOST: process.env.HOST || '0.0.0.0',
  PORT,
  APP_URL: (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, ''),
  TIMEZONE: process.env.TIMEZONE || 'Asia/Singapore',
  JWT_SECRET: loadJwtSecret(),
  TOKEN_TTL: process.env.TOKEN_TTL || '7d',
  AUTO_REPORT_ENABLED: (process.env.AUTO_REPORT_ENABLED || 'true').toLowerCase() !== 'false',
  // Runs daily; the report only goes out when today is the last day of the month.
  REPORT_CRON: process.env.REPORT_CRON || '55 23 * * *',
  SMTP: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    // Gmail shows app passwords with spaces. Strip them so you can paste as-is.
    pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
  },
  MAIL_FROM: process.env.MAIL_FROM || 'FlatKhata Pro <no-reply@localhost>',
};
