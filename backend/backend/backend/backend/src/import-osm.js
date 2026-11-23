// backend/src/import-osm.js  (version 3: splits big provinces into smaller squares when the free server times out)
// Imports REAL facilities for all 9 provinces from OpenStreetMap (urban and rural): name, category, province, town,
// street address, phone, email, website, map coordinates and wheelchair-access tags where people recorded them.
//
//   node src/import-osm.js                      all 9 provinces. It remembers what finished: if it stops, run the same command again.
//   node src/import-osm.js Limpopo              only one province (or several: node src/import-osm.js Limpopo Gauteng)
//   node src/import-osm.js --only=Clinic        only one kind of place, in every province
//   node src/import-osm.js --report             shows how many places each province has in each category
//   node src/import-osm.js --force              load everything again
//   node src/import-osm.js --schools            also import schools
//
// Data (c) OpenStreetMap contributors, licensed under the ODbL (https://www.openstreetmap.org/copyright).
// Imported places are saved as "not verified". Places you verified in the organiser portal are never overwritten.
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
});
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
// south, west, north, east (rough boxes, only used to cut a big province into smaller squares)
const BBOX = {
  'Eastern Cape': [-34.3, 22.4, -30.1, 30.3], 'Free State': [-30.8, 24.0, -26.5, 29.9], Gauteng: [-26.95, 27.2, -25.05, 29.1], 'KwaZulu-Natal': [-31.2, 28.9, -26.8, 33.0],
  Limpopo: [-25.5, 26.3, -22.0, 31.6], Mpumalanga: [-27.4, 28.4, -24.4, 32.2], 'North West': [-28.3, 22.4, -24.5, 28.3], 'Northern Cape': [-31.5, 16.4, -24.9, 25.9], 'Western Cape': [-34.9, 17.5, -30.2, 24.6],
};
const GROUPS = [
  ['Hospital', ['nwr["amenity"="hospital"]', 'nwr["healthcare"="hospital"]']],
  ['Clinic', ['nwr["amenity"="clinic"]', 'nwr["healthcare"="clinic"]', 'nwr["healthcare"="centre"]']],
  ['Community centre', ['nwr["amenity"="community_centre"]']],
  ['Educational institution', ['nwr["amenity"="university"]', 'nwr["amenity"="college"]']],
  ['Public service office', ['nwr["amenity"="townhall"]', 'nwr["amenity"="courthouse"]', 'nwr["office"="government"]', 'nwr["office"="administrative"]', 'nwr["amenity"="post_office"]']],
  ['Library', ['nwr["amenity"="library"]']],
  ['Shopping centre', ['nwr["shop"="mall"]']],
  ['Support organisation', ['nwr["amenity"="social_facility"]']],
];
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const chosen = args.filter((a) => !a.startsWith('--'));
const provinces = chosen.length ? chosen : PROVINCES;
if (flag('--schools')) GROUPS.find((g) => g[0] === 'Educational institution')[1].push('nwr["amenity"="school"]');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
let ep = 0;

async function overpass(q) {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(ENDPOINTS[ep % ENDPOINTS.length], {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AbilityConnectSA-student-project/1.0' },
        body: 'data=' + encodeURIComponent(q),
      });
      if (res.ok) return (await res.json()).elements || [];
      console.log(`      server said ${res.status}, switching server and trying again...`);
    } catch (e) { console.log('      network problem, trying again...'); }
    ep++; await sleep(12000 * (i + 1));
  }
  return null;
}

// Loads one kind of place for a province. If the whole province is too big for the free server, it is cut into 16 squares.
async function fetchAll(province, area, sel) {
  const whole = await overpass(`[out:json][timeout:240];${area}(${sel}["name"](area.a););out center tags;`);
  if (whole) return whole;
  console.log('      the province was too big in one go, loading it in smaller squares...');
  const [s, w, n, e] = BBOX[province] || [-35, 16, -22, 33]; const N = 4; const seen = new Map();
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const box = [s + ((n - s) * i) / N, w + ((e - w) * j) / N, s + ((n - s) * (i + 1)) / N, w + ((e - w) * (j + 1)) / N].map((x) => x.toFixed(4)).join(',');
      const part = await overpass(`[out:json][timeout:240];${area}(${sel}["name"](area.a)(${box}););out center tags;`);
      if (part === null) return null; // all or nothing, so a half-finished job is never marked as done
      part.forEach((el) => seen.set(el.type + el.id, el));
      await sleep(3000);
    }
  }
  return [...seen.values()];
}

async function findProvinceIds() {
  const els = await overpass('[out:json][timeout:120];area["ISO3166-1"="ZA"]["admin_level"="2"]->.za;rel(area.za)["boundary"="administrative"]["admin_level"="4"];out tags;');
  const ids = {};
  for (const el of els || []) for (const p of PROVINCES) if ([el.tags.name, el.tags['name:en']].some((n) => norm(n) === norm(p))) ids[p] = el.id;
  return ids;
}

const pick = (t, ...keys) => { for (const k of keys) if (t[k]) return String(t[k]); return ''; };
function toRow(el, category, province) {
  const t = el.tags || {};
  const lat = el.lat !== undefined ? el.lat : el.center && el.center.lat;
  const lng = el.lon !== undefined ? el.lon : el.center && el.center.lon;
  if (!t.name || lat === undefined || lng === undefined) return null;
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  const acc = [];
  if (t.wheelchair === 'yes') acc.push('Step-free wheelchair access reported');
  else if (t.wheelchair === 'limited') acc.push('Limited wheelchair access reported');
  else if (t.wheelchair === 'no') acc.push('Not wheelchair accessible (reported)');
  if (t['toilets:wheelchair'] === 'yes') acc.push('Accessible toilet');
  if (t['ramp:wheelchair'] === 'yes' || t.ramp === 'yes') acc.push('Wheelchair ramp');
  return {
    sid: el.type + '/' + el.id, name: t.name.slice(0, 200), category,
    address: [street, t['addr:suburb']].filter(Boolean).join(', ').slice(0, 250),
    city: pick(t, 'addr:city', 'addr:town', 'addr:village', 'addr:suburb').slice(0, 100), province, lat, lng,
    phone: pick(t, 'phone', 'contact:phone').slice(0, 60), email: pick(t, 'email', 'contact:email').slice(0, 120), website: /^https?:\/\//i.test(pick(t, 'website', 'contact:website')) ? pick(t, 'website', 'contact:website').slice(0, 250) : '',
    accessibility: (acc.length ? acc.join('. ') + '. ' : 'Accessibility features not confirmed yet. ') + 'Source: OpenStreetMap.',
  };
}

async function report() {
  const { rows } = await pool.query(`SELECT COALESCE(province,'(no province)') AS province, category, COUNT(*)::int AS places,
    COUNT(*) FILTER (WHERE lat IS NOT NULL)::int AS with_coordinates, COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone <> '')::int AS with_phone,
    COUNT(*) FILTER (WHERE address IS NOT NULL AND address <> '')::int AS with_address, COUNT(*) FILTER (WHERE verified)::int AS verified
    FROM organisations GROUP BY 1, 2 ORDER BY 1, 2`);
  console.table(rows);
  const have = new Set(rows.map((r) => r.province + '|' + r.category));
  for (const p of PROVINCES) for (const [c] of GROUPS) if (!have.has(p + '|' + c)) console.log(`MISSING: ${p} - ${c}`);
}

(async () => {
  for (const c of ['province TEXT', 'lat DOUBLE PRECISION', 'lng DOUBLE PRECISION', 'source TEXT', 'source_id TEXT']) await pool.query(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS ${c}`);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS organisations_source_uq ON organisations(source, source_id)');
  await pool.query('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
  if (flag('--report')) { await report(); await pool.end(); return; }

  const curated = new Set((await pool.query('SELECT lower(name) AS n FROM organisations WHERE source IS NULL')).rows.map((r) => r.n));
  console.log('Finding the province boundaries...');
  const ids = await findProvinceIds();
  const failed = []; let grand = 0;
  for (const province of provinces) {
    const area = ids[province] ? `rel(${ids[province]});map_to_area->.a;` : `area["name"="${province}"]["boundary"="administrative"]["admin_level"="4"]->.a;`;
    if (!ids[province]) console.log(`(${province}: boundary not found by id, using its name instead)`);
    for (const [category, selectors] of GROUPS) {
      if (only && norm(only) !== norm(category)) continue;
      for (const sel of selectors) {
        const key = `osm_done:${province}|${sel}`;
        if (!flag('--force') && (await pool.query('SELECT 1 FROM settings WHERE key=$1', [key])).rowCount) continue;
        process.stdout.write(`${province} - ${category} (${sel.replace('nwr', '')}): loading... `);
        const els = await fetchAll(province, area, sel);
        if (els === null) { console.log('FAILED, will skip'); failed.push(`${province} - ${category}`); continue; }
        let n = 0;
        for (const el of els) {
          const r = toRow(el, category, province);
          if (!r || curated.has(r.name.toLowerCase())) continue;
          await pool.query(
            `INSERT INTO organisations(name,category,address,city,province,lat,lng,phone,email,website,accessibility,verified,source,source_id)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,'osm',$12)
             ON CONFLICT (source, source_id) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category, address=EXCLUDED.address, city=EXCLUDED.city,
               province=EXCLUDED.province, lat=EXCLUDED.lat, lng=EXCLUDED.lng, phone=EXCLUDED.phone, email=EXCLUDED.email, website=EXCLUDED.website, accessibility=EXCLUDED.accessibility
             WHERE organisations.verified = false`,
            [r.name, r.category, r.address, r.city, r.province, r.lat, r.lng, r.phone, r.email, r.website, r.accessibility, r.sid]);
          n++;
        }
        await pool.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [key, String(n)]);
        grand += n; console.log(`${n} saved`);
        await sleep(6000);
      }
    }
  }
  console.log(`\nFinished. ${grand} places saved in this run.`);
  if (failed.length) console.log('These did not load (busy server). Run the same command again to retry only these:\n - ' + failed.join('\n - '));
  console.log('\nSee the numbers per province and category with:  node src/import-osm.js --report');
  await pool.end();
})().catch((e) => { console.error('\nSTOPPED:', e.message, '\nRun the same command again to continue where it stopped.'); process.exit(1); });
