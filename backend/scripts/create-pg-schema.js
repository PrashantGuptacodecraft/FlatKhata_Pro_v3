'use strict';

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_T8V0pXlAzSKv@ep-summer-breeze-azxjvixy-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const SCHEMA_SQL = `
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

async function run() {
  console.log('Connecting to Neon PostgreSQL...');
  const client = await pool.connect();
  try {
    console.log('Applying database schema...');
    await client.query(SCHEMA_SQL);
    console.log('Schema created successfully!');

    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('Created tables:');
    res.rows.forEach(r => console.log(' - ' + r.table_name));
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Error applying schema:', err);
  process.exit(1);
});
