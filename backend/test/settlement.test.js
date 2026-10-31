'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSettlement, daysInMonth } = require('../src/settlement');

const members = [
  { id: 'prashant', name: 'Prashant', upi: 'prashant@okaxis' },
  { id: 'aditya', name: 'Aditya', upi: 'aditya@okicici' },
  { id: 'abhishek', name: 'Abhishek', upi: 'abhishek@ybl' },
  { id: 'tanishq', name: 'Tanishq', upi: 'tanishq@paytm' },
  { id: 'pranjil', name: 'Pranjil', upi: 'pranjil@oksbi' },
];

const exp = (memberId, amount, date) => ({ memberId, amount, date, item: 'x', category: 'Sabzi & Vegetables' });

// Reference month: total ₹7,000 spread across the five flatmates.
const expenses = [
  exp('prashant', 2600, '2026-11-02'),
  exp('aditya', 1900, '2026-11-03'),
  exp('abhishek', 1200, '2026-11-04'),
  exp('tanishq', 800, '2026-11-09'),
  exp('pranjil', 500, '2026-11-11'),
];
const leaves = { aditya: { days: 5 }, abhishek: { days: 10 } };

test('days in month uses the real calendar, including leap years', () => {
  assert.equal(daysInMonth('2026-11'), 30);
  assert.equal(daysInMonth('2026-12'), 31);
  assert.equal(daysInMonth('2026-02'), 28);
  assert.equal(daysInMonth('2028-02'), 29);
});

test('away 5 days (<= 7) is not deducted; away 10 days (> 7) is deducted', () => {
  const s = computeSettlement({ ym: '2026-11', members, expenses, leaves });
  const aditya = s.members.find((m) => m.id === 'aditya');
  const abhishek = s.members.find((m) => m.id === 'abhishek');
  assert.equal(aditya.exempt, false);
  assert.equal(aditya.deductedDays, 0);
  assert.equal(aditya.activeDays, 30);
  assert.equal(abhishek.exempt, true);
  assert.equal(abhishek.deductedDays, 10);
  assert.equal(abhishek.activeDays, 20);
});

test('exactly 7 days away is NOT exempt, and 8 days IS exempt (strict > 7)', () => {
  const at7 = computeSettlement({ ym: '2026-11', members, expenses, leaves: { prashant: { days: 7 } } });
  const at8 = computeSettlement({ ym: '2026-11', members, expenses, leaves: { prashant: { days: 8 } } });
  assert.equal(at7.members[0].exempt, false);
  assert.equal(at7.members[0].activeDays, 30);
  assert.equal(at8.members[0].exempt, true);
  assert.equal(at8.members[0].activeDays, 22);
});

test('away days are capped at the month length and never negative', () => {
  const s = computeSettlement({ ym: '2026-11', members, expenses, leaves: { tanishq: { days: 99 }, pranjil: { days: -4 } } });
  const tanishq = s.members.find((m) => m.id === 'tanishq');
  const pranjil = s.members.find((m) => m.id === 'pranjil');
  assert.equal(tanishq.daysAway, 30);
  assert.equal(tanishq.activeDays, 0);
  assert.equal(pranjil.daysAway, 0);
});

test('per-day rate = total spend / total active person-days', () => {
  const s = computeSettlement({ ym: '2026-11', members, expenses, leaves });
  // Active: 30 + 30 + 20 + 30 + 30 = 140 days. ₹7,000 / 140 = ₹50 per day.
  assert.equal(s.totalActiveDays, 140);
  assert.equal(s.totalSpend, 7000);
  assert.equal(s.ratePerDay, 50);
  assert.equal(s.fullMonthShare, 1500);
});

test('net balances add up to zero', () => {
  const s = computeSettlement({ ym: '2026-11', members, expenses, leaves });
  const total = s.members.reduce((sum, m) => sum + m.net, 0);
  assert.ok(Math.abs(total) < 1e-6, `net sum should be 0, got ${total}`);
  const byId = Object.fromEntries(s.members.map((m) => [m.id, Math.round(m.net)]));
  assert.deepEqual(byId, { prashant: 1100, aditya: 400, abhishek: 200, tanishq: -700, pranjil: -1000 });
});

test('greedy settlement pays debtors to creditors with the fewest transfers', () => {
  const s = computeSettlement({ ym: '2026-11', members, expenses, leaves });
  const pairs = s.transfers.map((t) => [t.fromName, t.toName, t.amount]);
  assert.deepEqual(pairs, [
    ['Pranjil', 'Prashant', 1000],
    ['Tanishq', 'Prashant', 100],
    ['Tanishq', 'Aditya', 400],
    ['Tanishq', 'Abhishek', 200],
  ]);
  const paidIn = s.transfers.filter((t) => t.toId === 'prashant').reduce((x, t) => x + t.amount, 0);
  assert.equal(paidIn, 1100);
});

test('transfers carry a UPI deep link and a settled flag from the stored keys', () => {
  const first = computeSettlement({ ym: '2026-11', members, expenses, leaves }).transfers[0];
  assert.match(first.upiLink, /^upi:\/\/pay\?pa=prashant%40okaxis&pn=Prashant&am=1000&cu=INR/);
  assert.equal(first.settled, false);

  const marked = computeSettlement({ ym: '2026-11', members, expenses, leaves, settledKeys: { [first.key]: true } });
  assert.equal(marked.transfers[0].settled, true);
});

test('only purchases dated in the chosen month count', () => {
  const withOctober = [...expenses, exp('prashant', 9999, '2026-10-30')];
  const s = computeSettlement({ ym: '2026-11', members, expenses: withOctober, leaves });
  assert.equal(s.totalSpend, 7000);
});

test('no spend means no transfers and no division by zero', () => {
  const s = computeSettlement({ ym: '2026-11', members, expenses: [], leaves: {} });
  assert.equal(s.totalSpend, 0);
  assert.equal(s.ratePerDay, 0);
  assert.deepEqual(s.transfers, []);
});
