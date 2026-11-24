import { useState } from 'react';
import { api, Field, Listen, Dictate, SA_LANGS, translateText } from './lib.jsx';

// "Word helper": type or say a word and see what it means in plain language, with an example.
// The meaning can also be read aloud and translated into another South African language (translation needs the organiser to switch it on).
export default function WordHelper({ token }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState('zu'); const [tr, setTr] = useState({}); const [trErr, setTrErr] = useState('');

  const look = async (e) => {
    if (e) e.preventDefault();
    setErr(''); setRes(null); setTr({}); setTrErr(''); setBusy(true);
    try { setRes(await api('/api/words?q=' + encodeURIComponent(q.trim()), { token })); } catch (er) { setErr(er.message); }
    setBusy(false);
  };
  const translate = async (key, text) => {
    setTrErr('');
    try { const r = await translateText(text, lang, token, 'en'); setTr((t) => ({ ...t, [key]: r.text })); } catch (er) { setTrErr(er.message); }
  };

  return (
    <>
      <form className="card" onSubmit={look}>
        <h3>Word helper</h3>
        <p>Type or say a word you do not understand. We explain it in simple words and give an example.</p>
        <Field label="The word (in English)" id="wh-q"><input id="wh-q" required value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" /></Field>
        <div className="btnrow"><button className="btn" disabled={busy}>{busy ? 'Looking...' : 'What does it mean?'}</button> <Dictate onText={(t) => setQ(t.replace(/[^a-zA-Z' -]/g, '').trim())} /></div>
      </form>
      {err && <div className="msg" role="alert">{err}</div>}
      {res && (
        <article className="card" aria-live="polite">
          <h3>{res.word}{res.phonetic ? <span className="small"> {res.phonetic}</span> : null}</h3>
          <div className="row">
            <div style={{ minWidth: 180 }}><label htmlFor="wh-l">Translate the meaning into</label>
              <select id="wh-l" value={lang} onChange={(e) => { setLang(e.target.value); setTr({}); }}>{SA_LANGS.filter((l) => l.t !== 'en').map((l) => <option key={l.t} value={l.t}>{l.name}</option>)}</select></div>
          </div>
          {trErr && <div className="msg" role="alert">{trErr}</div>}
          {res.meanings.map((m, i) => (
            <section key={i}>
              {m.part && <span className="tag">{m.part}</span>}
              <ol>
                {m.definitions.map((d, j) => {
                  const key = i + '-' + j;
                  return (
                    <li key={j}>
                      <p>{d.definition}</p>
                      {d.example && <p className="small">Example: {d.example}</p>}
                      {tr[key] && <p className="bigline">{tr[key]}</p>}
                      <div className="btnrow">
                        <Listen text={d.definition} />
                        <button type="button" className="btn alt sm" onClick={() => translate(key, d.definition)}>🌍 Translate</button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </article>
      )}
    </>
  );
}
