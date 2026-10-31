-- ====================================================================
-- FlatKhata Pro v3 - PostgreSQL Database Schema
-- Compatible with Neon PostgreSQL (v15+)
-- ====================================================================

-- 1. Members (Flatmates, roles, auth credentials and profiles)
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

-- 2. Expenses (Kitchen and grocery purchases with category and receipts)
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

-- 3. Leaves (Away days per flatmate per month for the > 7 days rule)
CREATE TABLE IF NOT EXISTS leaves (
    month VARCHAR(7) NOT NULL, -- Format: YYYY-MM (e.g. 2026-11)
    member_id VARCHAR(50) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    days INTEGER NOT NULL DEFAULT 0 CHECK (days >= 0 AND days <= 31),
    note VARCHAR(120) NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (month, member_id)
);

CREATE INDEX IF NOT EXISTS idx_leaves_month ON leaves (month);

-- 4. Settled Transfers (Tracks who paid whom in each month's settlement)
CREATE TABLE IF NOT EXISTS settled_transfers (
    month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
    transfer_key VARCHAR(100) NOT NULL, -- Composite key: fromId:toId:amount
    settled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (month, transfer_key)
);

CREATE INDEX IF NOT EXISTS idx_settled_month ON settled_transfers (month);

-- 5. Month Reports (Archived month-end settlement reports and email dispatches)
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

-- 6. Month Metadata (Tracks automated month-end execution flags)
CREATE TABLE IF NOT EXISTS month_metadata (
    month VARCHAR(7) PRIMARY KEY,
    auto_sent_at TIMESTAMPTZ DEFAULT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Audit Logs (Chronological record of actions: added, edited, reset, etc.)
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    detail TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_at ON audit_logs (at DESC);

-- 8. System Config (Internal metadata, schema versioning, etc.)
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
