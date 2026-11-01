'use strict';

const { Pool, types } = require('pg');
const { DATABASE_URL } = require('./config');

// Ensure DATE (OID 1082) returns YYYY-MM-DD string without timezone shifting
types.setTypeParser(1082, (val) => val);

let pool = null;

function isConfigured() {
  return Boolean(DATABASE_URL);
}

function getPool() {
  if (!pool) {
    if (!DATABASE_URL) return null;
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (err) => {
      console.error('[db] Unexpected error on idle client:', err);
    });
  }
  return pool;
}

const DDL = `
CREATE TABLE IF NOT EXISTS members (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL DEFAULT '',
    upi VARCHAR(255) NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    color VARCHAR(20) NOT NULL DEFAULT '#8a7d68',
    avatar TEXT DEFAULT NULL,
    password_hash VARCHAR(255) NOT NULL,
    token_version INTEGER NOT NULL DEFAULT 0,
    must_change_password BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
    id VARCHAR(50) PRIMARY KEY,
    member_id VARCHAR(50) NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
    item VARCHAR(120) NOT NULL,
    category VARCHAR(50) NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 100000),
    date DATE NOT NULL,
    receipt TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses (date);
CREATE INDEX IF NOT EXISTS idx_expenses_member ON expenses (member_id);

CREATE TABLE IF NOT EXISTS leaves (
    month VARCHAR(7) NOT NULL,
    member_id VARCHAR(50) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    days INTEGER NOT NULL DEFAULT 0 CHECK (days >= 0 AND days <= 31),
    note VARCHAR(120) NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (month, member_id)
);

CREATE INDEX IF NOT EXISTS idx_leaves_month ON leaves (month);

CREATE TABLE IF NOT EXISTS settled_transfers (
    month VARCHAR(7) NOT NULL,
    transfer_key VARCHAR(100) NOT NULL,
    settled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (month, transfer_key)
);

CREATE INDEX IF NOT EXISTS idx_settled_month ON settled_transfers (month);

CREATE TABLE IF NOT EXISTS month_reports (
    id SERIAL PRIMARY KEY,
    month VARCHAR(7) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_auto BOOLEAN NOT NULL DEFAULT false,
    triggered_by VARCHAR(100),
    recipients JSONB,
    summary JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_month_reports_month ON month_reports (month);

CREATE TABLE IF NOT EXISTS month_metadata (
    month VARCHAR(7) PRIMARY KEY,
    auto_sent_at TIMESTAMPTZ DEFAULT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    detail TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_at ON audit_logs (at DESC);

CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function initSchema() {
  const p = getPool();
  if (!p) return;
  const client = await p.connect();
  try {
    await client.query(DDL);
  } finally {
    client.release();
  }
}

async function loadState() {
  const p = getPool();
  if (!p) return null;

  try {
    const [memberRes, expenseRes, leaveRes, settledRes, metaRes, reportRes, auditRes, configRes] = await Promise.all([
      p.query('SELECT * FROM members ORDER BY id'),
      p.query('SELECT * FROM expenses ORDER BY date DESC, created_at DESC'),
      p.query('SELECT * FROM leaves'),
      p.query('SELECT * FROM settled_transfers'),
      p.query('SELECT * FROM month_metadata'),
      p.query('SELECT * FROM month_reports ORDER BY sent_at DESC'),
      p.query('SELECT * FROM audit_logs ORDER BY at DESC, id DESC LIMIT 300'),
      p.query('SELECT * FROM system_config')
    ]);

    if (memberRes.rows.length === 0) {
      return null; // Not seeded yet
    }

    const members = memberRes.rows.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email || '',
      upi: m.upi || '',
      phone: m.phone || '',
      role: m.role || 'member',
      color: m.color || '#8a7d68',
      avatar: m.avatar || null,
      passwordHash: m.password_hash,
      tokenVersion: m.token_version || 0,
      mustChangePassword: Boolean(m.must_change_password),
      createdAt: m.created_at ? new Date(m.created_at).toISOString() : new Date().toISOString(),
      updatedAt: m.updated_at ? new Date(m.updated_at).toISOString() : new Date().toISOString(),
    }));

    const expenses = expenseRes.rows.map((e) => ({
      id: e.id,
      memberId: e.member_id,
      item: e.item,
      category: e.category,
      amount: e.amount,
      date: typeof e.date === 'string' ? e.date : new Date(e.date).toISOString().slice(0, 10),
      receipt: e.receipt || null,
      createdAt: e.created_at ? new Date(e.created_at).toISOString() : new Date().toISOString(),
      updatedAt: e.updated_at ? new Date(e.updated_at).toISOString() : null,
    }));

    const leaves = {};
    for (const l of leaveRes.rows) {
      leaves[l.month] ||= {};
      leaves[l.month][l.member_id] = {
        days: l.days,
        note: l.note || '',
        updatedAt: l.updated_at ? new Date(l.updated_at).toISOString() : new Date().toISOString(),
      };
    }

    const months = {};
    for (const s of settledRes.rows) {
      months[s.month] ||= { settledKeys: {}, reports: [], autoSentAt: null };
      months[s.month].settledKeys[s.transfer_key] = Boolean(s.settled);
    }

    for (const m of metaRes.rows) {
      months[m.month] ||= { settledKeys: {}, reports: [], autoSentAt: null };
      months[m.month].autoSentAt = m.auto_sent_at ? new Date(m.auto_sent_at).toISOString() : null;
    }

    for (const r of reportRes.rows) {
      months[r.month] ||= { settledKeys: {}, reports: [], autoSentAt: null };
      months[r.month].reports.push({
        sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : new Date().toISOString(),
        auto: Boolean(r.is_auto),
        triggeredBy: r.triggered_by || '',
        recipients: r.recipients || [],
        summary: r.summary || {},
      });
    }

    const auditLog = auditRes.rows.map((a) => ({
      at: a.at ? new Date(a.at).toISOString() : new Date().toISOString(),
      actor: a.actor,
      action: a.action,
      detail: a.detail,
    }));

    const configMap = {};
    for (const row of configRes.rows) {
      configMap[row.key] = row.value;
    }

    return {
      schemaVersion: Number(configMap.schemaVersion) || 3,
      createdAt: configMap.createdAt || new Date().toISOString(),
      members,
      expenses,
      leaves,
      months,
      auditLog,
    };
  } catch (err) {
    console.error('[db] Error loading state from PostgreSQL:', err.message);
    throw err;
  }
}

async function saveState(state) {
  const p = getPool();
  if (!p || !state) return;

  const client = await p.connect();
  try {
    await client.query('BEGIN');

    // 1. System config
    await client.query(
      `INSERT INTO system_config (key, value, updated_at) VALUES ('schemaVersion', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [String(state.schemaVersion || 3)]
    );
    if (state.createdAt) {
      await client.query(
        `INSERT INTO system_config (key, value, updated_at) VALUES ('createdAt', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [String(state.createdAt)]
      );
    }

    // 2. Members
    for (const m of state.members || []) {
      await client.query(
        `INSERT INTO members (id, name, email, upi, phone, role, color, avatar, password_hash, token_version, must_change_password, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           upi = EXCLUDED.upi,
           phone = EXCLUDED.phone,
           role = EXCLUDED.role,
           color = EXCLUDED.color,
           avatar = EXCLUDED.avatar,
           password_hash = EXCLUDED.password_hash,
           token_version = EXCLUDED.token_version,
           must_change_password = EXCLUDED.must_change_password,
           updated_at = EXCLUDED.updated_at`,
        [
          m.id,
          m.name,
          m.email || '',
          m.upi || '',
          m.phone || '',
          m.role || 'member',
          m.color || '#8a7d68',
          m.avatar || null,
          m.passwordHash,
          m.tokenVersion || 0,
          Boolean(m.mustChangePassword),
          m.createdAt || new Date(),
          m.updatedAt || new Date(),
        ]
      );
    }

    // 3. Expenses
    const currentExpIds = (state.expenses || []).map((e) => e.id);
    if (currentExpIds.length === 0) {
      await client.query('DELETE FROM expenses');
    } else {
      await client.query('DELETE FROM expenses WHERE NOT (id = ANY($1))', [currentExpIds]);
      for (const e of state.expenses || []) {
        await client.query(
          `INSERT INTO expenses (id, member_id, item, category, amount, date, receipt, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             item = EXCLUDED.item,
             category = EXCLUDED.category,
             amount = EXCLUDED.amount,
             date = EXCLUDED.date,
             receipt = EXCLUDED.receipt,
             updated_at = EXCLUDED.updated_at`,
          [
            e.id,
            e.memberId,
            e.item,
            e.category,
            e.amount,
            e.date,
            e.receipt || null,
            e.createdAt || new Date(),
            e.updatedAt || null,
          ]
        );
      }
    }

    // 4. Leaves
    for (const [month, memberLeaves] of Object.entries(state.leaves || {})) {
      for (const [memberId, leave] of Object.entries(memberLeaves || {})) {
        await client.query(
          `INSERT INTO leaves (month, member_id, days, note, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (month, member_id) DO UPDATE SET
             days = EXCLUDED.days,
             note = EXCLUDED.note,
             updated_at = EXCLUDED.updated_at`,
          [month, memberId, leave.days, leave.note || '', leave.updatedAt || new Date()]
        );
      }
    }

    // 5. Months (settled transfers, metadata, reports)
    for (const [month, monthData] of Object.entries(state.months || {})) {
      if (monthData.settledKeys) {
        for (const [transferKey, settled] of Object.entries(monthData.settledKeys)) {
          await client.query(
            `INSERT INTO settled_transfers (month, transfer_key, settled, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (month, transfer_key) DO UPDATE SET
               settled = EXCLUDED.settled,
               updated_at = NOW()`,
            [month, transferKey, Boolean(settled)]
          );
        }
      }

      await client.query(
        `INSERT INTO month_metadata (month, auto_sent_at, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (month) DO UPDATE SET
           auto_sent_at = EXCLUDED.auto_sent_at,
           updated_at = NOW()`,
        [month, monthData.autoSentAt ? new Date(monthData.autoSentAt) : null]
      );
    }

    // 6. Audit logs (keep latest entries)
    if (Array.isArray(state.auditLog) && state.auditLog.length > 0) {
      // Clean and refresh audit logs or insert latest
      await client.query('DELETE FROM audit_logs');
      for (const a of state.auditLog.slice(0, 300)) {
        await client.query(
          `INSERT INTO audit_logs (at, actor, action, detail) VALUES ($1, $2, $3, $4)`,
          [a.at ? new Date(a.at) : new Date(), a.actor, a.action, a.detail]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  isConfigured,
  getPool,
  initSchema,
  loadState,
  saveState,
  close,
};
