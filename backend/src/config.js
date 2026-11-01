'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BACKEND_DIR = path.resolve(__dirname, '..');
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = path.resolve(process.env.DATA_DIR || (isServerless ? '/tmp/data' : path.join(BACKEND_DIR, 'data')));

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // Ignore filesystem errors in read-only environments
}

let cachedSecret = null;
function loadJwtSecret() {
  const fromEnv = (process.env.JWT_SECRET || '').trim();
  if (fromEnv.length >= 32) return fromEnv;
  if (cachedSecret) return cachedSecret;
  if (fromEnv) {
    console.warn('[config] JWT_SECRET is shorter than 32 characters, so a stored secret is used instead.');
  }
  const file = path.join(DATA_DIR, 'secret.key');
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(file, secret, { mode: 0o600 });
    cachedSecret = secret;
    return secret;
  } catch {
    cachedSecret = crypto.randomBytes(48).toString('hex');
    return cachedSecret;
  }
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
  TIMEZONE: process.env.TIMEZONE || 'Asia/Kolkata',
  JWT_SECRET: loadJwtSecret(),
  TOKEN_TTL: process.env.TOKEN_TTL || '15d',
  AUTO_REPORT_ENABLED: (process.env.AUTO_REPORT_ENABLED || 'true').toLowerCase() !== 'false',
  REPORT_CRON: process.env.REPORT_CRON || '55 23 * * *',
  SMTP: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
  },
  MAIL_FROM: process.env.MAIL_FROM || 'FlatKhata Pro <no-reply@localhost>',
};
