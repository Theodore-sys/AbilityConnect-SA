// backend/src/places.js  -  loaded from server.js with:  require('./places')(app, pool);
const jwt = require('jsonwebtoken');

module.exports = (app, pool) => {
  const run = (sql, p) => pool.query(sql, p);
  const read = (req) => { try { return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); } catch { return null; } };
  const auth = (req, res, next) => { req.user = read(req); req.user ? next() : res.status(401).json({ error: 'Please log in' }); };
  const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Administrators only' }));

  // Contact details copied from the Disability Info South Africa organisations page (disabilityinfosa.org.za), checked for this project.
  const DISA = [
    ['National Council of and for Persons with Disabilities (NCPD)', 'Gauteng', '(011) 452 2774', 'therina@ncpd.org.za', 'https://www.ncpd.org.za'],
    ['QuadPara Association of South Africa (QASA)', 'KwaZulu-Natal', '031 767 0348', 'gm@qasa.co.za', 'https://www.qasa.co.za'],
    ['Blind SA', 'Gauteng', '011 839 1793', 'ceo@blindsa.org.za', 'https://www.blindsa.org.za'],
  ];

  (async () => {
    await run('ALTER TABLE organisations ADD COLUMN IF NOT EXISTS province TEXT');
    await run('ALTER TABLE organisations ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION');
    await run('ALTER TABLE organisations ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION');
    await run('ALTER TABLE organisations ADD COLUMN IF NOT EXISTS source TEXT');
    await run('ALTER TABLE organisations ADD COLUMN IF NOT EXISTS source_id TEXT');
    await run('CREATE UNIQUE INDEX IF NOT EXISTS organisations_source_uq ON organisations(source, source_id)');
    await run('CREATE INDEX IF NOT EXISTS organisations_province_idx ON organisations(province)');
    await run('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
    const done = await run("SELECT 1 FROM settings WHERE key='disa_orgs_v1'");
    if (!done.rowCount) {
      for (const [name, province, phone, email, website] of DISA) {
        const ex = await run('SELECT 1 FROM organisations WHERE name=$1', [name]);
        if (!ex.rowCount) await run("INSERT INTO organisations(name,category,province,phone,email,website,accessibility,verified) VALUES($1,'Support organisation',$2,$3,$4,$5,'Disability organisation. Contact them for accessibility details.',false)", [name, province, phone, email, website]);
      }
      await run("UPDATE organisations SET phone='+27 12 452 3811', email='helpdesk@sancb.org.za', website='https://www.sancb.org.za' WHERE name LIKE 'South African National Council for the Blind%'");
      await run("INSERT INTO settings(key,value) VALUES('disa_orgs_v1','1') ON CONFLICT (key) DO NOTHING");
    }
  })().catch((e) => console.error('SETUP PROBLEM (places):', e.message || e.code));

  // Search with filters, distance and paging, so thousands of places stay fast
  app.get('/api/places-search', auth, async (req, res) => {
    try {
      const { province, category, kind, q, verified, feats, near } = req.query;
      const p = []; const where = [];
      const param = (v) => { p.push(v); return '$' + p.length; };
      if (province) where.push(`o.province = ${param(province)}`);
      if (category) where.push(`o.category = ${param(category)}`);
      if (kind === 'support') where.push("o.category = 'Support organisation'");
      else if (kind === 'places') where.push("o.category <> 'Support organisation'");
      if (verified) where.push('o.verified = true');
      if (q) { const i = param('%' + String(q).slice(0, 80) + '%'); where.push(`(o.name ILIKE ${i} OR o.city ILIKE ${i} OR o.address ILIKE ${i} OR o.province ILIKE ${i} OR o.accessibility ILIKE ${i})`); }
      String(feats || '').split(',').filter((f) => /^[a-z-]{2,12}$/.test(f)).forEach((f) => where.push(`o.accessibility ILIKE ${param('%' + f + '%')}`));
      const lat = Number(req.query.lat); const lng = Number(req.query.lng);
      const located = Number.isFinite(lat) && Number.isFinite(lng) && req.query.lat !== undefined && req.query.lng !== undefined;
      let dist = 'NULL::float8';
      if (located) {
        const a = param(lat); const b = param(lng);
        dist = `(CASE WHEN o.lat IS NULL OR o.lng IS NULL THEN NULL ELSE 6371 * acos(LEAST(1, cos(radians(${a})) * cos(radians(o.lat)) * cos(radians(o.lng) - radians(${b})) + sin(radians(${a})) * sin(radians(o.lat)))) END)`;
      }
      const base = `SELECT o.*, ${dist} AS km FROM organisations o ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
      let outer = '';
      if (located && near) outer = `WHERE t.km IS NOT NULL AND t.km <= ${param(Math.min(200, Number(req.query.km) || 40))}`;
      const total = (await run(`SELECT COUNT(*)::int AS n FROM (${base}) t ${outer}`, p)).rows[0].n;
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50)); const offset = Math.max(0, Number(req.query.offset) || 0);
      const order = located ? 't.km ASC NULLS LAST, t.name' : 't.province NULLS LAST, t.city NULLS LAST, t.name';
      const rows = (await run(`SELECT * FROM (${base}) t ${outer} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, p)).rows;
      res.json({ total, rows });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error: ' + (e.message || e.code) }); }
  });

  // How many places each province has in each category, and how complete the details are
  app.get('/api/admin/coverage', auth, admin, async (_req, res) => {
    try {
      res.json((await run(`SELECT COALESCE(province,'Province not set') AS province, category, COUNT(*)::int AS n,
        COUNT(*) FILTER (WHERE lat IS NOT NULL)::int AS co, COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone <> '')::int AS ph,
        COUNT(*) FILTER (WHERE address IS NOT NULL AND address <> '')::int AS ad
        FROM organisations GROUP BY 1, 2 ORDER BY 1, 2`)).rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error: ' + (e.message || e.code) }); }
  });

  // ================= Access verification workflow =================
  (async () => {
    await run("ALTER TABLE organisations ADD COLUMN IF NOT EXISTS access_checklist JSONB DEFAULT '{}'::jsonb");
    for (const c of ['verified_by TEXT', 'verified_at TIMESTAMPTZ', 'verification_method TEXT', 'verification_note TEXT']) await run(`ALTER TABLE organisations ADD COLUMN IF NOT EXISTS ${c}`);
  })().catch((e) => console.error('SETUP PROBLEM (verification):', e.message || e.code));

  const ITEMS = ['ramp', 'step_free', 'toilet', 'lift', 'parking', 'sign', 'braille', 'loop', 'wide_doors'];
  const LABEL = { ramp: 'Wheelchair ramp', step_free: 'Step-free entrance', toilet: 'Accessible toilet', lift: 'Lift', parking: 'Accessible parking', sign: 'Sign language support', braille: 'Braille / large print', loop: 'Hearing loop', wide_doors: 'Wide doors' };
  const METHODS = ['Phone call', 'Site visit', 'Official website', 'Community report'];
  const CATS = ['Clinic', 'Hospital', 'Community centre', 'Educational institution', 'Public service office', 'Library', 'Shopping centre', 'Support organisation'];
  const PROV = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
  const fail = (res, e) => { console.error(e); res.status(500).json({ error: 'Server error: ' + (e.message || e.code) }); };

  // Places waiting to be checked (places with a phone number come first, so organisers can call them)
  app.get('/api/admin/verify-queue', auth, admin, async (req, res) => {
    try {
      const { province, category, q, phone, status = 'unverified' } = req.query;
      const p = []; const w = []; const prm = (v) => { p.push(v); return '$' + p.length; };
      if (province) w.push(`province = ${prm(province)}`);
      if (category) w.push(`category = ${prm(category)}`);
      if (status === 'unverified') w.push('COALESCE(verified, false) = false'); else if (status === 'verified') w.push('verified = true');
      if (phone === '1') w.push("phone IS NOT NULL AND phone <> ''");
      if (q) { const i = prm('%' + String(q).slice(0, 60) + '%'); w.push(`(name ILIKE ${i} OR city ILIKE ${i})`); }
      const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
      const total = (await run(`SELECT COUNT(*)::int AS n FROM organisations ${where}`, p)).rows[0].n;
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const rows = (await run(`SELECT id,name,category,province,city,address,phone,email,website,accessibility,verified,access_checklist,verification_method,verification_note,verified_at,verified_by
        FROM organisations ${where} ORDER BY (phone IS NOT NULL AND phone <> '') DESC, province NULLS LAST, city NULLS LAST, name LIMIT 20 OFFSET ${offset}`, p)).rows;
      res.json({ total, rows });
    } catch (e) { fail(res, e); }
  });

  // An organiser records what they found. A place only becomes "verified" with a method and at least 3 answers.
  app.patch('/api/admin/places/:id/verify', auth, admin, async (req, res) => {
    try {
      const cl = {}; let answered = 0;
      for (const k of ITEMS) {
        const v = (req.body.checklist || {})[k];
        if (v === 'yes' || v === 'no') { cl[k] = v; answered++; } else if (v === 'unknown') cl[k] = 'unknown';
      }
      if (!METHODS.includes(req.body.method)) return res.status(400).json({ error: 'Please choose how you checked: ' + METHODS.join(', ') + '.' });
      if (answered < 3) return res.status(400).json({ error: 'Please answer at least 3 of the access questions with Yes or No.' });
      const yes = ITEMS.filter((k) => cl[k] === 'yes').map((k) => LABEL[k]);
      const text = (yes.length ? yes.join(', ') + '.' : 'No accessibility features were found when this place was checked.') + ' Checked by ' + req.body.method.toLowerCase() + '.';
      await run(`UPDATE organisations SET access_checklist=$1, verification_method=$2, verification_note=$3, verified=true, verified_at=now(), verified_by=$4, accessibility=$5 WHERE id=$6`,
        [JSON.stringify(cl), req.body.method, String(req.body.note || '').slice(0, 300), req.user.name, text, req.params.id]);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });
  app.patch('/api/admin/places/:id/unverify', auth, admin, async (req, res) => {
    try { await run('UPDATE organisations SET verified=false WHERE id=$1', [req.params.id]); res.json({ ok: true }); } catch (e) { fail(res, e); }
  });

  // ================= Bulk import from a CSV file =================
  const parseCsv = (text) => {
    const rows = []; let row = []; let cur = ''; let q = false;
    const endRow = () => { row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
      else cur += c;
    }
    endRow();
    return rows;
  };
  app.post('/api/admin/places-import', auth, admin, async (req, res) => {
    try {
      const rows = parseCsv(String(req.body.csv || '').replace(/^\uFEFF/, ''));
      if (rows.length < 2) return res.status(400).json({ error: 'The file needs a header row and at least one place.' });
      const head = rows[0].map((x) => x.trim().toLowerCase()); const idx = (n) => head.indexOf(n);
      if (idx('name') < 0 || idx('category') < 0) return res.status(400).json({ error: 'The first row must contain the column names: name, category, province, city, address, lat, lng, phone, email, website, accessibility' });
      let added = 0; let skipped = 0; const errors = [];
      for (let r = 1; r < rows.length && r <= 5000; r++) {
        const g = (n) => (idx(n) >= 0 ? String(rows[r][idx(n)] || '').trim() : '');
        const name = g('name'); const category = g('category'); const province = g('province');
        if (!name) { errors.push(`Row ${r + 1}: no name`); continue; }
        if (!CATS.includes(category)) { errors.push(`Row ${r + 1} (${name}): category must be one of: ${CATS.join(', ')}`); continue; }
        if (province && !PROV.includes(province)) { errors.push(`Row ${r + 1} (${name}): unknown province "${province}"`); continue; }
        const lat = g('lat') === '' ? null : Number(g('lat')); const lng = g('lng') === '' ? null : Number(g('lng'));
        if ((lat !== null && !(lat >= -35 && lat <= -22)) || (lng !== null && !(lng >= 16 && lng <= 33.5))) { errors.push(`Row ${r + 1} (${name}): the coordinates are not in South Africa`); continue; }
        if ((await run("SELECT 1 FROM organisations WHERE lower(name)=lower($1) AND COALESCE(province,'')=$2", [name, province])).rowCount) { skipped++; continue; }
        await run(`INSERT INTO organisations(name,category,province,city,address,lat,lng,phone,email,website,accessibility,verified,source)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,'csv')`,
        [name.slice(0, 200), category, province || null, g('city'), g('address'), lat, lng, g('phone'), g('email'), /^https?:\/\//i.test(g('website')) ? g('website') : '', g('accessibility') || 'Accessibility features not confirmed yet.']);
        added++;
      }
      res.json({ added, skipped, errorCount: errors.length, errors: errors.slice(0, 15) });
    } catch (e) { fail(res, e); }
  });
};
