import { useState, useRef, useEffect } from 'react';
import { api, speak, stopSpeak, hasVoice, Slot, Field, SA_LANGS, langName, translateText, useList } from './lib.jsx';

const PHRASES = {
  'Meeting someone': ['Hello', 'Good morning', 'Nice to meet you', 'Thank you', 'Please wait a moment'],
  'I need help': ['I am deaf. Please face me and speak normally.', 'Please write it down for me.', 'Please speak slowly, not louder.', 'Can you repeat that, please?', 'I need a sign language interpreter.', 'Where is the ramp or lift?'],
  'Health': ['I need a doctor.', 'I am in pain.', 'I need my medication.', 'Please call an ambulance.'],
  'Shops and services': ['How much is this?', 'Where is the toilet?', 'I would like to open an account.', 'Please can I see a manager?'],
};
const SYMBOLS = [['🚻', 'Toilet'], ['💧', 'Water'], ['💊', 'Medicine'], ['🆘', 'I need help'], ['🐢', 'Please slow down'], ['✍️', 'Please write it down'],
  ['🔁', 'Please repeat'], ['🚌', 'Transport'], ['🍽️', 'Food'], ['🏥', 'Clinic'], ['👍', 'Yes'], ['👎', 'No']];
const byCode = (c) => SA_LANGS.find((l) => l.code === c) || SA_LANGS[0];
const MAX_SECONDS = 20;

function LangSelect({ id, label, value, onChange, none }) {
  return (
    <Field label={label} id={id}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {none && <option value="">{none}</option>}
        {SA_LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
      </select>
    </Field>
  );
}

/* ---------------- Write / speak / captions ---------------- */
function Talk({ token }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = useRef(null); const cfg = useRef({});
  const [log, setLog] = useState([]); const [live, setLive] = useState(''); const [listening, setListening] = useState(false);
  const [text, setText] = useState(''); const [big, setBig] = useState(''); const [full, setFull] = useState(false); const [note, setNote] = useState('');
  const [capCode, setCapCode] = useState('en-ZA'); const [showCode, setShowCode] = useState('');
  const [typeCode, setTypeCode] = useState('en-ZA'); const [toCode, setToCode] = useState('');
  cfg.current = { capCode, showCode };
  const add = (who, t, tr) => { if (t) setLog((l) => [...l, { who, t, tr: tr || '', at: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) }]); };
  useEffect(() => () => { if (rec.current) rec.current.stop(); stopSpeak(); }, []);

  const finalCaption = async (t) => {
    if (!t) return;
    const { capCode: from, showCode: to } = cfg.current; let tr = '';
    if (to && byCode(to).t !== byCode(from).t) {
      try { tr = (await translateText(t, byCode(to).t, token, byCode(from).t)).text; } catch (e) { setNote(e.message); }
    }
    add('hearing', t, tr);
  };
  const startListening = () => {
    if (!SR) { setNote('Live captions are not supported in this browser. Please use Chrome or Edge.'); return; }
    setNote('');
    const r = new SR(); r.lang = capCode; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalCaption(t.trim()); else interim += t;
      }
      setLive(interim);
    };
    r.onend = () => { setListening(false); setLive(''); };
    r.onerror = (e) => {
      setListening(false);
      setNote(e.error === 'language-not-supported' || e.error === 'language-unavailable'
        ? `Your browser cannot caption ${byCode(capCode).name} yet. Captions work in English, Afrikaans and isiZulu. For other languages, use the write option or the Sign on video tab.`
        : 'The microphone could not be used. Please allow microphone access and try again.');
    };
    rec.current = r; r.start(); setListening(true);
  };
  const stopListening = () => { if (rec.current) rec.current.stop(); };

  // You write (or tap): the device can translate and then speak in the other person's language
  const say = async (t) => {
    const s = (t || '').trim(); if (!s) return;
    let spoken = s; let code = typeCode; setNote('');
    if (toCode && byCode(toCode).t !== byCode(typeCode).t) {
      try { spoken = (await translateText(s, byCode(toCode).t, token, byCode(typeCode).t)).text; code = toCode; }
      catch (e) { setNote(e.message + ' Speaking your original message instead.'); }
    }
    add('deaf', s, spoken !== s ? spoken : ''); setBig(spoken); speak(spoken, code);
    if (!hasVoice(code)) setNote(`This device has no ${byCode(code).name} voice installed, so a default voice reads it. You can use the big text instead.`);
  };
  const lines = () => log.map((x) => `${x.at} ${x.who === 'deaf' ? 'Me' : 'Other person'}: ${x.t}${x.tr ? ' -> ' + x.tr : ''}`).join('\n');
  const copy = () => navigator.clipboard && navigator.clipboard.writeText(lines());
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines()], { type: 'text/plain' })); a.download = 'conversation.txt'; a.click(); URL.revokeObjectURL(a.href); };

  return (
    <>
      {note && <div className="msg" role="alert">{note}</div>}
      <div className="comm-grid">
        <section className="card comm" aria-labelledby="c1">
          <h3 id="c1">👂 Other person speaks, you read</h3>
          <LangSelect id="cl" label="Language the other person speaks" value={capCode} onChange={setCapCode} />
          <LangSelect id="sl" label="Show the captions in" value={showCode} onChange={setShowCode} none="The same language (no translation)" />
          {!byCode(capCode).stt && <div className="msg" role="status">Browsers cannot caption {byCode(capCode).name} yet. Captions work in English, Afrikaans and isiZulu (Chrome or Edge). You can still try, or use the write option below.</div>}
          <div className="btnrow">
            {!listening ? <button className="btn gold" onClick={startListening}>🎤 Start captions</button> : <button className="btn danger" onClick={stopListening}>■ Stop captions</button>}
          </div>
          <p className="small">To change a language, stop the captions and start them again.</p>
          <div className="captions" aria-live="polite" aria-label="Live captions">
            {log.filter((x) => x.who === 'hearing').slice(-3).map((x, i) => <p key={i}>{x.tr || x.t}{x.tr && <><br /><span className="small">{x.t}</span></>}</p>)}
            {live && <p className="interim">{live}</p>}
            {!live && !log.some((x) => x.who === 'hearing') && <p className="small">Captions appear here.</p>}
          </div>
        </section>

        <section className="card comm" aria-labelledby="c2">
          <h3 id="c2">✍️ You write or tap, it speaks</h3>
          <LangSelect id="tl" label="I am writing in" value={typeCode} onChange={setTypeCode} />
          <LangSelect id="ol" label="Say it to the other person in" value={toCode} onChange={setToCode} none="The same language (no translation)" />
          <label htmlFor="ct">Type your message</label>
          <textarea id="ct" rows="3" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="btnrow">
            <button className="btn" onClick={() => { say(text); setText(''); }}>🔊 Speak it</button>
            <button className="btn alt" onClick={() => setFull(true)} disabled={!big}>🖥️ Show big text</button>
            <button className="btn alt" onClick={stopSpeak}>■ Stop voice</button>
          </div>
          {big && <p className="bigline" role="status">{big}</p>}
        </section>
      </div>

      <section className="card" aria-labelledby="c3">
        <h3 id="c3">⚡ Quick phrases</h3>
        <p className="small">These phrases are in English. If you chose a language above under "Say it to the other person in", they are translated first.</p>
        {Object.entries(PHRASES).map(([group, items]) => (
          <div key={group}><strong>{group}</strong>
            <div className="chips">{items.map((p) => <button key={p} className="chip" onClick={() => { setTypeCode('en-ZA'); say(p); }}>{p}</button>)}</div>
          </div>
        ))}
      </section>

      <section className="card" aria-labelledby="c4">
        <h3 id="c4">🖼️ Symbol board</h3>
        <p className="small">Tap a picture to say it and show it. Useful when typing is difficult.</p>
        <div className="symbols">{SYMBOLS.map(([e, l]) => <button key={l} className="symbol" onClick={() => { setTypeCode('en-ZA'); say(l); }}><span aria-hidden="true">{e}</span>{l}</button>)}</div>
      </section>

      <section className="card" aria-labelledby="c5">
        <div className="head"><h3 id="c5">📝 Conversation</h3>
          <div className="btnrow"><button className="btn alt sm" onClick={copy}>Copy</button><button className="btn alt sm" onClick={download}>Download</button><button className="btn alt sm" onClick={() => setLog([])}>Clear</button></div>
        </div>
        {log.length === 0 && <p>Nothing yet. Your conversation will be written here so you can read it again.</p>}
        <ul className="chat">{log.map((x, i) => <li key={i} className={x.who}><span className="small">{x.at} · {x.who === 'deaf' ? 'Me' : 'Other person'}</span><br />{x.t}{x.tr && <><br /><strong>→ {x.tr}</strong></>}</li>)}</ul>
        <p className="small">The conversation stays on this device. Text sent for translation goes to the translation service and is not stored by us.</p>
      </section>

      <section className="card" aria-labelledby="c6">
        <h3 id="c6">💡 Tips for people talking to a deaf person</h3>
        <ul>
          <li>Face the person so they can see your face and lips. Do not cover your mouth.</li>
          <li>Speak normally. Shouting and speaking very slowly does not help.</li>
          <li>Use gestures, writing or this tool. Be patient and check that you were understood.</li>
          <li>South African Sign Language (SASL) is an official language. Ask if the person would like an interpreter.</li>
        </ul>
        <p className="small">Captions use your browser's speech recognition. They work best in Chrome or Edge, need an internet connection and can make mistakes. Machine translation can also make mistakes, so do not rely on it for medical, legal or money matters.</p>
      </section>

      {full && (
        <div className="fullscreen" role="dialog" aria-modal="true" aria-label="Message shown in big text">
          <p>{big}</p>
          <button className="btn gold" onClick={() => setFull(false)} autoFocus>Close</button>
        </div>
      )}
    </>
  );
}

/* ---------------- Sign on video: sent to a human interpreter ---------------- */
function SignTab({ token }) {
  const live = useRef(null); const stream = useRef(null); const recorder = useRef(null); const chunks = useRef([]); const timer = useRef(null);
  const [state, setState] = useState('idle'); // idle | camera | recording | recorded
  const [preview, setPreview] = useState(''); const [data, setData] = useState(''); const [secs, setSecs] = useState(0);
  const [lang, setLang] = useState('en'); const [consent, setConsent] = useState(false); const [msg, setMsg] = useState('');
  const [mine, reload] = useList('/api/sign-requests/mine', token);

  const stopStream = () => { if (stream.current) stream.current.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => () => { stopStream(); clearInterval(timer.current); }, []);
  useEffect(() => { if ((state === 'camera' || state === 'recording') && live.current && stream.current) live.current.srcObject = stream.current; }, [state]);
  useEffect(() => { if (state === 'recording' && secs >= MAX_SECONDS) stopRec(); }, [secs, state]);

  const openCamera = async () => {
    setMsg('');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      setState('camera');
    } catch { setMsg('The camera could not be opened. Please allow camera access in your browser, or choose a video file instead.'); }
  };
  const startRec = () => {
    if (!window.MediaRecorder) { setMsg('Video recording is not supported in this browser. Please use Chrome or Edge, or choose a video file.'); return; }
    chunks.current = [];
    const mime = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(stream.current, { mimeType: mime, videoBitsPerSecond: 500000 });
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = () => {
      const blob = new Blob(chunks.current, { type: r.mimeType || 'video/webm' });
      stopStream(); setPreview(URL.createObjectURL(blob)); setState('recorded');
      const fr = new FileReader(); fr.onload = () => setData(fr.result); fr.readAsDataURL(blob);
    };
    recorder.current = r; r.start(); setSecs(0); setState('recording');
    timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
  };
  function stopRec() { clearInterval(timer.current); if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop(); }
  const chooseFile = (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setMsg('That video is too large. Please choose one under 5 MB (about 20 seconds).'); return; }
    setMsg(''); setPreview(URL.createObjectURL(f)); setState('recorded'); setSecs(0);
    const fr = new FileReader(); fr.onload = () => setData(fr.result); fr.readAsDataURL(f);
  };
  const reset = () => { stopStream(); clearInterval(timer.current); setPreview(''); setData(''); setSecs(0); setState('idle'); };
  const send = async () => {
    setMsg('');
    if (!consent) { setMsg('Please tick the box to agree before sending.'); return; }
    if (!data) { setMsg('The video is still being prepared. Please try again in a moment.'); return; }
    try { await api('/api/sign-requests', { method: 'POST', token, body: { video: data, target_lang: lang, duration: secs } }); reset(); setConsent(false); setMsg('Sent. An interpreter will watch your video and reply here with text.'); reload(); }
    catch (e) { setMsg(e.message); }
  };
  const remove = async (id) => { if (window.confirm('Delete this request?')) { await api('/api/sign-requests/' + id, { method: 'DELETE', token }); reload(); } };

  return (
    <>
      <div className="card">
        <h3>🤟 Sign on video, get text back</h3>
        <p>Record yourself signing (up to {MAX_SECONDS} seconds). A human interpreter watches the video and replies in writing in the language you choose. You can then read it, or press Listen to hear it.</p>
        <p className="small"><strong>This is not instant and not automatic.</strong> No software can reliably turn South African Sign Language into text yet, so a person does the translation. Keep your face and both hands in view, with good light.</p>
      </div>
      {msg && <div className="msg" role="status">{msg}</div>}
      <div className="card">
        {state === 'idle' && (
          <>
            <div className="btnrow"><button className="btn gold" onClick={openCamera}>📷 Open camera</button></div>
            <Field label="Or choose a video file from your device (under 5 MB)" id="svf"><input id="svf" type="file" accept="video/*" onChange={chooseFile} /></Field>
          </>
        )}
        {(state === 'camera' || state === 'recording') && (
          <>
            <video ref={live} className="embed" style={{ aspectRatio: '4 / 3', transform: 'scaleX(-1)' }} autoPlay muted playsInline aria-label="Your camera" />
            <div className="btnrow">
              {state === 'camera' && <button className="btn gold" onClick={startRec}>⏺ Start recording</button>}
              {state === 'recording' && <button className="btn danger" onClick={stopRec}>■ Stop ({MAX_SECONDS - secs} s left)</button>}
              <button className="btn alt" onClick={reset}>Cancel</button>
            </div>
          </>
        )}
        {state === 'recorded' && (
          <>
            <video className="embed" style={{ aspectRatio: '4 / 3' }} controls src={preview} aria-label="Your recorded video" />
            <Field label="Please translate my signing into" id="sgl"><select id="sgl" value={lang} onChange={(e) => setLang(e.target.value)}>{SA_LANGS.map((l) => <option key={l.t} value={l.t}>{l.name}</option>)}</select></Field>
            <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> <span>I agree that an interpreter at AbilityConnect SA can watch this video to translate it. The video is deleted as soon as it is translated, or after 14 days.</span></label>
            <div className="btnrow"><button className="btn" onClick={send}>Send to an interpreter</button><button className="btn alt" onClick={reset}>Record again</button></div>
          </>
        )}
      </div>
      <h3>My sign requests</h3>
      {mine.length === 0 && <p>You have not sent any videos yet.</p>}
      {mine.map((x) => (
        <article className="card" key={x.id}>
          <span className="tag">{x.status === 'waiting' ? '⏳ Waiting for an interpreter' : '✔ Translated'}</span><span className="tag">{langName(x.target_lang)}</span>
          <p className="small">Sent {new Date(x.created_at).toLocaleString('en-ZA')}</p>
          {x.translation && <p className="bigline">{x.translation}</p>}
          <div className="btnrow">
            {x.translation && <button className="btn alt sm" onClick={() => speak(x.translation, (SA_LANGS.find((l) => l.t === x.target_lang) || SA_LANGS[0]).code)}>🔊 Listen</button>}
            <button className="btn alt sm" onClick={() => remove(x.id)}>Delete</button>
          </div>
        </article>
      ))}
    </>
  );
}

export default function Communicate({ token }) {
  const [tab, setTab] = useState('talk');
  return (
    <>
      <section className="banner">
        <div>
          <h2>Communicate</h2>
          <p>Write, speak or sign. Captions for what people say, your words spoken aloud in any of South Africa's 11 official languages, and sign language videos answered in writing by an interpreter.</p>
          <p className="plain">In short: read what people say, write what you want to say, or sign on video.</p>
        </div>
        <Slot name="sasl" className="banner-media" />
      </section>
      <div className="tabs" role="group" aria-label="Communication options">
        <button aria-pressed={tab === 'talk'} onClick={() => setTab('talk')}>✍️ Write, speak and captions</button>
        <button aria-pressed={tab === 'sign'} onClick={() => setTab('sign')}>🤟 Sign on video</button>
      </div>
      {tab === 'talk' ? <Talk token={token} /> : <SignTab token={token} />}
    </>
  );
}
