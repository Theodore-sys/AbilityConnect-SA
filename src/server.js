// backend/src/server.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { passwordProblem } = require('./policy');

const prod = process.env.NODE_ENV === 'production';
if (!process.env.JWT_SECRET) { console.error('MISSING JWT_SECRET in backend/.env'); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error('MISSING DATABASE_URL in backend/.env'); process.exit(1); }
if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is too short. Use at least 32 random characters.');
  if (prod) process.exit(1);
}
process.on('unhandledRejection', (e) => console.error('Unhandled problem (the server keeps running):', e && e.message ? e.message : e));
process.on('uncaughtException', (e) => console.error('Unexpected problem (the server keeps running):', e && e.message ? e.message : e));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
});
const app = express();

// Only your own website may talk to this server (set CLIENT_URL in .env; several addresses can be separated by commas)
const origins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim().replace(/\/$/, ''));
app.use(cors({
  origin: (origin, cb) => (!origin || origins.includes(origin) ? cb(null, true) : cb(new Error('CORS: this website address is not allowed'))),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'], maxAge: 600,
}));

// Security layer (headers, request limits, session checks, lockout, logs)
let sec = null;
try { sec = require('./security')(app, pool); app.locals.sec = sec; console.log('Loaded security.js'); }
catch (e) {
  console.error('\nSECURITY MODULE DID NOT LOAD: ' + e.message + '\nRun "npm install" in the backend folder. The website is NOT fully protected until this is fixed.\n');
  if (prod) process.exit(1);
  app.use(express.json({ limit: '1mb' }));
}

const errText = (e) => e.message || e.code || (e.errors && e.errors[0] && (e.errors[0].code || e.errors[0].message)) || String(e);
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(500).json({ error: prod ? 'Something went wrong on our side. Please try again later.' : 'Server error: ' + errText(e) });
});
const sign = (u) => jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET, { expiresIn: u.role === 'admin' ? '2h' : '8h' });
const readToken = (req) => { try { return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); } catch { return null; } };
const optionalAuth = (req, _res, next) => { req.user = readToken(req); next(); };
const auth = (req, res, next) => { req.user = readToken(req); req.user ? next() : res.status(401).json({ error: 'Please log in' }); };
const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Administrators only' }));
const need = (res, ...vals) => (vals.every((v) => v && String(v).trim()) ? true : (res.status(400).json({ error: 'Please fill in all required fields' }), false));
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-just-for-timing', 12); // so a missing account takes as long to check as a real one

// Auth
app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!need(res, name, email, password)) return;
  const em = String(email).trim().toLowerCase();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(em) || em.length > 160) return res.status(400).json({ error: 'Please enter a valid email address' });
  if (String(name).trim().length > 80) return res.status(400).json({ error: 'Please use a shorter name (up to 80 characters)' });
  const problem = passwordProblem(password, em);
  if (problem) return res.status(400).json({ error: problem });
  const exists = await pool.query('SELECT 1 FROM users WHERE email=$1', [em]);
  if (exists.rowCount) return res.status(409).json({ error: 'That email is already registered' });
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query("INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,role", [String(name).trim(), em, hash]);
  res.status(201).json({ token: sign(rows[0]), user: rows[0] });
}));
app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!need(res, email, password)) return;
  const em = String(email).trim().toLowerCase();
  if (sec && (await sec.isLocked(em))) return res.status(429).json({ error: 'Too many wrong passwords. For your safety this account is locked for 15 minutes. You can also use "Forgot your password?".' });
  const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [em]);
  const ok = await bcrypt.compare(String(password), rows[0] ? rows[0].password_hash : DUMMY_HASH);
  if (!rows[0] || !ok) { if (sec) sec.failed(em, req.ip, rows[0] && rows[0].id); return res.status(401).json({ error: 'Incorrect email or password' }); }
  if (rows[0].disabled) return res.status(403).json({ error: 'This account has been suspended. Please contact the organisers.' });
  if (rows[0].role === 'admin' && process.env.ADMIN_EMAIL && em !== process.env.ADMIN_EMAIL.trim().toLowerCase()) return res.status(403).json({ error: 'This account is not allowed to use the organiser portal.' });
  if (sec) { sec.succeeded(em); if (rows[0].role === 'admin') sec.event('admin_login', { userId: rows[0].id, email: em, ip: req.ip }); }
  const u = { id: rows[0].id, name: rows[0].name, role: rows[0].role };
  res.json({ token: sign(u), user: u });
}));

// Places and opportunities (only for logged-in people, and never more than a few hundred at a time)
app.get('/api/organisations', auth, wrap(async (req, res) => {
  const { q = '', category = '' } = req.query;
  const { rows } = await pool.query(
    `SELECT * FROM organisations WHERE ($1='' OR category=$1)
     AND ($2='' OR name ILIKE '%'||$2||'%' OR city ILIKE '%'||$2||'%' OR accessibility ILIKE '%'||$2||'%') ORDER BY name LIMIT 300`, [String(category).slice(0, 60), String(q).slice(0, 80)]);
  res.json(rows);
}));
// Dashboard numbers: the real total (not capped at 300) and the three newest places
app.get('/api/places-summary', auth, wrap(async (_req, res) => {
  const total = (await pool.query('SELECT COUNT(*)::int AS n FROM organisations')).rows[0].n;
  const newest = (await pool.query("SELECT * FROM organisations WHERE category <> 'Support organisation' ORDER BY id DESC LIMIT 3")).rows;
  res.json({ total, newest });
}));
app.post('/api/organisations', auth, admin, wrap(async (req, res) => {
  const o = req.body;
  if (!need(res, o.name, o.category)) return;
  const { rows } = await pool.query(
    'INSERT INTO organisations(name,category,address,city,phone,email,website,accessibility,verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [o.name, o.category, o.address, o.city, o.phone, o.email, o.website, o.accessibility, !!o.verified]);
  res.status(201).json(rows[0]);
}));
app.delete('/api/organisations/:id', auth, admin, wrap(async (req, res) => { await pool.query('DELETE FROM organisations WHERE id=$1', [req.params.id]); res.json({ ok: true }); }));

app.get('/api/opportunities', auth, wrap(async (req, res) => {
  const { q = '', type = '' } = req.query;
  const { rows } = await pool.query(
    `SELECT * FROM opportunities WHERE ($1='' OR type=$1)
     AND ($2='' OR title ILIKE '%'||$2||'%' OR organisation ILIKE '%'||$2||'%' OR description ILIKE '%'||$2||'%') ORDER BY closing_date NULLS LAST LIMIT 300`, [String(type).slice(0, 40), String(q).slice(0, 80)]);
  res.json(rows);
}));
app.post('/api/opportunities', auth, admin, wrap(async (req, res) => {
  const o = req.body;
  if (!need(res, o.title, o.type)) return;
  const { rows } = await pool.query(
    'INSERT INTO opportunities(title,type,organisation,location,description,accessibility_notes,closing_date) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [o.title, o.type, o.organisation, o.location, o.description, o.accessibility_notes, o.closing_date || null]);
  if (app.locals.notify) app.locals.notify.broadcast({ title: 'New opportunity: ' + rows[0].title, body: [rows[0].type, rows[0].organisation, rows[0].location].filter(Boolean).join(' · '), url: '/' });
  res.status(201).json(rows[0]);
}));
app.delete('/api/opportunities/:id', auth, admin, wrap(async (req, res) => { await pool.query('DELETE FROM opportunities WHERE id=$1', [req.params.id]); res.json({ ok: true }); }));

// Saved opportunities
app.get('/api/saved', auth, wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT o.* FROM opportunities o JOIN saved_opportunities s ON s.opportunity_id=o.id WHERE s.user_id=$1', [req.user.id]);
  res.json(rows);
}));
app.post('/api/saved/:id', auth, wrap(async (req, res) => { await pool.query('INSERT INTO saved_opportunities VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]); res.json({ ok: true }); }));
app.delete('/api/saved/:id', auth, wrap(async (req, res) => { await pool.query('DELETE FROM saved_opportunities WHERE user_id=$1 AND opportunity_id=$2', [req.user.id, req.params.id]); res.json({ ok: true }); }));

// Feedback and reports
app.post('/api/feedback', optionalAuth, wrap(async (req, res) => {
  const { type, message } = req.body;
  if (!need(res, type, message)) return;
  await pool.query('INSERT INTO feedback(user_id,type,message) VALUES($1,$2,$3)', [req.user ? req.user.id : null, String(type).slice(0, 60), String(message).trim().slice(0, 2000)]);
  res.status(201).json({ ok: true });
}));
app.get('/api/feedback', auth, admin, wrap(async (_req, res) => { res.json((await pool.query('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 500')).rows); }));
app.patch('/api/feedback/:id', auth, admin, wrap(async (req, res) => { await pool.query('UPDATE feedback SET status=$1 WHERE id=$2', [req.body.status, req.params.id]); res.json({ ok: true }); }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// The extra feature files. If one of them has a problem, the server still starts and says which one.
// (profile must come before ability, because it replaces the older "My profile" routes)
for (const name of ['notify', 'notifications', 'profile', 'ability', 'academy', 'sign', 'places', 'accounts']) {
  try {
    const feature = require('./' + name);
    if (typeof feature !== 'function') throw new Error('the file does not contain "module.exports = (app, pool) => { ... }". It is probably empty or cut off. Copy the full file again.');
    feature(app, pool); console.log('Loaded ' + name + '.js');
  } catch (e) { console.error(`\nCOULD NOT LOAD ${name}.js: ${e.message}\n(The rest of the website still works. Fix this file or run "npm install" in the backend folder.)\n`); }
}
if (sec) sec.finish(app);

// Create the main tables if they are missing, then start listening
(async () => {
  try {
    const schemaFile = path.join(__dirname, '../../database/schema.sql');
    if (fs.existsSync(schemaFile)) await pool.query(fs.readFileSync(schemaFile, 'utf8'));
    await pool.query('SELECT 1');
    console.log('Database connected.');
  } catch (e) { console.error('DATABASE PROBLEM:', errText(e)); }
  app.listen(process.env.PORT || 5000, () => console.log('AbilityConnect API running on port ' + (process.env.PORT || 5000) + (prod ? ' (production mode)' : ' (development mode)')));
})();
