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
