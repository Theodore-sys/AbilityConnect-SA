// backend/src/security.js  -  the security layer. Needs:  npm install helmet express-rate-limit
// It adds: safe HTTP headers, request limits, small body-size limits, session revocation (suspended users, changed passwords,
// "log out everywhere"), account lockout after repeated wrong passwords, a security log, and an audit log of administrator actions.
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const express = require('express');
const mailer = require('./mailer');

module.exports = (app, pool) => {
  const prod = process.env.NODE_ENV === 'production';
  const run = (sql, p) => pool.query(sql, p);

  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY || (prod ? 1 : 0)));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const ready = (async () => {
    await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT false');
    await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_valid_from TIMESTAMPTZ');
    await run(`CREATE TABLE IF NOT EXISTS security_events (id SERIAL PRIMARY KEY, type TEXT NOT NULL, user_id INT, email TEXT, ip TEXT, detail TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
    await run('CREATE INDEX IF NOT EXISTS security_events_idx ON security_events(type, email, created_at)');
  })();
  ready.catch((e) => console.error('SETUP PROBLEM (security):', e.message || e.code));
  setInterval(() => run("DELETE FROM security_events WHERE created_at < now() - interval '90 days'").catch(() => {}), 24 * 3600 * 1000);

  // Small request bodies everywhere. Only the few routes that really need big uploads get bigger limits.
  app.use(['/api/reports', '/api/sign-requests'], express.json({ limit: '9mb' }));
  app.use('/api/admin/places-import', express.json({ limit: '6mb' }));
  app.use('/api/me', express.json({ limit: '700kb' }));
  app.use(express.json({ limit: '100kb' }));

  // In production, never show internal error details to the public
  app.use((req, res, next) => {
    if (prod) {
      const j = res.json.bind(res);
      res.json = (b) => (res.statusCode >= 500 && b && typeof b === 'object' && b.error ? j({ error: 'Something went wrong on our side. Please try again later.' }) : j(b));
    }
    next();
  });

  // Request limits (per visitor)
  const limit = (minutes, max, msg) => rateLimit({ windowMs: minutes * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { error: msg } });
  app.use('/api/', limit(1, 400, 'Too many requests. Please slow down and try again in a minute.'));
  app.use('/api/auth/login', limit(15, 25, 'Too many log in attempts. Please wait 15 minutes and try again.'));
  app.use('/api/auth/register', limit(60, 10, 'Too many new accounts from this connection. Please try again later.'));
  app.use('/api/auth/forgot', limit(60, 6, 'Too many password reset requests. Please try again in an hour.'));
  app.use('/api/auth/reset', limit(60, 10, 'Too many attempts. Please try again later.'));
  app.use('/api/auth/google', limit(15, 30, 'Too many attempts. Please wait a few minutes.'));
  app.use('/api/certificates', limit(1, 30, 'Too many checks. Please wait a minute.'));
  app.use('/api/translate', limit(1, 30, 'Too many translations. Please wait a minute.'));

  // Every logged-in request is re-checked: suspended users, changed roles and revoked sessions are refused immediately
  const cache = new Map();
  const status = async (id) => {
    const c = cache.get(id);
    if (c && Date.now() - c.at < 15000) return c.st;
    const st = (await run('SELECT role, disabled, sessions_valid_from, email FROM users WHERE id=$1', [id])).rows[0] || null;
    cache.set(id, { at: Date.now(), st });
    return st;
  };
  const forget = (id) => cache.delete(id);
  app.use(async (req, res, next) => {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return next();
    let p;
    try { p = jwt.verify(h.slice(7), process.env.JWT_SECRET); } catch { return next(); } // a bad token is answered by the route itself
    try {
      await ready.catch(() => {});
      const st = await status(p.id);
      const since = st && st.sessions_valid_from ? Math.floor(new Date(st.sessions_valid_from).getTime() / 1000) : 0;
      if (!st || st.disabled || st.role !== p.role || p.iat < since || (st.role === 'admin' && process.env.ADMIN_EMAIL && String(st.email).toLowerCase() !== process.env.ADMIN_EMAIL.trim().toLowerCase())) return res.status(401).json({ error: 'Your session has ended. Please log in again.' });
      req.secUser = p;
    } catch (e) { return res.status(503).json({ error: 'The service is busy. Please try again in a moment.' }); }
    return next();
  });

  // Security log + audit log of what administrators change
  const event = (type, { userId = null, email = null, ip = null, detail = null } = {}) =>
    run('INSERT INTO security_events(type,user_id,email,ip,detail) VALUES($1,$2,$3,$4,$5)', [type, userId, email, ip, detail && String(detail).slice(0, 300)]).catch(() => {});
  app.use((req, res, next) => {
    res.on('finish', () => {
      if (req.secUser && req.secUser.role === 'admin' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && res.statusCode < 400) {
        event('admin_action', { userId: req.secUser.id, email: req.secUser.name, ip: req.ip, detail: req.method + ' ' + req.path });
      }
    });
    next();
  });

  // Lockout: 5 wrong passwords for one email in 15 minutes locks that account for the rest of the 15 minutes
  const isLocked = async (email) => (await run("SELECT COUNT(*)::int AS n FROM security_events WHERE type='login_failed' AND email=$1 AND created_at > now() - interval '15 minutes'", [email])).rows[0].n >= 5;
  const failed = (email, ip, userId) => event('login_failed', { email, ip, userId });
  const succeeded = (email) => run("DELETE FROM security_events WHERE type='login_failed' AND email=$1", [email]).catch(() => {});

  const needAdmin = (req, res, next) => {
    if (!req.secUser) return res.status(401).json({ error: 'Please log in' });
    return req.secUser.role === 'admin' ? next() : res.status(403).json({ error: 'Administrators only' });
  };
  app.get('/api/admin/security-log', needAdmin, async (_req, res) => {
    try { res.json((await run('SELECT id,type,email,ip,detail,created_at FROM security_events ORDER BY created_at DESC LIMIT 200')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error: ' + e.message }); }
  });
  app.patch('/api/admin/users/:id/suspend', needAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (id === req.secUser.id) return res.status(400).json({ error: 'You cannot suspend your own account' });
      const on = req.body.suspended === true;
      await run('UPDATE users SET disabled=$1 WHERE id=$2', [on, id]);
      forget(id); event(on ? 'user_suspended' : 'user_unsuspended', { userId: req.secUser.id, detail: 'user ' + id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Server error: ' + e.message }); }
  });
  app.post('/api/admin/email-test', needAdmin, async (req, res) => {
    try {
      const me = (await run('SELECT email FROM users WHERE id=$1', [req.secUser.id])).rows[0];
      const r = await mailer.sendMail({ to: me.email, subject: 'AbilityConnect SA test email', text: 'This is a test email. If you can read this, email sending works.',
        html: mailer.layout('Test email', ['This is a test email from AbilityConnect SA.', 'If you can read this, email sending works.'], { url: mailer.siteUrl(), label: 'Open AbilityConnect SA' }) });
      res.json(r.sent ? { ok: true, message: 'Test email sent to ' + me.email + '. Check the inbox and the Spam folder.' } : { ok: false, message: 'Email is not set up yet. Add SMTP_USER and a real SMTP_PASS (a Gmail App Password) to backend/.env, then restart.' });
    } catch (e) { res.status(502).json({ error: 'The email could not be sent: ' + e.message }); }
  });

  // Called at the very end of server.js, after all routes
  const finish = (a) => {
    a.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
    // eslint-disable-next-line no-unused-vars
    a.use((err, req, res, next) => {
      if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large.' });
      if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'That request could not be read.' });
      if (err && /CORS/.test(err.message)) return res.status(403).json({ error: 'This website address is not allowed.' });
      console.error(err);
      return res.status(500).json({ error: prod ? 'Something went wrong on our side. Please try again later.' : 'Server error: ' + (err && err.message) });
    });
  };

  return { event, isLocked, failed, succeeded, forget, finish };
};
