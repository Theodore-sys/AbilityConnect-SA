// Usage (from the folder that holds package.json and src):   node src/import-jobs.js jobs-for-import.csv
// Adds jobs, learnerships, internships and bursaries from a CSV. Posts that already exist (same title + organisation) are skipped.
// CSV columns: title,type,organisation,location,closing_date,apply_url,apply_email,description,accessibility_notes
require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');
const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('Give the CSV file name, for example:  node src/import-jobs.js jobs-for-import.csv'); process.exit(1); }

function parse(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pool.query('ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS apply_url TEXT');
  await pool.query('ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS apply_email TEXT');
  const [head, ...rows] = parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const col = (r, k) => (r[head.map((x) => x.trim()).indexOf(k)] || '').trim();
  const TYPES = ['Internship', 'Employment', 'Learnership', 'Skills programme', 'Bursary', 'Course'];
  let added = 0, skipped = 0;
  for (const r of rows) {
    const title = col(r, 'title'), type = col(r, 'type'), org = col(r, 'organisation');
    if (!title || !TYPES.includes(type)) { console.log('Skipped (needs a title and a type from: ' + TYPES.join(', ') + '):', title || '(blank)'); skipped++; continue; }
    const res = await pool.query(
      `INSERT INTO opportunities(title,type,organisation,location,description,accessibility_notes,closing_date,apply_url,apply_email)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9
       WHERE NOT EXISTS (SELECT 1 FROM opportunities WHERE lower(title)=lower($1) AND lower(coalesce(organisation,''))=lower($3))`,
      [title, type, org, col(r, 'location'), col(r, 'description'), col(r, 'accessibility_notes'), col(r, 'closing_date') || null, col(r, 'apply_url') || null, col(r, 'apply_email') || null]);
    if (res.rowCount) { added++; console.log('Added:', title); } else { skipped++; console.log('Already there, skipped:', title); }
  }
  console.log(`\nDone. Added ${added}, skipped ${skipped}.`);
  await pool.end();
})().catch((e) => { console.error('STOPPED:', e.message); process.exit(1); });
