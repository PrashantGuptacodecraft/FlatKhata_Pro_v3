'use strict';

const cron = require('node-cron');
const store = require('./store');
const mailer = require('./mailer');
const { APP_URL, TIMEZONE, REPORT_CRON, AUTO_REPORT_ENABLED } = require('./config');
const { computeSettlement, daysInMonth } = require('./settlement');
const { esc, inr, monthLabel, localParts, shiftMonth } = require('./util');

function getSettlement(ym) {
  const d = store.db();
  return computeSettlement({
    ym,
    members: d.members.map((m) => ({ id: m.id, name: m.name, upi: m.upi })),
    expenses: d.expenses,
    leaves: d.leaves[ym] || {},
    settledKeys: (d.months[ym] && d.months[ym].settledKeys) || {},
  });
}

// Every flatmate gets the same full table, with their own lines at the top.
function buildMonthEmail(s, me) {
  const label = monthLabel(s.ym);
  const mine = s.members.find((m) => m.id === me.id);
  const net = Math.round(mine.net);

  const headlineText = net > 0 ? `you get back ${inr(net)}`
    : net < 0 ? `you pay ${inr(-net)}`
    : 'you are settled up';
  const subject = `[FlatKhata] ${label}: ${headlineText}`;

  const myPays = s.transfers.filter((t) => t.fromId === me.id);
  const myGets = s.transfers.filter((t) => t.toId === me.id);
  const personal = [
    ...myPays.map((t) => `Pay ${inr(t.amount)} to ${t.toName}${t.toUpi ? ` (UPI ${t.toUpi})` : ''}`),
    ...myGets.map((t) => `Receive ${inr(t.amount)} from ${t.fromName}`),
  ];

  const headlineHtml = net > 0 ? `You get back <strong>${inr(net)}</strong>`
    : net < 0 ? `You pay <strong>${inr(-net)}</strong>`
    : 'You are <strong>settled up</strong> this month';

  const cell = 'padding:8px 4px;border-bottom:1px solid #eee';
  const memberRows = s.members.map((m) => {
    const n = Math.round(m.net);
    const color = n >= 0 ? '#3f6e2a' : '#b0422b';
    return `<tr>
      <td style="${cell}">${esc(m.name)}${m.id === me.id ? ' (you)' : ''}</td>
      <td style="${cell};text-align:right">${esc(inr(m.paid))}</td>
      <td style="${cell};text-align:center">${m.activeDays}/${s.daysInMonth}</td>
      <td style="${cell};text-align:right">${esc(inr(Math.round(m.fairShare)))}</td>
      <td style="${cell};text-align:right;color:${color};font-weight:bold">${n >= 0 ? '+' : ''}${esc(inr(n))}</td>
    </tr>`;
  }).join('');

  const transferItems = s.transfers.length
    ? s.transfers.map((t) => `<li style="margin:4px 0">${esc(t.fromName)} pays <strong>${esc(inr(t.amount))}</strong> to ${esc(t.toName)}${t.toUpi ? ` (UPI ${esc(t.toUpi)})` : ''}</li>`).join('')
    : '<li>Everyone is settled. No transfers needed.</li>';

  const head = (text, align = 'left') => `<th style="padding:6px 4px;text-align:${align};font-size:12px;color:#7a6c57;border-bottom:1px solid #ddd">${text}</th>`;

  const html = layout(`${label} kitchen settlement`, `
    <p style="margin:0 0 6px;font-size:16px">Hi ${esc(me.name)},</p>
    <p style="margin:0 0 14px;font-size:20px">${headlineHtml} for ${esc(label)}.</p>
    ${personal.length ? `<ul style="padding-left:18px;margin:0 0 16px">${personal.map((p) => `<li style="margin:4px 0">${esc(p)}</li>`).join('')}</ul>` : ''}
    <p style="margin:0 0 14px;font-size:13px;color:#6b5d48">
      ${s.expenseCount} purchases · ${s.totalActiveDays} active days · ${esc(inr(s.totalSpend))} spent · ${esc(inr(s.ratePerDay, 2))} per active day
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr>${head('Member')}${head('Paid', 'right')}${head('Days', 'center')}${head('Share', 'right')}${head('Net', 'right')}</tr></thead>
      <tbody>${memberRows}</tbody>
    </table>
    <h2 style="font-family:Georgia,serif;font-size:17px;margin:22px 0 8px">Who pays whom</h2>
    <ul style="padding-left:18px;margin:0 0 14px">${transferItems}</ul>
    <p style="font-size:12px;color:#6b5d48;margin:0">
      Share = active days × per-day rate. Away more than 7 days? Those days are deducted. 7 days or fewer are not.
      Amounts are rounded to whole rupees.
    </p>`);

  const rows = s.members.map((m) => {
    const n = Math.round(m.net);
    return `${m.name.padEnd(11)} ${inr(m.paid).padStart(9)}  ${`${m.activeDays}/${s.daysInMonth}`.padStart(6)}  ${inr(Math.round(m.fairShare)).padStart(9)}  ${n >= 0 ? '+' : ''}${inr(n)}`;
  });

  const text = [
    `FlatKhata Pro · ${label}`,
    `Hi ${me.name}, ${headlineText} this month.`,
    '',
    ...personal.map((p) => `- ${p}`),
    '',
    'Member      Paid      Days      Share       Net',
    ...rows,
    '',
    'Who pays whom:',
    ...(s.transfers.length
      ? s.transfers.map((t) => `- ${t.fromName} pays ${inr(t.amount)} to ${t.toName}${t.toUpi ? ` (UPI ${t.toUpi})` : ''}`)
      : ['- Everyone is settled.']),
    '',
    `Open FlatKhata: ${APP_URL}`,
  ].join('\n');

  return { subject, html, text };
}

function layout(title, body) {
  return mailer.layout(title, body);
}

async function sendMonthReport(ym, { triggeredBy = 'System' } = {}) {
  const s = getSettlement(ym);
  const results = [];

  for (const m of store.db().members) {
    if (!m.email) {
      results.push({ memberId: m.id, name: m.name, status: 'skipped', error: 'No email address set' });
      continue;
    }
    try {
      const mail = buildMonthEmail(s, m);
      const sent = await mailer.sendMail({ to: m.email, ...mail });
      results.push({ memberId: m.id, name: m.name, status: sent.mode });
    } catch (err) {
      results.push({ memberId: m.id, name: m.name, status: 'failed', error: err.message });
    }
  }

  const record = {
    at: new Date().toISOString(),
    triggeredBy,
    mode: mailer.isConfigured() ? 'smtp' : 'dry-run',
    delivered: results.filter((r) => r.status === 'smtp' || r.status === 'dry-run').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  };

  await store.write((d) => {
    const rec = store.ensureMonth(d, ym);
    rec.reports = [record, ...rec.reports].slice(0, 12);
    store.addAudit(d, triggeredBy, 'EMAIL', `${monthLabel(ym)} report: ${record.delivered} delivered, ${record.failed} failed`);
  });
  return record;
}

// Sends the automatic report once per month, even if the cron fires twice.
async function sendOnce(ym, now, triggeredBy) {
  const existing = store.db().months[ym];
  if (existing && existing.autoSentAt) return null;
  const record = await sendMonthReport(ym, { triggeredBy });
  await store.write((d) => {
    store.ensureMonth(d, ym).autoSentAt = now.toISOString();
  });
  return record;
}

async function runMonthEndJob(now = new Date()) {
  const today = localParts(now);
  if (today.day !== daysInMonth(today.ym)) return null; // not the last day yet
  return sendOnce(today.ym, now, 'Automatic (month end)');
}

// If the server was off on the last night, send the missed report during the first week of the new month.
async function catchUpPreviousMonth() {
  if (!AUTO_REPORT_ENABLED) return null;
  const today = localParts();
  const previous = shiftMonth(today.ym, -1);
  const d = store.db();
  const hasSpend = d.expenses.some((e) => e.date.startsWith(`${previous}-`));
  const alreadySent = Boolean(d.months[previous] && d.months[previous].autoSentAt);
  if (!hasSpend || alreadySent || today.day > 7) return null;
  console.log(`[reports] Sending the missed ${monthLabel(previous)} report now.`);
  return sendOnce(previous, new Date(), 'Automatic (catch-up after restart)');
}

function startScheduler() {
  if (!AUTO_REPORT_ENABLED) {
    console.log('[reports] Automatic month-end email is off (AUTO_REPORT_ENABLED=false).');
    return;
  }
  if (!cron.validate(REPORT_CRON)) {
    throw new Error(`REPORT_CRON "${REPORT_CRON}" is not a valid cron expression.`);
  }
  cron.schedule(REPORT_CRON, () => {
    runMonthEndJob()
      .then((record) => {
        if (record) console.log(`[reports] Month-end report: ${record.delivered} delivered, ${record.failed} failed.`);
      })
      .catch((err) => console.error('[reports] Month-end job failed:', err));
  }, { timezone: TIMEZONE });
  console.log(`[reports] Month-end email armed (${REPORT_CRON}, ${TIMEZONE}). It goes out on the last day of each month.`);
}

module.exports = {
  getSettlement,
  buildMonthEmail,
  sendMonthReport,
  runMonthEndJob,
  catchUpPreviousMonth,
  startScheduler,
};
