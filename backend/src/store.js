'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');
const dbModule = require('./db');

const FILE = path.join(DATA_DIR, 'db.json');
const AUDIT_LIMIT = 300;
let state = null;
let isSyncing = false;
let syncRequested = false;

function load() {
  if (state) return state;
  if (fs.existsSync(FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch (err) {
      throw new Error(`backend/data/db.json could not be read (${err.message}). Restore it from a backup.`);
    }
  }
  return state;
}

async function initStore() {
  if (state) return state;

  if (dbModule.isConfigured()) {
    try {
      await dbModule.initSchema();
      const pgState = await dbModule.loadState();
      if (pgState) {
        state = pgState;
        // Keep local file replica in sync
        try {
          const tmp = `${FILE}.tmp`;
          fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
          fs.renameSync(tmp, FILE);
        } catch {
          // ignore local disk write errors if running in read-only container
        }
        return state;
      }
    } catch (err) {
      console.error('[db] Failed to load initial state from PostgreSQL:', err.message);
      console.warn('[db] Falling back to local file storage if available.');
    }
  }

  return load();
}

function schedulePgSync() {
  if (!dbModule.isConfigured() || !state) return;
  if (isSyncing) {
    syncRequested = true;
    return;
  }
  isSyncing = true;
  const snapshot = JSON.parse(JSON.stringify(state));
  dbModule.saveState(snapshot)
    .catch((err) => {
      console.error('[db] Error syncing to PostgreSQL:', err.message);
    })
    .finally(() => {
      isSyncing = false;
      if (syncRequested) {
        syncRequested = false;
        schedulePgSync();
      }
    });
}

async function syncNow() {
  if (!dbModule.isConfigured() || !state) return;
  const snapshot = JSON.parse(JSON.stringify(state));
  await dbModule.saveState(snapshot);
}

function persist() {
  try {
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, FILE);
  } catch (err) {
    // If running in an environment without writable disk, log warning
    if (!dbModule.isConfigured()) {
      console.error('[store] Failed to persist db.json:', err.message);
    }
  }

  schedulePgSync();
}

function init(initialState) {
  state = initialState;
  persist();
  return state;
}

function db() {
  return state;
}

function write(mutator) {
  const result = mutator(state);
  persist();
  return result;
}

function addAudit(d, actor, action, detail) {
  d.auditLog.unshift({ at: new Date().toISOString(), actor, action, detail });
  d.auditLog.length = Math.min(d.auditLog.length, AUDIT_LIMIT);
}

function ensureMonth(d, ym) {
  d.months[ym] ||= { settledKeys: {}, reports: [], autoSentAt: null };
  d.months[ym].settledKeys ||= {};
  d.months[ym].reports ||= [];
  return d.months[ym];
}

module.exports = {
  load,
  initStore,
  syncNow,
  init,
  db,
  write,
  addAudit,
  ensureMonth,
  FILE,
};
