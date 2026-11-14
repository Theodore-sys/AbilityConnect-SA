// backend/src/notify.js  -  notifications that reach people even when they are NOT in the app.
//   * Push notifications to phones and computers (needs:  npm install web-push, and VAPID keys in .env)
//   * A message inbox inside the app
//   * Optional email notifications (people choose this in My profile)
// Other files send messages with:  app.locals.notify.broadcast({ title, body, url })   and   app.locals.notify.toUser(userId, title, body)
const jwt = require('jsonwebtoken');
const webpush = require('web-push');
const mailer = require('./mailer');

module.exports = (app, pool) => {
  const run = (sql, p) => pool.query(sql, p);
  const pub = process.env.VAPID_PUBLIC_KEY; const priv = process.env.VAPID_PRIVATE_KEY;
  const pushOn = !!(pub && priv);
  if (pushOn) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:' + (process.env.SMTP_USER || 'admin@example.com'), pub, priv);
  else console.log('PUSH: not switched on yet. Create keys with  npx web-push generate-vapid-keys  and add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY to backend/.env');
  mailer.verify();

  (async () => {
    await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email BOOLEAN DEFAULT false');
    await run(`CREATE TABLE IF NOT EXISTS push_subscriptions (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`);
    await run(`CREATE TABLE IF NOT EXISTS inbox (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT,
      url TEXT, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`);
    await run('CREATE INDEX IF NOT EXISTS inbox_user_idx ON inbox(user_id, created_at)');
  })().catch((e) => console.error('SETUP PROBLEM (notify):', e.message || e.code));

  const read = (req) => { try { return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); } catch { return null; } };
  const auth = (req, res, next) => { req.user = read(req); req.user ? next() : res.status(401).json({ error: 'Please log in' }); };
  const h = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { console.error(e); res.status(500).json({ error: 'Server error: ' + (e.message || e.code) }); }
  };
  const short = (t, n) => (String(t || '').length > n ? String(t).slice(0, n - 1) + '…' : String(t || ''));

  // Send one push message to a list of saved devices. Devices that no longer exist are removed.
  const pushTo = async (subs, payload) => {
    if (!pushOn || !subs.length) return 0;
    const body = JSON.stringify(payload); let sent = 0;
    for (let i = 0; i < subs.length; i += 25) {
      await Promise.all(subs.slice(i, i + 25).map(async (s) => {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 86400 }); sent++; }
        catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await run('DELETE FROM push_subscriptions WHERE endpoint=$1', [s.endpoint]).catch(() => {}); }
      }));
    }
    return sent;
  };
  const emailTo = (u, title, body, url) => mailer.sendMail({
    to: u.email, subject: title, bulk: true,
    text: `${title}\n\n${body}\n\nOpen AbilityConnect SA: ${url}\n\nYou get these emails because you turned on email notifications. You can turn them off in My profile, then Notifications.`,
    html: mailer.layout(title, [body], { url, label: 'Open AbilityConnect SA' }, 'You get these emails because you turned on email notifications. You can turn them off in My profile, then Notifications.'),
  });

  // A message to one person: saved in their inbox, pushed to their devices, and emailed if they asked for email
  const toUser = async (userId, title, body, url = '/') => {
    try {
      await run('INSERT INTO inbox(user_id,title,body,url) VALUES($1,$2,$3,$4)', [userId, short(title, 120), short(body, 500), url]);
      const subs = (await run('SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=$1', [userId])).rows;
      await pushTo(subs, { title: short(title, 80), body: short(body, 140), url, tag: 'msg' });
      const u = (await run('SELECT email,notify_email,disabled FROM users WHERE id=$1', [userId])).rows[0];
      if (u && u.notify_email && !u.disabled && mailer.configured()) await emailTo(u, title, body, mailer.siteUrl() + '/');
    } catch (e) { console.error('NOTIFY problem:', e.message); }
  };

  // A message to everyone who turned notifications on
  const broadcast = async ({ title, body, url = '/' }) => {
    try {
      const subs = (await run('SELECT s.endpoint,s.p256dh,s.auth FROM push_subscriptions s JOIN users u ON u.id=s.user_id WHERE NOT COALESCE(u.disabled,false)')).rows;
      const n = await pushTo(subs, { title: short(title, 80), body: short(body, 140), url, tag: 'news' });
      let mails = 0;
      if (mailer.configured()) {
        const users = (await run('SELECT email FROM users WHERE COALESCE(notify_email,false) AND NOT COALESCE(disabled,false) LIMIT 1000')).rows;
        for (const u of users) { try { await emailTo(u, title, body, mailer.siteUrl() + '/'); mails++; } catch (e) { console.error('EMAIL FAILED:', e.message); } await new Promise((r) => setTimeout(r, 400)); }
      }
      console.log(`NOTIFY: "${title}" sent to ${n} device(s) and ${mails} email(s)`);
    } catch (e) { console.error('NOTIFY problem:', e.message); }
  };
  app.locals.notify = { toUser, broadcast };

  // ---------- Push: devices ----------
  app.get('/api/push/key', (_req, res) => (pushOn ? res.json({ key: pub }) : res.status(503).json({ error: 'Notifications are not switched on yet. The organiser must add VAPID keys to the backend .env file.' })));
  app.post('/api/push/subscribe', auth, h(async (req, res) => {
    const { endpoint, keys } = req.body || {};
    if (!pushOn) return res.status(503).json({ error: 'Notifications are not switched on yet.' });
    if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 700 || !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 100) {
      return res.status(400).json({ error: 'That device could not be registered.' });
    }
    await run('INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES($1,$2,$3,$4) ON CONFLICT (endpoint) DO UPDATE SET user_id=$1, p256dh=$3, auth=$4', [req.user.id, endpoint, keys.p256dh, keys.auth]);
    await run('DELETE FROM push_subscriptions WHERE id IN (SELECT id FROM push_subscriptions WHERE user_id=$1 ORDER BY created_at DESC OFFSET 10)', [req.user.id]); // at most 10 devices each
    res.status(201).json({ ok: true });
  }));
  app.delete('/api/push/subscribe', auth, h(async (req, res) => {
    await run('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2', [String((req.body || {}).endpoint || ''), req.user.id]); res.json({ ok: true });
  }));
  app.post('/api/push/test', auth, h(async (req, res) => {
    const subs = (await run('SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=$1', [req.user.id])).rows;
    const n = await pushTo(subs, { title: 'AbilityConnect SA', body: 'Notifications are working. You will get a message like this when there is news.', url: '/', tag: 'test' });
    res.json({ sent: n, devices: subs.length });
  }));
  app.get('/api/me/notifications', auth, h(async (req, res) => {
    const u = (await run('SELECT COALESCE(notify_email,false) AS email FROM users WHERE id=$1', [req.user.id])).rows[0] || {};
    const d = (await run('SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id=$1', [req.user.id])).rows[0].n;
    res.json({ push_available: pushOn, email: u.email, email_available: mailer.configured(), devices: d });
  }));
  app.put('/api/me/notifications', auth, h(async (req, res) => {
    await run('UPDATE users SET notify_email=$1 WHERE id=$2', [req.body.email === true, req.user.id]); res.json({ ok: true });
  }));

  // ---------- Inbox ----------
  app.get('/api/inbox', auth, h(async (req, res) => {
    const items = (await run('SELECT id,title,body,url,read_at,created_at FROM inbox WHERE user_id=$1 ORDER BY created_at DESC LIMIT 60', [req.user.id])).rows;
    res.json({ unread: items.filter((i) => !i.read_at).length, items });
  }));
  app.get('/api/inbox/count', auth, h(async (req, res) => {
    res.json({ unread: (await run('SELECT COUNT(*)::int AS n FROM inbox WHERE user_id=$1 AND read_at IS NULL', [req.user.id])).rows[0].n });
  }));
  app.post('/api/inbox/read', auth, h(async (req, res) => { await run('UPDATE inbox SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]); res.json({ ok: true }); }));
  app.delete('/api/inbox/:id', auth, h(async (req, res) => { await run('DELETE FROM inbox WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); res.json({ ok: true }); }));
};
