'use strict';

const store = require('../src/store');
const seed = require('../src/seed');
const db = require('../src/db');
const assert = require('assert');

async function testIntegration() {
  console.log('Testing PostgreSQL integration with Neon...');

  // 1. Initialize store & schema
  console.log('1. Initializing store...');
  await store.initStore();

  // 2. Seed database
  console.log('2. Running seed.initDatabase()...');
  const wasSeeded = await seed.initDatabase();
  console.log('   Seed executed:', wasSeeded ? 'Initial seed completed' : 'Already seeded');

  // 3. Check members loaded in memory and in PostgreSQL
  const state = store.db();
  console.log(`   Members loaded: ${state.members.length}`);
  assert.equal(state.members.length, 5, 'Should have 5 members');

  const pool = db.getPool();
  const dbMembers = await pool.query('SELECT id, name, role FROM members ORDER BY id');
  console.log('3. PostgreSQL members table check:');
  dbMembers.rows.forEach(m => console.log(`   - ${m.id} (${m.name}) [${m.role}]`));
  assert.equal(dbMembers.rows.length, 5, 'PostgreSQL members count should be 5');

  // 4. Test adding an expense and syncing to PostgreSQL
  console.log('4. Testing adding an expense...');
  const testExpId = 'test_exp_' + Date.now();
  store.write((d) => {
    d.expenses.push({
      id: testExpId,
      memberId: 'prashant',
      item: 'Test Milk Pack',
      category: 'Dairy & Morning',
      amount: 60,
      date: '2026-11-01',
      receipt: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
    });
    store.addAudit(d, 'Prashant', 'ADDED', 'Added ₹60 for Test Milk Pack');
  });

  await store.syncNow();

  // Check it is in PG
  const pgExp = await pool.query('SELECT * FROM expenses WHERE id = $1', [testExpId]);
  assert.equal(pgExp.rows.length, 1, 'Expense should be found in PostgreSQL');
  console.log('   Expense confirmed in PostgreSQL:', pgExp.rows[0].item, pgExp.rows[0].amount);

  // 5. Test deleting the test expense and syncing
  console.log('5. Cleaning up test expense...');
  store.write((d) => {
    d.expenses = d.expenses.filter((e) => e.id !== testExpId);
  });
  await store.syncNow();

  const pgExpAfter = await pool.query('SELECT * FROM expenses WHERE id = $1', [testExpId]);
  assert.equal(pgExpAfter.rows.length, 0, 'Expense should be removed from PostgreSQL');
  console.log('   Expense deleted from PostgreSQL cleanly.');

  console.log('\nAll PostgreSQL integration tests passed successfully!');
  await db.close();
}

testIntegration().catch((err) => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
