require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false },
});

function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

(async () => {
  const file = process.argv[2];
  if (!file) { console.log('Usage: node src/import-csv.js yourfile.csv'); process.exit(1); }
  const [head, ...data] = parseCsv(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')).filter((r) => r.length > 1);
  const items = data.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()]))).filter((o) => o.name && o.province);
  const col = (f) => items.map((o) => o[f] || null);
  const num = (f) => items.map((o) => (o[f] ? Number(o[f]) : null));
  const res = await pool.query(
    `INSERT INTO organisations(name,category,address,city,province,lat,lng,phone,email,website,accessibility,verified)
     SELECT t.name,t.category,t.address,t.city,t.province,t.lat,t.lng,t.phone,t.email,t.website,t.accessibility,FALSE
     FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::float8[],$7::float8[],$8::text[],$9::text[],$10::text[],$11::text[])
       AS t(name,category,address,city,province,lat,lng,phone,email,website,accessibility)
     WHERE NOT EXISTS (SELECT 1 FROM organisations o WHERE lower(o.name)=lower(t.name) AND o.province=t.province)`,
    [col('name'), col('category'), col('address'), col('city'), col('province'), num('lat'), num('lng'), col('phone'), col('email'), col('website'), col('accessibility')]);
  console.log(`Done. Added ${res.rowCount}, skipped ${items.length - res.rowCount} that were already there.`);
  await pool.end();
})().catch((e) => { console.error('STOPPED:', e.message); process.exit(1); });
