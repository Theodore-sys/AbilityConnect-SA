import { useState, useEffect } from 'react';
import { api, API, Field, useList, ORG_CATS, EDU_TYPES, JOB_TYPES, REPORT_STATUS, RES_CATS, PROVINCES, langName, ACCESS_ITEMS, VERIFY_METHODS, safeUrl } from './lib.jsx';

/* One reusable add / edit / delete block, driven by a small config */
function Crud({ cfg, token, run, del }) {
  const blank = Object.fromEntries(cfg.fields.map((f) => [f.k, f.t === 'check' ? false : f.o ? f.o[0] : '']));
  const [items, reload] = useList(cfg.path, token);
  const [form, setForm] = useState(blank); const [edit, setEdit] = useState(null);
  const [flt, setFlt] = useState('');
  const shown = items.filter((x) => !flt || JSON.stringify(x).toLowerCase().includes(flt.toLowerCase())).slice(0, 100);
  const set = (k, v) => setForm({ ...form, [k]: v });
  const start = (x) => {
    setEdit(x.id);
    setForm(Object.fromEntries(cfg.fields.map((f) => [f.k, f.t === 'date' ? String(x[f.k] || '').slice(0, 10) : (x[f.k] ?? (f.t === 'check' ? false : ''))])));
    const el = document.getElementById('crud-form'); if (el) el.scrollIntoView();
  };
  const submit = (e) => {
    e.preventDefault();
    run(() => (edit ? api(cfg.path + '/' + edit, { method: 'PUT', token, body: form }) : api(cfg.path, { method: 'POST', token, body: form })),
      () => { reload(); setForm(blank); setEdit(null); });
  };
  return (
    <>
      <form className="card" id="crud-form" onSubmit={submit}>
        <h3>{edit ? 'Edit' : 'Add'}: {cfg.name}</h3>
        <div className="grid">
          {cfg.fields.map((f) => (
            <div key={f.k} style={f.t === 'area' ? { gridColumn: '1 / -1' } : undefined}>
              {f.t === 'check'
                ? <label className="check"><input type="checkbox" checked={!!form[f.k]} onChange={(e) => set(f.k, e.target.checked)} /> {f.l}</label>
                : (
                  <Field label={f.l} id={cfg.id + f.k}>
                    {f.t === 'select' ? <select id={cfg.id + f.k} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)}>{f.o.map((o) => <option key={o}>{o}</option>)}</select>
                      : f.t === 'area' ? <textarea id={cfg.id + f.k} rows="3" required={f.req} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} />
                        : <input id={cfg.id + f.k} type={f.t === 'date' ? 'date' : 'text'} required={f.req} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} />}
                  </Field>
                )}
            </div>
          ))}
        </div>
        <button className="btn">{edit ? 'Save changes' : 'Add'}</button>{' '}
        {edit && <button type="button" className="btn alt" onClick={() => { setEdit(null); setForm(blank); }}>Cancel</button>}
      </form>
      <h3>{cfg.name} list ({items.length})</h3>
      {items.length > 20 && <Field label="Search this list (shows the first 100 matches)" id={cfg.id + 'flt'}><input id={cfg.id + 'flt'} value={flt} onChange={(e) => setFlt(e.target.value)} /></Field>}
      {items.length === 0 && <p>Nothing added yet.</p>}
      {shown.map((x) => (
        <div className="card line" key={x.id}>
          <span><strong>{cfg.title(x)}</strong><br /><span className="small">{cfg.sub ? cfg.sub(x) : ''}</span></span>
          <span>
            {cfg.edit && <button className="btn alt sm" onClick={() => start(x)}>Edit {cfg.title(x)}</button>}
            <button className="btn danger sm" onClick={() => del(cfg.path + '/' + x.id, cfg.title(x), reload)}>Delete {cfg.title(x)}</button>
          </span>
        </div>
      ))}
    </>
  );
}

const CFG = {
  places: {
    id: 'pl', name: 'Place or organisation', path: '/api/places', edit: true, title: (x) => x.name,
    sub: (x) => `${x.category} · ${x.city || ''}, ${x.province || 'province not set'} · ${x.verified ? 'Verified' : 'Not verified'}`,
    fields: [
      { k: 'name', l: 'Name', req: true }, { k: 'category', l: 'Category', t: 'select', o: ORG_CATS }, { k: 'province', l: 'Province', t: 'select', o: PROVINCES },
      { k: 'city', l: 'City or town' }, { k: 'address', l: 'Street address' },
      { k: 'lat', l: 'Latitude (for example -25.7479). Needed for the near me filter' }, { k: 'lng', l: 'Longitude (for example 28.2293)' },
      { k: 'phone', l: 'Phone' }, { k: 'email', l: 'Email' }, { k: 'website', l: 'Website' },
      { k: 'accessibility', l: 'Accessibility features (for example: Wheelchair ramp, Lift, Sign language support)', t: 'area' },
      { k: 'verified', l: 'Verified (tick only after confirming)', t: 'check' },
    ],
  },
  opps: {
    id: 'op', name: 'Education or job opportunity', path: '/api/opportunities', edit: true, title: (x) => x.title,
    sub: (x) => `${x.type} · ${x.organisation || ''} · closes ${x.closing_date ? x.closing_date.slice(0, 10) : 'n/a'}`,
    fields: [
      { k: 'title', l: 'Title', req: true }, { k: 'type', l: 'Type', t: 'select', o: [...EDU_TYPES, ...JOB_TYPES] }, { k: 'organisation', l: 'Organisation' }, { k: 'location', l: 'Location' },
      { k: 'closing_date', l: 'Closing date', t: 'date' }, { k: 'description', l: 'Description', t: 'area' }, { k: 'accessibility_notes', l: 'Accessibility and workplace arrangements', t: 'area' },
    ],
  },
  resources: {
    id: 'rs', name: 'Learning video or guide', path: '/api/resources', title: (x) => x.title, sub: (x) => x.category,
    fields: [{ k: 'title', l: 'Title', req: true }, { k: 'category', l: 'Kind', t: 'select', o: RES_CATS }, { k: 'url', l: 'Link (YouTube link or a .mp4 / .webm file link)' }, { k: 'description', l: 'Description', t: 'area' }],
  },
  courses: {
    id: 'co', name: 'Skills course', path: '/api/admin/courses', edit: true, title: (x) => `#${x.id} ${x.title}`, sub: (x) => `${x.category || ''} · pass mark ${x.pass_mark}%`,
    fields: [{ k: 'title', l: 'Course title', req: true }, { k: 'category', l: 'Category (for example Digital skills)' }, { k: 'description', l: 'Description', t: 'area' }, { k: 'pass_mark', l: 'Pass mark in % (for example 70)' }],
  },
  lessons: {
    id: 'ls', name: 'Lesson', path: '/api/admin/lessons', edit: true, title: (x) => x.title, sub: (x) => `Course #${x.course_id} · lesson ${x.position}`,
    fields: [{ k: 'course_id', l: 'Course number (see the Courses tab)', req: true }, { k: 'title', l: 'Lesson title', req: true }, { k: 'position', l: 'Lesson order (1, 2, 3...)' },
      { k: 'body', l: 'Lesson text (leave a blank line between paragraphs)', t: 'area', req: true }, { k: 'video_url', l: 'Video link (optional, for example a sign language video)' }],
  },
  questions: {
    id: 'qs', name: 'Exam question', path: '/api/admin/questions', edit: true, title: (x) => x.question, sub: (x) => `Course #${x.course_id} · correct option ${x.answer}`,
    fields: [{ k: 'course_id', l: 'Course number', req: true }, { k: 'question', l: 'Question', req: true }, { k: 'options', l: 'Answer options (one per line)', t: 'area', req: true }, { k: 'answer', l: 'Number of the correct option (1, 2, 3...)', req: true }],
  },
  notes: {
    id: 'nt', name: 'Announcement', path: '/api/notifications', title: (x) => x.title, sub: (x) => x.message,
    fields: [{ k: 'title', l: 'Title', req: true }, { k: 'message', l: 'Message', t: 'area', req: true }, { k: 'sign_video_url', l: 'Sign language video link (optional)' },
      { k: 'quiet', l: 'Do not send a notification (only show it in the app). Leave this empty to tell everyone who turned notifications on, even when they are not in the app.', t: 'check' }],
  },
  help: {
    id: 'hl', name: 'Quick help number', path: '/api/helplines', title: (x) => x.name, sub: (x) => x.number,
    fields: [{ k: 'name', l: 'Name', req: true }, { k: 'number', l: 'Phone number', req: true }, { k: 'description', l: 'Description', t: 'area' }],
  },
};

function Overview({ token }) {
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api('/api/admin/overview', { token }).then(setD).catch((e) => setErr(e.message)); }, [token]);
  if (err) return <div className="msg" role="alert">{err}</div>;
  if (!d) return <p>Loading…</p>;
  const tiles = [[d.users, 'Users', '👥'], [d.places, 'Places and services', '📍'], [d.opportunities, 'Opportunities', '💼'], [d.openReports, 'Open reports', '📣'], [d.newFeedback, 'New feedback', '💬'], [d.notifications, 'Announcements', '📢']];
  const max = Math.max(1, ...REPORT_STATUS.map((s) => (d.byStatus.find((b) => b.status === s) || { n: 0 }).n));
  return (
    <>
      <section className="stats">{tiles.map(([n, l, i]) => <div className="stat" key={l}><span aria-hidden="true">{i}</span><strong>{n}</strong><span>{l}</span></div>)}</section>
      <h3>Reports by status</h3>
      <div className="card">
        {REPORT_STATUS.map((s) => {
          const n = (d.byStatus.find((b) => b.status === s) || { n: 0 }).n;
          return <div className="barrow" key={s}><span>{s}</span><div className="bar-track"><div className="bar-fill" style={{ width: (n / max) * 100 + '%' }} /></div><strong>{n}</strong></div>;
        })}
      </div>
    </>
  );
}

function Reports({ token, run }) {
  const [items, reload] = useList('/api/reports', token);
  const [flt, setFlt] = useState(''); const [ed, setEd] = useState({});
  const shown = items.filter((r) => !flt || r.status === flt);
  const val = (r, k) => (ed[r.id] && ed[r.id][k] !== undefined ? ed[r.id][k] : (r[k] || ''));
  const set = (r, k, v) => setEd({ ...ed, [r.id]: { ...(ed[r.id] || {}), [k]: v } });
  return (
    <>
      <div className="row"><div><label htmlFor="rf1">Show reports</label><select id="rf1" value={flt} onChange={(e) => setFlt(e.target.value)}><option value="">All statuses</option>{REPORT_STATUS.map((s) => <option key={s}>{s}</option>)}</select></div></div>
      {shown.length === 0 && <p>No reports to show.</p>}
      {shown.map((r) => (
        <article className="card" key={r.id}>
          <h3>{r.reference} <span className="tag">{r.status}</span></h3>
          <p><strong>{r.category}</strong>{r.place ? ' · ' + r.place : ''} · from {r.user_name || 'a deleted user'} · {new Date(r.created_at).toLocaleDateString()}</p>
          <p>{r.description}</p>
          {r.photo && <img className="preview" src={r.photo} alt="Photo supplied with this report" />}
          <div className="grid">
            <Field label="Status" id={'rs' + r.id}><select id={'rs' + r.id} value={val(r, 'status')} onChange={(e) => set(r, 'status', e.target.value)}>{REPORT_STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Note the user will see" id={'rn' + r.id}><textarea id={'rn' + r.id} rows="2" value={val(r, 'admin_note')} onChange={(e) => set(r, 'admin_note', e.target.value)} /></Field>
          </div>
          <button className="btn sm" onClick={() => run(() => api('/api/reports/' + r.id, { method: 'PATCH', token, body: { status: val(r, 'status'), admin_note: val(r, 'admin_note') } }), reload)}>Save update</button>
        </article>
      ))}
    </>
  );
}

function Feedback({ token, run }) {
  const [items, reload] = useList('/api/feedback', token);
  const [ed, setEd] = useState({});
  return (
    <>
      {items.length === 0 && <p>No feedback yet.</p>}
      {items.map((x) => (
        <article className="card" key={x.id}>
          <span className="tag">{x.type}</span><span className="tag">{x.status}</span><p>{x.message}</p>
          <Field label="Reply (the user sees this)" id={'fr' + x.id}><textarea id={'fr' + x.id} rows="2" value={ed[x.id] !== undefined ? ed[x.id] : (x.response || '')} onChange={(e) => setEd({ ...ed, [x.id]: e.target.value })} /></Field>
          {['new', 'reviewed', 'resolved'].map((s) => (
            <button key={s} className="btn alt sm" onClick={() => run(() => api('/api/feedback/' + x.id + '/response', { method: 'PATCH', token, body: { status: s, response: ed[x.id] !== undefined ? ed[x.id] : x.response } }), reload)}>Save and mark {s}</button>
          ))}
        </article>
      ))}
    </>
  );
}

function Users({ token, me, run, del }) {
  const [items, reload] = useList('/api/admin/users', token);
  return (
    <>
      <p>{items.length} accounts.</p>
      {items.map((u) => (
        <div className="card line" key={u.id}>
          <span><strong>{u.name}</strong> <span className="tag">{u.role}</span>{u.disabled && <span className="tag warn">Suspended</span>}<br /><span className="small">{u.email}</span></span>
          {u.id !== me.id && (
            <span>
              <button className="btn alt sm" onClick={() => run(() => api('/api/admin/users/' + u.id + '/role', { method: 'PATCH', token, body: { role: u.role === 'admin' ? 'user' : 'admin' } }), reload)}>{u.role === 'admin' ? 'Make ' + u.name + ' a user' : 'Make ' + u.name + ' an admin'}</button>
              <button className="btn alt sm" onClick={() => run(() => api('/api/admin/users/' + u.id + '/suspend', { method: 'PATCH', token, body: { suspended: !u.disabled } }), reload)}>{u.disabled ? 'Allow ' + u.name + ' again' : 'Suspend ' + u.name}</button>
              <button className="btn danger sm" onClick={() => del('/api/admin/users/' + u.id, u.name, reload)}>Delete {u.name}</button>
            </span>
          )}
        </div>
      ))}
    </>
  );
}

function SiteSettings({ token, run }) {
  const [s, setS] = useState({ welcome: '', announcement: '', contact_email: '' });
  const [mail, setMail] = useState('');
  const testMail = async () => { setMail('Sending…'); try { const r = await api('/api/admin/email-test', { method: 'POST', token }); setMail(r.message); } catch (e) { setMail('Problem: ' + e.message); } };
  useEffect(() => { api('/api/settings').then((d) => setS((x) => ({ ...x, ...d }))).catch(() => {}); }, []);
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); run(() => api('/api/settings', { method: 'PUT', token, body: s })); }}>
      <h3>Platform settings</h3>
      <Field label="Welcome message (shown on the login page and dashboard)" id="sw"><textarea id="sw" rows="2" value={s.welcome} onChange={(e) => setS({ ...s, welcome: e.target.value })} /></Field>
      <Field label="Banner announcement shown at the top of every page (leave empty for none)" id="sa"><input id="sa" value={s.announcement} onChange={(e) => setS({ ...s, announcement: e.target.value })} /></Field>
      <Field label="Contact email shown in the footer" id="sc"><input id="sc" value={s.contact_email} onChange={(e) => setS({ ...s, contact_email: e.target.value })} /></Field>
      <button className="btn">Save settings</button>{' '}
      <button type="button" className="btn alt" onClick={testMail}>✉️ Send me a test email</button>
      {mail && <p className="small" role="status">{mail}</p>}
    </form>
  );
}

function SignQueue({ token, run }) {
  const [items, reload] = useList('/api/admin/sign-requests', token);
  const [video, setVideo] = useState({}); const [txt, setTxt] = useState({});
  const watch = async (id) => { try { const r = await api(`/api/admin/sign-requests/${id}/video`, { token }); setVideo((v) => ({ ...v, [id]: r.video })); } catch (e) { run(() => { throw e; }); } };
  const waiting = items.filter((x) => x.status === 'waiting');
  const done = items.filter((x) => x.status !== 'waiting');
  return (
    <>
      <p className="small">Sign language videos sent by users are private. Watch each video, type the translation in the language the person asked for, and send it. The video is deleted as soon as you send the translation (and after 14 days if nobody translates it). This task needs a qualified South African Sign Language interpreter.</p>
      <h3>Waiting ({waiting.length})</h3>
      {waiting.length === 0 && <p>No sign videos are waiting.</p>}
      {waiting.map((x) => (
        <article className="card" key={x.id}>
          <h3>Request #{x.id} <span className="tag">Translate into {langName(x.target_lang)}</span></h3>
          <p className="small">From {x.user_name || 'a deleted user'} · {new Date(x.created_at).toLocaleString('en-ZA')}{x.duration ? ` · ${x.duration} s` : ''}</p>
          {!x.has_video ? <p>This video has expired.</p> : video[x.id] ? <video className="embed" controls src={video[x.id]} aria-label="Sign language video" /> : <button className="btn alt sm" onClick={() => watch(x.id)}>▶ Load video</button>}
          <Field label={`Your translation in ${langName(x.target_lang)}`} id={'sg' + x.id}><textarea id={'sg' + x.id} rows="3" value={txt[x.id] || ''} onChange={(e) => setTxt({ ...txt, [x.id]: e.target.value })} /></Field>
          <button className="btn sm" onClick={() => run(() => api(`/api/admin/sign-requests/${x.id}`, { method: 'PATCH', token, body: { translation: txt[x.id] } }), reload)}>Send translation (deletes the video)</button>
        </article>
      ))}
      <h3>Answered ({done.length})</h3>
      {done.map((x) => <div className="card line" key={x.id}><span>#{x.id} · {x.user_name || 'deleted user'} · {langName(x.target_lang)}</span><span className="tag ok">Translated</span></div>)}
    </>
  );
}

function VerifyQueue({ token, run }) {
  const [f, setF] = useState({ province: '', category: '', q: '', phone: true, status: 'unverified' });
  const [data, setData] = useState({ total: 0, rows: [] }); const [ed, setEd] = useState({}); const [offset, setOffset] = useState(0);
  const qs = new URLSearchParams({ status: f.status, offset: String(offset) });
  if (f.province) qs.set('province', f.province); if (f.category) qs.set('category', f.category); if (f.q) qs.set('q', f.q); if (f.phone) qs.set('phone', '1');
  const key = qs.toString();
  const load = () => api('/api/admin/verify-queue?' + key, { token }).then(setData).catch(() => {});
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [key, token]);
  const val = (r) => ed[r.id] || { checklist: r.access_checklist || {}, method: r.verification_method || '', note: r.verification_note || '' };
  const patch = (r, p) => setEd({ ...ed, [r.id]: { ...val(r), ...p } });
  const setItem = (r, k, v) => patch(r, { checklist: { ...val(r).checklist, [k]: v } });
  const change = (p) => { setF({ ...f, ...p }); setOffset(0); };
  return (
    <>
      <div className="card">
        <h3>How to check a place (about 3 minutes by phone)</h3>
        <p className="small">Only mark a place as verified after you have really checked it. Phone the number shown, say who you are, and ask:</p>
        <ol className="small">
          <li>Is there a ramp, or a step-free way in, at the main entrance?</li>
          <li>Is there an accessible toilet, and a lift if the building has more than one floor?</li>
          <li>Is there accessible parking, and are the doors wide enough for a wheelchair?</li>
          <li>Can you help deaf visitors (sign language or written help) and blind visitors (braille or large print)?</li>
        </ol>
        <p className="small">Choose Yes or No for what you were told or saw. Leave "Not checked" for anything you did not learn. You need at least 3 answers.</p>
      </div>
      <div className="row">
        <div style={{ minWidth: 170 }}><label htmlFor="vq1">Province</label><select id="vq1" value={f.province} onChange={(e) => change({ province: e.target.value })}><option value="">All provinces</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</select></div>
        <div style={{ minWidth: 170 }}><label htmlFor="vq2">Kind of place</label><select id="vq2" value={f.category} onChange={(e) => change({ category: e.target.value })}><option value="">All kinds</option>{ORG_CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div style={{ minWidth: 150 }}><label htmlFor="vq3">Show</label><select id="vq3" value={f.status} onChange={(e) => change({ status: e.target.value })}><option value="unverified">Waiting to be checked</option><option value="verified">Already verified</option><option value="all">All</option></select></div>
        <div style={{ flex: 1, minWidth: 160 }}><label htmlFor="vq4">Search name or town</label><input id="vq4" value={f.q} onChange={(e) => change({ q: e.target.value })} /></div>
        <label className="check"><input type="checkbox" checked={f.phone} onChange={(e) => change({ phone: e.target.checked })} /> Only places with a phone number</label>
      </div>
      <p aria-live="polite">{data.total} place{data.total === 1 ? '' : 's'}. Showing {data.rows.length ? offset + 1 : 0} to {offset + data.rows.length}.</p>
      {data.rows.map((r) => {
        const v = val(r);
        return (
          <article className="card" key={r.id}>
            <h3>{r.name} {r.verified && <span className="tag ok">✔ Verified</span>}</h3>
            <p className="small">{r.category} · {[r.city, r.province].filter(Boolean).join(', ')}{r.address ? ' · ' + r.address : ''}</p>
            <p>{r.phone ? <a className="btn alt sm" href={'tel:' + r.phone.replace(/[^\d+]/g, '')}>📞 {r.phone}</a> : <span className="small">No phone number listed</span>} {safeUrl(r.website) && <a className="btn alt sm" href={safeUrl(r.website)} target="_blank" rel="noopener noreferrer">Website</a>}</p>
            <div className="grid">
              {ACCESS_ITEMS.map(([k, l]) => (
                <Field label={l} id={`v${r.id}${k}`} key={k}>
                  <select id={`v${r.id}${k}`} value={v.checklist[k] || 'unknown'} onChange={(e) => setItem(r, k, e.target.value)}>
                    <option value="unknown">Not checked</option><option value="yes">Yes</option><option value="no">No</option>
                  </select>
                </Field>
              ))}
              <Field label="How did you check?" id={`vm${r.id}`}>
                <select id={`vm${r.id}`} value={v.method} onChange={(e) => patch(r, { method: e.target.value })}><option value="">Choose…</option>{VERIFY_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
              </Field>
              <Field label="Note (optional, for example who you spoke to)" id={`vn${r.id}`}><input id={`vn${r.id}`} value={v.note} onChange={(e) => patch(r, { note: e.target.value })} /></Field>
            </div>
            <button className="btn sm" onClick={() => run(() => api(`/api/admin/places/${r.id}/verify`, { method: 'PATCH', token, body: v }), load)}>{r.verified ? 'Save changes' : 'Mark as verified'}</button>
            {r.verified && <button className="btn alt sm" onClick={() => run(() => api(`/api/admin/places/${r.id}/unverify`, { method: 'PATCH', token }), load)}>Remove verified</button>}
            {r.verified_at && <p className="small">Last checked by {r.verified_by || 'an organiser'} on {new Date(r.verified_at).toLocaleDateString('en-ZA')}</p>}
          </article>
        );
      })}
      <div className="btnrow">
        {offset > 0 && <button className="btn alt" onClick={() => setOffset(Math.max(0, offset - 20))}>← Previous 20</button>}
        {offset + 20 < data.total && <button className="btn alt" onClick={() => setOffset(offset + 20)}>Next 20 →</button>}
      </div>
    </>
  );
}

const CSV_TEMPLATE = 'name,category,province,city,address,lat,lng,phone,email,website,accessibility\n"Example Community Clinic","Clinic","Limpopo","Polokwane","1 Main Street",-23.9045,29.4689,"015 000 0000","","","Wheelchair ramp, Accessible toilet"\n';
function PlacesImport({ token, run }) {
  const [csv, setCsv] = useState(''); const [res, setRes] = useState(null); const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setRes(null);
    try { setRes(await api('/api/admin/places-import', { method: 'POST', token, body: { csv } })); } catch (e) { run(() => { throw e; }); } finally { setBusy(false); }
  };
  const template = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' })); a.download = 'places-template.csv'; a.click(); URL.revokeObjectURL(a.href); };
  const pick = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => setCsv(String(r.result)); r.readAsText(f); };
  return (
    <>
      <div className="card">
        <h3>Add many places at once</h3>
        <p className="small">Use this to add places from an official list (for example a department's list of clinics, offices or libraries). Open the template in Excel, fill in one place per row, save as CSV, then choose the file here.</p>
        <ul className="small">
          <li><strong>category</strong> must be one of: {ORG_CATS.join(', ')}.</li>
          <li><strong>province</strong> must be one of the nine provinces, spelled as in the list: {PROVINCES.join(', ')}.</li>
          <li><strong>lat</strong> and <strong>lng</strong> (map coordinates) are needed for the "near me" filter. You can copy them from Google Maps by right-clicking a place.</li>
          <li>Places already in the system (same name and province) are skipped. Imported places start as "not verified".</li>
        </ul>
        <div className="btnrow"><button className="btn alt" onClick={template}>⬇ Download the template</button></div>
      </div>
      <div className="card">
        <Field label="Choose your CSV file" id="pif"><input id="pif" type="file" accept=".csv,text/csv" onChange={pick} /></Field>
        <Field label="Or paste the CSV text here" id="pit"><textarea id="pit" rows="6" value={csv} onChange={(e) => setCsv(e.target.value)} /></Field>
        <button className="btn gold" disabled={!csv.trim() || busy} onClick={send}>{busy ? 'Importing…' : 'Import places'}</button>
        {res && (
          <div className="msg ok" role="status" style={{ marginTop: 12 }}>
            Added {res.added} place(s). Skipped {res.skipped} that already exist. {res.errorCount} row(s) had problems.
            {res.errors.length > 0 && <ul>{res.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          </div>
        )}
      </div>
    </>
  );
}

function SecurityLog({ token }) {
  const [rows] = useList('/api/admin/security-log', token);
  const label = { login_failed: 'Wrong password', admin_login: 'Organiser logged in', admin_action: 'Organiser change', password_changed: 'Password changed', password_reset_requested: 'Reset link requested', password_reset_done: 'Password reset', logout_everywhere: 'Signed out everywhere', user_suspended: 'User suspended', user_unsuspended: 'User allowed again', account_deleted: 'Account deleted' };
  return (
    <>
      <p className="small">The last 200 security events. Many "Wrong password" lines for one email in a short time can mean someone is trying to break in. After 5 wrong passwords an account is locked for 15 minutes. Organiser changes are recorded here so every change can be traced. Events are kept for 90 days.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="cov">
          <thead><tr><th>When</th><th>What happened</th><th>Who or which email</th><th>Details</th><th>Network address</th></tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r.id}><td>{new Date(r.created_at).toLocaleString('en-ZA')}</td><td>{label[r.type] || r.type}</td><td>{r.email || ''}</td><td>{r.detail || ''}</td><td>{r.ip || ''}</td></tr>)}
            {rows.length === 0 && <tr><td colSpan="5">Nothing has been recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <p className="small">No data yet.</p>;
  return rows.map((r) => <div className="barrow" key={r.label}><span>{r.label}</span><div className="bar-track"><div className="bar-fill" style={{ width: (r.n / max) * 100 + '%' }} /></div><strong>{r.n}</strong></div>);
}

function Coverage({ rows }) {
  const by = {};
  rows.forEach((r) => { const b = by[r.province] || (by[r.province] = { n: 0, co: 0, ph: 0, ad: 0, cats: {} }); b.n += r.n; b.co += r.co; b.ph += r.ph; b.ad += r.ad; b.cats[r.category] = r.n; });
  const provs = [...PROVINCES, ...Object.keys(by).filter((p) => !PROVINCES.includes(p))];
  return (
    <>
      <p className="small">A red 0 means no places have been loaded for that province and category yet. Run the import again, or add places by hand.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="cov">
          <thead><tr><th>Province</th><th>Total</th>{ORG_CATS.map((c) => <th key={c}>{c}</th>)}<th>With coordinates</th><th>With phone</th><th>With address</th></tr></thead>
          <tbody>
            {provs.map((p) => { const b = by[p] || { n: 0, co: 0, ph: 0, ad: 0, cats: {} }; return (
              <tr key={p}><th scope="row">{p}</th><td>{b.n}</td>{ORG_CATS.map((c) => <td key={c} className={b.cats[c] ? '' : 'zero'}>{b.cats[c] || 0}</td>)}<td>{b.co}</td><td>{b.ph}</td><td>{b.ad}</td></tr>
            ); })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Analytics({ token }) {
  const [d, setD] = useState(null); const [o, setO] = useState(null); const [msg, setMsg] = useState('');
  const [cov, setCov] = useState([]);
  useEffect(() => {
    api('/api/admin/analytics', { token }).then(setD).catch((e) => setMsg(e.message));
    api('/api/admin/overview', { token }).then(setO).catch(() => {});
    api('/api/admin/coverage', { token }).then(setCov).catch(() => {});
  }, [token]);
  const dl = async (what) => {
    try {
      const res = await fetch(API + '/api/admin/export/' + what, { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) throw new Error('The download failed');
      const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = what + '.csv'; a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { setMsg(e.message); }
  };
  if (!d) return msg ? <div className="msg" role="alert">{msg}</div> : <p>Loading…</p>;
  const tiles = o ? [[o.users, 'Users', '👥'], [o.places, 'Places and services', '📍'], [o.openReports, 'Open reports', '📣'], [d.certificates, 'Certificates issued', '🏅'], [d.exams.total, 'Exams taken', '📝'], [d.exams.passed, 'Exams passed', '✅']] : [];
  return (
    <>
      <div className="btnrow"><button className="btn" onClick={() => window.print()}>🖨️ Print this report</button></div>
      {msg && <div className="msg" role="alert">{msg}</div>}
      <section className="stats">{tiles.map(([n, l, i]) => <div className="stat" key={l}><span aria-hidden="true">{i}</span><strong>{n}</strong><span>{l}</span></div>)}</section>
      <div className="two">
        <div className="card"><h3>Reports by status</h3><Bars rows={d.reportsByStatus} /></div>
        <div className="card"><h3>Reports by type of barrier</h3><Bars rows={d.reportsByCategory} /></div>
        <div className="card"><h3>Certificates by course</h3><Bars rows={d.certsByCourse} /></div>
        <div className="card"><h3>Places and services by province</h3><Bars rows={d.placesByProvince} /></div>
        <div className="card"><h3>New users (last 6 months)</h3><Bars rows={d.signups} /></div>
      </div>
      <div className="card"><h3>Places coverage by province and category</h3><Coverage rows={cov} /></div>
      <div className="card">
        <h3>Download data (CSV for Excel)</h3>
        <p className="small">Exports can contain personal information. Store them safely and share them only with people who need them.</p>
        <div className="btnrow">
          {[['users', 'Users'], ['reports', 'Accessibility reports'], ['places', 'Places and services'], ['certificates', 'Certificates'], ['feedback', 'Feedback']].map(([k, l]) => <button key={k} className="btn alt sm" onClick={() => dl(k)}>⬇ {l}</button>)}
        </div>
      </div>
    </>
  );
}

export default function Admin({ token, me }) {
  const [tab, setTab] = useState('overview'); const [msg, setMsg] = useState('');
  const run = async (fn, after) => { try { await fn(); setMsg('Saved.'); if (after) after(); } catch (e) { setMsg(e.message); } };
  const del = (path, label, after) => { if (window.confirm('Delete ' + label + '? This cannot be undone.')) run(() => api(path, { method: 'DELETE', token }), after); };
  const tabs = [['overview', 'Overview'], ['analytics', 'Reports and exports'], ['reports', 'Accessibility reports'], ['sign', 'Sign interpreter queue'], ['places', 'Places and support'], ['verify', 'Verify places'], ['import', 'Import places (CSV)'], ['opps', 'Education and jobs'],
    ['courses', 'Courses'], ['lessons', 'Lessons'], ['questions', 'Exam questions'], ['resources', 'Learning resources'],
    ['notes', 'Announcements'], ['help', 'Quick help'], ['feedback', 'Feedback'], ['users', 'Users'], ['security', 'Security log'], ['settings', 'Settings']];
  const common = { token, run, del };
  return (
    <>
      <h2>Administrator dashboard</h2>
      <div className="tabs" role="group" aria-label="Administrator sections">
        {tabs.map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => { setTab(k); setMsg(''); }}>{l}</button>)}
      </div>
      {msg && <div className="msg" role="status">{msg}</div>}
      {tab === 'overview' && <Overview token={token} />}
      {tab === 'reports' && <Reports {...common} />}
      {tab === 'sign' && <SignQueue {...common} />}
      {tab === 'verify' && <VerifyQueue {...common} />}
      {tab === 'security' && <SecurityLog token={token} />}
      {tab === 'import' && <PlacesImport {...common} />}
      {tab === 'analytics' && <Analytics token={token} />}
      {['places', 'opps', 'courses', 'lessons', 'questions', 'resources', 'notes', 'help'].includes(tab) && <Crud key={tab} cfg={CFG[tab]} {...common} />}
      {tab === 'feedback' && <Feedback {...common} />}
      {tab === 'users' && <Users {...common} me={me} />}
      {tab === 'settings' && <SiteSettings {...common} />}
    </>
  );
}
