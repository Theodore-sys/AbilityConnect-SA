// backend/src/accounts.js  -  Google sign-in and "forgot password" by email link.
// Needs:  npm install nodemailer google-auth-library
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const mailer = require('./mailer');
const { passwordProblem } = require('./policy');

module.exports = (app, pool) => {
  const run = (sql, p) => pool.query(sql, p);
  const sec = () => app.locals.sec;
  const h = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { console.error(e); res.status(500).json({ error: 'Server error: ' + (e.message || e.code) }); }
  };
  const sign = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET, { expiresIn: u.role === 'admin' ? '2h' : '8h' });
  const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

  (async () => {
    await run(`CREATE TABLE IF NOT EXISTS password_resets (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`);
    await run('CREATE INDEX IF NOT EXISTS password_resets_hash_idx ON password_resets(token_hash)');
  })().catch((e) => console.error('SETUP PROBLEM (accounts):', e.message || e.code));

  // ---------- Forgot password: send a reset link ----------
  app.post('/api/auth/forgot', h(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email || email.length > 160) return res.status(400).json({ error: 'Please enter your email address' });
    const user = (await run('SELECT id,name,email,disabled FROM users WHERE email=$1', [email])).rows[0];
    if (user && !user.disabled) {
      const recent = (await run("SELECT COUNT(*)::int AS n FROM password_resets WHERE user_id=$1 AND created_at > now() - interval '1 hour'", [user.id])).rows[0].n;
      if (recent < 3) {
        const token = crypto.randomBytes(32).toString('hex');
        await run("INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES($1,$2, now() + interval '30 minutes')", [user.id, sha(token)]);
        const link = mailer.siteUrl() + '/#reset=' + token;
        if (sec()) sec().event('password_reset_requested', { userId: user.id, email, ip: req.ip });
        mailer.sendMail({
          to: user.email, subject: 'Reset your AbilityConnect SA password',
          text: `Hello ${user.name},\n\nWe received a request to reset your AbilityConnect SA password.\nOpen this link to choose a new password. It works for 30 minutes and only once:\n\n${link}\n\nIf you did not ask for this, you can ignore this email. Your password will not change.\n\nAbilityConnect SA`,
          html: mailer.layout('Reset your password', [`Hello ${user.name},`, 'We received a request to reset your AbilityConnect SA password. The link works for 30 minutes and only once.', 'If you did not ask for this, you can ignore this email. Your password will not change.'], { url: link, label: 'Choose a new password' }),
        }).catch((e) => console.error('EMAIL FAILED (password reset for ' + email + '): ' + e.message));
      }
    }
    // The same answer whether or not the email exists, so nobody can find out who has an account
    res.json({ ok: true, message: 'If an account exists for that email address, we have sent a link to reset the password. The link works for 30 minutes. Please also check your Spam folder.' });
  }));

  // ---------- Reset password with the link ----------
  app.post('/api/auth/reset', h(async (req, res) => {
    const { token, password } = req.body;
    const r = token && String(token).length < 200 ? (await run('SELECT id,user_id FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()', [sha(String(token))])).rows[0] : null;
    if (!r) return res.status(400).json({ error: 'This reset link is not valid or has expired. Please ask for a new one.' });
    const u = (await run('SELECT name,email FROM users WHERE id=$1', [r.user_id])).rows[0];
    const problem = passwordProblem(password, u ? u.email : '');
    if (problem) return res.status(400).json({ error: problem });
    await run('UPDATE users SET password_hash=$1, sessions_valid_from=now() WHERE id=$2', [await bcrypt.hash(String(password), 12), r.user_id]);
    await run('UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [r.user_id]);
    if (sec()) { sec().forget(r.user_id); sec().event('password_reset_done', { userId: r.user_id, email: u && u.email, ip: req.ip }); }
    if (u) mailer.sendMail({
      to: u.email, subject: 'Your AbilityConnect SA password was changed',
      text: `Hello ${u.name},\n\nYour password was changed successfully, and you were signed out on all devices.\nIf you did not do this, reset your password again straight away and contact the organisers.\n\nAbilityConnect SA`,
      html: mailer.layout('Your password was changed', [`Hello ${u.name},`, 'Your password was changed successfully, and you were signed out on all devices.', 'If you did not do this, reset your password again straight away and contact the organisers.'], { url: mailer.siteUrl(), label: 'Open AbilityConnect SA' }),
    }).catch((e) => console.error('EMAIL FAILED:', e.message));
    res.json({ ok: true, message: 'Your password was reset successfully. You can now log in with your new password.' });
  }));

  // ---------- Sign in with Google ----------
  app.post('/api/auth/google', h(async (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(503).json({ error: 'Google sign-in is not switched on yet. The organiser must add GOOGLE_CLIENT_ID to the backend .env file.' });
    if (!req.body.credential || String(req.body.credential).length > 5000) return res.status(400).json({ error: 'No Google sign-in was received' });
    let p;
    try { p = (await new OAuth2Client(clientId).verifyIdToken({ idToken: req.body.credential, audience: clientId })).getPayload(); }
    catch { return res.status(401).json({ error: 'Google sign-in could not be verified. Please try again.' }); }
    if (!p.email || !p.email_verified) return res.status(401).json({ error: 'Your Google email address is not verified.' });
    const email = p.email.toLowerCase();
    let u = (await run('SELECT id,name,role,disabled FROM users WHERE email=$1', [email])).rows[0];
    if (u && u.role === 'admin') return res.status(403).json({ error: 'Organiser accounts must log in with their email and password in the organiser portal.' });
    if (u && u.disabled) return res.status(403).json({ error: 'This account has been suspended. Please contact the organisers.' });
    if (req.body.portal === 'interpreter' && (!u || u.role !== 'interpreter')) return res.status(403).json({ error: 'This Google account has not been added as an interpreter. Please ask the organiser to add your email address.' });
    if (!u) {
      const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12); // nobody knows this password; "Forgot password" lets them set one
      u = (await run("INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'user') RETURNING id,name,role", [String(p.name || email.split('@')[0]).slice(0, 80), email, hash])).rows[0];
    }
    res.json({ token: sign(u), user: { id: u.id, name: u.name, role: u.role } });
  }));
};
