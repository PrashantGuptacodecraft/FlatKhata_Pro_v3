'use strict';

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { SMTP, MAIL_FROM, APP_URL, DATA_DIR } = require('./config');
const { esc } = require('./util');

// Without SMTP settings, emails are written to backend/data/outbox so you can test the whole flow.
const OUTBOX = path.join(DATA_DIR, 'outbox');
let transporter = null;

function isConfigured() {
  return Boolean(SMTP.host && SMTP.user && SMTP.pass);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP.host,
      port: SMTP.port,
      secure: SMTP.secure,
      auth: { user: SMTP.user, pass: SMTP.pass },
    });
  }
  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  if (!isConfigured()) {
    fs.mkdirSync(OUTBOX, { recursive: true });
    const file = path.join(OUTBOX, `${Date.now()}_${to.replace(/[^a-z0-9]+/gi, '_')}.html`);
    fs.writeFileSync(file, `<!-- To: ${to}\nSubject: ${subject}\n-->\n${html}`);
    return { mode: 'dry-run', file };
  }
  await getTransporter().sendMail({ from: MAIL_FROM, to, subject, html, text });
  return { mode: 'smtp' };
}

function layout(title, bodyHtml) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5efe3;font-family:Arial,Helvetica,sans-serif;color:#2a2118">
<div style="max-width:620px;margin:0 auto;padding:24px 14px">
  <h1 style="font-family:Georgia,serif;font-size:22px;margin:0 0 14px;color:#2a2118">${esc(title)}</h1>
  <div style="background:#ffffff;border:1px solid #e4dac6;border-radius:12px;padding:20px">${bodyHtml}</div>
  <p style="font-size:12px;color:#7a6c57;margin:14px 0 0">FlatKhata Pro · <a href="${esc(APP_URL)}" style="color:#7a6c57">${esc(APP_URL)}</a></p>
</div>
</body></html>`;
}

// kind: 'welcome' (first setup) or 'reset' (admin reset). Both carry a temporary password.
function sendCredentials(member, tempPassword, kind = 'welcome') {
  const isReset = kind === 'reset';
  const title = isReset ? 'Your FlatKhata password was reset' : 'Your FlatKhata Pro login';
  const intro = isReset
    ? 'The flat admin reset your FlatKhata password.'
    : 'Your FlatKhata Pro login is ready.';
  const html = layout(title, `
    <p style="margin:0 0 10px">Hi ${esc(member.name)},</p>
    <p style="margin:0 0 10px">${esc(intro)}</p>
    <p style="margin:0 0 14px">Temporary password:
      <code style="font-size:16px;background:#f3ecdd;padding:4px 8px;border-radius:6px">${esc(tempPassword)}</code>
    </p>
    <p style="margin:0 0 10px">Sign in at <a href="${esc(APP_URL)}">${esc(APP_URL)}</a> with your name and this password.
      You will be asked to choose your own password straight away. The temporary one stops working after that.</p>`);
  const text = [
    `Hi ${member.name},`,
    intro,
    `Temporary password: ${tempPassword}`,
    `Sign in at ${APP_URL} and choose your own password.`,
  ].join('\n');
  return sendMail({ to: member.email, subject: `[FlatKhata] ${title}`, html, text });
}

module.exports = { isConfigured, sendMail, sendCredentials, layout };
