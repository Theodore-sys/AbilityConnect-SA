import { useState, useEffect } from 'react';
import { Slot } from './lib.jsx';

// A real 3D cube: four faces turn around, with a flower logo on top.
// "preview" = login page (no links). Otherwise the dashboard version with Open buttons.
const FACES = {
  preview: [
    { key: 'hero', slot: 'hero', title: 'Everyone belongs', text: 'Places, learning, jobs and support for people of all abilities.' },
    { key: 'welcome', video: true, title: 'Welcome', text: 'Watch the welcome video with a sign language interpreter.' },
    { key: 'places', slot: 'places', title: 'Accessible places near you', text: 'Find places within 40 km and get directions.' },
    { key: 'education', slot: 'education', title: 'Learn and earn certificates', text: 'Free skills courses, an exam and a certificate.' },
  ],
  app: [
    { key: 'welcome', video: true, title: 'Welcome', text: 'Watch the welcome video with a sign language interpreter.', page: null },
    { key: 'places', slot: 'places', title: 'Accessible places', text: 'Find places near you, with directions.', page: 'places' },
    { key: 'education', slot: 'education', title: 'Skills Academy', text: 'Free courses with an exam and a certificate.', page: 'education' },
    { key: 'communicate', slot: 'support', title: 'Communicate', text: 'Live captions and voice for deaf and hearing people.', page: 'communicate' },
  ],
};

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('calm');

export default function Demo3D({ go, preview, auto }) {
  const faces = preview ? FACES.preview : FACES.app;
  const n = faces.length;
  const [step, setStep] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [playing, setPlaying] = useState(() => !!auto && !reduced());
  const cur = ((step % n) + n) % n;

  useEffect(() => {
    if (!playing || reduced()) return undefined;
    const t = setInterval(() => setStep((s) => s + 1), 4500);
    return () => clearInterval(t);
  }, [playing]);

  const turn = (d) => { setStep((s) => s + d); setPlaying(false); };
  const move = (e) => {
    if (reduced()) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTilt({ x: -((e.clientY - r.top) / r.height - 0.5) * 10, y: ((e.clientX - r.left) / r.width - 0.5) * 14 });
  };
  const key = (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); turn(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); turn(-1); } };

  return (
    <div className="demo3d">
      <div className="stage" role="group" aria-roledescription="carousel" aria-label="3D cube tour. Use the left and right arrow keys or the buttons to turn it."
        tabIndex={0} onPointerMove={move} onPointerLeave={() => setTilt({ x: 0, y: 0 })} onKeyDown={key}>
        <div className="tilt3d" style={{ transform: `rotateX(${-14 + tilt.x}deg) rotateY(${tilt.y}deg)` }}>
          <div className="ring3d" style={{ transform: `translateZ(calc(var(--w) / -2)) rotateY(${-step * 90}deg)` }}>
            <div className="face top" aria-hidden="true" style={{ transform: 'rotateX(90deg) translateZ(calc(var(--w) / 2))' }}>
              <span className="top-flower">✿</span><strong>AbilityConnect SA</strong>
            </div>
            {faces.map((p, i) => (
              <section key={p.key} className={'face' + (i === cur ? ' on' : '')} role="group" aria-roledescription="slide"
                aria-label={`Face ${i + 1} of ${n}: ${p.title}`} aria-hidden={i === cur ? undefined : 'true'} inert={i === cur ? undefined : ''}
                style={{ transform: `rotateY(${i * 90}deg) translateZ(calc(var(--w) / 2))` }}>
                <div className="face-media">{p.video ? <Slot name="welcome" className="wide" /> : <Slot name={p.slot} className="face-img" />}</div>
                <div className="face-text">
                  <h3>{p.title}</h3><p>{p.text}</p>
                  <div className="btnrow">
                    {!preview && p.page && <button className="btn sm gold" onClick={() => go(p.page)}>Open</button>}
                    <button className="btn sm" onClick={() => turn(1)}>Turn ↻</button>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
      <div className="demo-controls">
        <button className="btn alt sm" onClick={() => turn(-1)}>◀ Previous</button>
        <button className="btn sm" onClick={() => turn(1)}>Next ▶</button>
        <button className="btn alt sm" aria-pressed={playing} disabled={reduced()} onClick={() => setPlaying(!playing)}>{playing ? '⏸ Pause' : '▶ Auto-turn'}</button>
        <span className="dots">
          {faces.map((p, i) => <button key={p.key} className="dot" aria-label={`Show ${p.title}`} aria-current={i === cur ? 'true' : undefined} onClick={() => turn((i - cur + n) % n)} />)}
        </span>
      </div>
      <p className="small" aria-live="polite">Face {cur + 1} of {n}: {faces[cur].title}</p>
    </div>
  );
}
