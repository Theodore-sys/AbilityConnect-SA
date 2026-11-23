import { useState, useEffect, useCallback } from 'react';
import { SLOTS } from './media.js';

export const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
export const ORG_CATS = ['Clinic', 'Hospital', 'Community centre', 'Educational institution', 'Public service office', 'Library', 'Shopping centre', 'Support organisation'];
export const EDU_TYPES = ['Learnership', 'Skills programme', 'Bursary', 'Course'];
export const JOB_TYPES = ['Internship', 'Employment'];
export const FEATURES = [
  { k: 'ramp', l: 'Wheelchair ramp' }, { k: 'toilet', l: 'Accessible toilet' }, { k: 'lift', l: 'Lift' }, { k: 'parking', l: 'Accessible parking' },
  { k: 'sign', l: 'Sign language' }, { k: 'braille', l: 'Braille / large print' }, { k: 'loop', l: 'Hearing loop' }, { k: 'step-free', l: 'Step-free entrance' },
];
export const HELP_KINDS = ['Rehabilitation', 'Assistive technology', 'Counselling', 'Caregiver', 'Information'];
export const REPORT_CATS = ['No wheelchair access', 'Inaccessible toilets', 'Website or app not accessible', 'Missing captions or sign language', 'No braille or large print', 'Incorrect information on this platform', 'Other barrier'];
export const REPORT_STATUS = ['Submitted', 'Under review', 'Action required', 'Resolved', 'Closed'];
export const RES_CATS = ['Sign language video', 'Easy-read guide', 'Audio guide', 'Training video', 'Other'];
export const CONTACT_PREFS = [['email', 'Email'], ['sms', 'SMS / text message'], ['phone', 'Phone call'], ['written', 'Written messages only (no calls)']];
export const DEFAULT_PREFS = { size: 18, theme: 'light', style: 'blue', reading: false, calm: false, simple: false, auto: false, rate: 1 };
export const ICON = { Clinic: '🏥', Hospital: '🏨', 'Community centre': '🏘️', 'Educational institution': '🎓', 'Public service office': '🏛️', Library: '📚', 'Shopping centre': '🛍️', 'Support organisation': '🤝' };

async function rawApi(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { localStorage.removeItem('ac_auth'); localStorage.removeItem('ac_admin_auth'); setTimeout(() => window.location.reload(), 1500); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export async function api(path, opts) {
  try { return await rawApi(path, opts); }
  catch (e) {
    if (e instanceof TypeError) throw new Error('Cannot reach the server. Please make sure the backend is running (open ' + API + '/api/health in your browser, it should say {"ok":true}).');
    throw e;
  }
}

// Audio reading (text to speech) and voice input (speech to text) use the browser's built-in features
let RATE = 1;
export const setRate = (r) => { RATE = r; };
export const speak = (t, lang = 'en-ZA') => {
  if (!('speechSynthesis' in window) || !t) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t); u.lang = lang; u.rate = RATE;
  const v = window.speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang.split('-')[0].toLowerCase()));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
};
// true when this device has a voice for the language (also true while the voice list is still loading)
export const hasVoice = (lang) => {
  if (!('speechSynthesis' in window)) return false;
  const vs = window.speechSynthesis.getVoices();
  return vs.length === 0 || vs.some((x) => x.lang.toLowerCase().startsWith(lang.split('-')[0].toLowerCase()));
};
export const stopSpeak = () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };

export function Listen({ text }) {
  return <button type="button" className="btn alt sm" onClick={() => speak(text)}>🔊 Listen</button>;
}
export function Dictate({ onText }) {
  const [on, setOn] = useState(false);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const start = () => {
    const r = new SR(); r.lang = 'en-ZA';
    r.onresult = (e) => onText(e.results[0][0].transcript);
    r.onend = () => setOn(false); r.onerror = () => setOn(false);
    setOn(true); r.start();
  };
  return <button type="button" className="btn alt sm" aria-pressed={on} onClick={start}>{on ? 'Listening…' : '🎤 Speak'}</button>;
}
export function Field({ label, id, children }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}</div>;
}

export function useList(path, token) {
  const [items, setItems] = useState([]); const [err, setErr] = useState('');
  const load = useCallback(() => api(path, { token }).then((d) => { setItems(Array.isArray(d) ? d : []); setErr(''); }).catch((e) => setErr(e.message)), [path, token]);
  useEffect(() => { load(); }, [load]);
  return [items, load, err];
}

// Plays a link an administrator pasted: YouTube, .mp4/.webm, or any other page
export function Embed({ url, title = 'Video' }) {
  if (!url) return null;
  const yt = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
  if (yt) return <iframe className="embed" src={'https://www.youtube.com/embed/' + yt[1]} title={title} allowFullScreen />;
  if (/\.(mp4|webm)(\?.*)?$/i.test(url)) return <video className="embed" controls src={url} aria-label={title} />;
  return safeUrl(url) ? <p><a href={safeUrl(url)} target="_blank" rel="noopener noreferrer">Open: {title}</a></p> : null;
}

// A picture/video slot. Shows your file from frontend/public/media, or a dashed box telling you what to add.
export function Slot({ name, className = '' }) {
  const s = SLOTS[name]; const [i, setI] = useState(0);
  if (i >= s.src.length) {
    return (
      <div className={'slot-empty ' + className} aria-hidden="true">
        <span className="slot-ico">{s.type === 'video' ? '🎬' : '🖼️'}</span>
        <strong>Add a {s.type} here</strong><span>{s.hint}</span><code>public{s.src[0]}</code><small>{s.size}</small>
      </div>
    );
  }
  if (s.type === 'video') {
    return (
      <video className={'slot-video ' + className} controls preload="metadata" poster={s.poster} aria-label={s.alt} onError={() => setI(i + 1)}>
        <source src={s.src[i]} onError={() => setI(i + 1)} />
        {s.captions && <track kind="captions" src={s.captions} srcLang="en" label="English" default />}
      </video>
    );
  }
  return <img className={'slot-img ' + className} src={s.src[i]} alt={s.alt} onError={() => setI(i + 1)} />;
}

// Shrinks a photo so it uploads quickly
export const compressImage = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 800 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject; img.src = r.result;
  };
  r.onerror = reject; r.readAsDataURL(file);
});

export const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
export const NEAR_KM = 40;
// Straight-line distance between two points on the map (in km). Your location never leaves your browser.
export const distanceKm = (a, b) => {
  const r = (d) => (d * Math.PI) / 180; const dLat = r(b.lat - a.lat); const dLng = r(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};

// The 11 official languages. stt = a browser can caption it today (Chrome and Edge). t = code for the translation service.
export const SA_LANGS = [
  { code: 'en-ZA', t: 'en', name: 'English', stt: true }, { code: 'af-ZA', t: 'af', name: 'Afrikaans', stt: true }, { code: 'zu-ZA', t: 'zu', name: 'isiZulu', stt: true },
  { code: 'xh-ZA', t: 'xh', name: 'isiXhosa' }, { code: 'nso-ZA', t: 'nso', name: 'Sepedi' }, { code: 'st-ZA', t: 'st', name: 'Sesotho' }, { code: 'tn-ZA', t: 'tn', name: 'Setswana' },
  { code: 'ts-ZA', t: 'ts', name: 'Xitsonga' }, { code: 'ss-ZA', t: 'ss', name: 'siSwati' }, { code: 've-ZA', t: 've', name: 'Tshivenda' }, { code: 'nr-ZA', t: 'nr', name: 'isiNdebele' },
];
export const langName = (t) => (SA_LANGS.find((l) => l.t === t || l.code === t) || { name: t }).name;
export const translateText = (text, target, token, source) => api('/api/translate', { method: 'POST', token, body: { text, target, source } });

export const ACCESS_ITEMS = [['ramp', 'Wheelchair ramp'], ['step_free', 'Step-free entrance'], ['toilet', 'Accessible toilet'], ['lift', 'Lift'], ['parking', 'Accessible parking'], ['sign', 'Sign language support'], ['braille', 'Braille / large print'], ['loop', 'Hearing loop'], ['wide_doors', 'Wide doors']];
export const VERIFY_METHODS = ['Phone call', 'Site visit', 'Official website', 'Community report'];

// Only real web addresses are ever used as links (never "javascript:" or other tricks)
export const safeUrl = (u) => { try { const x = new URL(String(u || '').trim()); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } };
export const safeEmail = (e) => (/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(e || '')) ? String(e) : null);

// A square profile picture, shrunk so it is small and quick to save
export const squareImage = (file, size = 256) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height); const c = document.createElement('canvas'); c.width = size; c.height = size;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject; img.src = fr.result;
  };
  fr.onerror = reject; fr.readAsDataURL(file);
});

// Push notifications: messages that reach the phone or computer even when the website is closed
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const keyBytes = (b64) => { const p = '='.repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };
export async function enablePush(token) {
  const reg = await navigator.serviceWorker.register('/sw.js');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed. You can allow them in your browser settings for this website.');
  const { key } = await api('/api/push/key');
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  await api('/api/push/subscribe', { method: 'POST', token, body: sub.toJSON() });
}
export async function disablePush(token) {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) { await api('/api/push/subscribe', { method: 'DELETE', token, body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); }
}
export const pushActiveHere = async () => {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  return !!(reg && (await reg.pushManager.getSubscription()));
};
