// backend/src/jobs.js  -  loaded from server.js. Adds "Apply" details to jobs, learnerships and bursaries.
module.exports = (app, pool) => {
  (async () => {
    await pool.query('ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS apply_url TEXT');
    await pool.query('ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS apply_email TEXT');
  })().catch((e) => console.error('SETUP PROBLEM (jobs columns):', e.message || e.code));
};
