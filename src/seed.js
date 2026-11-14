// Creates tables, FICTIONAL test accounts and FICTIONAL sample data. Replace with verified real data before going live.
require('dotenv').config();
const fs = require('fs'); const path = require('path');
const bcrypt = require('bcryptjs'); const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false });
(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8'));
  const users = [['Test Admin', 'admin@abilityconnect.test', 'Admin@12345', 'admin'], ['Test User', 'user@abilityconnect.test', 'User@12345', 'user']];
  for (const [n, e, p, r] of users)
    await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING', [n, e, await bcrypt.hash(p, 10), r]);
  if (!(await pool.query('SELECT 1 FROM organisations LIMIT 1')).rowCount) {
    const orgs = [
      ['Sample Disability Support Centre', 'Support organisation', '1 Example Street', 'Pretoria', '012 000 0000', 'info@example.org', '', 'Wheelchair ramp, sign language interpreter on request', false],
      ['Sample Community Clinic', 'Clinic', '2 Example Road', 'Johannesburg', '011 000 0000', 'clinic@example.org', '', 'Step-free entrance, accessible toilets', false],
      ['Sample Skills College', 'Educational institution', '3 Example Avenue', 'Cape Town', '021 000 0000', 'college@example.org', '', 'Braille materials, lift access', false],
      ['Sample Home Affairs Office', 'Public service office', '4 Example Lane', 'Durban', '031 000 0000', 'office@example.org', '', 'Priority queue, ramp access', false]];
    for (const o of orgs) await pool.query('INSERT INTO organisations(name,category,address,city,phone,email,website,accessibility,verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', o);
    const ops = [
      ['Sample IT Internship', 'Internship', 'Sample Tech Co', 'Pretoria', 'Twelve-month paid internship for graduates.', 'Screen-reader friendly workplace tools', '2027-01-31'],
      ['Sample Business Learnership', 'Learnership', 'Sample Training Academy', 'Johannesburg', 'NQF level 4 business administration learnership.', 'Accessible venue, extra time for assessments', '2027-02-15'],
      ['Sample Data Capturer', 'Employment', 'Sample Services Ltd', 'Remote', 'Part-time remote data capturing role.', 'Flexible hours, remote work', '2026-12-15'],
      ['Sample Digital Skills Course', 'Skills programme', 'Sample Skills Hub', 'Online', 'Free introductory digital skills programme.', 'Captioned video lessons', null]];
    for (const o of ops) await pool.query('INSERT INTO opportunities(title,type,organisation,location,description,accessibility_notes,closing_date) VALUES($1,$2,$3,$4,$5,$6,$7)', o);
  }
  console.log('Database ready.'); await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
