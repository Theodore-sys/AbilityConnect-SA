import { useState, useRef, useEffect } from 'react';
import { speak, stopSpeak, SA_LANGS, translateText, Field } from './lib.jsx';

// A picture board for people who cannot read or write (for example Deaf people who use home sign).
// Nothing here needs reading: tap pictures, show the screen, or let the device listen and show pictures back.
// Each tile: e = picture, w = short word, say = the full sentence that is spoken, kw = words the microphone listens for.
const GROUPS = [
  ['🆘 Help now', [
    { id: 'help', e: '🆘', w: 'Help', say: 'I need help, please.', kw: ['help', 'emergency'] },
    { id: 'amb', e: '🚑', w: 'Ambulance', say: 'Please call an ambulance.', kw: ['ambulance'] },
    { id: 'police', e: '👮', w: 'Police', say: 'I need the police.', kw: ['police', 'crime'] },
    { id: 'pain', e: '😖', w: 'Pain', say: 'I am in pain.', kw: ['pain', 'hurt', 'sore'] },
    { id: 'lost', e: '🧭', w: 'Lost', say: 'I am lost. Please help me find my way.', kw: ['lost', 'direction', 'where'] },
    { id: 'deaf', e: '🧏', w: 'I am Deaf', say: 'I am Deaf. Please do not shout. Please use pictures, gestures or writing.', kw: ['deaf'] },
  ]],
  ['❤️ Body and health', [
    { id: 'head', e: '🤕', w: 'Head', say: 'My head hurts.', kw: ['head', 'headache'] },
    { id: 'tummy', e: '🤢', w: 'Stomach', say: 'My stomach is sick.', kw: ['stomach', 'tummy', 'vomit', 'sick'] },
    { id: 'tooth', e: '🦷', w: 'Tooth', say: 'My tooth hurts.', kw: ['tooth', 'teeth', 'dentist'] },
    { id: 'ear', e: '👂', w: 'Ear', say: 'There is a problem with my ear.', kw: ['ear', 'hearing'] },
    { id: 'eye', e: '👁️', w: 'Eye', say: 'There is a problem with my eye.', kw: ['eye', 'eyes', 'see'] },
    { id: 'fever', e: '🤒', w: 'Fever', say: 'I have a fever.', kw: ['fever', 'temperature', 'hot'] },
    { id: 'pill', e: '💊', w: 'Medicine', say: 'I need my medicine.', kw: ['medicine', 'medication', 'tablets', 'pills'] },
    { id: 'pregnant', e: '🤰', w: 'Baby', say: 'I am pregnant, or I have a baby who needs care.', kw: ['pregnant', 'baby'] },
    { id: 'doctor', e: '🧑‍⚕️', w: 'Doctor', say: 'I need to see a doctor or a nurse.', kw: ['doctor', 'nurse'] },
  ]],
  ['🍽️ Needs', [
    { id: 'water', e: '💧', w: 'Water', say: 'I need water.', kw: ['water', 'drink', 'thirsty'] },
    { id: 'food', e: '🍽️', w: 'Food', say: 'I am hungry. I need food.', kw: ['food', 'eat', 'hungry'] },
    { id: 'toilet', e: '🚻', w: 'Toilet', say: 'I need the toilet.', kw: ['toilet', 'bathroom'] },
    { id: 'sleep', e: '🛏️', w: 'Sleep', say: 'I need to rest or sleep.', kw: ['sleep', 'rest', 'bed'] },
    { id: 'money', e: '💰', w: 'Money', say: 'I need money or help to pay.', kw: ['money', 'pay', 'cost', 'price'] },
    { id: 'phone', e: '📱', w: 'Phone', say: 'Please call my family or my helper for me.', kw: ['phone', 'call'] },
    { id: 'write', e: '✍️', w: 'Write', say: 'Please write it down or draw it for me.', kw: ['write', 'draw'] },
    { id: 'show', e: '🖼️', w: 'Show me', say: 'Please show me with pictures or gestures.', kw: ['show', 'picture'] },
  ]],
  ['😊 Feelings and answers', [
    { id: 'yes', e: '👍', w: 'Yes', say: 'Yes.', kw: ['yes', 'okay', 'ok'] },
    { id: 'no', e: '👎', w: 'No', say: 'No.', kw: ['no', 'not'] },
    { id: 'dont', e: '🤷', w: 'I do not understand', say: 'I do not understand. Please show me slowly.', kw: ['understand'] },
    { id: 'slow', e: '🐢', w: 'Slowly', say: 'Please go slowly.', kw: ['slow', 'slowly'] },
    { id: 'again', e: '🔁', w: 'Again', say: 'Please do it again.', kw: ['again', 'repeat'] },
    { id: 'happy', e: '😀', w: 'Happy', say: 'I am happy.', kw: ['happy', 'good', 'fine'] },
    { id: 'sad', e: '😢', w: 'Sad', say: 'I am sad.', kw: ['sad', 'cry'] },
    { id: 'scared', e: '😨', w: 'Scared', say: 'I am scared.', kw: ['scared', 'afraid', 'fear'] },
    { id: 'angry', e: '😠', w: 'Angry', say: 'I am angry.', kw: ['angry'] },
    { id: 'thanks', e: '🙏', w: 'Thank you', say: 'Thank you.', kw: ['thank', 'thanks'] },
  ]],
  ['📍 Places and people', [
    { id: 'clinic', e: '🏥', w: 'Clinic', say: 'I want to go to the clinic or hospital.', kw: ['clinic', 'hospital'] },
    { id: 'home', e: '🏠', w: 'Home', say: 'I want to go home.', kw: ['home'] },
    { id: 'taxi', e: '🚐', w: 'Taxi or bus', say: 'I need a taxi or a bus.', kw: ['taxi', 'bus', 'transport'] },
    { id: 'shop', e: '🛒', w: 'Shop', say: 'I want to go to the shop.', kw: ['shop', 'store', 'buy'] },
    { id: 'school', e: '🏫', w: 'School', say: 'I want to go to school or training.', kw: ['school', 'college', 'training'] },
    { id: 'work', e: '💼', w: 'Work', say: 'I am looking for work.', kw: ['work', 'job'] },
    { id: 'bank', e: '🏦', w: 'Bank or office', say: 'I need the bank or a government office.', kw: ['bank', 'office', 'home affairs', 'sassa'] },
    { id: 'church', e: '⛪', w: 'Church or mosque', say: 'I want to go to my place of worship.', kw: ['church', 'mosque', 'temple'] },
    { id: 'family', e: '👨‍👩‍👧', w: 'Family', say: 'I want my family.', kw: ['family', 'mother', 'father', 'mom', 'mum', 'sister', 'brother'] },
    { id: 'interp', e: '🤟', w: 'Sign interpreter', say: 'I need a sign language interpreter.', kw: ['interpreter', 'sign'] },
  ]],
];
const ALL = GROUPS.flatMap(([, t]) => t);
const KEY = 'ac_pic_cards';
const loadCards = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const saveCards = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch { return false; } };
const shrink = (file) => new Promise((ok, no) => {
  const r = new FileReader();
  r.onerror = no;
  r.onload = () => {
    const im = new Image(); im.onerror = no;
    im.onload = () => {
      const s = 220 / Math.max(im.width, im.height, 1); const c = document.createElement('canvas');
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); ok(c.toDataURL('image/jpeg', 0.7));
    };
    im.src = r.result;
  };
  r.readAsDataURL(file);
});
const Pic = ({ t, size }) => (t.img
  ? <img src={t.img} alt="" className={'pt-img ' + (size || '')} />
  : <span className={'pt-emoji ' + (size || '')} aria-hidden="true">{t.e}</span>);

export default function PictureTalk({ token }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const [strip, setStrip] = useState([]); const [words, setWords] = useState(true); const [lang, setLang] = useState('en-ZA');
  const [cards, setCards] = useState(loadCards); const [full, setFull] = useState(false); const [note, setNote] = useState('');
  const [heard, setHeard] = useState([]); const [heardText, setHeardText] = useState(''); const [listening, setListening] = useState(false);
  const [nw, setNw] = useState(''); const [nimg, setNimg] = useState(''); const [nsay, setNsay] = useState('');
  const rec = useRef(null);
  useEffect(() => () => { if (rec.current) rec.current.stop(); stopSpeak(); }, []);

  const add = (t) => setStrip((s) => [...s, t].slice(0, 8));
  const byLang = SA_LANGS.find((l) => l.code === lang) || SA_LANGS[0];
  const speakStrip = async () => {
    if (!strip.length) return;
    let text = strip.map((t) => t.say || t.w).join(' '); setNote('');
    if (byLang.t !== 'en') {
      try { text = (await translateText(text, byLang.t, token, 'en')).text; }
      catch (e) { setNote((e.message || 'Translation is not available.') + ' Speaking English instead.'); speak(text, 'en-ZA'); return; }
    }
    speak(text, lang);
  };

  const listen = () => {
    if (!SR) { setNote('Listening is not supported in this browser. Please use Chrome or Edge.'); return; }
    setNote(''); setHeard([]);
    const r = new SR(); r.lang = 'en-ZA'; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => {
      const said = Array.from(e.results).slice(e.resultIndex).map((x) => x[0].transcript).join(' ').toLowerCase();
      setHeardText(said);
      const hits = ALL.filter((t) => t.kw.some((k) => new RegExp('\\b' + k + '\\b').test(said)));
      if (hits.length) setHeard((h) => [...hits, ...h.filter((x) => !hits.some((y) => y.id === x.id))].slice(0, 6));
    };
    r.onend = () => setListening(false);
    r.onerror = () => { setListening(false); setNote('The microphone could not be used. Please allow microphone access.'); };
    rec.current = r; r.start(); setListening(true);
  };

  const addCard = () => {
    if (!nw.trim() && !nimg) return;
    const next = [...cards, { id: 'c' + Date.now(), e: '⭐', w: nw.trim() || 'My card', say: nsay.trim() || nw.trim(), img: nimg, kw: [] }].slice(0, 30);
    setCards(next); if (!saveCards(next)) setNote('This device could not save the card. Try a smaller photo.');
    setNw(''); setNimg(''); setNsay('');
  };
  const delCard = (id) => { const next = cards.filter((c) => c.id !== id); setCards(next); saveCards(next); };
  const pickPhoto = async (e) => { const f = e.target.files[0]; if (!f) return; try { setNimg(await shrink(f)); } catch { setNote('That photo could not be read.'); } };

  const Tile = ({ t }) => (
    <button type="button" className="pt-tile" onClick={() => add(t)} aria-label={t.w}>
      <Pic t={t} />{words && <span className="pt-word">{t.w}</span>}
    </button>
  );

  return (
    <>
      <div className="card">
        <h3>🖼️ Talk with pictures</h3>
        <p className="small">For anyone who cannot read or write. Tap the pictures you want, then press the big speaker so the other person hears you, or show them the screen. A family member, teacher or interpreter can add your own photo cards below (your home, your clinic, your family).</p>
        <div className="pt-strip" aria-live="polite" aria-label="My message">
          {strip.length === 0 ? <span className="small">Tap a picture to start…</span> : strip.map((t, i) => <span key={i} className="pt-chip"><Pic t={t} />{words && <span className="pt-word">{t.w}</span>}</span>)}
        </div>
        <div className="btnrow">
          <button className="btn gold" disabled={!strip.length} onClick={speakStrip}>🔊 Speak for me</button>
          <button className="btn" disabled={!strip.length} onClick={() => setFull(true)}>📺 Show my screen</button>
          <button className="btn alt" disabled={!strip.length} onClick={() => setStrip((s) => s.slice(0, -1))}>↩ Undo</button>
          <button className="btn alt" disabled={!strip.length} onClick={() => { setStrip([]); stopSpeak(); }}>🗑 Clear</button>
        </div>
        <div className="grid">
          <Field label="Language to speak in" id="ptl"><select id="ptl" value={lang} onChange={(e) => setLang(e.target.value)}>{SA_LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></Field>
          <label className="check"><input type="checkbox" checked={words} onChange={(e) => setWords(e.target.checked)} /> Show words under pictures</label>
        </div>
        {note && <p role="alert" className="small">{note}</p>}
      </div>

      {cards.length > 0 && <div className="card"><h3>⭐ My own cards</h3><div className="pt-grid">{cards.map((c) => (
        <div key={c.id} className="pt-own"><Tile t={c} /><button className="btn alt sm" onClick={() => delCard(c.id)} aria-label={'Delete ' + c.w}>Delete</button></div>))}</div></div>}

      {GROUPS.map(([title, tiles]) => (
        <div className="card" key={title}><h3>{title}</h3><div className="pt-grid">{tiles.map((t) => <Tile key={t.id} t={t} />)}</div></div>
      ))}

      <div className="card">
        <h3>👂 Let the device listen, and it shows pictures</h3>
        <p className="small">Give the phone to the person who is speaking. When they say words such as "water", "doctor", "taxi" or "family", the matching pictures appear in big size. Works in English.</p>
        <div className="btnrow">
          {!listening ? <button className="btn" onClick={listen}>🎤 Start listening</button> : <button className="btn alt" onClick={() => rec.current && rec.current.stop()}>⏹ Stop</button>}
          {heard.length > 0 && <button className="btn alt" onClick={() => { setHeard([]); setHeardText(''); }}>Clear</button>}
        </div>
        <div className="pt-heard" aria-live="polite">{heard.map((t) => <span key={t.id} className="pt-chip big"><Pic t={t} size="xl" /><span className="pt-word">{t.w}</span></span>)}</div>
        {heardText && <p className="small">Heard: {heardText}</p>}
      </div>

      <div className="card">
        <h3>➕ Make my own card (with my own photo)</h3>
        <p className="small">Home sign is personal, so make cards that look like your real life. Take a photo of your mother, your house, your clinic or your taxi stop. These cards are saved on this phone only.</p>
        <Field label="Photo (take a picture or choose one)" id="ptp"><input id="ptp" type="file" accept="image/*" capture="environment" onChange={pickPhoto} /></Field>
        {nimg && <img src={nimg} alt="Preview of the new card" className="pt-img" />}
        <Field label="Short name (optional)" id="ptn"><input id="ptn" value={nw} maxLength={30} onChange={(e) => setNw(e.target.value)} /></Field>
        <Field label="What should it say out loud? (optional, for example: I want to go to my mother's house.)" id="pts"><input id="pts" value={nsay} maxLength={120} onChange={(e) => setNsay(e.target.value)} /></Field>
        <button className="btn gold" disabled={!nw.trim() && !nimg} onClick={addCard}>Save card</button>
      </div>

      {full && (
        <div className="pt-full" role="dialog" aria-modal="true" aria-label="My message in pictures">
          <div className="pt-full-row">{strip.map((t, i) => <span key={i} className="pt-chip big"><Pic t={t} size="xl" />{words && <span className="pt-word">{t.w}</span>}</span>)}</div>
          <div className="btnrow"><button className="btn gold" onClick={speakStrip}>🔊 Speak</button><button className="btn alt" onClick={() => setFull(false)}>✕ Close</button></div>
        </div>
      )}
    </>
  );
}