require('dotenv').config();
fetch(process.env.GMAIL_RELAY_URL, {
  method: 'POST',
  headers: { 'content-type': 'text/plain' },
  body: JSON.stringify({ key: process.env.GMAIL_RELAY_KEY, to: 'x@example.com', subject: 't', text: 't', html: 't' }),
}).then(async (r) => {
  const t = await r.text();
  const clean = t.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  console.log('Answer from Google:', clean.slice(0, 300));
});
