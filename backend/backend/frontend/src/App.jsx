import { useEffect, useState, useCallback, Fragment } from 'react';
import { api, speak, stopSpeak, setRate, Listen, DEFAULT_PREFS, JOB_TYPES } from './lib.jsx';
import { Auth, Dashboard, Directory, Opps, Report, QuickHelp, AccessSettings, Profile, ResetPassword, Inbox } from './pages.jsx';
import { Education } from './Academy.jsx';
import Communicate from './Communicate.jsx';
import Organiser from './Organiser.jsx';

const BANNERS = {
  education: { slot: 'education', title: 'Education and training', text: 'Learnerships, skills programmes, bursaries and courses, with accessibility details.', plain: 'find ways to learn and grow.' },
  employment: { slot: 'employment', title: 'Employment opportunities', text: 'Disability-inclusive internships and jobs. Each listing shows workplace arrangements where they are confirmed.', plain: 'find work that welcomes you.' },
};
const VOICE = [['dashboard', 'dashboard'], ['home', 'dashboard'], ['place', 'places'], ['education', 'education'], ['training', 'education'], ['course', 'education'], ['skill', 'education'], ['certificate', 'education'],
  ['employment', 'employment'], ['job', 'employment'], ['support', 'support'], ['communicat', 'communicate'], ['caption', 'communicate'], ['conversation', 'communicate'], ['report', 'report'], ['barrier', 'report'],
  ['help', 'help'], ['emergency', 'help'], ['profile', 'profile'], ['accessibility', 'access'], ['setting', 'access']];

const PATHS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.4 2.7-6 6-6s6 2.6 6 6"/><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M18 14.3c1.9.7 3 2.5 3 5.7"/>',
  briefcase: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5"/><path d="M3 13h18"/>',
  cap: '<path d="M2 9.5 12 5l10 4.5L12 14z"/><path d="M6 11.8V16c0 1.4 2.7 2.8 6 2.8s6-1.4 6-2.8v-4.2"/>',
  chat: '<path d="M21 11.5a8 8 0 0 1-11.7 7L3 20l1.4-4.9A8 8 0 1 1 21 11.5z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4.5h12l-2 4 2 4H5"/>',
  phone: '<path d="M5.5 4h3.5l1.8 4.6-2.3 1.4a11 11 0 0 0 5.4 5.4l1.4-2.3L20 14.9V18.5a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3.5 6.2 2 2 0 0 1 5.5 4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"/>',
  access: '<circle cx="12" cy="4.5" r="2"/><path d="M5 8.5l7 1.5 7-1.5"/><path d="M12 10v4.5"/><path d="M12 14.5 8.5 21"/><path d="M12 14.5 15.5 21"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>', chevR: '<path d="M9 6l6 6-6 6"/>',
  out: '<path d="M9.5 4H6a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6 20h3.5"/><path d="M15.5 8l4 4-4 4"/><path d="M19.5 12H9.5"/>',
};
function Icon({ name }) {
  return <svg className="ico-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: PATHS[name] }} />;
}
const GROUP = { dashboard: 'Overview', places: 'Find', support: 'Find', employment: 'Find', education: 'Learn', communicate: 'Connect', report: 'Get help', help: 'Get help', inbox: 'Account', profile: 'Account', access: 'Account' };

export default function App() {
  const [page, setPage] = useState('dashboard'); const [ctx, setCtx] = useState(null);
  const [notice, setNotice] = useState(''); const [heard, setHeard] = useState('');
  const [hash, setHash] = useState(window.location.hash);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('ac_side') === '1');
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { localStorage.setItem('ac_side', collapsed ? '1' : '0'); }, [collapsed]);
  const [settings, setSettings] = useState({});
  const [notes, setNotes] = useState([]);
  const [seen, setSeen] = useState(() => Number(localStorage.getItem('ac_seen')) || 0);
  const [auth, setAuth] = useState(() => { try { return JSON.parse(localStorage.getItem('ac_auth')) || {}; } catch { return {}; } });
  const [prefs, setPrefs] = useState(() => { try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('ac_prefs')) }; } catch { return DEFAULT_PREFS; } });
  const [synced, setSynced] = useState(false);
  const [me, setMe] = useState(null); const [inboxN, setInboxN] = useState(0);
  const user = auth.user, token = auth.token;
  setRate(prefs.rate);
  const update = (patch) => setPrefs((p) => ({ ...p, ...patch }));

  useEffect(() => { const h = () => setHash(window.location.hash); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  useEffect(() => { api('/api/settings').then(setSettings).catch(() => {}); }, []);
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--fs', prefs.size + 'px');
    r.className = `theme-${prefs.theme} style-${prefs.style}` + (prefs.reading ? ' reading' : '') + (prefs.calm ? ' calm' : '') + (prefs.simple ? ' simple' : '');
    localStorage.setItem('ac_prefs', JSON.stringify(prefs));
  }, [prefs]);
  // Preferences follow the account: load them after login, save them when they change
  useEffect(() => {
    setSynced(false);
    if (!token) return;
    api('/api/me/prefs', { token }).then((p) => { if (p && Object.keys(p).length) setPrefs({ ...DEFAULT_PREFS, ...p }); }).catch(() => {}).finally(() => setSynced(true));
  }, [token]);
  useEffect(() => {
    if (!token || !synced) return;
    const t = setTimeout(() => api('/api/me/prefs', { method: 'PUT', token, body: prefs }).catch(() => {}), 700);
    return () => clearTimeout(t);
  }, [prefs, token, synced]);
  const loadNotes = useCallback(() => { if (token) api('/api/notifications', { token }).then(setNotes).catch(() => {}); }, [token]);
  useEffect(() => { loadNotes(); }, [loadNotes, page]);
  useEffect(() => { if (token) api('/api/me', { token }).then(setMe).catch(() => {}); else setMe(null); }, [token]);
  useEffect(() => { if (token) api('/api/inbox/count', { token }).then((d) => setInboxN(d.unread)).catch(() => {}); else setInboxN(0); }, [token, page]);
  useEffect(() => { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); }, []);
  useEffect(() => {
    if (!prefs.auto) { stopSpeak(); return; }
    const t = setTimeout(() => { const m = document.getElementById('main'); if (m) speak(m.innerText.slice(0, 1500)); }, 900);
    return () => { clearTimeout(t); stopSpeak(); };
  }, [prefs.auto, page, user]);

  // Organisers (administrators) have their own portal, so they are sent there instead of the public site
  const onAuth = (r) => {
    if (r.user.role === 'admin') { localStorage.setItem('ac_admin_auth', JSON.stringify(r)); window.location.hash = 'organiser'; return; }
    setAuth(r); localStorage.setItem('ac_auth', JSON.stringify(r)); setNotice('');
  };
  const logout = () => { setAuth({}); localStorage.removeItem('ac_auth'); setNotes([]); setPage('dashboard'); setNotice(''); };
  const onProfile = (r) => {
    if (r.token) { const a = { token: r.token, user: r.user }; setAuth(a); localStorage.setItem('ac_auth', JSON.stringify(a)); }
    if (r.profile) setMe(r.profile);
  };
  const markRead = () => { const m = Math.max(0, ...notes.map((n) => n.id)); setSeen(m); localStorage.setItem('ac_seen', m); };
  // Logged-out visitors are always sent to the login page
  const go = (p, c) => {
    if (user) { setCtx(c || null); setPage(p); setMenuOpen(false); window.scrollTo(0, 0); return; }
    setNotice('Please log in to open that page.'); setPage('login'); window.scrollTo(0, 0);
  };

  const unread = notes.filter((n) => n.id > seen).length;
  const nav = [['dashboard', 'home', 'Dashboard'], ['places', 'pin', 'Accessible places'], ['support', 'users', 'Support services'], ['employment', 'briefcase', 'Employment'], ['education', 'cap', 'Education & training'],
    ['communicate', 'chat', 'Communicate'], ['report', 'flag', 'Report a problem'], ['help', 'phone', 'Quick help'], ['inbox', 'bell', 'Messages'], ['profile', 'user', 'My profile'], ['access', 'access', 'Accessibility']];
  const initials = user ? user.name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '';

  useEffect(() => {
    const h = (e) => { if (!user || !e.altKey) return; const n = Number(e.key); if (n >= 1 && n <= nav.length) { e.preventDefault(); go(nav[n - 1][0]); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });

  const voice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setHeard('Voice commands are not supported in this browser. Try Chrome or Edge.'); return; }
    const r = new SR(); r.lang = 'en-ZA';
    r.onresult = (e) => {
      const t = e.results[0][0].transcript.toLowerCase(); setHeard('Heard: ' + t);
      if (/log ?out|sign out/.test(t)) return logout();
      if (/stop/.test(t)) return stopSpeak();
      if (/read/.test(t)) return speak(document.getElementById('main').innerText.slice(0, 3000));
      if (/bigger|larger|increase/.test(t)) return update({ size: Math.min(28, prefs.size + 2) });
      if (/smaller|decrease/.test(t)) return update({ size: Math.max(14, prefs.size - 2) });
      const hit = VOICE.find(([k]) => t.includes(k)); if (hit) go(hit[1]); else setHeard('Heard: ' + t + '. Try a page name such as "places" or "help".');
    };
    r.onerror = () => setHeard('Sorry, I could not hear that.');
    setHeard('Listening… say a page name, "read page", "bigger" or "log out".'); r.start();
  };

  const view = () => {
    if (!user) return <Auth onAuth={onAuth} go={setPage} notice={notice} settings={settings} />;
    switch (page) {
      case 'access': return <AccessSettings prefs={prefs} update={update} />;
      case 'places': return <Directory key="places" mode="places" token={token} go={go} />;
      case 'support': return <Directory key="support" mode="support" token={token} go={go} />;
      case 'education': return <Education token={token} banner={BANNERS.education} />;
      case 'employment': return <Opps key="job" token={token} types={JOB_TYPES} banner={BANNERS.employment} />;
      case 'communicate': return <Communicate token={token} />;
      case 'report': return <Report token={token} ctx={ctx} />;
      case 'help': return <QuickHelp token={token} />;
      case 'inbox': return <Inbox token={token} onRead={() => setInboxN(0)} />;
      case 'profile': return <Profile user={user} token={token} go={go} onUser={onProfile} logout={logout} />;
      default: return <Dashboard user={user} token={token} go={go} notes={notes} seen={seen} markRead={markRead} settings={settings} />;
    }
  };

  const toolsBar = (
    <div className="tools" role="group" aria-label="Quick accessibility tools">
      <button className="k1" onClick={() => update({ size: Math.max(14, prefs.size - 2) })} aria-label="Decrease text size">A−</button>
      <button className="k2" onClick={() => update({ size: Math.min(28, prefs.size + 2) })} aria-label="Increase text size">A+</button>
      <button className="k3" onClick={() => update({ theme: prefs.theme === 'contrast' ? 'light' : 'contrast' })} aria-pressed={prefs.theme === 'contrast'}>◐ Contrast</button>
      <button className="k4" onClick={() => speak(document.getElementById('main').innerText.slice(0, 3000))}>🔊 Read page</button>
      <button className="k5" onClick={stopSpeak}>■ Stop</button>
      <button className="k6" onClick={() => update({ auto: !prefs.auto })} aria-pressed={prefs.auto}>🔁 Auto-read</button>
      <button className="k7" onClick={voice}>🎙 Voice</button>
    </div>
  );

  if (hash === '#organiser') return <><Organiser />{toolsBar}</>;
  if (hash.startsWith('#reset=')) {
    return (
      <>
        <header className="site-header"><div className="bar"><h1 className="brand-h"><span className="brand"><span className="logo" aria-hidden="true">✿</span>AbilityConnect SA</span></h1></div></header>
        <main id="main" className="reset-main"><ResetPassword token={decodeURIComponent(hash.slice(7))} /></main>
        {toolsBar}
      </>
    );
  }

  return (
    <>
      <a className="skip" href="#main">Skip to main content</a>
      <header className="site-header">
        <div className="bar">
          <div className="brand-wrap">
            {user && <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Open the menu"><Icon name="menu" /></button>}
            <h1 className="brand-h"><button className="brand" onClick={() => go('dashboard')}><span className="logo" aria-hidden="true">✿</span>AbilityConnect SA</button></h1>
          </div>
          <div className="who">
            {user ? <><span className="small">Signed in as {user.name}</span> <button className="btn alt sm" onClick={logout}>Log out</button></>
              : <button className="btn gold sm" onClick={() => { setNotice(''); setPage('login'); }}>Log in</button>}
          </div>
        </div>
      </header>
      {settings.announcement && <div className="announce" role="status">📢 {settings.announcement} <Listen text={settings.announcement} /></div>}
      <div className={user ? 'shell' + (collapsed ? ' slim' : '') : 'shell solo'}>
        {user && menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
        {user && (
          <aside className={'side' + (menuOpen ? ' open' : '')}>
            <div className="side-top">
              <span className="side-title">Menu</span>
              <button className="side-toggle" onClick={() => setCollapsed(!collapsed)} aria-pressed={collapsed} aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}><Icon name={collapsed ? 'chevR' : 'chevL'} /></button>
            </div>
            <nav aria-label="Main menu">
              {nav.map(([k, ic, l], n) => (
                <Fragment key={k}>
                  {(n === 0 || GROUP[k] !== GROUP[nav[n - 1][0]]) && <p className="side-group">{GROUP[k]}</p>}
                  <button className={'side-item' + (k === 'help' ? ' urgent' : '')} aria-current={page === k ? 'page' : undefined} onClick={() => go(k)} title={l}>
                    <Icon name={ic} /><span className="lbl">{l}</span>
                    {(k === 'dashboard' ? unread : k === 'inbox' ? inboxN : 0) > 0 && <span className="badge-n" aria-label={`${k === 'inbox' ? inboxN : unread} new`}>{k === 'inbox' ? inboxN : unread}</span>}
                    {n < 9 && <kbd aria-hidden="true">Alt+{n + 1}</kbd>}
                  </button>
                </Fragment>
              ))}
            </nav>
            <div className="side-user">
              {me && me.avatar ? <img className="avatar" src={me.avatar} alt="" /> : <span className="avatar" aria-hidden="true">{initials}</span>}
              <span className="lbl who-name"><strong>{user.name}</strong><small>Signed in</small></span>
              <button className="side-out" onClick={logout} aria-label="Log out" title="Log out"><Icon name="out" /></button>
            </div>
          </aside>
        )}
        <main id="main" tabIndex="-1">{view()}</main>
      </div>
      <footer className="site-footer">
        <div className="inner">
          <span className="brand"><span className="logo" aria-hidden="true">✿</span>AbilityConnect SA</span>
          <p>Your ability. Your opportunities. Your access.</p>
          {settings.contact_email && <p className="small">Contact: <a href={'mailto:' + settings.contact_email}>{settings.contact_email}</a></p>}
          <p className="small">© 2026 AbilityConnect SA. Built for the Samsung Innovation Internship. Listings marked "Not yet verified" should be confirmed with the organisation. <a href="#organiser">Organiser portal</a></p>
        </div>
      </footer>
      {heard && <div className="heard" role="status" aria-live="polite">{heard} <button className="btn alt sm" onClick={() => setHeard('')}>Close</button></div>}
      {toolsBar}
    </>
  );
}
