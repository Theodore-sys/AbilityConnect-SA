// backend/src/test-email.js  -  checks that email sending works.   Run:  node src/test-email.js you@gmail.com
require('dotenv').config();
const mailer = require('./mailer');
(async () => {
  const to = process.argv[2];
  if (!to) { console.log('Usage: node src/test-email.js your-email@example.com'); return; }
  if (!(await mailer.verify())) { console.log('\nFix the EMAIL PROBLEM above, then run this again.'); return; }
  await mailer.sendMail({
    to, subject: 'AbilityConnect SA test email', text: 'This is a test email from AbilityConnect SA. If you can read this, email sending works.',
    html: mailer.layout('Test email', ['This is a test email from AbilityConnect SA.', 'If you can read this, email sending works.'], { url: mailer.siteUrl(), label: 'Open AbilityConnect SA' }),
  });
  console.log('Sent. Check the inbox, and also the Spam folder. If it is in Spam, open it and click "Not spam".');
})().catch((e) => console.error('FAILED:', e.message));
