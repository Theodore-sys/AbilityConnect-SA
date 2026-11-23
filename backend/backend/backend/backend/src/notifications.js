// backend/src/notifications.js
// Extra features: notifications, saved preferences, application tracker, community reviews,
// learning resources (sign language videos / guides), quick-help contacts, requests with replies,
// admin statistics and user management.
// server.js already loads this file with:  require('./notifications')(app, pool);
const jwt = require('jsonwebtoken');

module.exports = (app, pool) => {
  const run = (sql, params) => pool.query(sql, params);

  const setup = async () => {
    await run(`CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL,
      sign_video_url TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
    await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS prefs JSONB DEFAULT '{}'::jsonb`);
    await run(`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS response TEXT`);
    await run(`CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE,
      opportunity_id INT REFERENCES opportunities(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'interested', notes TEXT, updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (user_id, opportunity_id))`);
    await run(`CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY, organisation_id INT REFERENCES organisations(id) ON DELETE CASCADE,
      user_id INT REFERENCES users(id) ON DELETE SET NULL, author TEXT,
      rating INT CHECK (rating BETWEEN 1 AND 5), features TEXT[] DEFAULT '{}', comment TEXT,
      created_at TIMESTAMPTZ DEFAULT now())`);
    await run(`CREATE TABLE IF NOT EXISTS resources (
      id SERIAL PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, url TEXT, description TEXT,
      created_at TIMESTAMPTZ DEFAULT now())`);
    await run(`CREATE TABLE IF NOT EXISTS helplines (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, number TEXT NOT NULL, description TEXT)`);
    const h = await run('SELECT 1 FROM helplines LIMIT 1');
    if (!h.rowCount) {
      const seed = [
        ['Emergency (from any mobile phone)', '112', 'General emergency number from a mobile phone'],
        ['Police', '10111', 'South African Police Service emergency line'],
        ['Ambulance', '10177', 'Public ambulance and emergency medical services'],
        ['GBV Command Centre', '0800 428 428', 'Free, 24-hour support line'],
      ];
      for (const s of seed) await run('INSERT INTO helplines(name,number,description) VALUES($1,$2,$3)', s);
    }
  };
  setup().catch((e) => console.error('SETUP PROBLEM (extra tables):', e.message || e.code));

  const read = (req) => { try { return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); } catch { return null; } };
  const auth = (req, res, next) => { req.user = read(req); req.user ? next() : res.status(401).json({ error: 'Please log in' }); };
  const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Administrators only' }));
  const h = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { console.error(e); res.status(500).json({ error: 'Server error: ' + (e.message || e.code) }); }
  };
  const need = (res, ...v) => (v.every((x) => x && String(x).trim()) ? true : (res.status(400).json({ error: 'Please fill in all required fields' }), false));

  // ---------- Notifications ----------
  app.get('/api/notifications', auth, h(async (_req, res) => {
    res.json((await run('SELECT * FROM notifications ORDER BY created_at DESC')).rows);
  }));
  app.post('/api/notifications', auth, admin, h(async (req, res) => {
    const { title, message, sign_video_url, quiet } = req.body;
    if (!need(res, title, message)) return;
    const { rows } = await run('INSERT INTO notifications(title,message,sign_video_url) VALUES($1,$2,$3) RETURNING *', [String(title).trim().slice(0, 120), String(message).trim().slice(0, 600), sign_video_url || null]);
    // Tell everyone who turned notifications on, even when they are not in the app (unless the organiser chose "quiet")
    if (quiet !== true && app.locals.notify) app.locals.notify.broadcast({ title: rows[0].title, body: rows[0].message, url: '/' });
    res.status(201).json(rows[0]);
  }));
  app.delete('/api/notifications/:id', auth, admin, h(async (req, res) => {
    await run('DELETE FROM notifications WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));

  // ---------- Saved accessibility preferences (no diagnosis is ever stored) ----------
  app.get('/api/me/prefs', auth, h(async (req, res) => {
    const { rows } = await run('SELECT prefs FROM users WHERE id=$1', [req.user.id]);
    res.json((rows[0] && rows[0].prefs) || {});
  }));
  app.put('/api/me/prefs', auth, h(async (req, res) => {
    const p = req.body || {};
    const clean = {
      size: Math.min(28, Math.max(14, Number(p.size) || 18)),
      theme: ['light', 'dark', 'contrast', 'cream'].includes(p.theme) ? p.theme : 'light',
      style: ['blue', 'purple', 'green'].includes(p.style) ? p.style : 'blue', simple: !!p.simple,
      reading: !!p.reading, calm: !!p.calm, auto: !!p.auto,
      rate: [0.8, 1, 1.2].includes(Number(p.rate)) ? Number(p.rate) : 1,
    };
    await run('UPDATE users SET prefs=$1 WHERE id=$2', [clean, req.user.id]);
    res.json(clean);
  }));

  // ---------- Application tracker ----------
  const STATUSES = ['interested', 'applied', 'interview', 'offered', 'not successful'];
  app.get('/api/applications', auth, h(async (req, res) => {
    const { rows } = await run(
      `SELECT a.id, a.status, a.notes, a.updated_at, o.id AS opportunity_id, o.title, o.organisation, o.type, o.closing_date
       FROM applications a JOIN opportunities o ON o.id=a.opportunity_id WHERE a.user_id=$1 ORDER BY a.updated_at DESC`, [req.user.id]);
    res.json(rows);
  }));
  app.post('/api/applications', auth, h(async (req, res) => {
    const { opportunity_id, status } = req.body;
    if (!need(res, opportunity_id)) return;
    const s = STATUSES.includes(status) ? status : 'interested';
    await run(`INSERT INTO applications(user_id,opportunity_id,status) VALUES($1,$2,$3)
               ON CONFLICT (user_id,opportunity_id) DO NOTHING`, [req.user.id, opportunity_id, s]);
    res.status(201).json({ ok: true });
  }));
  app.patch('/api/applications/:id', auth, h(async (req, res) => {
    const { status, notes } = req.body;
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
    await run(`UPDATE applications SET status=COALESCE($1,status), notes=COALESCE($2,notes), updated_at=now()
               WHERE id=$3 AND user_id=$4`, [status || null, notes === undefined ? null : String(notes).slice(0, 500), req.params.id, req.user.id]);
    res.json({ ok: true });
  }));
  app.delete('/api/applications/:id', auth, h(async (req, res) => {
    await run('DELETE FROM applications WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); res.json({ ok: true });
  }));

  // ---------- Community accessibility reviews ----------
  const FEATS = ['Wheelchair ramp', 'Accessible toilet', 'Lift / elevator', 'Accessible parking', 'Sign language support', 'Braille / large print', 'Hearing loop', 'Step-free entrance'];
  app.get('/api/reviews-summary', auth, h(async (_req, res) => {
    const { rows } = await run(
      `SELECT r.organisation_id, ROUND(AVG(r.rating)::numeric,1) AS avg, COUNT(*)::int AS n,
        COALESCE((SELECT array_agg(DISTINCT f) FROM reviews r2, unnest(r2.features) f WHERE r2.organisation_id=r.organisation_id), '{}') AS features
       FROM reviews r GROUP BY r.organisation_id`);
    res.json(rows);
  }));
  app.get('/api/reviews', auth, h(async (req, res) => {
    const org = req.query.organisation_id;
    const { rows } = await run(
      `SELECT r.*, o.name AS organisation FROM reviews r JOIN organisations o ON o.id=r.organisation_id
       WHERE ($1::int IS NULL OR r.organisation_id=$1::int) ORDER BY r.created_at DESC LIMIT 200`, [org || null]);
    res.json(rows);
  }));
  app.post('/api/reviews', auth, h(async (req, res) => {
    const { organisation_id, rating, features, comment } = req.body;
    if (!need(res, organisation_id)) return;
    const r = Number(rating);
    if (!(r >= 1 && r <= 5)) return res.status(400).json({ error: 'Choose a rating from 1 to 5' });
    const feats = Array.isArray(features) ? features.filter((f) => FEATS.includes(f)) : [];
    const author = String(req.user.name || 'Member').split(' ')[0];
    await run('INSERT INTO reviews(organisation_id,user_id,author,rating,features,comment) VALUES($1,$2,$3,$4,$5,$6)',
      [organisation_id, req.user.id, author, r, feats, String(comment || '').slice(0, 500)]);
    res.status(201).json({ ok: true });
  }));
  app.delete('/api/reviews/:id', auth, admin, h(async (req, res) => {
    await run('DELETE FROM reviews WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));

  // ---------- Learning resources (sign language videos, easy-read and audio guides) ----------
  app.get('/api/resources', auth, h(async (_req, res) => {
    res.json((await run('SELECT * FROM resources ORDER BY created_at DESC')).rows);
  }));
  app.post('/api/resources', auth, admin, h(async (req, res) => {
    const { title, category, url, description } = req.body;
    if (!need(res, title, category)) return;
    const { rows } = await run('INSERT INTO resources(title,category,url,description) VALUES($1,$2,$3,$4) RETURNING *', [title.trim(), category, url || null, description || null]);
    res.status(201).json(rows[0]);
  }));
  app.delete('/api/resources/:id', auth, admin, h(async (req, res) => {
    await run('DELETE FROM resources WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));

  // ---------- Quick help contacts ----------
  app.get('/api/helplines', auth, h(async (_req, res) => {
    res.json((await run('SELECT * FROM helplines ORDER BY id')).rows);
  }));
  app.post('/api/helplines', auth, admin, h(async (req, res) => {
    const { name, number, description } = req.body;
    if (!need(res, name, number)) return;
    const { rows } = await run('INSERT INTO helplines(name,number,description) VALUES($1,$2,$3) RETURNING *', [name.trim(), number.trim(), description || null]);
    res.status(201).json(rows[0]);
  }));
  app.delete('/api/helplines/:id', auth, admin, h(async (req, res) => {
    await run('DELETE FROM helplines WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));

  // ---------- Requests: users see their own feedback and the administrator's reply ----------
  app.get('/api/feedback/mine', auth, h(async (req, res) => {
    res.json((await run('SELECT id,type,message,status,response,created_at FROM feedback WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id])).rows);
  }));
  app.patch('/api/feedback/:id/response', auth, admin, h(async (req, res) => {
    const { response, status } = req.body;
    const upd = await run('UPDATE feedback SET response=$1, status=COALESCE($2,status) WHERE id=$3 RETURNING user_id', [response || null, status || null, req.params.id]);
    if (response && upd.rows[0] && upd.rows[0].user_id && app.locals.notify) app.locals.notify.toUser(upd.rows[0].user_id, 'Reply to your message', String(response), '/');
    res.json({ ok: true });
  }));

  // ---------- Administrator overview and user management ----------
  app.get('/api/admin/stats', auth, admin, h(async (_req, res) => {
    const c = async (t, w = '') => (await run(`SELECT COUNT(*)::int AS n FROM ${t} ${w}`)).rows[0].n;
    res.json({
      users: await c('users'), organisations: await c('organisations'), opportunities: await c('opportunities'),
      reviews: await c('reviews'), applications: await c('applications'), notifications: await c('notifications'),
      feedback: await c('feedback'), newFeedback: await c('feedback', "WHERE status='new'"),
    });
  }));
  app.get('/api/admin/users', auth, admin, h(async (_req, res) => {
    res.json((await run('SELECT id,name,email,role,COALESCE(disabled,false) AS disabled,created_at FROM users ORDER BY created_at DESC')).rows);
  }));
  app.patch('/api/admin/users/:id/role', auth, admin, h(async (req, res) => {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'You cannot change your own role' });
    if (!['user', 'admin'].includes(req.body.role)) return res.status(400).json({ error: 'Unknown role' });
    await run('UPDATE users SET role=$1 WHERE id=$2', [req.body.role, req.params.id]); res.json({ ok: true });
  }));
  app.delete('/api/admin/users/:id', auth, admin, h(async (req, res) => {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
    await run('DELETE FROM users WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));
};
