'use strict';

// Pure settlement engine. No file or network access, so it is easy to test.

const CATEGORIES = [
  'Sabzi & Vegetables',
  'Ration & Staples',
  'Oil & Spices',
  'Dairy & Morning',
  'LPG Gas & Utility',
];

// House rule: a member is exempt when away for 7 or more days (inclusive).
// 6 days or fewer = present, nothing deducted. 7+ days = every away day is deducted.
const EXEMPT_MIN_DAYS = 7;
const EXEMPT_ABOVE_DAYS = EXEMPT_MIN_DAYS;

// Differences smaller than this (in rupees) are treated as "settled".
const TOLERANCE = 0.5;

// Calendar length of a month, e.g. daysInMonth('2026-02') === 28.
function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function upiLink({ upi, name, amount, note }) {
  const enc = encodeURIComponent;
  return `upi://pay?pa=${enc(upi)}&pn=${enc(name)}&am=${amount}&cu=INR&tn=${enc(note)}`;
}

/**
 * Work out one month of kitchen money.
 *
 * @param {object} input
 * @param {string} input.ym            'YYYY-MM'
 * @param {Array}  input.members       [{ id, name, upi }]
 * @param {Array}  input.expenses      [{ memberId, amount, date }]  (all months; filtered here)
 * @param {object} input.leaves        { [memberId]: { days } } for this month
 * @param {object} input.settledKeys   { [transferKey]: true }
 */
function computeSettlement({ ym, members, expenses, leaves = {}, settledKeys = {} }) {
  const N = daysInMonth(ym);
  const monthExpenses = expenses.filter((e) => e.date.startsWith(`${ym}-`));
  const totalSpend = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const stats = members.map((m) => {
    const mine = monthExpenses.filter((e) => e.memberId === m.id);
    const paid = mine.reduce((sum, e) => sum + Number(e.amount), 0);
    const requested = Math.round(Number((leaves[m.id] || {}).days) || 0);
    const daysAway = Math.min(Math.max(requested, 0), N);
    const exempt = daysAway >= EXEMPT_MIN_DAYS;
    const deductedDays = exempt ? daysAway : 0;
    return {
      id: m.id,
      name: m.name,
      upi: m.upi,
      paid,
      expenseCount: mine.length,
      daysAway,
      exempt,
      deductedDays,
      activeDays: N - deductedDays,
    };
  });

  const totalActiveDays = stats.reduce((sum, s) => sum + s.activeDays, 0);
  const totalDeductedDays = stats.reduce((sum, s) => sum + s.deductedDays, 0);
  const ratePerDay = totalActiveDays > 0 ? totalSpend / totalActiveDays : 0;

  stats.forEach((s) => {
    s.fairShare = s.activeDays * ratePerDay;
    s.net = s.paid - s.fairShare; // > 0 gets money back, < 0 owes money
  });

  const transfers = minimumTransfers(stats, ym, settledKeys);

  return {
    ym,
    daysInMonth: N,
    expenseCount: monthExpenses.length,
    totalSpend,
    totalActiveDays,
    totalDeductedDays,
    ratePerDay,
    fullMonthShare: ratePerDay * N,
    members: stats,
    transfers,
  };
}

// Greedy minimum cash-flow: match the biggest debtor with the biggest creditor until all are settled.
function minimumTransfers(stats, ym, settledKeys) {
  const debtors = stats
    .filter((s) => s.net < -TOLERANCE)
    .map((s) => ({ s, rem: -s.net }))
    .sort((a, b) => b.rem - a.rem);
  const creditors = stats
    .filter((s) => s.net > TOLERANCE)
    .map((s) => ({ s, rem: s.net }))
    .sort((a, b) => b.rem - a.rem);

  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amt = Math.min(d.rem, c.rem);
    const amount = Math.round(amt);

    if (amount >= 1) {
      const key = `${d.s.id}>${c.s.id}:${amount}`;
      out.push({
        key,
        fromId: d.s.id,
        fromName: d.s.name,
        toId: c.s.id,
        toName: c.s.name,
        toUpi: c.s.upi || '',
        amount,
        upiLink: c.s.upi ? upiLink({ upi: c.s.upi, name: c.s.name, amount, note: `FlatKhata ${ym}` }) : null,
        settled: Boolean(settledKeys[key]),
      });
    }

    d.rem -= amt;
    c.rem -= amt;
    if (d.rem < 0.01) i += 1;
    if (c.rem < 0.01) j += 1;
  }
  return out;
}

module.exports = { CATEGORIES, EXEMPT_ABOVE_DAYS, daysInMonth, computeSettlement };
