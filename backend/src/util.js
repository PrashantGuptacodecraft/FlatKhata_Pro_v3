'use strict';

const crypto = require('crypto');
const { TIMEZONE } = require('./config');
const { daysInMonth } = require('./settlement');

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Today's date and month in the flat's timezone, not the server's.
function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const o = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { ym: `${o.year}-${o.month}`, date: `${o.year}-${o.month}-${o.day}`, day: Number(o.day) };
}

function currentYm() {
  return localParts().ym;
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function isValidDate(str) {
  if (!DATE_RE.test(str)) return false;
  const year = Number(str.slice(0, 4));
  if (year < 2020 || year > 2100) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
}

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function inr(value, decimals = 0) {
  const n = Number(value) || 0;
  const body = Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (n < 0 ? '-₹' : '₹') + body;
}

module.exports = {
  HttpError,
  YM_RE,
  localParts,
  currentYm,
  shiftMonth,
  monthLabel,
  isValidDate,
  newId,
  esc,
  inr,
  daysInMonth,
};
