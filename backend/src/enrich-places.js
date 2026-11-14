// backend/src/enrich-places.js
// Fills in a missing town and street address for places that have map coordinates, using OpenStreetMap's free "Nominatim" service.
//   node src/enrich-places.js                    up to 200 places per run
//   node src/enrich-places.js --limit=400 --province="Limpopo"
// Nominatim allows 1 request per second and asks users not to do huge bulk jobs, so this runs slowly on purpose.
// Run it again to do the next batch. Phone numbers are never invented: if a place has none on the map, it stays blank.
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
});
const arg = (n) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : ''; };
const limit = Math.min(1000, Number(arg('limit')) || 200); const province = arg('province');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await pool.query('ALTER TABLE organisations ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ');
  const { rows } = await pool.query(
    `SELECT id,lat,lng FROM organisations WHERE lat IS NOT NULL AND enriched_at IS NULL AND (city IS NULL OR city='' OR address IS NULL OR address='')
     AND ($2='' OR province=$2) ORDER BY (source IS NULL) DESC, id LIMIT $1`, [limit, province]);
  console.log(`${rows.length} places to complete...`);
  let done = 0;
  for (const r of rows) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=en&lat=${r.lat}&lon=${r.lng}`, { headers: { 'User-Agent': 'AbilityConnectSA-student-project/1.0' } });
      if (res.status === 429) { console.log('The service asked us to slow down. Run the command again later.'); break; }
      const a = ((await res.json()).address) || {};
      const city = a.city || a.town || a.village || a.suburb || a.municipality || a.county || '';
      const road = [a.house_number, a.road].filter(Boolean).join(' ');
      await pool.query("UPDATE organisations SET city=COALESCE(NULLIF(city,''),$1), address=COALESCE(NULLIF(address,''),$2), enriched_at=now() WHERE id=$3", [city, road, r.id]);
      done++; if (done % 25 === 0) console.log(`${done} done`);
    } catch (e) { console.log('skipped one:', e.message); }
    await sleep(1100);
  }
  console.log(`Finished: ${done} places completed. Run again for the next batch.`);
  await pool.end();
})().catch((e) => { console.error('STOPPED:', e.message); process.exit(1); });