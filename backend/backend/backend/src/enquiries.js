// backend/src/enquiries.js  -  loaded from server.js. Lets people who are not logged in (for example people who want to
// become interpreters) send a question or request. It is saved in the database AND emailed to the organiser.
const jwt = require('jsonwebtoken');
const mailer = require('./mailer');

module.exports = (app, pool) => {
  const run = (sql, p) => pool.query(sql, p);
  const read = (req) => { try { return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); } catch { return null; } };
  const admin = (req, res, next) => { const u = read(req); if (u && u.role === 'admin') { req.user = u; return next(); } return res.status(403).json({ error: 'Administrators only' }); };
  const h = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); } };
  const KINDS = ['Apply to become an interpreter', 'Question about the interpreter portal', 'Problem logging in', 'Employment or job post', 'Other'];

  run(`CREATE TABLE IF NOT EXISTS enquiries (
    id SERIAL PRIMARY KEY, kind TEXT, name TEXT, email TEXT, message TEXT, status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ DEFAULT now())`).catch((e) => console.error('SETUP PROBLEM (enquiries):', e.message || e.code));

  app.post('/api/enquiries', h(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').trim().slice(0, 80);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
    const message = String(b.message || '').trim().slice(0, 2000);
    const kind = KINDS.includes(b.kind) ? b.kind : 'Other';
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 5) return res.status(400).json({ error: 'Please fill in your name, a valid email address and your message.' });
    await run('INSERT INTO enquiries(kind,name,email,message) VALUES($1,$2,$3,$4)', [kind, name, email, message]);
    const to = (process.env.ENQUIRY_EMAIL || 'abilityconnectsa@gmail.com').trim();
    const text = `New enquiry from the AbilityConnect SA website\n\nType: ${kind}\nName: ${name}\nEmail (reply to this person): ${email}\n\n${message}\n`;
    mailer.sendMail({ to, subject: `[AbilityConnect SA] ${kind} - ${name}`, text }).catch((e) => console.error('ENQUIRY EMAIL PROBLEM:', e.message));
    res.status(201).json({ ok: true });
  }));

  app.get('/api/admin/enquiries', admin, h(async (_req, res) => { res.json((await run('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 300')).rows); }));
  app.patch('/api/admin/enquiries/:id', admin, h(async (req, res) => {
    await run('UPDATE enquiries SET status=$1 WHERE id=$2', [['new', 'answered', 'closed'].includes(req.body.status) ? req.body.status : 'new', req.params.id]); res.json({ ok: true });
  }));
};
