// backend/src/ability.js  -  loaded from server.js with:  require('./ability')(app, pool);
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

module.exports = (app, pool) => {
  const run = (sql, p) => pool.query(sql, p);
  const STATUS = ['Submitted', 'Under review', 'Action required', 'Resolved', 'Closed'];

  (async () => {
    await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contact TEXT DEFAULT 'email'`);
    await run(`CREATE TABLE IF NOT EXISTS saved_places (
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      organisation_id INT REFERENCES organisations(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, organisation_id))`);
    await run(`CREATE TABLE IF NOT EXISTS accessibility_reports (
      id SERIAL PRIMARY KEY, reference TEXT UNIQUE NOT NULL,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      category TEXT NOT NULL, place TEXT, description TEXT NOT NULL, photo TEXT,
      status TEXT NOT NULL DEFAULT 'Submitted', admin_note TEXT,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
    await run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
    await run(`INSERT INTO settings(key,value) VALUES
      ('welcome','Find accessible places, discover opportunities and get the support you need.'),
      ('announcement',''), ('contact_email','') ON CONFLICT (key) DO NOTHING`);
  })().catch((e) => console.error('SETUP PROBLEM (ability tables):', e.message || e.code));

  const read = (req) => { try { return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); } catch { return null; } };
  const auth = (req, res, next) => { req.user = read(req); req.user ? next() : res.status(401).json({ error: 'Please log in' }); };
  const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Administrators only' }));
  const h = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { console.error(e); res.status(500).json({ error: 'Server error: ' + (e.message || e.code) }); }
  };
  const sign = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET, { expiresIn: '8h' });

  // ----- Platform settings (admin edits, everyone reads) -----
  app.get('/api/settings', h(async (_req, res) => {
    const o = {}; (await run('SELECT key,value FROM settings')).rows.forEach((r) => { o[r.key] = r.value; }); res.json(o);
  }));
  app.put('/api/settings', auth, admin, h(async (req, res) => {
    for (const k of ['welcome', 'announcement', 'contact_email']) {
      if (req.body[k] !== undefined) await run('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [k, String(req.body[k]).slice(0, 400)]);
    }
    res.json({ ok: true });
  }));

  // ----- My profile -----
  app.get('/api/me', auth, h(async (req, res) => {
    const { rows } = await run('SELECT id,name,email,role,contact FROM users WHERE id=$1', [req.user.id]); res.json(rows[0] || {});
  }));
  app.patch('/api/me', auth, h(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const contact = ['email', 'sms', 'phone', 'written'].includes(req.body.contact) ? req.body.contact : 'email';
    if (!name) return res.status(400).json({ error: 'Please enter your name' });
    const { rows } = await run('UPDATE users SET name=$1, contact=$2 WHERE id=$3 RETURNING id,name,role', [name.slice(0, 80), contact, req.user.id]);
    res.json({ token: sign(rows[0]), user: rows[0] });
  }));
  app.put('/api/me/password', auth, h(async (req, res) => {
    const { current, password } = req.body;
    if (!password || password.length < 8) return res.status(400).json({ error: 'The new password must be at least 8 characters' });
    const { rows } = await run('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!rows[0] || !(await bcrypt.compare(current || '', rows[0].password_hash))) return res.status(401).json({ error: 'Your current password is incorrect' });
    await run('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(password, 10), req.user.id]);
    res.json({ ok: true });
  }));

  // ----- Saved places -----
  app.get('/api/saved-places', auth, h(async (req, res) => {
    res.json((await run('SELECT o.* FROM organisations o JOIN saved_places s ON s.organisation_id=o.id WHERE s.user_id=$1', [req.user.id])).rows);
  }));
  app.post('/api/saved-places/:id', auth, h(async (req, res) => {
    await run('INSERT INTO saved_places VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]); res.json({ ok: true });
  }));
  app.delete('/api/saved-places/:id', auth, h(async (req, res) => {
    await run('DELETE FROM saved_places WHERE user_id=$1 AND organisation_id=$2', [req.user.id, req.params.id]); res.json({ ok: true });
  }));

  // ----- Accessibility reports (reference number + status tracking) -----
  app.post('/api/reports', auth, h(async (req, res) => {
    const { category, place, description, photo } = req.body;
    if (!category || !description || !String(description).trim()) return res.status(400).json({ error: 'Please choose a category and describe the barrier' });
    if (photo && (!String(photo).startsWith('data:image/') || photo.length > 1500000)) return res.status(400).json({ error: 'The photo is too large or not an image' });
    for (let i = 0; i < 5; i++) {
      const ref = 'AC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      try {
        await run('INSERT INTO accessibility_reports(reference,user_id,category,place,description,photo) VALUES($1,$2,$3,$4,$5,$6)',
          [ref, req.user.id, category, place || null, String(description).trim().slice(0, 1500), photo || null]);
        return res.status(201).json({ reference: ref });
      } catch (e) { if (e.code !== '23505') throw e; }
    }
    res.status(500).json({ error: 'Could not create a reference number. Please try again.' });
  }));
  app.get('/api/reports/mine', auth, h(async (req, res) => {
    res.json((await run('SELECT id,reference,category,place,description,photo,status,admin_note,created_at,updated_at FROM accessibility_reports WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id])).rows);
  }));
  app.get('/api/reports', auth, admin, h(async (_req, res) => {
    res.json((await run(`SELECT r.*, u.name AS user_name FROM accessibility_reports r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 200`)).rows);
  }));
  app.patch('/api/reports/:id', auth, admin, h(async (req, res) => {
    const { status, admin_note } = req.body;
    if (status && !STATUS.includes(status)) return res.status(400).json({ error: 'Unknown status' });
    const upd = await run('UPDATE accessibility_reports SET status=COALESCE($1,status), admin_note=$2, updated_at=now() WHERE id=$3 RETURNING user_id, reference, status', [status || null, admin_note || null, req.params.id]);
    const r = upd.rows[0];
    if (r && r.user_id && app.locals.notify) app.locals.notify.toUser(r.user_id, 'Update on your report ' + r.reference, 'Status: ' + r.status + (admin_note ? '. ' + admin_note : ''), '/');
    res.json({ ok: true });
  }));

  // ----- Admin can edit places/organisations and opportunities -----
  app.put('/api/organisations/:id', auth, admin, h(async (req, res) => {
    const o = req.body;
    if (!o.name || !o.category) return res.status(400).json({ error: 'Name and category are required' });
    await run(`UPDATE organisations SET name=$1,category=$2,address=$3,city=$4,phone=$5,email=$6,website=$7,accessibility=$8,verified=$9 WHERE id=$10`,
      [o.name, o.category, o.address, o.city, o.phone, o.email, o.website, o.accessibility, !!o.verified, req.params.id]);
    res.json({ ok: true });
  }));
  app.put('/api/opportunities/:id', auth, admin, h(async (req, res) => {
    const o = req.body;
    if (!o.title || !o.type) return res.status(400).json({ error: 'Title and type are required' });
    await run(`UPDATE opportunities SET title=$1,type=$2,organisation=$3,location=$4,description=$5,accessibility_notes=$6,closing_date=$7,apply_url=$8,apply_email=$9 WHERE id=$10`,
      [o.title, o.type, o.organisation, o.location, o.description, o.accessibility_notes, o.closing_date || null, o.apply_url || null, o.apply_email || null, req.params.id]);
    res.json({ ok: true });
  }));

  // ----- Administrator overview -----
  app.get('/api/admin/overview', auth, admin, h(async (_req, res) => {
    const c = async (t, w = '') => (await run(`SELECT COUNT(*)::int AS n FROM ${t} ${w}`)).rows[0].n;
    const byStatus = (await run('SELECT status, COUNT(*)::int AS n FROM accessibility_reports GROUP BY status')).rows;
    res.json({
      users: await c('users'), places: await c('organisations'), opportunities: await c('opportunities'),
      reports: await c('accessibility_reports'), openReports: await c('accessibility_reports', "WHERE status NOT IN ('Resolved','Closed')"),
      newFeedback: await c('feedback', "WHERE status='new'"), notifications: await c('notifications'), byStatus,
    });
  }));
};
