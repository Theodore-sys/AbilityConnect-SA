require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '') ? false : { rejectUnauthorized: false },
});
const P = ['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape'];
const C = ['Clinic','Hospital','Community centre','Educational institution','Public service office','Library','Shopping centre','Support organisation'];
(async () => {
  const { rows } = await pool.query(`SELECT province, category, COUNT(*)::int AS n FROM organisations GROUP BY 1,2`);
  const m = {}; rows.forEach((r) => { m[r.province + '|' + r.category] = r.n; });
  const t = {}; P.forEach((p) => { t[p] = {}; C.forEach((c) => { t[p][c] = m[p + '|' + c] || 0; }); });
  console.table(t);
  P.forEach((p) => C.forEach((c) => { if (!t[p][c]) console.log('MISSING:', p, '-', c); }));
  await pool.end();
})().catch((e) => { console.error('STOPPED:', e.message); process.exit(1); });
