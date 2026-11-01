'use strict';

const path = require('path');
const express = require('express');
const { PORT, HOST, APP_URL, TIMEZONE, FRONTEND_DIR } = require('./src/config');
const store = require('./src/store');
const auth = require('./src/auth');
const mailer = require('./src/mailer');
const reports = require('./src/reports');
const seed = require('./src/seed');
const { CATEGORIES, daysInMonth } = require('./src/settlement');
const { HttpError, YM_RE, isValidDate, currentYm, localParts, monthLabel, newId, inr } = require('./src/util');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '3mb' }));

let initPromise = null;
function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      await store.initStore();
      await seed.initDatabase();
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

// URL Normalizer: handles Vercel rewrites (x-matched-path / x-forwarded-uri) and missing /api prefixes
app.use((req, res, next) => {
  const original = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'];
  if (original && original !== '/api' && original.startsWith('/api')) {
    req.url = original;
  }
  if (!req.url.startsWith('/api')) {
    const p = req.url.split('?')[0];
    const isApi = ['/members', '/health', '/auth', '/me', '/dashboard', '/expenses', '/leave', '/settlement', '/admin', '/cron'].some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
    if (isApi) {
      req.url = `/api${req.url}`;
    }
  }
  next();
});

app.use('/api', async (req, res, next) => {
  try {
    await ensureInitialized();
    next();
  } catch (err) {
    console.error('[server] Database initialization failed:', err);
    next(err);
  }
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const nowIso = () => new Date().toISOString();
const IMAGE_RE = /^data:image\/(jpeg|png|webp|gif);base64,/;

// ---- Views: only the fields the app needs. Never password hashes. ----

function publicMe(m) {
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    email: m.email,
    upi: m.upi,
    phone: m.phone || '',
    avatar: m.avatar || null,
    color: m.color,
    mustChangePassword: Boolean(m.mustChangePassword),
  };
}

function publicExpense(e) {
  return {
    id: e.id,
    memberId: e.memberId,
    item: e.item,
    category: e.category,
    amount: e.amount,
    date: e.date,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt || null,
    hasReceipt: Boolean(e.receipt),
  };
}

// ---- Input checks ----

function requireYm(value) {
  const ym = value === undefined || value === '' ? currentYm() : String(value);
  if (!YM_RE.test(ym)) throw new HttpError(400, 'Month must look like 2026-11.');
  return ym;
}

function parseExpense(body) {
  const item = String(body.item ?? '').trim();
  const amount = Number(body.amount);
  const date = String(body.date ?? '');
  const category = String(body.category ?? '');

  if (item.length < 2 || item.length > 120) {
    throw new HttpError(400, 'Describe the item in 2 to 120 characters.');
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
    throw new HttpError(400, 'Enter a whole-rupee amount between ₹1 and ₹1,00,000.');
  }
  if (!isValidDate(date)) throw new HttpError(400, 'Pick a valid date.');
  if (!CATEGORIES.includes(category)) throw new HttpError(400, 'Pick a category from the list.');

  const out = { item, amount, date, category };
  if (body.receipt !== undefined) {
    const ok = body.receipt === null
      || (typeof body.receipt === 'string' && IMAGE_RE.test(body.receipt) && body.receipt.length <= 1500000);
    if (!ok) throw new HttpError(400, 'The bill photo must be an image under about 1 MB.');
    out.receipt = body.receipt;
  }
  return out;
}

// ---- Health & member list (public: used by the sign-in screen) ----

app.get('/api/health', (req, res) => {
  res.json({ ok: true, timezone: TIMEZONE, email: mailer.isConfigured() ? 'smtp' : 'dry-run' });
});

app.get('/api/members', wrap(async (req, res) => {
  const d = store.db();
  const members = (d && d.members) || [];
  res.json(members.map((m) => ({ id: m.id, name: m.name, color: m.color })));
}));

// ---- Authentication ----

app.post('/api/auth/login', wrap(async (req, res) => {
  const memberId = String((req.body && req.body.memberId) || '');
  const password = String((req.body && req.body.password) || '');
  const key = `${req.ip}|${memberId}`;

  if (auth.loginRateLimited(key)) {
    throw new HttpError(429, 'Too many wrong attempts. Wait 10 minutes and try again.');
  }
  const m = store.db().members.find((x) => x.id === memberId);
  if (!m || !auth.matches(password, m.passwordHash)) {
    auth.recordLoginFailure(key);
    throw new HttpError(401, 'That password is not right for this name.');
  }
  auth.clearLoginFailures(key);
  res.json({ token: auth.issueToken(m), user: publicMe(m) });
}));

app.post('/api/auth/forgot-password', wrap(async (req, res) => {
  const memberId = String((req.body && req.body.memberId) || '').trim();
  const m = store.db().members.find((x) => x.id === memberId);
  if (!m) {
    throw new HttpError(404, 'No flatmate found with that name.');
  }
  if (!m.email) {
    throw new HttpError(400, 'No email address registered for this account.');
  }
  if (!mailer.isConfigured()) {
    throw new HttpError(503, 'Email service is not set up on this server.');
  }

  const key = `forgot|${req.ip}|${memberId}`;
  if (auth.loginRateLimited(key)) {
    throw new HttpError(429, 'Too many reset requests. Wait 10 minutes and try again.');
  }
  auth.recordLoginFailure(key);

  const temp = auth.generateTempPassword(store.db().members);
  store.write((d) => {
    const target = d.members.find((x) => x.id === m.id);
    target.passwordHash = auth.hash(temp);
    target.mustChangePassword = true;
    target.tokenVersion += 1;
    target.updatedAt = nowIso();
    store.addAudit(d, target.name, 'RESET', 'Requested temporary password via email');
  });

  if (store.syncNow) {
    await store.syncNow().catch((err) => console.error('[db] Error syncing password reset to DB:', err));
  }

  await mailer.sendCredentials(m, temp, 'reset');
  res.json({ ok: true, email: m.email });
}));

app.get('/api/me', auth.requireAuth({ allowPendingChange: true }), (req, res) => {
  res.json({ user: publicMe(req.user) });
});

// Used both by "Change password" and by the forced first-time change.
app.post('/api/me/password', auth.requireAuth({ allowPendingChange: true }), wrap((req, res) => {
  const currentPassword = String((req.body && req.body.currentPassword) || '');
  const newPassword = String((req.body && req.body.newPassword) || '');
  const me = req.user;

  if (!auth.matches(currentPassword, me.passwordHash)) {
    throw new HttpError(400, 'Your current password is not right.');
  }
  const problem = auth.passwordProblem(newPassword, me.name);
  if (problem) throw new HttpError(400, problem);
  if (newPassword === currentPassword) {
    throw new HttpError(400, 'Choose a password that is different from the current one.');
  }
  if (auth.usedByOther(newPassword, store.db().members, me.id)) {
    throw new HttpError(400, 'No other flatmate can use the same password. Try another.');
  }

  store.write((d) => {
    const m = d.members.find((x) => x.id === me.id);
    m.passwordHash = auth.hash(newPassword);
    m.mustChangePassword = false;
    m.tokenVersion += 1; // signs out every other device
    m.updatedAt = nowIso();
    store.addAudit(d, m.name, 'PASSWORD', 'Changed own password');
  });

  const fresh = store.db().members.find((x) => x.id === me.id);
  res.json({ token: auth.issueToken(fresh), user: publicMe(fresh) });
}));

// ---- Profile ----

app.put('/api/me/profile', auth.requireAuth(), wrap((req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const upi = String((req.body && req.body.upi) || '').trim();
  const phone = String((req.body && req.body.phone) || '').trim().slice(0, 20);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (!/^[\w.-]{2,256}@[A-Za-z]{2,64}$/.test(upi)) throw new HttpError(400, 'Enter a UPI ID like name@bank.');

  store.write((d) => {
    const m = d.members.find((x) => x.id === req.user.id);
    Object.assign(m, { email, upi, phone, updatedAt: nowIso() });
    store.addAudit(d, m.name, 'PROFILE', `Updated contact details (${email}, UPI ${upi})`);
  });
  res.json({ user: publicMe(req.user) });
}));

app.put('/api/me/avatar', auth.requireAuth(), wrap((req, res) => {
  const avatar = req.body ? req.body.avatar : undefined;
  const ok = avatar === null || (typeof avatar === 'string' && IMAGE_RE.test(avatar) && avatar.length <= 400000);
  if (!ok) throw new HttpError(400, 'Choose an image under about 300 KB.');

  store.write((d) => {
    const m = d.members.find((x) => x.id === req.user.id);
    m.avatar = avatar;
    store.addAudit(d, m.name, 'PROFILE', avatar ? 'Changed profile photo' : 'Removed profile photo');
  });
  res.json({ user: publicMe(req.user) });
}));

// ---- Monthly dashboard (one request feeds the whole app) ----

function buildDashboard(req) {
  const ym = requireYm(req.query.month);
  const d = store.db();
  const s = reports.getSettlement(ym);
  const { members: stats, transfers, ...summary } = s;
  const leaves = d.leaves[ym] || {};
  const rec = d.months[ym] || { reports: [], autoSentAt: null };

  const members = stats.map((st) => {
    const m = d.members.find((x) => x.id === st.id);
    return {
      ...st,
      email: m.email,
      phone: m.phone || '',
      role: m.role,
      color: m.color,
      avatar: m.avatar || null,
      mustChangePassword: Boolean(m.mustChangePassword),
      leaveNote: (leaves[st.id] && leaves[st.id].note) || '',
    };
  });

  const expenses = d.expenses
    .filter((e) => e.date.startsWith(`${ym}-`))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .map(publicExpense);

  return {
    month: ym,
    label: monthLabel(ym),
    daysInMonth: daysInMonth(ym),
    isCurrentMonth: ym === currentYm(),
    today: localParts().date, // the flat's date, so the form never disagrees with the server
    me: publicMe(req.user),
    members,
    expenses,
    summary,
    transfers,
    emailStatus: {
      mode: mailer.isConfigured() ? 'smtp' : 'dry-run',
      lastReport: rec.reports[0] || null,
      autoSentAt: rec.autoSentAt,
    },
    audit: d.auditLog.slice(0, 30),
  };
}

app.get('/api/dashboard', auth.requireAuth(), wrap((req, res) => {
  res.json(buildDashboard(req));
}));

// ---- Purchases: anyone can add; only the author can edit or delete ----

app.post('/api/expenses', auth.requireAuth(), wrap((req, res) => {
  const input = parseExpense(req.body || {});
  const me = req.user;
  const created = store.write((d) => {
    const e = {
      id: newId('exp'),
      memberId: me.id,
      ...input,
      receipt: input.receipt || null,
      createdAt: nowIso(),
      updatedAt: null,
    };
    d.expenses.push(e);
    store.addAudit(d, me.name, 'ADDED', `Added ${inr(input.amount)} for "${input.item}" (${input.date})`);
    return e;
  });
  res.status(201).json({ expense: publicExpense(created) });
}));

app.put('/api/expenses/:id', auth.requireAuth(), wrap((req, res) => {
  const existing = store.db().expenses.find((e) => e.id === req.params.id);
  if (!existing) throw new HttpError(404, 'That purchase no longer exists.');
  if (existing.memberId !== req.user.id) {
    throw new HttpError(403, 'Only the person who added this purchase can change it.');
  }
  const input = parseExpense(req.body || {});

  const updated = store.write((d) => {
    const e = d.expenses.find((x) => x.id === existing.id);
    Object.assign(e, { item: input.item, amount: input.amount, date: input.date, category: input.category, updatedAt: nowIso() });
    if (input.receipt !== undefined) e.receipt = input.receipt; // omitted = keep the current bill
    store.addAudit(d, req.user.name, 'EDITED', `Changed "${e.item}" to ${inr(e.amount)} (${e.date})`);
    return e;
  });
  res.json({ expense: publicExpense(updated) });
}));

app.delete('/api/expenses/:id', auth.requireAuth(), wrap((req, res) => {
  const existing = store.db().expenses.find((e) => e.id === req.params.id);
  if (!existing) throw new HttpError(404, 'That purchase no longer exists.');
  if (existing.memberId !== req.user.id) {
    throw new HttpError(403, 'Only the person who added this purchase can delete it.');
  }
  store.write((d) => {
    d.expenses = d.expenses.filter((e) => e.id !== existing.id);
    store.addAudit(d, req.user.name, 'DELETED', `Deleted "${existing.item}" (${inr(existing.amount)})`);
  });
  res.json({ ok: true });
}));

app.get('/api/expenses/:id/receipt', auth.requireAuth(), wrap((req, res) => {
  const e = store.db().expenses.find((x) => x.id === req.params.id);
  if (!e || !e.receipt) throw new HttpError(404, 'No bill photo for this purchase.');
  res.json({ dataUrl: e.receipt });
}));

// ---- Leave: each person edits only their own days ----

app.put('/api/leave', auth.requireAuth(), wrap((req, res) => {
  const ym = requireYm(req.body && req.body.month);
  const N = daysInMonth(ym);
  const days = Number(req.body && req.body.days);
  if (!Number.isInteger(days) || days < 0 || days > N) {
    throw new HttpError(400, `Days away must be a whole number from 0 to ${N}.`);
  }
  const note = String((req.body && req.body.note) || '').trim().slice(0, 120);
  const rule = days > 7 ? 'more than 7, so deducted' : '7 or fewer, no deduction';

  store.write((d) => {
    d.leaves[ym] ||= {};
    d.leaves[ym][req.user.id] = { days, note, updatedAt: nowIso() };
    store.addAudit(d, req.user.name, 'LEAVE', `Set ${days} day(s) away for ${monthLabel(ym)} (${rule})`);
  });
  res.json({ ok: true });
}));

// ---- Who pays whom: mark transfers paid ----

app.put('/api/settlement/:ym/paid', auth.requireAuth(), wrap((req, res) => {
  const ym = requireYm(req.params.ym);
  const key = String((req.body && req.body.key) || '');
  const settled = Boolean(req.body && req.body.settled);
  const t = reports.getSettlement(ym).transfers.find((x) => x.key === key);
  if (!t) throw new HttpError(404, 'That payment is no longer in the settlement. Refresh and try again.');

  const me = req.user;
  if (me.id !== t.fromId && me.id !== t.toId && me.role !== 'admin') {
    throw new HttpError(403, 'Only the payer, the receiver or the admin can mark this paid.');
  }
  store.write((d) => {
    store.ensureMonth(d, ym).settledKeys[key] = settled;
    store.addAudit(d, me.name, 'PAYMENT', `${settled ? 'Marked paid' : 'Unmarked'}: ${t.fromName} to ${t.toName} ${inr(t.amount)}`);
  });
  res.json({ ok: true });
}));

// ---- Admin: reset any flatmate's password, send the month-end report now ----

app.post('/api/admin/members/:id/reset-password', auth.requireAuth(), auth.requireAdmin, wrap(async (req, res) => {
  const target = store.db().members.find((m) => m.id === req.params.id);
  if (!target) throw new HttpError(404, 'No such flatmate.');
  if (target.id === req.user.id) {
    throw new HttpError(400, 'To change your own password, use the Password section in the Me tab.');
  }

  const typed = req.body && typeof req.body.newPassword === 'string' ? req.body.newPassword.trim() : '';
  let temp;
  if (typed) {
    const problem = auth.passwordProblem(typed, target.name);
    if (problem) throw new HttpError(400, problem);
    if (auth.usedByOther(typed, store.db().members, target.id)) {
      throw new HttpError(400, 'Another flatmate already uses that password.');
    }
    temp = typed;
  } else {
    temp = auth.generateTempPassword(store.db().members);
  }

  store.write((d) => {
    const m = d.members.find((x) => x.id === target.id);
    m.passwordHash = auth.hash(temp);
    m.mustChangePassword = true; // they must pick their own at next sign-in
    m.tokenVersion += 1; // signs them out everywhere
    m.updatedAt = nowIso();
    store.addAudit(d, req.user.name, 'RESET', `Reset password for ${m.name}`);
  });

  let emailed = false;
  if (target.email && mailer.isConfigured()) {
    try {
      await mailer.sendCredentials(target, temp, 'reset');
      emailed = true;
    } catch (err) {
      console.error(`[mail] Reset email to ${target.name} failed: ${err.message}`);
    }
  }
  res.json({
    name: target.name,
    temporaryPassword: temp,
    emailed,
    emailMode: mailer.isConfigured() ? 'smtp' : 'dry-run',
  });
}));

app.post('/api/admin/reports/:ym/send', auth.requireAuth(), auth.requireAdmin, wrap(async (req, res) => {
  const ym = requireYm(req.params.ym);
  const record = await reports.sendMonthReport(ym, { triggeredBy: req.user.name });
  res.json({ record });
}));

// Cron endpoint (used by Vercel Cron or external scheduler)
app.all('/api/cron/month-end', wrap(async (req, res) => {
  const authHeader = req.headers.authorization || req.query.secret;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}` && authHeader !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  const record = await reports.runMonthEndJob();
  const catchup = await reports.catchUpPreviousMonth();
  res.json({ ok: true, record, catchup });
}));

// ---- Static web app and errors ----

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That upload is too big. Try a smaller photo.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request was not valid JSON.' });
  }
  console.error('[server]', err);
  return res.status(500).json({ error: 'Something went wrong on the server. Check the server log.' });
});

app.use(express.static(FRONTEND_DIR, { index: 'index.html', maxAge: 0 }));
app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

// ---- Start ----

async function startServer() {
  await ensureInitialized();

  app.listen(PORT, HOST, () => {
    console.log(`\nFlatKhata Pro is running on port ${PORT}.`);
    console.log(`  Database:                  ${process.env.DATABASE_URL ? 'PostgreSQL (Neon)' : 'Local JSON file'}`);
    console.log(`  On this computer:          http://localhost:${PORT}`);
    console.log(`  Address used in emails:    ${APP_URL}`);
    if (/localhost|127\.0\.0\.1/.test(APP_URL)) {
      console.log('  Phones cannot open "localhost". Set APP_URL in backend/.env to this computer\'s Wi-Fi');
      console.log(`  address (for example http://192.168.1.20:${PORT}) so flatmates can open the app.`);
    }
    console.log(`  Timezone ${TIMEZONE} · Email: ${mailer.isConfigured() ? 'SMTP connected' : 'not set up (emails saved to backend/data/outbox)'}\n`);
    reports.startScheduler();
    reports.catchUpPreviousMonth().catch((err) => console.error('[reports] Catch-up failed:', err));
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[server] Fatal startup error:', err);
    process.exit(1);
  });
}

app.startServer = startServer;
module.exports = app;
