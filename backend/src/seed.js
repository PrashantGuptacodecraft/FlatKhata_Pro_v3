'use strict';

const fs = require('fs');
const path = require('path');
const { BACKEND_DIR } = require('./config');
const store = require('./store');
const auth = require('./auth');
const mailer = require('./mailer');

// Creates the database on the very first start. Every member gets a unique temporary password
// and must set their own at the first sign-in. Existing data is never touched.
async function initDatabase() {
  if (store.load()) return false;

  const roster = JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, 'config', 'members.json'), 'utf8')).members;
  const now = new Date().toISOString();
  const members = [];
  const issued = [];

  for (const r of roster) {
    const temp = auth.generateTempPassword(members);
    const member = {
      id: r.id,
      name: r.name,
      email: r.email || '',
      upi: r.upi || '',
      phone: r.phone || '',
      role: r.role || 'member',
      color: r.color || '#8a7d68',
      avatar: null,
      passwordHash: auth.hash(temp),
      tokenVersion: 0,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    };
    members.push(member);
    issued.push({ member, temp });
  }

  store.init({
    schemaVersion: 3,
    createdAt: now,
    members,
    expenses: [],
    leaves: {},
    months: {},
    auditLog: [],
  });

  if (store.syncNow) {
    await store.syncNow();
  }

  printCredentials(issued);

  if (mailer.isConfigured()) {
    issued.forEach(({ member, temp }) => {
      if (!member.email) return;
      mailer.sendCredentials(member, temp, 'welcome').catch((err) => {
        console.error(`[mail] Welcome email to ${member.name} failed: ${err.message}`);
      });
    });
  }
  return true;
}

function printCredentials(issued) {
  const line = '-'.repeat(64);
  console.log(`\n${line}\nFIRST RUN: temporary passwords (shown only once)\n${line}`);
  issued.forEach(({ member, temp }) => {
    console.log(`  ${member.name.padEnd(10)} ${temp.padEnd(14)} ${member.email || '(no email)'}`);
  });
  console.log(`${line}\nEach person signs in with theirs, then sets a personal password.`);
  console.log(`Lost one? Admin can reset it in the app, or run: npm run reset-password -- <id>\n${line}\n`);
}

module.exports = { initDatabase };
