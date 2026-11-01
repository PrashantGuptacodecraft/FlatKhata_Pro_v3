'use strict';

// Usage (from the backend folder):  npm run reset-password -- aditya
// Sets a new temporary password for that member. They must choose their own at next sign-in.

const store = require('../src/store');
const auth = require('../src/auth');

const memberId = (process.argv[2] || '').toLowerCase();

async function run() {
  await store.initStore();
  if (!store.db()) {
    console.error('No database yet. Start the server once so it can create the members.');
    process.exit(1);
  }

  const members = store.db().members;
  const target = members.find((m) => m.id === memberId);
  if (!target) {
    console.error(`Unknown member "${memberId}". Use one of: ${members.map((m) => m.id).join(', ')}`);
    process.exit(1);
  }

  const temp = auth.generateTempPassword(members);

  await store.write((d) => {
    const m = d.members.find((x) => x.id === target.id);
    m.passwordHash = auth.hash(temp);
    m.mustChangePassword = true;
    m.tokenVersion += 1;
    m.updatedAt = new Date().toISOString();
    store.addAudit(d, 'Server CLI', 'RESET', `Reset password for ${m.name} from the command line`);
  });

  console.log(`New temporary password for ${target.name}: ${temp}`);
  console.log('They must choose their own password at the next sign-in.');
  console.log('IMPORTANT: this only works while the server is stopped. A running server keeps its own copy');
  console.log('of the data and would overwrite this change on its next save. Use the admin reset in the app instead.');
  process.exit(0);
}

run().catch((err) => {
  console.error('[reset-password] Error:', err);
  process.exit(1);
});
