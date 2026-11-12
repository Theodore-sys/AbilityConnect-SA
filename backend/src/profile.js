// backend/src/profile.js  -  "My profile". Loaded BEFORE ability.js so these routes replace the older, simpler ones.
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { passwordProblem } = require('./policy');

module.exports = (app, pool) => {
  const run = (sql, p) => pool.query(sql, p);
  const read = (req) => { try { return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); } catch { return null; } };
  const auth = (req, res, next) => { req.user = read(req); req.user ? next() : res.status(401).json({ error: 'Please log in' }); };
  const h = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { console.error(e); res.status(500).json({ error: 'Server error: ' + (e.message || e.code) }); }
  };
  const sign = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET, { expiresIn: u.role === 'admin' ? '2h' : '8h' });
  const sec = () => app.locals.sec;

  (async () => {
    await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contact TEXT DEFAULT 'email'`);
    for (const c of ['gender TEXT', 'gender_other TEXT', 'dob DATE', 'phone TEXT', 'province TEXT', 'city TEXT', 'language TEXT', 'bio TEXT', 'emergency_name TEXT', 'emergency_phone TEXT', 'avatar TEXT']) {
      await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${c}`);
    }
  })().catch((e) => console.error('SETUP PROBLEM (profile):', e.message || e.code));

  const PROV = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
  const LANG = ['English', 'Afrikaans', 'isiZulu', 'isiXhosa', 'Sepedi', 'Sesotho', 'Setswana', 'Xitsonga', 'siSwati', 'Tshivenda', 'isiNdebele', 'South African Sign Language'];
  const GENDER = ['female', 'male', 'non_binary', 'self_describe', 'prefer_not'];
  const PHONE = /^\+?[0-9 ()-]{7,20}$/;
  const COLS = 'id,name,email,role,contact,gender,gender_other,to_char(dob,\'YYYY-MM-DD\') AS dob,phone,province,city,language,bio,emergency_name,emergency_phone,avatar,created_at';

  // Pictures must really be pictures: check the type and the first bytes of the file
  const avatarOk = (v) => {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(v);
    if (!m || v.length > 280000) return false;
    const b = Buffer.from(m[2].slice(0, 24), 'base64');
    if (m[1] === 'jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    if (m[1] === 'png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
    return b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP';
  };
  const text = (max) => (v) => { const s = String(v == null ? '' : v).trim(); if (s.length > max) throw new Error(`That text is too long (the limit is ${max} characters).`); return s || null; };
  const FIELDS = {
    name: (v) => { const s = String(v || '').trim(); if (!s || s.length > 80) throw new Error('Please enter your name (up to 80 characters).'); return s; },
    contact: (v) => (['email', 'sms', 'phone', 'written'].includes(v) ? v : 'email'),
    gender: (v) => { if (!v) return null; if (!GENDER.includes(v)) throw new Error('Please choose one of the gender options.'); return v; },
    gender_other: text(30),
    dob: (v) => {
      if (!v) return null;
      const d = new Date(v + 'T00:00:00Z'); const age = (Date.now() - d.getTime()) / (365.25 * 86400000);
      if (Number.isNaN(d.getTime()) || age < 5 || age > 120) throw new Error('Please check your date of birth.');
      return v;
    },
    phone: (v) => { const s = String(v || '').trim(); if (!s) return null; if (!PHONE.test(s)) throw new Error('Please type a valid phone number, for example 082 123 4567.'); return s; },
    province: (v) => { if (!v) return null; if (!PROV.includes(v)) throw new Error('Please choose a province from the list.'); return v; },
    city: text(60),
    language: (v) => { if (!v) return null; if (!LANG.includes(v)) throw new Error('Please choose a language from the list.'); return v; },
    bio: text(300), emergency_name: text(80),
    emergency_phone: (v) => { const s = String(v || '').trim(); if (!s) return null; if (!PHONE.test(s)) throw new Error('Please type a valid emergency contact number.'); return s; },
    avatar: (v) => { if (!v) return null; if (!avatarOk(v)) throw new Error('That picture could not be used. Please choose a JPG, PNG or WEBP picture.'); return v; },
  };

  app.get('/api/me', auth, h(async (req, res) => { res.json((await run(`SELECT ${COLS} FROM users WHERE id=$1`, [req.user.id])).rows[0] || {}); }));

  app.patch('/api/me', auth, h(async (req, res) => {
    const sets = []; const vals = [];
    try {
      for (const k of Object.keys(FIELDS)) {
        if (req.body[k] === undefined) continue;
        vals.push(FIELDS[k](req.body[k])); sets.push(`${k}=$${vals.length}`);
      }
    } catch (e) { return res.status(400).json({ error: e.message }); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to save' });
    vals.push(req.user.id);
    await run(`UPDATE users SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
    const profile = (await run(`SELECT ${COLS} FROM users WHERE id=$1`, [req.user.id])).rows[0];
    res.json({ token: sign(profile), user: { id: profile.id, name: profile.name, role: profile.role }, profile });
  }));

  // Changing the password also ends every other session
  app.put('/api/me/password', auth, h(async (req, res) => {
    const { current, password } = req.body;
    const u = (await run('SELECT email,password_hash FROM users WHERE id=$1', [req.user.id])).rows[0];
    if (!u || !(await bcrypt.compare(String(current || ''), u.password_hash))) return res.status(403).json({ error: 'Your current password is incorrect. If you signed up with Google, use "Forgot your password?" on the log in page to set one.' });
    const problem = passwordProblem(password, u.email);
    if (problem) return res.status(400).json({ error: problem });
    await run('UPDATE users SET password_hash=$1, sessions_valid_from=now() WHERE id=$2', [await bcrypt.hash(String(password), 12), req.user.id]);
    if (sec()) { sec().forget(req.user.id); sec().event('password_changed', { userId: req.user.id, email: u.email, ip: req.ip }); }
    res.json({ ok: true, relogin: true });
  }));

  app.post('/api/me/logout-all', auth, h(async (req, res) => {
    await run('UPDATE users SET sessions_valid_from=now() WHERE id=$1', [req.user.id]);
    if (sec()) { sec().forget(req.user.id); sec().event('logout_everywhere', { userId: req.user.id, ip: req.ip }); }
    res.json({ ok: true });
  }));

  // The person's right to see their own data (POPIA)
  app.get('/api/me/export', auth, h(async (req, res) => {
    const id = req.user.id; const q = async (sql) => (await run(sql, [id])).rows;
    const out = {
      exported_at: new Date().toISOString(),
      profile: (await q(`SELECT ${COLS} FROM users WHERE id=$1`))[0],
      saved_places: await q('SELECT o.name,o.city,o.province FROM organisations o JOIN saved_places s ON s.organisation_id=o.id WHERE s.user_id=$1'),
      saved_opportunities: await q('SELECT o.title,o.type,o.organisation FROM opportunities o JOIN saved_opportunities s ON s.opportunity_id=o.id WHERE s.user_id=$1'),
      reports: await q('SELECT reference,category,place,description,status,admin_note,created_at FROM accessibility_reports WHERE user_id=$1'),
      feedback: await q('SELECT type,message,status,response,created_at FROM feedback WHERE user_id=$1'),
      certificates: await q('SELECT code,first_names,surname,id_type,id_number,score,issued_at FROM certificates WHERE user_id=$1'),
      sign_requests: await q('SELECT target_lang,status,translation,created_at FROM sign_requests WHERE user_id=$1'),
      messages: await q('SELECT title,body,created_at FROM inbox WHERE user_id=$1'),
    };
    res.setHeader('Content-Disposition', 'attachment; filename="my-abilityconnect-data.json"');
    res.json(out);
  }));

  // The person's right to be forgotten: deleting the account deletes the profile, saved items and messages
  app.delete('/api/me', auth, h(async (req, res) => {
    const u = (await run('SELECT email,role FROM users WHERE id=$1', [req.user.id])).rows[0];
    if (!u) return res.status(404).json({ error: 'Account not found' });
    if (u.role === 'admin') return res.status(403).json({ error: 'Organiser accounts must be removed by another organiser.' });
    if (String((req.body || {}).confirm_email || '').trim().toLowerCase() !== u.email.toLowerCase()) return res.status(400).json({ error: 'Please type your email address exactly to confirm.' });
    if (sec()) sec().event('account_deleted', { email: u.email, ip: req.ip });
    await run('DELETE FROM users WHERE id=$1', [req.user.id]);
    if (sec()) sec().forget(req.user.id);
    res.json({ ok: true });
  }));
};
