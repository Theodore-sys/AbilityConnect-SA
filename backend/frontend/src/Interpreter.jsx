import { useState, useEffect, useRef, useCallback } from 'react';
import { api, Field, langName } from './lib.jsx';

// The interpreter portal: open it with  https://YOUR-SITE/#interpreter
// Its own login and session. Only accounts with the "interpreter" role (or an administrator) can use it.
const QUICK = [
  ['Could not understand', 'I could not understand this video. Please record it again, a little slower, in good light, with your hands and face clearly in the picture.'],
  ['Move closer', 'Please record again and stand a little closer to the camera so your hands stay inside the picture.'],
  ['Need more detail', 'I understood part of your message but I need more detail. Please record again and add more information.'],
];
const ago = (d) => { const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000)); return m < 60 ? m + ' min' : m < 1440 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : Math.floor(m / 1440) + ' days'; };

function IntGoogle({ onDone, onError }) {
  const box = useRef(null); const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  useEffect(() => {
    if (!clientId) return undefined;
    const start = () => {
      if (!box.current || !window.google || !window.google.accounts) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp) => {
          try { onDone(await api('/api/auth/google', { method: 'POST', body: { credential: resp.credential, portal: 'interpreter' } })); } catch (e) { onError(e.message); }
        },
      });
      window.google.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 300 });
    };
    if (window.google && window.google.accounts) start();
    else { const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.defer = true; sc.onload = start; document.head.appendChild(sc); }
    return undefined;
  }, [clientId]);
  if (!clientId) return null;
  return <div className="gbtn" ref={box} aria-label="Continue with Google" />;
}

export default function Interpreter() {
  const [auth, setAuth] = useState(() => { try { return JSON.parse(localStorage.getItem('ac_int_auth')) || {}; } catch { return {}; } });
  const [f, setF] = useState({ email: '', password: '' }); const [err, setErr] = useState('');
  const [data, setData] = useState({ waiting: [], done: [], stats: { today: 0, total: 0, avg_minutes: 0 } });
  const [tab, setTab] = useState('queue'); const [lang, setLang] = useState(''); const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(null); const [video, setVideo] = useState(''); const [txt, setTxt] = useState(''); const vid = useRef(null);
  const token = auth.token;

  const logout = () => { localStorage.removeItem('ac_int_auth'); setAuth({}); setOpen(null); };
  const login = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: f });
      if (!['interpreter', 'admin'].includes(r.user.role)) { setErr('This portal is for registered sign language interpreters only. Please ask an administrator to give your account interpreter access.'); return; }
      localStorage.setItem('ac_int_auth', JSON.stringify(r)); setAuth(r);
    } catch (er) { setErr(er.message); }
  };
  const googleDone = (r) => {
    if (!['interpreter', 'admin'].includes(r.user.role)) { setErr('This portal is for registered sign language interpreters only. Please ask the organiser to add your email address.'); return; }
    localStorage.setItem('ac_int_auth', JSON.stringify(r)); setAuth(r);
  };
  const load = useCallback(async () => {
    if (!token) return;
    try { setData(await api('/api/interpreter/queue', { token })); }
    catch (e) { if (/session|log in/i.test(e.message)) logout(); else setMsg(e.message); }
  }, [token]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const take = async (x) => {
    setMsg('');
    try {
      await api(`/api/interpreter/requests/${x.id}/claim`, { method: 'POST', token });
      setOpen(x.id); setTxt(''); setVideo('');
      const r = await api(`/api/interpreter/requests/${x.id}/video`, { token }); setVideo(r.video);
    } catch (e) { setMsg(e.message); }
    load();
  };
  const give = async (x) => { try { await api(`/api/interpreter/requests/${x.id}/release`, { method: 'POST', token }); } catch { /* the 15 minute timer frees it anyway */ } setOpen(null); setVideo(''); load(); };
  const send = async (x) => {
    try { await api(`/api/interpreter/requests/${x.id}`, { method: 'PATCH', token, body: { translation: txt } }); setMsg('Reply sent. The video was deleted.'); setOpen(null); setVideo(''); setTxt(''); }
    catch (e) { setMsg(e.message); }
    load();
  };
  const speed = (v) => { if (vid.current) vid.current.playbackRate = v; };

  if (!token) {
    return (
      <main id="main" className="org-login">
        <div className="card org-card">
          <p className="eyebrow">Registered interpreters only</p>
          <h1>🤟 Interpreter Portal</h1>
          <p>Log in to watch sign language videos sent by users and reply in writing.</p>
          {err && <div className="msg" role="alert">{err}</div>}
          <form onSubmit={login}>
            <Field label="Email" id="ie"><input id="ie" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Password" id="ip"><input id="ip" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            <button className="btn">Log in</button>{' '}
            <button type="button" className="btn alt" onClick={() => { window.location.hash = ''; }}>Back to the public website</button>
          </form>
          <div className="or"><span>or</span></div>
          <IntGoogle onDone={googleDone} onError={setErr} />
          <p className="small">Interpreters are added by the organiser. If you cannot log in, ask the organiser to add your email address.</p>
        </div>
      </main>
    );
  }

  const shown = data.waiting.filter((x) => !lang || x.target_lang === lang);
  const langs = [...new Set(data.waiting.map((x) => x.target_lang))];
  const tiles = [[data.waiting.length, 'Waiting now', '⏳'], [data.stats.today, 'Answered today', '✅'], [data.stats.total, 'Answered in total', '🏅'], [data.stats.avg_minutes + ' min', 'Average wait (7 days)', '⏱️']];

  return (
    <div className="organiser">
      <header className="org-head">
        <strong>🤟 AbilityConnect SA · Interpreter Portal</strong>
        <span><span className="small">Signed in as {auth.user.name}</span>{' '}
          <button className="btn alt sm" onClick={() => { window.location.hash = ''; }}>Public website</button>
          <button className="btn gold sm" onClick={logout}>Log out</button></span>
      </header>
      <main id="main" className="org-main">
        <h2>Interpreter dashboard</h2>
        <section className="stats">{tiles.map(([n, l, i]) => <div className="stat" key={l}><span aria-hidden="true">{i}</span><strong>{n}</strong><span>{l}</span></div>)}</section>
        <div className="tabs" role="group" aria-label="Interpreter sections">
          <button aria-pressed={tab === 'queue'} onClick={() => setTab('queue')}>Waiting videos ({data.waiting.length})</button>
          <button aria-pressed={tab === 'done'} onClick={() => setTab('done')}>My answers</button>
          <button aria-pressed={tab === 'guide'} onClick={() => setTab('guide')}>Guidelines</button>
        </div>
        {msg && <div className="msg" role="status">{msg}</div>}

        {tab === 'queue' && (
          <>
            <div className="btnrow">
              <button className="btn alt sm" onClick={load}>↻ Refresh</button>
              <label className="small">Language: <select value={lang} onChange={(e) => setLang(e.target.value)}><option value="">All</option>{langs.map((l) => <option key={l} value={l}>{langName(l)}</option>)}</select></label>
              <span className="small">The list refreshes by itself every 30 seconds. Oldest requests come first.</span>
            </div>
            {shown.length === 0 && <p>No sign videos are waiting. Thank you!</p>}
            {shown.map((x) => {
              const other = x.claimed_by && !x.mine && x.claim_active;
              return (
                <article className="card" key={x.id}>
                  <h3>Request #{x.id} <span className="tag">Reply in {langName(x.target_lang)}</span>{other && <span className="tag warn">Being handled by {x.claimed_name}</span>}{x.mine && <span className="tag ok">Yours</span>}</h3>
                  <p className="small">From {x.first_name} · waiting {ago(x.created_at)}{x.duration ? ` · ${x.duration} s` : ''}{!x.has_video && ' · video expired'}</p>
                  {open === x.id ? (
                    <>
                      {video ? <video ref={vid} className="embed" controls autoPlay loop src={video} aria-label="Sign language video" /> : <p>Loading video…</p>}
                      <div className="btnrow">{[0.5, 0.75, 1].map((v) => <button key={v} className="btn alt sm" onClick={() => speed(v)}>{v}× speed</button>)}</div>
                      <Field label={`Your reply in ${langName(x.target_lang)}`} id={'ir' + x.id}><textarea id={'ir' + x.id} rows="4" value={txt} onChange={(e) => setTxt(e.target.value)} /></Field>
                      <div className="btnrow">{QUICK.map(([l, t]) => <button key={l} className="btn alt sm" onClick={() => setTxt(t)}>{l}</button>)}</div>
                      <div className="btnrow">
                        <button className="btn" disabled={!txt.trim()} onClick={() => send(x)}>Send reply (deletes the video)</button>
                        <button className="btn alt" onClick={() => give(x)}>Give it back to the queue</button>
                      </div>
                    </>
                  ) : (
                    <button className="btn" disabled={!x.has_video || other} onClick={() => take(x)}>{x.mine ? 'Continue' : 'Take this one'}</button>
                  )}
                </article>
              );
            })}
          </>
        )}

        {tab === 'done' && (
          <>
            {data.done.length === 0 && <p>You have not answered any videos yet.</p>}
            {data.done.map((x) => (
              <div className="card" key={x.id}>
                <span className="tag">#{x.id}</span><span className="tag">{langName(x.target_lang)}</span>
                <p className="small">Answered {new Date(x.translated_at).toLocaleString('en-ZA')} · after {ago(x.created_at).replace(/^/, '')} wait</p>
                <p>{x.translation}</p>
              </div>
            ))}
          </>
        )}

        {tab === 'guide' && (
          <div className="card">
            <h3>Guidelines for interpreters</h3>
            <ul>
              <li><strong>Privacy:</strong> the video belongs to the user. Do not download, record or share it. It is deleted when you send your reply, or after 14 days.</li>
              <li><strong>Take one at a time.</strong> "Take this one" reserves the video for you for 15 minutes so nobody else translates it. Press "Give it back" if you cannot help.</li>
              <li><strong>Home sign:</strong> many Deaf people who did not go to school use their own signs. Write only what you understood. Put <em>[unclear]</em> where you are not sure, and use the quick replies to ask for a new recording.</li>
              <li><strong>Plain words:</strong> write short, simple sentences. The reader may not read well. Avoid long or technical words.</li>
              <li><strong>Emergencies:</strong> if the video shows danger or a medical emergency, reply with the right helpline number straight away (for example 10177 ambulance, 10111 police).</li>
              <li><strong>Qualifications:</strong> this task is for people who know South African Sign Language (SASL). Deaf interpreters who know home sign are especially welcome.</li>
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
