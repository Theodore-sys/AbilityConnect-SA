// backend/src/mailer.js  -  one place that sends every email, so problems are easy to see.
// Set these in backend/.env:  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (a Gmail App Password), MAIL_FROM
const nodemailer = require('nodemailer');
let tx = null;

const configured = () => !!process.env.BREVO_API_KEY || !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) && !/your-16|app-password|xxxx|paste/i.test(process.env.SMTP_PASS);
const siteUrl = () => (process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',')[0].trim() : 'http://localhost:5173').replace(/\/$/, '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const transport = () => {
  if (tx) return tx;
  const port = Number(process.env.SMTP_PORT) || 465;
  tx = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 15000, greetingTimeout: 15000 });
  return tx;
};
// Gmail only accepts mail "from" the same address you log in with, so by default we use SMTP_USER
const from = () => process.env.MAIL_FROM || `AbilityConnect SA <${process.env.SMTP_USER}>`;

// A clean, simple email layout (plain text is always sent too, which helps emails reach the inbox)
const layout = (heading, paragraphs, button, footer) => `<!doctype html><html><body style="margin:0;background:#f5f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td style="font-size:18px;font-weight:bold;color:#4338ca">AbilityConnect SA</td></tr>
<tr><td style="font-size:22px;font-weight:bold;padding:14px 0 6px">${esc(heading)}</td></tr>
<tr><td style="font-size:16px;line-height:1.55">${paragraphs.map((p) => `<p style="margin:0 0 12px">${esc(p)}</p>`).join('')}</td></tr>
${button ? `<tr><td style="padding:8px 0 16px"><a href="${button.url}" style="background:#4f46e5;color:#ffffff;padding:13px 22px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">${esc(button.label)}</a></td></tr>
<tr><td style="font-size:13px;color:#475569;word-break:break-all">If the button does not work, copy this link into your browser:<br>${esc(button.url)}</td></tr>` : ''}
<tr><td style="font-size:12px;color:#64748b;padding-top:18px">${esc(footer || 'You are receiving this email because you have an AbilityConnect SA account.')}</td></tr>
</table></td></tr></table></body></html>`;

// Render's free plan blocks the normal email ports (SMTP). Brevo's web API works over HTTPS, so it is not blocked.
// Set BREVO_API_KEY (and BREVO_SENDER = the email address you verified in Brevo). If BREVO_API_KEY is empty, SMTP is used as before.
async function sendViaBrevo({ to, subject, text, html }) {
  const sender = process.env.BREVO_SENDER || process.env.MAIL_FROM || process.env.SMTP_USER;
  const m = String(sender || '').match(/^(.*)<(.+)>$/);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { name: (m ? m[1].trim() : '') || 'AbilityConnect SA', email: (m ? m[2] : sender).trim() }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
  });
  if (!res.ok) throw new Error('Brevo refused the email (' + res.status + '): ' + (await res.text()).slice(0, 300));
  console.log(`EMAIL SENT via Brevo to ${to}: ${subject}`);
  return { sent: true };
}

async function sendMail({ to, subject, text, html, bulk }) {
  if (!configured()) {
    console.log(`\n[EMAIL IS NOT SET UP YET: add SMTP_USER and a real SMTP_PASS to backend/.env]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return { sent: false, reason: 'not_configured' };
  }
  if (process.env.BREVO_API_KEY) return sendViaBrevo({ to, subject, text, html });
  const headers = bulk ? { 'List-Unsubscribe': `<${siteUrl()}/>`, Precedence: 'bulk' } : {};
  const info = await transport().sendMail({ from: from(), to, subject, text, html, replyTo: process.env.MAIL_REPLY_TO || process.env.SMTP_USER, headers });
  console.log(`EMAIL SENT to ${to} (${(info.accepted || []).length ? 'accepted' : 'REJECTED'}): ${subject}`);
  if (!(info.accepted || []).length) throw new Error('The email server did not accept the address ' + to);
  return { sent: true };
}

async function verify() {
  if (!configured()) { console.log('EMAIL: not set up yet (SMTP_PASS is missing or still a placeholder). Emails are printed here instead of being sent.'); return false; }
  if (process.env.BREVO_API_KEY) { console.log('EMAIL READY: sending through Brevo'); return true; }
  try { await transport().verify(); console.log('EMAIL READY: sending as ' + from()); return true; }
  catch (e) { console.error('EMAIL PROBLEM: ' + e.message + '\n   For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=your Gmail address, SMTP_PASS=a 16-letter App Password.'); return false; }
}

module.exports = { configured, sendMail, verify, layout, siteUrl, esc };