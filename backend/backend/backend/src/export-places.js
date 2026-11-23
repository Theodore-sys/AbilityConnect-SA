// backend/src/export-places.js
// Saves EVERY place in your database (OpenStreetMap + hand-added) into one spreadsheet file you can open in Excel.
//   node src/export-places.js
require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false },
});
const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
(async () => {
  const { rows } = await pool.query(
    `SELECT province, category, name, city, address, lat, lng, phone, email, website, accessibility, verified, COALESCE(source,'hand-added') AS source
     FROM organisations ORDER BY province NULLS LAST, category, name`);
  const head = ['province', 'category', 'name', 'city', 'address', 'latitude', 'longitude', 'phone', 'email', 'website', 'accessibility', 'verified', 'source'];
  const lines = [head.join(',')].concat(rows.map((r) =>
    [r.province, r.category, r.name, r.city, r.address, r.lat, r.lng, r.phone, r.email, r.website, r.accessibility, r.verified ? 'yes' : 'no', r.source].map(q).join(',')));
  fs.writeFileSync('all-places-export.csv', '﻿' + lines.join('\r\n'), 'utf8');
  console.log(`Saved ${rows.length} places to all-places-export.csv (open it in Excel).`);
  const by = {};
  rows.forEach((r) => { by[r.province || '(none)'] = (by[r.province || '(none)'] || 0) + 1; });
  console.table(by);
  await pool.end();
})().catch((e) => { console.error('STOPPED:', e.message); process.exit(1); });