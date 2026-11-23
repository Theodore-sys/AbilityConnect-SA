import { useState, useEffect } from 'react';
import { api, Field, Listen, Embed, useList, Slot, EDU_TYPES } from './lib.jsx';
import { Opps } from './pages.jsx';

const ICONS = { 'Digital skills': '💻', 'Soft skills': '🗣️', 'Employment skills': '💼' };

export function Education({ token, banner }) {
  const [tab, setTab] = useState('skills');
  return (
    <>
      <div className="tabs" role="group" aria-label="Education sections">
        <button aria-pressed={tab === 'skills'} onClick={() => setTab('skills')}>🎓 Skills Academy (certificates)</button>
        <button aria-pressed={tab === 'programmes'} onClick={() => setTab('programmes')}>Learnerships, bursaries and courses</button>
      </div>
      {tab === 'skills' ? <Academy token={token} /> : <Opps token={token} types={EDU_TYPES} banner={banner} showResources />}
    </>
  );
}

function Academy({ token }) {
  const [courses, reload, err] = useList('/api/courses', token);
  const [open, setOpen] = useState(null);
  if (open) return <CourseView id={open} token={token} back={() => { setOpen(null); reload(); }} />;
  return (
    <>
      <section className="banner">
        <div>
          <h2>Skills Academy</h2>
          <p>Free short courses. Read or listen to each lesson, pass the final exam and get your certificate.</p>
          <p className="plain">In short: learn, take the exam, get a certificate.</p>
        </div>
        <Slot name="education" className="banner-media" />
      </section>
      {err && <div className="msg" role="alert">{err}</div>}
      <div className="two">
        {courses.map((c) => (
          <article className="card course" key={c.id}>
            <div className="course-ico" aria-hidden="true">{ICONS[c.category] || '📘'}</div>
            <span className="tag">{c.category}</span>
            <h3>{c.title}</h3><p>{c.description}</p>
            <progress value={c.done_count} max={Math.max(1, c.lesson_count)} aria-label={`${c.done_count} of ${c.lesson_count} lessons finished`} />
            <p className="small">{c.lesson_count} lessons · exam with {c.question_count} questions · pass mark {c.pass_mark}%</p>
            {c.certificate_code && <p><span className="tag ok">🏅 Certificate earned</span></p>}
            <button className="btn sm" onClick={() => setOpen(c.id)}>{c.certificate_code ? 'View' : c.done_count ? 'Continue' : 'Start course'}</button>
          </article>
        ))}
      </div>
      <Verify />
    </>
  );
}

function CourseView({ id, token, back }) {
  const [data, setData] = useState(null); const [err, setErr] = useState('');
  const [exam, setExam] = useState(null); const [answers, setAnswers] = useState({}); const [result, setResult] = useState(null);
  const load = () => api('/api/courses/' + id, { token }).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  if (err && !data) return <><div className="msg" role="alert">{err}</div><button className="btn alt" onClick={back}>Back</button></>;
  if (!data) return <p>Loading…</p>;
  const { course, lessons, certificate, questionCount, passed } = data;
  const done = lessons.filter((l) => l.done).length;
  const all = lessons.length > 0 && done === lessons.length;
  const complete = async (lid) => { await api(`/api/lessons/${lid}/complete`, { method: 'POST', token }); load(); };
  const startExam = async () => {
    setErr('');
    try { const r = await api(`/api/courses/${id}/exam`, { token }); setExam(r.questions); setAnswers({}); setResult(null); } catch (e) { setErr(e.message); }
  };
  const submit = async (e) => {
    e.preventDefault();
    try { const r = await api(`/api/courses/${id}/exam`, { method: 'POST', token, body: { answers } }); setResult(r); setExam(null); load(); window.scrollTo(0, 0); } catch (er) { setErr(er.message); }
  };
  return (
    <>
      <button className="btn alt sm" onClick={back}>← All courses</button>
      <h2>{course.title}</h2>
      <p>{course.description}</p>
      <progress value={done} max={Math.max(1, lessons.length)} aria-label={`${done} of ${lessons.length} lessons finished`} />
      <p className="small">{done} of {lessons.length} lessons finished</p>
      {err && <div className="msg" role="alert">{err}</div>}
      {result && (
        <div className="msg" role="status">
          You scored <strong>{result.score}%</strong> ({result.correct} of {result.total} correct). The pass mark is {result.passMark}%.{' '}
          {result.passed ? 'Well done, you passed! Your certificate is below.' : 'You did not pass this time. Read the lessons again and try the exam again.'}
        </div>
      )}
      {!certificate && passed && <CertificateDetails courseId={id} token={token} done={load} />}
      {certificate && <Certificate cert={certificate} course={course} />}

      {!exam && lessons.map((l, i) => (
        <article className="card" key={l.id}>
          <h3>{i + 1}. {l.title} {l.done && <span className="tag ok">✔ Done</span>}</h3>
          {String(l.body || '').split('\n\n').map((p, k) => <p key={k}>{p}</p>)}
          <Embed url={l.video_url} title={l.title} />
          <div className="btnrow">
            <Listen text={l.title + '. ' + (l.body || '').replace(/\n+/g, ' ')} />
            {!l.done && <button className="btn sm gold" onClick={() => complete(l.id)}>Mark as done</button>}
          </div>
        </article>
      ))}

      {!exam && (
        <div className="card">
          <h3>Final exam</h3>
          {questionCount === 0 ? <p>This course does not have an exam yet.</p>
            : all ? <><p>{questionCount} multiple-choice questions. Pass mark: {course.pass_mark}%. You can try again if you do not pass.</p><p className="small">If you pass, you will be asked for your full names and your ID number (or passport number) so they can be printed on your certificate. Please have them ready.</p><button className="btn gold" onClick={startExam}>{certificate ? 'Take the exam again' : 'Start the exam'}</button></>
              : <p>Finish all the lessons to unlock the exam.</p>}
        </div>
      )}

      {exam && (
        <form className="card" onSubmit={submit}>
          <h3>Final exam</h3>
          {exam.map((q, qi) => (
            <fieldset className="q" key={q.id}>
              <legend>{qi + 1}. {q.question}</legend>
              {q.options.map((o, oi) => (
                <label className="check" key={oi}><input type="radio" name={'q' + q.id} checked={answers[q.id] === oi + 1} onChange={() => setAnswers({ ...answers, [q.id]: oi + 1 })} /> {o}</label>
              ))}
              <Listen text={q.question + '. ' + q.options.map((o, oi) => `Option ${oi + 1}: ${o}`).join('. ')} />
            </fieldset>
          ))}
          <button className="btn gold" disabled={Object.keys(answers).length < exam.length}>Submit answers</button>{' '}
          <button type="button" className="btn alt" onClick={() => setExam(null)}>Cancel</button>
          {Object.keys(answers).length < exam.length && <p className="small">Answer every question to submit.</p>}
        </form>
      )}
    </>
  );
}

const ID_LABEL = { sa_id: 'South African ID number', passport: 'Passport number', other: 'Identity document number' };

function CertificateDetails({ courseId, token, done }) {
  const [f, setF] = useState({ first_names: '', surname: '', id_type: 'sa_id', id_number: '', consent: false }); const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try { await api(`/api/courses/${courseId}/certificate`, { method: 'POST', token, body: f }); done(); window.scrollTo(0, 0); } catch (er) { setErr(er.message); }
  };
  const sa = f.id_type === 'sa_id';
  return (
    <form className="card" onSubmit={submit}>
      <h3>🏅 You passed! Enter your details for your certificate</h3>
      <p className="small">Type your names exactly as they appear on your identity document. Your certificate cannot be changed after it is issued.</p>
      {err && <div className="msg" role="alert">{err}</div>}
      <div className="grid">
        <Field label="Full first names" id="cf1"><input id="cf1" required autoComplete="given-name" value={f.first_names} onChange={set('first_names')} /></Field>
        <Field label="Surname" id="cf2"><input id="cf2" required autoComplete="family-name" value={f.surname} onChange={set('surname')} /></Field>
        <Field label="Type of identification" id="cf3">
          <select id="cf3" value={f.id_type} onChange={set('id_type')}>
            <option value="sa_id">South African ID number</option><option value="passport">Passport number</option><option value="other">Other identity document</option>
          </select>
        </Field>
        <Field label={sa ? 'ID number (13 digits)' : 'Document number'} id="cf4">
          <input id="cf4" required inputMode={sa ? 'numeric' : 'text'} maxLength={sa ? 13 : 25} value={f.id_number} onChange={set('id_number')} />
        </Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
        <span>I confirm that these details are correct. I agree that AbilityConnect SA stores them to issue and verify my certificate. When someone checks my certificate number, only my name and the last four characters of my ID number are shown.</span></label>
      <button className="btn gold">Get my certificate</button>
    </form>
  );
}

function Certificate({ cert, course }) {
  const print = () => {
    document.body.classList.add('print-cert');
    window.addEventListener('afterprint', () => document.body.classList.remove('print-cert'), { once: true });
    window.print();
  };
  return (
    <div className="card">
      <div className="cert">
        <div className="cert-flower" aria-hidden="true">✿</div>
        <p className="cert-top">AbilityConnect SA</p>
        <h2>Certificate of Completion</h2>
        <p>This certifies that</p>
        <p className="cert-name">{cert.first_names ? `${cert.first_names} ${cert.surname}` : cert.name}</p>
        {cert.id_number && <p>{ID_LABEL[cert.id_type] || 'ID number'}: <strong>{cert.id_number}</strong></p>}
        <p>has completed the course and passed the final exam</p>
        <p className="cert-course">{course.title}</p>
        <p>Score: <strong>{cert.score}%</strong> · Issued {new Date(cert.issued_at).toLocaleDateString('en-ZA')}</p>
        <p className="small">Certificate number: <strong>{cert.code}</strong></p>
        <p className="small">This is a certificate of completion issued by AbilityConnect SA. It is not an accredited qualification.</p>
      </div>
      <button className="btn" onClick={print}>🖨️ Print or save as PDF</button>
    </div>
  );
}

function Verify() {
  const [code, setCode] = useState(''); const [res, setRes] = useState(null); const [err, setErr] = useState('');
  const check = async (e) => {
    e.preventDefault(); setRes(null); setErr('');
    try { setRes(await api('/api/certificates/' + encodeURIComponent(code.trim()))); } catch (er) { setErr(er.message); }
  };
  return (
    <section className="card section">
      <h3>Check a certificate</h3>
      <form className="row" onSubmit={check}>
        <div style={{ flex: 1, minWidth: 220 }}><label htmlFor="vc">Certificate number</label><input id="vc" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ACC-XXXXXXXX" /></div>
        <button className="btn">Check</button>
      </form>
      {err && <div className="msg" role="alert">{err}</div>}
      {res && <div className="msg" role="status">✔ Genuine certificate: <strong>{res.name}</strong>{res.id_masked ? ` (ID ${res.id_masked})` : ''} completed <strong>{res.course}</strong> with {res.score}% on {new Date(res.issued_at).toLocaleDateString('en-ZA')}.</div>}
    </section>
  );
}
