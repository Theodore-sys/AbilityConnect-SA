// backend/src/sign.js  -  loaded from server.js with:  require('./sign')(app, pool);
const jwt = require('jsonwebtoken');

module.exports = (app, pool) => {
  const run = (sql, p) => pool.query(sql, p);
  const read = (req) => { try { return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); } catch { return null; } };
  const auth = (req, res, next) => { req.user = read(req); req.user ? next() : res.status(401).json({ error: 'Please log in' }); };
  const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Administrators only' }));
  const h = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { console.error(e); res.status(500).json({ error: 'Server error: ' + (e.message || e.code) }); }
  };

  (async () => {
    await run(`CREATE TABLE IF NOT EXISTS sign_requests (
      id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, video TEXT, duration INT,
      target_lang TEXT NOT NULL DEFAULT 'en', status TEXT NOT NULL DEFAULT 'waiting', translation TEXT,
      translated_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT now(), translated_at TIMESTAMPTZ)`);
    // Interpreter role + claiming (so two interpreters do not translate the same video)
    await run("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check").catch(() => {});
    await run("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user','admin','interpreter'))").catch(() => {});
    await run('ALTER TABLE sign_requests ADD COLUMN IF NOT EXISTS claimed_by INT REFERENCES users(id) ON DELETE SET NULL').catch(() => {});
    await run('ALTER TABLE sign_requests ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ').catch(() => {});
    // Privacy: videos are deleted after 14 days even if nobody translated them
    const purge = () => run("UPDATE sign_requests SET video=NULL WHERE video IS NOT NULL AND created_at < now() - interval '14 days'").catch(() => {});
    purge(); setInterval(purge, 6 * 3600 * 1000);
  })().catch((e) => console.error('SETUP PROBLEM (sign tables):', e.message || e.code));

  // ---------- Learner: send a sign language video to a human interpreter ----------
  app.post('/api/sign-requests', auth, h(async (req, res) => {
    const { video, target_lang, duration } = req.body;
    if (!video || !String(video).startsWith('data:video/')) return res.status(400).json({ error: 'Please record or choose a video first' });
    if (video.length > 7000000) return res.status(400).json({ error: 'The video is too large. Please record 20 seconds or less.' });
    const open = (await run("SELECT COUNT(*)::int AS n FROM sign_requests WHERE user_id=$1 AND status='waiting'", [req.user.id])).rows[0].n;
    if (open >= 5) return res.status(429).json({ error: 'You already have 5 videos waiting. Please wait for a reply first.' });
    await run('INSERT INTO sign_requests(user_id,video,duration,target_lang) VALUES($1,$2,$3,$4)', [req.user.id, video, Number(duration) || null, String(target_lang || 'en').slice(0, 8)]);
    res.status(201).json({ ok: true });
  }));
  app.get('/api/sign-requests/mine', auth, h(async (req, res) => {
    res.json((await run('SELECT id,status,target_lang,translation,created_at,translated_at FROM sign_requests WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id])).rows);
  }));
  app.delete('/api/sign-requests/:id', auth, h(async (req, res) => {
    await run('DELETE FROM sign_requests WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); res.json({ ok: true });
  }));

  // ---------- Organiser / interpreter ----------
  app.get('/api/admin/sign-requests', auth, admin, h(async (_req, res) => {
    res.json((await run(`SELECT s.id,s.target_lang,s.status,s.duration,s.created_at,(s.video IS NOT NULL) AS has_video,u.name AS user_name
      FROM sign_requests s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 200`)).rows);
  }));
  app.get('/api/admin/sign-requests/:id/video', auth, admin, h(async (req, res) => {
    const r = (await run('SELECT video FROM sign_requests WHERE id=$1', [req.params.id])).rows[0];
    if (!r || !r.video) return res.status(404).json({ error: 'This video is no longer available' });
    res.json({ video: r.video });
  }));
  app.patch('/api/admin/sign-requests/:id', auth, admin, h(async (req, res) => {
    const t = String(req.body.translation || '').trim();
    if (!t) return res.status(400).json({ error: 'Please type the translation' });
    const upd = await run("UPDATE sign_requests SET translation=$1, status='translated', video=NULL, translated_by=$2, translated_at=now() WHERE id=$3 RETURNING user_id", [t.slice(0, 2000), req.user.id, req.params.id]);
    if (upd.rows[0] && upd.rows[0].user_id && app.locals.notify) app.locals.notify.toUser(upd.rows[0].user_id, 'Your sign language video was translated', 'Open Communicate, then Sign on video, to read the reply.', '/');
    res.json({ ok: true });
  }));
  app.delete('/api/admin/sign-requests/:id', auth, admin, h(async (req, res) => {
    await run('DELETE FROM sign_requests WHERE id=$1', [req.params.id]); res.json({ ok: true });
  }));

  // ---------- Interpreter portal (role "interpreter", or an administrator) ----------
  const staff = (req, res, next) => (['admin', 'interpreter'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Interpreters only' }));
  app.get('/api/interpreter/queue', auth, staff, h(async (req, res) => {
    const waiting = (await run(`SELECT s.id,s.target_lang,s.duration,s.created_at,(s.video IS NOT NULL) AS has_video,split_part(COALESCE(u.name,'Deleted user'),' ',1) AS first_name,
      s.claimed_by,c.name AS claimed_name,(s.claimed_by=$1) AS mine,(s.claimed_at > now() - interval '15 minutes') AS claim_active
      FROM sign_requests s LEFT JOIN users u ON u.id=s.user_id LEFT JOIN users c ON c.id=s.claimed_by
      WHERE s.status='waiting' ORDER BY s.created_at ASC LIMIT 100`, [req.user.id])).rows;
    const done = (await run(`SELECT id,target_lang,translation,translated_at,created_at FROM sign_requests WHERE translated_by=$1 ORDER BY translated_at DESC LIMIT 30`, [req.user.id])).rows;
    const st = (await run(`SELECT COUNT(*) FILTER (WHERE translated_at >= date_trunc('day', now()))::int AS today, COUNT(*)::int AS total,
      COALESCE(round(avg(EXTRACT(EPOCH FROM (translated_at - created_at)) / 60) FILTER (WHERE translated_at >= now() - interval '7 days'))::int, 0) AS avg_minutes
      FROM sign_requests WHERE translated_by=$1`, [req.user.id])).rows[0];
    res.json({ waiting, done, stats: st });
  }));
  app.post('/api/interpreter/requests/:id/claim', auth, staff, h(async (req, res) => {
    const r = await run(`UPDATE sign_requests SET claimed_by=$1, claimed_at=now() WHERE id=$2 AND status='waiting'
      AND (claimed_by IS NULL OR claimed_by=$1 OR claimed_at < now() - interval '15 minutes') RETURNING id`, [req.user.id, req.params.id]);
    if (!r.rowCount) return res.status(409).json({ error: 'Another interpreter is already working on this video.' });
    res.json({ ok: true });
  }));
  app.post('/api/interpreter/requests/:id/release', auth, staff, h(async (req, res) => {
    await run("UPDATE sign_requests SET claimed_by=NULL, claimed_at=NULL WHERE id=$1 AND claimed_by=$2 AND status='waiting'", [req.params.id, req.user.id]); res.json({ ok: true });
  }));
  app.get('/api/interpreter/requests/:id/video', auth, staff, h(async (req, res) => {
    const r = (await run('SELECT video FROM sign_requests WHERE id=$1', [req.params.id])).rows[0];
    if (!r || !r.video) return res.status(404).json({ error: 'This video is no longer available' });
    res.json({ video: r.video });
  }));
  app.patch('/api/interpreter/requests/:id', auth, staff, h(async (req, res) => {
    const t = String(req.body.translation || '').trim();
    if (!t) return res.status(400).json({ error: 'Please type the translation' });
    const upd = await run(`UPDATE sign_requests SET translation=$1, status='translated', video=NULL, translated_by=$2, translated_at=now()
      WHERE id=$3 AND status='waiting' AND (claimed_by IS NULL OR claimed_by=$2 OR claimed_at < now() - interval '15 minutes') RETURNING user_id`, [t.slice(0, 2000), req.user.id, req.params.id]);
    if (!upd.rowCount) return res.status(409).json({ error: 'This request was already answered or is being handled by another interpreter.' });
    if (upd.rows[0].user_id && app.locals.notify) app.locals.notify.toUser(upd.rows[0].user_id, 'Your sign language video was translated', 'Open Communicate, then Sign on video, to read the reply.', '/');
    res.json({ ok: true });
  }));

  // ---------- Administrators manage interpreter accounts ----------
  app.get('/api/admin/interpreters', auth, admin, h(async (_req, res) => {
    res.json((await run(`SELECT u.id,u.name,u.email,COALESCE(u.disabled,false) AS disabled,
      (SELECT COUNT(*)::int FROM sign_requests s WHERE s.translated_by=u.id) AS answered FROM users u WHERE u.role='interpreter' ORDER BY u.name`)).rows);
  }));
  app.post('/api/admin/interpreters', auth, admin, h(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase(); const name = String(req.body.name || '').trim(); const password = String(req.body.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
    const ex = (await run('SELECT id,role FROM users WHERE email=$1', [email])).rows[0];
    if (ex) {
      if (ex.role === 'admin') return res.status(400).json({ error: 'That person is an administrator already. Administrators can use the interpreter portal too.' });
      await run("UPDATE users SET role='interpreter' WHERE id=$1", [ex.id]); return res.json({ ok: true, existing: true });
    }
    const problem = require('./policy').passwordProblem(password, email);
    if (!name) return res.status(400).json({ error: 'Please enter the interpreter\'s name' });
    if (problem) return res.status(400).json({ error: problem });
    await run("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'interpreter')", [name.slice(0, 80), email, await require('bcryptjs').hash(password, 12)]);
    res.json({ ok: true });
  }));
  app.patch('/api/admin/interpreters/:id/remove', auth, admin, h(async (req, res) => {
    await run("UPDATE users SET role='user', sessions_valid_from=now() WHERE id=$1 AND role='interpreter'", [req.params.id]); res.json({ ok: true });
  }));

  // ---------- Optional text translation (needs a Google Cloud Translation API key in .env) ----------
  const hits = new Map();
  const allowed = (id) => { const now = Date.now(); const a = (hits.get(id) || []).filter((t) => now - t < 60000); a.push(now); hits.set(id, a); return a.length <= 40; };
  app.post('/api/translate', auth, h(async (req, res) => {
    const key = process.env.GOOGLE_TRANSLATE_KEY;
    if (!key) return res.status(503).json({ error: 'Translation is not switched on yet. The organiser must add GOOGLE_TRANSLATE_KEY to the backend .env file.' });
    const { text, target, source } = req.body;
    if (!text || !target) return res.status(400).json({ error: 'Nothing to translate' });
    if (String(text).length > 1500) return res.status(400).json({ error: 'The text is too long to translate' });
    if (!allowed(req.user.id)) return res.status(429).json({ error: 'Too many translations. Please wait a minute.' });
    const body = { q: String(text), target, format: 'text' }; if (source) body.source = source;
    const r = await fetch('https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || 'The translation service could not translate this.' });
    res.json({ text: j.data.translations[0].translatedText });
  }));
};