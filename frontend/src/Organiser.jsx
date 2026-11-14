import { useState } from 'react';
import { api, Field } from './lib.jsx';
import Admin from './Admin.jsx';

// The organiser portal: open it with  http://localhost:5173/#organiser
// It has its own login, its own session and only accepts administrator accounts.
export default function Organiser() {
  const [auth, setAuth] = useState(() => { try { return JSON.parse(localStorage.getItem('ac_admin_auth')) || {}; } catch { return {}; } });
  const [f, setF] = useState({ email: '', password: '' }); const [err, setErr] = useState('');
  const login = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: f });
      if (r.user.role !== 'admin') { setErr('This portal is for system organisers only. Please use the public website to log in.'); return; }
      localStorage.setItem('ac_admin_auth', JSON.stringify(r)); setAuth(r);
    } catch (er) { setErr(er.message); }
  };
  const logout = () => { localStorage.removeItem('ac_admin_auth'); setAuth({}); };
  const leave = () => { window.location.hash = ''; };

  if (!auth.token) {
    return (
      <main id="main" className="org-login">
        <div className="card org-card">
          <p className="eyebrow">System organisers only</p>
          <h1>🛠️ Organiser Portal</h1>
          <p>Log in to manage the platform, review reports, add courses and download reports.</p>
          {err && <div className="msg" role="alert">{err}</div>}
          <form onSubmit={login}>
            <Field label="Organiser email" id="oe"><input id="oe" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Password" id="op"><input id="op" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            <button className="btn">Log in to the portal</button>{' '}
            <button type="button" className="btn alt" onClick={leave}>Back to the public website</button>
          </form>
        </div>
      </main>
    );
  }
  return (
    <div className="organiser">
      <header className="org-head">
        <strong>🛠️ AbilityConnect SA · Organiser Portal</strong>
        <span>
          <span className="small">Signed in as {auth.user.name}</span>{' '}
          <button className="btn alt sm" onClick={leave}>Public website</button>
          <button className="btn gold sm" onClick={logout}>Log out</button>
        </span>
      </header>
      <main id="main" className="org-main"><Admin token={auth.token} me={auth.user} /></main>
    </div>
  );
}
