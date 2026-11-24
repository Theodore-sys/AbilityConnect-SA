import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import Demo3D from './Demo3D.jsx';
import { api, Listen, Dictate, Field, Slot, Embed, useList, compressImage, speak, ICON, FEATURES, HELP_KINDS, REPORT_CATS, REPORT_STATUS, CONTACT_PREFS, PROVINCES, ORG_CATS, distanceKm, NEAR_KM, ACCESS_ITEMS, API, safeUrl, safeEmail, squareImage, pushSupported, enablePush, disablePush, pushActiveHere } from './lib.jsx';

function Banner({ title, text, plain, slot }) {
  return (
    <section className="banner">
      <div><h2>{title}</h2><p>{text}</p>{plain && <p className="plain">In short: {plain}</p>}</div>
      <Slot name={slot} className="banner-media" />
    </section>
  );
}

/* ---------------- Login / register / forgot password / Google ---------------- */
function GoogleButton({ onDone, onError }) {
  const box = useRef(null); const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  useEffect(() => {
    if (!clientId) return undefined;
    const start = () => {
      if (!box.current || !window.google || !window.google.accounts) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp) => {
          try { onDone(await api('/api/auth/google', { method: 'POST', body: { credential: resp.credential } })); } catch (e) { onError(e.message); }
        },
      });
      window.google.accounts.id.renderButton(box.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 300 });
    };
    if (window.google && window.google.accounts) start();
    else {
      const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true; sc.defer = true; sc.onload = start; document.head.appendChild(sc);
    }
    return undefined;
  }, [clientId]);
  if (!clientId) return <p className="small">Google sign-in is not switched on yet (the organiser must add VITE_GOOGLE_CLIENT_ID).</p>;
  return <div className="gbtn" ref={box} aria-label="Continue with Google" />;
}

export function Auth({ onAuth, go, notice, settings }) {
  const [mode, setMode] = useState('login'); const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState(''); const [info, setInfo] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const finish = (r) => { onAuth(r); go(r.user.role === 'admin' ? 'admin' : 'dashboard'); };
  const switchTo = (m) => { setMode(m); setErr(''); setInfo(''); };
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'forgot') { const r = await api('/api/auth/forgot', { method: 'POST', body: { email: f.email } }); setInfo(r.message); }
      else finish(await api('/api/auth/' + mode, { method: 'POST', body: f }));
    } catch (er) { setErr(er.message); } finally { setBusy(false); }
  };
  const title = { login: 'Log in to AbilityConnect SA', register: 'Create your account', forgot: 'Forgot your password?' }[mode];
  return (
    <>
    <section className="login-split">
      <div className="cube-col"><Demo3D preview auto /></div>
      <div>
        <p className="eyebrow">Your ability. Your opportunities. Your access.</p>
        <h2>{title}</h2>
        {mode === 'forgot'
          ? <p>Enter the email address you registered with. We will email you a link to choose a new password.</p>
          : <><p>{settings.welcome || 'Find accessible places, discover opportunities and get the support you need.'}</p>
            <p className="small">Everyone is welcome. You never need to share a diagnosis or medical information.</p></>}
        {notice && <div className="msg" role="status">{notice}</div>}
        {err && <div className="msg" role="alert">{err}</div>}
        {info && <div className="msg ok" role="status">✔ {info}</div>}
        <form className="card" onSubmit={submit}>
          {mode === 'register' && <Field label="Name" id="an"><input id="an" required value={f.name} onChange={set('name')} /></Field>}
          <Field label="Email" id="ae"><input id="ae" type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></Field>
          {mode !== 'forgot' && <Field label="Password (at least 10 characters, with letters and numbers)" id="ap"><input id="ap" type="password" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={f.password} onChange={set('password')} /></Field>}
          {mode === 'login' && <button className="btn" disabled={busy}>{busy ? 'Please wait…' : 'Log in'}</button>}
          {mode === 'register' && <button className="btn" disabled={busy}>{busy ? 'Please wait…' : 'Register'}</button>}
          {mode === 'forgot' && <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send me a reset link'}</button>}{' '}
          {mode === 'login' && <button type="button" className="btn alt" onClick={() => switchTo('register')}>Need an account?</button>}
          {mode === 'register' && <button type="button" className="btn alt" onClick={() => switchTo('login')}>Have an account?</button>}
          {mode === 'register' && <p className="small">This sign-up is for people who use the website. Sign language interpreters are added by the organisers, so please contact them if you are an interpreter.</p>}
          {mode === 'forgot' && <button type="button" className="btn alt" onClick={() => switchTo('login')}>Back to log in</button>}
          {mode === 'login' && <p className="small"><button type="button" className="linkbtn" onClick={() => switchTo('forgot')}>Forgot your password?</button></p>}
          {mode !== 'forgot' && <><div className="or"><span>or</span></div><GoogleButton onDone={finish} onError={setErr} /></>}
        </form>
        <p className="small">System organiser? <a href="#organiser">Open the organiser portal</a>.</p>
      </div>
    </section>
    </>
  );
}

// Opened from the link in the reset email:  /#reset=THE-TOKEN
export function ResetPassword({ token }) {
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState(''); const [done, setDone] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (pw !== pw2) { setErr('The two passwords do not match. Please type them again.'); return; }
    try { setDone((await api('/api/auth/reset', { method: 'POST', body: { token, password: pw } })).message); } catch (er) { setErr(er.message); }
  };
  const toLogin = () => { window.location.hash = ''; };
  if (done) {
    return (
      <section className="card reset">
        <h2>✔ Password reset</h2>
        <div className="msg ok" role="status">{done}</div>
        <button className="btn" onClick={toLogin}>Go to log in</button>
      </section>
    );
  }
  return (
    <section className="card reset">
      <p className="eyebrow">AbilityConnect SA</p>
      <h2>Choose a new password</h2>
      {err && <div className="msg" role="alert">{err}</div>}
      <form onSubmit={submit}>
        <Field label="New password (at least 10 characters, with letters and numbers)" id="rp1"><input id="rp1" type="password" required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Type the new password again" id="rp2"><input id="rp2" type="password" required autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        <button className="btn">Reset my password</button>{' '}
        <button type="button" className="btn alt" onClick={toLogin}>Cancel</button>
      </form>
    </section>
  );
}

/* ---------------- Dashboard ---------------- */
export function Dashboard({ user, token, go, notes, seen, markRead, settings }) {
  const [ops] = useList('/api/opportunities', token);
  const [placeSum, setPlaceSum] = useState({ total: 0, newest: [] });
  useEffect(() => { api('/api/places-summary', { token }).then(setPlaceSum).catch(() => {}); }, [token]);
  const [sp] = useList('/api/saved-places', token);
  const [so] = useList('/api/saved', token);
  const [reps] = useList('/api/reports/mine', token);
  const unread = notes.filter((n) => n.id > seen).length;
  const open = reps.filter((r) => !['Resolved', 'Closed'].includes(r.status)).length;
  const intro = settings.welcome || 'Find accessible places, discover opportunities and get the support you need.';
  const summary = `Hello ${user.name}. ${intro} You have ${unread} new announcements, ${sp.length + so.length} saved items and ${open} open reports.`;
  const stats = [[unread, 'New announcements', '📢'], [sp.length + so.length, 'Saved items', '⭐'], [open, 'Open reports', '📣'], [placeSum.total, 'Places and services listed', '📍']];
  const tiles = [
    ['places', '📍', 'Accessible places', 'Check ramps, lifts and toilets before you travel.'],
    ['education', '🎓', 'Education & training', 'Learnerships, courses and bursaries.'],
    ['employment', '💼', 'Employment', 'Inclusive internships and jobs.'],
    ['support', '🤝', 'Support services', 'Organisations that can help you.'],
    ['communicate', '💬', 'Communicate', 'Captions and voice for deaf and hearing people.'],
    ['report', '📣', 'Report a barrier', 'Help us make access better.'],
    ['access', '♿', 'Accessibility settings', 'Make the platform work for you.'],
  ];
  const newestOps = [...ops].sort((a, b) => b.id - a.id).slice(0, 3);
  const newestPlaces = placeSum.newest;
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Your dashboard</p>
          <h2>Welcome, {user.name}</h2>
          <p>{intro}</p>
          <p className="plain">In short: use the menu on the left to find places, jobs, learning and help.</p>
          <div className="actions">
            <button className="btn" onClick={() => go('places')}>Find accessible places</button>
            <button className="btn gold" onClick={() => go('report')}>Report a barrier</button>
            <Listen text={summary} />
          </div>
        </div>
        <Slot name="hero" className="tall" />
      </section>

      <section className="stats" aria-label="Your summary">
        {stats.map(([n, l, i]) => <div className="stat" key={l}><span aria-hidden="true">{i}</span><strong>{n}</strong><span>{l}</span></div>)}
      </section>

      <section className="section" aria-labelledby="ann">
        <div className="head"><h2 id="ann">Announcements</h2>{unread > 0 && <button className="btn alt sm" onClick={markRead}>Mark all as read</button>}</div>
        {notes.length === 0 && <p>No announcements right now.</p>}
        <div className="notes">
          {notes.slice(0, 3).map((n) => (
            <article className="card note" key={n.id}>
              <h3>{n.title} {n.id > seen && <span className="tag ok">New</span>}</h3>
              <p className="caption">{n.message}</p>
              <p className="small">{new Date(n.created_at).toLocaleDateString()}</p>
              <Listen text={n.title + '. ' + n.message} />
              <Embed url={n.sign_video_url} title="Sign language video" />
            </article>
          ))}
        </div>
      </section>

      <section className="blue-panel">
        <div><h2>Everything in one place</h2><p>Choose what you want to do.</p></div>
        <div className="mini-grid">
          {tiles.map(([p, i, t, d]) => <button className="mini" key={p} onClick={() => go(p)}><div className="ico" aria-hidden="true">{i}</div><h3>{t}</h3><p>{d}</p></button>)}
        </div>
      </section>

      <section className="section extra">
        <h2>Take a 3D tour</h2>
        <Demo3D go={go} />
      </section>

      <section className="section two">
        <div>
          <h2>Recently added opportunities</h2>
          {newestOps.length === 0 && <p>Nothing yet.</p>}
          {newestOps.map((o) => <div className="card" key={o.id}><strong>{o.title}</strong><div className="small">{o.type} · {o.organisation}</div></div>)}
          <button className="btn alt sm" onClick={() => go('education')}>Education</button> <button className="btn alt sm" onClick={() => go('employment')}>Employment</button>
        </div>
        <div>
          <h2>Accessible places</h2>
          {newestPlaces.length === 0 && <p>Nothing yet.</p>}
          {newestPlaces.map((o) => <div className="card" key={o.id}><strong>{o.name}</strong><div className="small">{o.category} · {o.verified ? 'Verified' : 'Not yet verified'}</div></div>)}
          <button className="btn alt sm" onClick={() => go('places')}>See all places</button>
        </div>
      </section>

      <section className="band extra">
        <Slot name="about" className="fill" />
        <div>
          <h2>Built for everyone</h2>
          <ul><li>Listen to any page or notification</li><li>Speak instead of typing</li><li>Sign language videos and captions</li><li>Large text, colours and simple mode</li></ul>
          <button className="btn gold" onClick={() => go('access')}>Open accessibility settings</button>
        </div>
      </section>
    </>
  );
}

/* ---------------- Accessible places and support services ---------------- */
function OrgCard({ o, saved, onSave, go, here }) {
  const addr = [o.address, o.city].filter(Boolean).join(', ');
  const hasXY = o.lat != null && o.lng != null;
  const dest = hasXY ? o.lat + ',' + o.lng : encodeURIComponent([o.name, addr, 'South Africa'].filter(Boolean).join(' '));
  const dir = 'https://www.google.com/maps/dir/?api=1&destination=' + dest + (here ? '&origin=' + here.lat + ',' + here.lng : '') + '&travelmode=driving';
  const ramp = /ramp/i.test(o.accessibility || '');
  return (
    <article className="card org">
      <div className="org-ico" aria-hidden="true">{ICON[o.category] || '🏢'}</div>
      <div className="org-body">
        <h3>{o.name}</h3>
        <span className="tag">{o.category}</span>{o.province && <span className="tag">{o.province}</span>}
        <span className={'tag ' + (o.verified ? 'ok' : 'warn')}>{o.verified ? '✔ Verified' : 'Not yet verified'}</span>
        {o.km != null && <span className="tag ok">{o.km.toFixed(1)} km away</span>}
        {addr && <p>{addr}</p>}
        <p className="small">📌 {hasXY ? `Coordinates: ${Number(o.lat).toFixed(5)}, ${Number(o.lng).toFixed(5)}` : 'Coordinates not available'} · 📞 {o.phone || 'Phone number not listed'}</p>
        {o.access_checklist && Object.keys(o.access_checklist).length > 0
          ? <ul className="checks">{ACCESS_ITEMS.filter(([k]) => o.access_checklist[k] && o.access_checklist[k] !== 'unknown').map(([k, l]) => <li key={k} className={o.access_checklist[k]}>{o.access_checklist[k] === 'yes' ? '✔' : '✖'} {l}{o.access_checklist[k] === 'no' ? ' (not available)' : ''}</li>)}</ul>
          : <p><strong>♿ Ramp:</strong> {ramp ? 'Reported available' : 'Not confirmed yet'}</p>}
        {o.verified && o.verified_at && <p className="small">✔ Checked by {(o.verification_method || 'an organiser').toLowerCase()} on {new Date(o.verified_at).toLocaleDateString('en-ZA')}</p>}
        <p><strong>Accessibility:</strong> {o.accessibility || 'Not listed'}</p>
        {!o.verified && <p className="small">This information is not verified yet. Please confirm with the organisation before you travel.</p>}
        <p className="small">{o.phone} {safeEmail(o.email) && <>· <a href={'mailto:' + o.email}>{o.email}</a></>} {safeUrl(o.website) && <>· <a href={safeUrl(o.website)} target="_blank" rel="noopener noreferrer">Website</a></>}</p>
        <div className="btnrow">
          <a className="btn sm gold" href={dir} target="_blank" rel="noreferrer">🧭 Directions</a>
          <button className="btn alt sm" aria-pressed={saved} onClick={onSave}>{saved ? '★ Saved' : '☆ Save'}</button>
          <Listen text={`${o.name}. ${o.category}. ${addr}. Ramp: ${ramp ? 'reported available' : 'not confirmed yet'}. Accessibility: ${o.accessibility || 'not listed'}.`} />
          <button className="btn alt sm" onClick={() => go('report', { place: o.name, category: 'Incorrect information on this platform' })}>Confirm or report</button>
        </div>
      </div>
    </article>
  );
}

export function Directory({ token, go, mode }) {
  const support = mode === 'support';
  const [saved, reloadSaved] = useList('/api/saved-places', token);
  const [q, setQ] = useState(''); const [feats, setFeats] = useState([]); const [ver, setVer] = useState(false);
  const [prov, setProv] = useState(''); const [cat, setCat] = useState('');
  const [here, setHere] = useState(null); const [near, setNear] = useState(false); const [locMsg, setLocMsg] = useState('');
  const [rows, setRows] = useState([]); const [total, setTotal] = useState(0); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const ids = saved.map((s) => s.id);

  // The server does the searching, so thousands of places stay fast, even on a slow connection
  const query = useMemo(() => {
    const u = new URLSearchParams({ kind: support ? 'support' : 'places', limit: '50' });
    if (q) u.set('q', q);
    if (prov) u.set('province', prov);
    if (cat) u.set('category', cat);
    if (ver) u.set('verified', '1');
    if (feats.length) u.set('feats', feats.join(','));
    if (here) { u.set('lat', String(here.lat)); u.set('lng', String(here.lng)); if (near) { u.set('near', '1'); u.set('km', String(NEAR_KM)); } }
    return u.toString();
  }, [support, q, prov, cat, ver, feats, here, near]);
  useEffect(() => {
    const t = setTimeout(() => {
      setBusy(true);
      api('/api/places-search?' + query, { token }).then((d) => { setRows(d.rows); setTotal(d.total); setErr(''); }).catch((e) => setErr(e.message)).finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, token]);
  const more = () => api('/api/places-search?' + query + '&offset=' + rows.length, { token }).then((d) => setRows((r) => [...r, ...d.rows])).catch((e) => setErr(e.message));

  const locate = () => {
    if (!navigator.geolocation) { setLocMsg('Your browser cannot share your location. Please choose your province instead.'); return; }
    setLocMsg('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (p) => { setHere({ lat: p.coords.latitude, lng: p.coords.longitude }); setNear(true); setLocMsg(''); },
      () => setLocMsg('We could not get your location. Please allow location access in your browser, or choose your province instead.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const toggleNear = () => { if (!here) locate(); else setNear(!near); };
  const toggle = async (id) => { await api('/api/saved-places/' + id, { method: ids.includes(id) ? 'DELETE' : 'POST', token }); reloadSaved(); };
  const flip = (k) => setFeats(feats.includes(k) ? feats.filter((x) => x !== k) : [...feats, k]);
  let last = null;
  return (
    <>
      {support
        ? <Banner slot="support" title="Support services" text="Find organisations that offer rehabilitation, assistive technology, counselling and community support." plain="find a group that can help you and contact them." />
        : <Banner slot="places" title="Accessible places" text="Hospitals, clinics, libraries, community centres, public offices, colleges and shopping centres in all nine provinces. Find places near you, check access and get directions." plain="find places near you and get directions." />}
      <p className="small">Many places come from OpenStreetMap (© OpenStreetMap contributors). Details can be out of date or missing. Please phone or confirm before you travel, and tell us what you find.</p>
      <div className="near card">
        <button className={'btn ' + (near ? 'gold' : '')} aria-pressed={near} onClick={toggleNear}>📍 {near ? `Showing places within ${NEAR_KM} km` : `Show places near me (within ${NEAR_KM} km)`}</button>
        <p className="small">Your location stays in your browser. It is only used to measure distance.</p>
        {locMsg && <div className="msg" role="status">{locMsg}</div>}
      </div>
      <form className="row" role="search" onSubmit={(e) => e.preventDefault()}>
        <div style={{ flex: 2, minWidth: 220 }}><label htmlFor="dq">Search by name, town or feature</label><input id="dq" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Dictate onText={setQ} />
        <div style={{ minWidth: 170 }}><label htmlFor="dp">Province</label>
          <select id="dp" value={prov} onChange={(e) => setProv(e.target.value)}><option value="">All nine provinces</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</select></div>
        {!support && <div style={{ minWidth: 170 }}><label htmlFor="dc">Kind of place</label>
          <select id="dc" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All kinds</option>{ORG_CATS.filter((c) => c !== 'Support organisation').map((c) => <option key={c}>{c}</option>)}</select></div>}
        <label className="check"><input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} /> Verified only</label>
      </form>
      <div className="chips" role="group" aria-label={support ? 'Kinds of help' : 'Accessibility features'}>
        {support
          ? HELP_KINDS.map((k) => <button key={k} className="chip" aria-pressed={q.toLowerCase() === k.toLowerCase()} onClick={() => setQ(q.toLowerCase() === k.toLowerCase() ? '' : k)}>{k}</button>)
          : FEATURES.map((f) => <button key={f.k} className="chip" aria-pressed={feats.includes(f.k)} onClick={() => flip(f.k)}>{f.l}</button>)}
      </div>
      {err && <div className="msg" role="alert">{err}</div>}
      <p aria-live="polite">{busy ? 'Searching…' : `${total} result${total === 1 ? '' : 's'}${near && here ? ` within ${NEAR_KM} km of you` : ''}${rows.length < total ? `, showing the first ${rows.length}` : ''}`}</p>
      {!busy && near && here && total === 0 && <div className="msg" role="status">No listed places within {NEAR_KM} km of you. Switch off the near me filter or choose a province to see all places, or tell us about a place we are missing.</div>}
      {rows.map((o) => {
        const head = !here && o.province !== last ? <h3 className="prov">{o.province || 'Province not set'}</h3> : null;
        last = o.province;
        return <Fragment key={o.id}>{head}<OrgCard o={o} here={here} saved={ids.includes(o.id)} onSave={() => toggle(o.id)} go={go} /></Fragment>;
      })}
      {rows.length < total && <div className="btnrow"><button className="btn alt" onClick={more}>Show more places</button></div>}
    </>
  );
}

/* ---------------- Education & training and employment ---------------- */
function Resources({ token }) {
  const [items] = useList('/api/resources', token);
  if (items.length === 0) return null;
  return (
    <section className="section">
      <h2>Learning videos and guides</h2>
      <div className="two">
        {items.map((r) => (
          <article className="card" key={r.id}>
            <span className="tag">{r.category}</span><h3>{r.title}</h3>
            {r.description && <p>{r.description}</p>}
            <Listen text={r.title + '. ' + (r.description || '')} />
            <Embed url={r.url} title={r.title} />
          </article>
        ))}
      </div>
    </section>
  );
}

export function Opps({ token, types, banner, showResources }) {
  const [ops, , err] = useList('/api/opportunities', token);
  const [saved, reloadSaved] = useList('/api/saved', token);
  const [q, setQ] = useState(''); const [type, setType] = useState('');
  const ids = saved.map((s) => s.id);
  const list = ops.filter((o) => types.includes(o.type)).filter((o) => !type || o.type === type)
    .filter((o) => !q || [o.title, o.organisation, o.location, o.description, o.accessibility_notes].join(' ').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.id - a.id);
  const toggle = async (id) => { await api('/api/saved/' + id, { method: ids.includes(id) ? 'DELETE' : 'POST', token }); reloadSaved(); };
  const soon = (d) => d && (new Date(d) - new Date()) / 86400000 <= 14 && (new Date(d) - new Date()) / 86400000 >= -1;
  return (
    <>
      <Banner {...banner} />
      <form className="row" role="search" onSubmit={(e) => e.preventDefault()}>
        <div style={{ flex: 2, minWidth: 220 }}><label htmlFor="oq">Search</label><input id="oq" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Dictate onText={setQ} />
        <div style={{ flex: 1, minWidth: 180 }}><label htmlFor="ot">Type</label>
          <select id="ot" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select></div>
      </form>
      {err && <div className="msg" role="alert">{err}</div>}
      <p aria-live="polite">{list.length} result{list.length === 1 ? '' : 's'}</p>
      {list.map((o) => (
        <article className="card" key={o.id}>
          <h3>{o.title}</h3>
          <span className="tag">{o.type}</span>
          {o.closing_date && <span className={'tag ' + (soon(o.closing_date) ? 'warn' : '')}>Closes {o.closing_date.slice(0, 10)}</span>}
          <p>{o.organisation} · {o.location}</p><p>{o.description}</p>
          <p><strong>Accessibility and workplace arrangements:</strong> {o.accessibility_notes || 'Not confirmed'}</p>
          <div className="btnrow">
            <button className="btn alt sm" aria-pressed={ids.includes(o.id)} onClick={() => toggle(o.id)}>{ids.includes(o.id) ? '★ Saved' : '☆ Save'}</button>
            <Listen text={`${o.title}. ${o.type} at ${o.organisation}, ${o.location}. ${o.description}. Accessibility: ${o.accessibility_notes || 'not confirmed'}.`} />
          </div>
        </article>
      ))}
      {showResources && <><section className="section extra"><h2>Learn South African Sign Language</h2><Slot name="sasl" className="wide" /></section><Resources token={token} /></>}
    </>
  );
}

/* ---------------- Report a problem, feedback ---------------- */
function Steps({ status }) {
  const idx = REPORT_STATUS.indexOf(status);
  return (
    <ol className="steps" aria-label="Report progress">
      {REPORT_STATUS.map((s, i) => <li key={s} className={i < idx ? 'done' : i === idx ? 'now' : ''} aria-current={i === idx ? 'step' : undefined}>{s}</li>)}
    </ol>
  );
}

function FeedbackTab({ token }) {
  const [mine, reload] = useList('/api/feedback/mine', token);
  const [type, setType] = useState('Suggestion for improvement'); const [message, setMessage] = useState(''); const [msg, setMsg] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/api/feedback', { method: 'POST', token, body: { type, message } }); setMsg('Thank you. We received your message.'); setMessage(''); reload(); }
    catch (er) { setMsg(er.message); }
  };
  return (
    <>
      {msg && <div className="msg" role="status">{msg}</div>}
      <form className="card" onSubmit={submit}>
        <Field label="What is this about?" id="ft"><select id="ft" value={type} onChange={(e) => setType(e.target.value)}>
          {['Suggestion for improvement', 'Suggest an organisation', 'Request a sign language interpreter', 'Request help finding a service', 'Other'].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Your message (type, or press Speak)" id="fm"><textarea id="fm" rows="4" required value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
        <Dictate onText={(t) => setMessage((m) => (m + ' ' + t).trim())} />
        <p className="small">Please do not include private medical details.</p>
        <button className="btn">Send</button>
      </form>
      <h3>My messages and replies</h3>
      {mine.length === 0 && <p>You have not sent any messages yet.</p>}
      {mine.map((x) => (
        <div className="card" key={x.id}><span className="tag">{x.type}</span><span className="tag">{x.status}</span><p>{x.message}</p>
          {x.response && <p className="reply"><strong>Reply:</strong> {x.response}</p>}</div>
      ))}
    </>
  );
}

export function Report({ token, ctx }) {
  const [tab, setTab] = useState('new');
  const [mine, reload] = useList('/api/reports/mine', token);
  const [orgs] = useList('/api/organisations', token);
  const [f, setF] = useState({ category: (ctx && ctx.category) || REPORT_CATS[0], place: (ctx && ctx.place) || '', description: '' });
  const [photo, setPhoto] = useState(''); const [msg, setMsg] = useState(''); const [ref, setRef] = useState('');
  const pick = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { setPhoto(await compressImage(file)); } catch { setMsg('That image could not be read. Please try another one.'); }
  };
  const submit = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      const r = await api('/api/reports', { method: 'POST', token, body: { ...f, photo } });
      setRef(r.reference); setF({ ...f, place: '', description: '' }); setPhoto(''); reload(); speak('Report submitted. Your reference number is ' + r.reference.split('').join(' '));
    } catch (er) { setMsg(er.message); }
  };
  return (
    <>
      <Banner slot="report" title="Report a problem" text="Tell us about an accessibility barrier. We will give you a reference number and keep you updated." plain="tell us what is not accessible and follow what happens next." />
      <div className="tabs" role="group" aria-label="Report sections">
        {[['new', 'Report a barrier'], ['mine', `My reports (${mine.length})`], ['feedback', 'Feedback and requests']].map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'new' && (
        <>
          {ref && <div className="msg" role="status">Thank you. Your reference number is <strong>{ref}</strong>. <Listen text={'Your reference number is ' + ref.split('').join(' ')} /></div>}
          {msg && <div className="msg" role="alert">{msg}</div>}
          <form className="card" onSubmit={submit}>
            <Field label="What kind of problem is it?" id="rc"><select id="rc" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{REPORT_CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Where is it? (place or organisation, optional)" id="rp">
              <input id="rp" list="places" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} />
              <datalist id="places">{orgs.map((o) => <option key={o.id} value={o.name} />)}</datalist>
            </Field>
            <Field label="Describe the barrier (type, or press Speak)" id="rd"><textarea id="rd" rows="5" required value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Dictate onText={(t) => setF((x) => ({ ...x, description: (x.description + ' ' + t).trim() }))} />
            <Field label="Add a photo (optional)" id="rf"><input key={ref || 'new'} id="rf" type="file" accept="image/*" onChange={pick} /></Field>
            {photo && <div><img className="preview" src={photo} alt="Preview of the photo you chose" /><button type="button" className="btn alt sm" onClick={() => setPhoto('')}>Remove photo</button></div>}
            <p className="small">Please do not include faces of people or private information in photos.</p>
            <button className="btn gold">Submit report</button>
          </form>
        </>
      )}
      {tab === 'mine' && (mine.length === 0 ? <p>You have not submitted any reports yet.</p> : mine.map((r) => (
        <article className="card" key={r.id}>
          <h3>{r.reference} <span className="tag">{r.status}</span></h3>
          <p><strong>{r.category}</strong>{r.place ? ' · ' + r.place : ''}</p><p>{r.description}</p>
          {r.photo && <img className="preview" src={r.photo} alt="Photo you submitted with this report" />}
          <Steps status={r.status} />
          {r.admin_note && <p className="reply"><strong>Update from the team:</strong> {r.admin_note}</p>}
          <Listen text={`Report ${r.reference.split('').join(' ')}. Status: ${r.status}. ${r.admin_note || ''}`} />
        </article>
      )))}
      {tab === 'feedback' && <FeedbackTab token={token} />}
    </>
  );
}

/* ---------------- Quick help ---------------- */
export function QuickHelp({ token }) {
  const [items] = useList('/api/helplines', token);
  return (
    <>
      <Banner slot="help" title="Quick help" text="Important phone numbers. If someone is in danger, call an emergency number now." plain="call these numbers if you need urgent help." />
      <div className="two">
        {items.map((h) => (
          <article className="card help" key={h.id}>
            <h3>{h.name}</h3><p className="big"><a href={'tel:' + h.number.replace(/\s/g, '')}>📞 {h.number}</a></p>
            {h.description && <p>{h.description}</p>}
            <Listen text={`${h.name}. ${h.number.split('').join(' ')}. ${h.description || ''}`} />
          </article>
        ))}
      </div>
      <p className="small">Numbers are managed by the platform administrators. Please check they are still correct before you rely on them.</p>
    </>
  );
}

/* ---------------- Accessibility settings ---------------- */
export function AccessSettings({ prefs, update }) {
  const themes = [['light', 'Light'], ['dark', 'Dark'], ['contrast', 'High contrast'], ['cream', 'Soft cream']];
  const styles = [['blue', 'Blue'], ['purple', 'Purple'], ['green', 'Green']];
  const toggles = [['reading', 'Easy reading', 'More space between letters, words and lines.'], ['simple', 'Simple mode', 'Hides extra sections and shows short "In short" summaries.'], ['calm', 'Reduce motion', 'Switches off animations and movement.'], ['auto', 'Read pages aloud automatically', 'Each page is read when you open it.']];
  return (
    <>
      <h2>Accessibility settings</h2>
      <p>These settings are saved to your account and follow you on any device. You never need to say why you want them.</p>
      <fieldset className="card"><legend>Colours</legend>
        <div className="chips">{themes.map(([k, l]) => <button key={k} className="chip" aria-pressed={prefs.theme === k} onClick={() => update({ theme: k })}>{l}</button>)}</div>
        <div className="chips">{styles.map(([k, l]) => <button key={k} className="chip" aria-pressed={prefs.style === k} onClick={() => update({ style: k })}>{l}</button>)}</div>
      </fieldset>
      <div className="card">
        <label htmlFor="sz">Text size: {prefs.size}px</label>
        <input id="sz" type="range" min="14" max="28" step="2" value={prefs.size} onChange={(e) => update({ size: Number(e.target.value) })} />
        <label htmlFor="rt">Reading speed (text to speech)</label>
        <select id="rt" value={prefs.rate} onChange={(e) => update({ rate: Number(e.target.value) })}><option value="0.8">Slower</option><option value="1">Normal</option><option value="1.2">Faster</option></select>
        <Listen text="This is how the voice sounds with your chosen reading speed." />
      </div>
      <div className="card">
        {toggles.map(([k, l, d]) => (
          <label className="check big" key={k}><input type="checkbox" checked={!!prefs[k]} onChange={(e) => update({ [k]: e.target.checked })} /> <span><strong>{l}</strong><br /><span className="small">{d}</span></span></label>
        ))}
      </div>
      <div className="card">
        <h3>Keyboard and voice</h3>
        <p>Use Tab and Shift+Tab to move, Enter to select. Press <kbd>Alt</kbd> + a number from 1 to 9 to jump to a menu item. Use the 🎙 Voice button at the bottom and say a page name such as "places", "report" or "help".</p>
      </div>
    </>
  );
}

/* ---------------- My profile ---------------- */
const GENDERS = [['female', 'Female'], ['male', 'Male'], ['non_binary', 'Non-binary'], ['self_describe', 'I prefer to describe myself'], ['prefer_not', 'I prefer not to say']];
const LANGS = ['English', 'Afrikaans', 'isiZulu', 'isiXhosa', 'Sepedi', 'Sesotho', 'Setswana', 'Xitsonga', 'siSwati', 'Tshivenda', 'isiNdebele', 'South African Sign Language'];
const FORM_KEYS = ['name', 'contact', 'gender', 'gender_other', 'dob', 'phone', 'province', 'city', 'language', 'bio', 'emergency_name', 'emergency_phone'];
const toForm = (p) => Object.fromEntries(FORM_KEYS.map((k) => [k, p && p[k] != null ? p[k] : (k === 'contact' ? 'email' : '')]));

function NotifyTab({ token }) {
  const [st, setSt] = useState(null); const [here, setHere] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const load = () => { api('/api/me/notifications', { token }).then(setSt).catch((e) => setErr(e.message)); pushActiveHere().then(setHere); };
  useEffect(load, []);
  const run = async (fn, ok) => { setErr(''); setMsg(''); try { await fn(); if (ok) setMsg(ok); load(); } catch (e) { setErr(e.message); } };
  return (
    <>
      {err && <div className="msg" role="alert">{err}</div>}
      {msg && <div className="msg ok" role="status">✔ {msg}</div>}
      <div className="card">
        <h3>🔔 Notifications on this device</h3>
        <p>Get a message on your phone or computer when there is news, a reply to your message or an update on your report, even when this website is closed.</p>
        {!pushSupported() && <p className="small">This browser cannot show notifications. Try Chrome, Edge or Firefox. On an iPhone, first add this website to your Home Screen (Share, then Add to Home Screen), then open it from there.</p>}
        {st && !st.push_available && <p className="small">Notifications are not switched on by the organisers yet.</p>}
        <div className="btnrow">
          {!here
            ? <button className="btn gold" disabled={!pushSupported() || !st || !st.push_available} onClick={() => run(() => enablePush(token), 'Notifications are now on for this device.')}>Turn on notifications</button>
            : <button className="btn alt" onClick={() => run(() => disablePush(token), 'Notifications are now off for this device.')}>Turn off on this device</button>}
          {here && <button className="btn alt" onClick={() => run(async () => { const r = await api('/api/push/test', { method: 'POST', token }); if (!r.sent) throw new Error('No device received it. Turn notifications off and on again.'); }, 'Test sent. You should see a notification now.')}>Send me a test</button>}
        </div>
        {st && <p className="small">{st.devices} device(s) will receive notifications.</p>}
      </div>
      <div className="card">
        <h3>✉️ Email</h3>
        <label className="check"><input type="checkbox" checked={!!(st && st.email)} disabled={!st} onChange={(e) => run(() => api('/api/me/notifications', { method: 'PUT', token, body: { email: e.target.checked } }))} />
          <span>Email me about new courses, opportunities, announcements and replies.</span></label>
        {st && !st.email_available && <p className="small">Email is not switched on by the organisers yet, so no emails are sent for now.</p>}
      </div>
    </>
  );
}

export function Profile({ user, token, onUser, go, logout }) {
  const [tab, setTab] = useState('details');
  const [me, setMe] = useState(null); const [f, setF] = useState(toForm(null));
  const [sp, reloadSp] = useList('/api/saved-places', token); const [so, reloadSo] = useList('/api/saved', token);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [pw, setPw] = useState({ current: '', password: '' }); const [del, setDel] = useState('');
  useEffect(() => { api('/api/me', { token }).then((p) => { setMe(p); setF(toForm(p)); }).catch((e) => setErr(e.message)); }, [token]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (patch, ok) => {
    setErr(''); setMsg('');
    try { const r = await api('/api/me', { method: 'PATCH', token, body: patch }); setMe(r.profile); setF(toForm(r.profile)); onUser(r); setMsg(ok || 'Saved.'); } catch (er) { setErr(er.message); }
  };
  const pickPhoto = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { await save({ avatar: await squareImage(file) }, 'Your picture was saved.'); } catch { setErr('That picture could not be used. Please choose a JPG or PNG picture.'); }
  };
  const changePw = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try { await api('/api/me/password', { method: 'PUT', token, body: pw }); setMsg('Your password was changed. For your safety you have been signed out everywhere. Please log in again.'); setTimeout(logout, 2500); } catch (er) { setErr(er.message); }
  };
  const logoutAll = async () => {
    if (!window.confirm('Sign out on every device, including this one?')) return;
    try { await api('/api/me/logout-all', { method: 'POST', token }); logout(); } catch (er) { setErr(er.message); }
  };
  const download = async () => {
    try {
      const res = await fetch(API + '/api/me/export', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error('The download failed');
      const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = 'my-abilityconnect-data.json'; a.click(); URL.revokeObjectURL(a.href);
    } catch (er) { setErr(er.message); }
  };
  const deleteAccount = async () => {
    if (!window.confirm('This permanently deletes your account, saved items and messages. This cannot be undone. Continue?')) return;
    try { await api('/api/me', { method: 'DELETE', token, body: { confirm_email: del } }); logout(); } catch (er) { setErr(er.message); }
  };
  const unsave = async (path, id, after) => { await api(path + id, { method: 'DELETE', token }); after(); };

  const checks = me ? [['a profile picture', me.avatar], ['your gender', me.gender], ['your date of birth', me.dob], ['your phone number', me.phone], ['your province', me.province], ['your town', me.city], ['your language', me.language], ['a short "about me"', me.bio], ['an emergency contact', me.emergency_name && me.emergency_phone]] : [];
  const pct = checks.length ? Math.round((checks.filter(([, v]) => v).length / checks.length) * 100) : 0;
  const missing = checks.filter(([, v]) => !v).map(([l]) => l);
  const initials = (user.name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <>
      <section className="card profile-head">
        {me && me.avatar ? <img className="avatar big" src={me.avatar} alt="Your profile picture" /> : <span className="avatar big" aria-hidden="true">{initials}</span>}
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ marginBottom: 2 }}>{user.name}</h2>
          <p className="small" style={{ margin: 0 }}>{me ? me.email : ''}</p>
          <progress value={pct} max="100" aria-label={`Your profile is ${pct} percent complete`} />
          <p className="small">Your profile is <strong>{pct}%</strong> complete.{missing.length > 0 ? ' You can still add: ' + missing.slice(0, 3).join(', ') + (missing.length > 3 ? ' and more.' : '.') : ' Well done!'}</p>
        </div>
      </section>
      <div className="tabs" role="group" aria-label="Profile sections">
        {[['details', 'My details'], ['notify', 'Notifications'], ['saved', `Saved (${sp.length + so.length})`], ['security', 'Security'], ['privacy', 'Privacy and data']].map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => { setTab(k); setMsg(''); setErr(''); }}>{l}</button>)}
      </div>
      {err && tab !== 'notify' && <div className="msg" role="alert">{err}</div>}
      {msg && tab !== 'notify' && <div className="msg ok" role="status">✔ {msg}</div>}

      {tab === 'details' && (
        <form className="card" onSubmit={(e) => { e.preventDefault(); save(f, 'Your profile was saved.'); }}>
          <h3>Profile picture</h3>
          <div className="row">
            <Field label="Choose a picture (JPG or PNG). It is made square automatically." id="pp"><input id="pp" type="file" accept="image/png,image/jpeg,image/webp" onChange={pickPhoto} /></Field>
            {me && me.avatar && <button type="button" className="btn alt sm" onClick={() => save({ avatar: '' }, 'Your picture was removed.')}>Remove picture</button>}
          </div>
          <h3>About you</h3>
          <div className="grid">
            <Field label="Name" id="pn"><input id="pn" required maxLength={80} value={f.name} onChange={set('name')} /></Field>
            <Field label="Gender (optional)" id="pg"><select id="pg" value={f.gender} onChange={set('gender')}><option value="">Not shared</option>{GENDERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            {f.gender === 'self_describe' && <Field label="How do you describe yourself?" id="pgo"><input id="pgo" maxLength={30} value={f.gender_other} onChange={set('gender_other')} /></Field>}
            <Field label="Date of birth (optional)" id="pd"><input id="pd" type="date" value={f.dob} onChange={set('dob')} /></Field>
            <Field label="Home language" id="pl"><select id="pl" value={f.language} onChange={set('language')}><option value="">Not shared</option>{LANGS.map((l) => <option key={l}>{l}</option>)}</select></Field>
            <Field label="Province" id="pv"><select id="pv" value={f.province} onChange={set('province')}><option value="">Not shared</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Town or city" id="pc"><input id="pc" maxLength={60} value={f.city} onChange={set('city')} /></Field>
            <Field label="Phone number" id="pph"><input id="pph" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} /></Field>
            <Field label="Email (cannot be changed here)" id="pe"><input id="pe" value={me ? me.email : ''} readOnly /></Field>
          </div>
          <Field label={`About me (optional, ${f.bio.length}/300)`} id="pb"><textarea id="pb" rows="3" maxLength={300} value={f.bio} onChange={set('bio')} /></Field>
          <h3>Emergency contact (optional)</h3>
          <div className="grid">
            <Field label="Contact person's name" id="pen"><input id="pen" maxLength={80} value={f.emergency_name} onChange={set('emergency_name')} /></Field>
            <Field label="Contact person's phone" id="pep"><input id="pep" type="tel" value={f.emergency_phone} onChange={set('emergency_phone')} /></Field>
          </div>
          <Field label="How would you like us to contact you?" id="pco"><select id="pco" value={f.contact} onChange={set('contact')}>{CONTACT_PREFS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <p className="small">Everything except your name is optional. You never need to share a diagnosis. Your details are only used to help you and are never sold. You can set your accessibility preferences in <button type="button" className="linkbtn" onClick={() => go('access')}>Accessibility settings</button>.</p>
          <button className="btn">Save my profile</button>
        </form>
      )}
      {tab === 'notify' && <NotifyTab token={token} />}
      {tab === 'saved' && (
        <>
          <h3>Saved places</h3>{sp.length === 0 && <p>No saved places yet.</p>}
          {sp.map((o) => <div className="card line" key={o.id}><span><strong>{o.name}</strong><br /><span className="small">{o.category} · {o.city}</span></span><button className="btn alt sm" onClick={() => unsave('/api/saved-places/', o.id, reloadSp)}>Remove {o.name}</button></div>)}
          <h3>Saved opportunities</h3>{so.length === 0 && <p>No saved opportunities yet.</p>}
          {so.map((o) => <div className="card line" key={o.id}><span><strong>{o.title}</strong><br /><span className="small">{o.type} · {o.organisation}</span></span><button className="btn alt sm" onClick={() => unsave('/api/saved/', o.id, reloadSo)}>Remove {o.title}</button></div>)}
        </>
      )}
      {tab === 'security' && (
        <>
          <form className="card" onSubmit={changePw}>
            <h3>Change your password</h3>
            <p className="small">Use at least 10 characters with letters and numbers. Do not use a password you use anywhere else. After you change it, you are signed out on all devices.</p>
            <Field label="Current password" id="cp"><input id="cp" type="password" required autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password (at least 10 characters, with letters and numbers)" id="np"><input id="np" type="password" required autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} /></Field>
            <button className="btn">Change password</button>
            <p className="small">Signed up with Google and never set a password? Log out, then use "Forgot your password?" on the log in page to choose one.</p>
          </form>
          <div className="card">
            <h3>Sign out everywhere</h3>
            <p className="small">If you lost a phone, or used a shared computer, this ends every session right now.</p>
            <button className="btn alt" onClick={logoutAll}>Sign out on all devices</button>
          </div>
        </>
      )}
      {tab === 'privacy' && (
        <>
          <div className="card">
            <h3>Download my data</h3>
            <p className="small">Get a copy of the information we hold about you: your profile, saved items, reports, messages and certificates.</p>
            <button className="btn alt" onClick={download}>⬇ Download my data</button>
          </div>
          <div className="card">
            <h3>Delete my account</h3>
            <p className="small">This permanently deletes your account, profile, saved items and messages. Certificates you earned are kept as a record but are no longer linked to you. This cannot be undone.</p>
            <Field label="Type your email address to confirm" id="dm"><input id="dm" type="email" value={del} onChange={(e) => setDel(e.target.value)} /></Field>
            <button className="btn danger" disabled={!del} onClick={deleteAccount}>Delete my account</button>
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- Messages (inbox) ---------------- */
export function Inbox({ token, onRead }) {
  const [data, setData] = useState({ unread: 0, items: [] }); const [err, setErr] = useState('');
  const load = () => api('/api/inbox', { token }).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const markAll = async () => { await api('/api/inbox/read', { method: 'POST', token }); onRead(); load(); };
  const remove = async (id) => { await api('/api/inbox/' + id, { method: 'DELETE', token }); load(); };
  return (
    <>
      <div className="head"><h2>Messages</h2>{data.unread > 0 && <button className="btn alt sm" onClick={markAll}>Mark all as read ({data.unread})</button>}</div>
      <p className="small">Replies to your messages, updates on your reports and other news for you. Turn on notifications in My profile to get these on your phone or computer too.</p>
      {err && <div className="msg" role="alert">{err}</div>}
      {data.items.length === 0 && !err && <div className="card"><p>You have no messages yet.</p></div>}
      {data.items.map((m) => (
        <article className={'card inbox-item' + (m.read_at ? '' : ' unread')} key={m.id}>
          <h3>{!m.read_at && <span className="dot-new" aria-label="New" />}{m.title}</h3>
          {m.body && <p>{m.body}</p>}
          <p className="small">{new Date(m.created_at).toLocaleString('en-ZA')}</p>
          <div className="btnrow"><Listen text={m.title + '. ' + (m.body || '')} /><button className="btn alt sm" onClick={() => remove(m.id)}>Delete</button></div>
        </article>
      ))}
    </>
  );
}
