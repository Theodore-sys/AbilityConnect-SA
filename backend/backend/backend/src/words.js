// backend/src/words.js  -  loaded from server.js. "Word helper": explains the meaning of an English word in plain language.
// Uses the free Dictionary API (https://dictionaryapi.dev). No key is needed. The person must be logged in.
const jwt = require('jsonwebtoken');

module.exports = (app) => {
  const read = (req) => { try { return jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); } catch { return null; } };
  const cache = new Map();   // word -> { at, data }
  const hits = new Map();    // user id -> recent request times

  app.get('/api/words', async (req, res) => {
    const user = read(req);
    if (!user) return res.status(401).json({ error: 'Please log in' });
    const word = String(req.query.q || '').trim().toLowerCase();
    if (!/^[a-z][a-z' -]{0,39}$/.test(word)) return res.status(400).json({ error: 'Please type one English word or a short phrase (letters only).' });

    const now = Date.now();
    const recent = (hits.get(user.id) || []).filter((t) => now - t < 60000); recent.push(now); hits.set(user.id, recent);
    if (recent.length > 30) return res.status(429).json({ error: 'Too many searches. Please wait a minute.' });

    const hit = cache.get(word);
    if (hit && now - hit.at < 3600000) return res.json(hit.data);

    try {
      const r = await fetch('https://api.dictionaryapi.dev/v2/entries/en/' + encodeURIComponent(word), { signal: AbortSignal.timeout(8000) });
      if (r.status === 404) return res.status(404).json({ error: 'We could not find "' + word + '". Check the spelling and try again.' });
      if (!r.ok) return res.status(502).json({ error: 'The dictionary is not answering right now. Please try again in a minute.' });
      const j = await r.json();
      const first = Array.isArray(j) ? j[0] : null;
      if (!first) return res.status(404).json({ error: 'We could not find "' + word + '".' });
      const meanings = [];
      for (const e of j) for (const m of (e.meanings || [])) {
        const defs = (m.definitions || []).slice(0, 3).map((d) => ({ definition: d.definition, example: d.example || '' }));
        if (defs.length) meanings.push({ part: m.partOfSpeech || '', definitions: defs });
      }
      const data = { word: first.word || word, phonetic: first.phonetic || '', meanings: meanings.slice(0, 4) };
      if (cache.size > 500) cache.clear();
      cache.set(word, { at: now, data });
      res.json(data);
    } catch (e) {
      console.error('WORD HELPER PROBLEM:', e.message);
      res.status(502).json({ error: 'The dictionary could not be reached. Please try again in a minute.' });
    }
  });
};
