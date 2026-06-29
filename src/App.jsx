import React, { useState, useMemo, useEffect } from "react";
import { STRUCTURES, CATS, CAT_LABEL } from "./structures";
import banks from "./banks.json";
import { gradeClosed, isProduction } from "./grade";

const TYPE_LABEL = {
  cloze: "Fill the blank", translate_e2c: "Translate to Chinese", translate_c2e: "Translate to English",
  error_correction: "Fix the mistake", production: "Write your own",
};
const STATE_LABEL = { new: "New", learning: "Learning", known: "Known" };
const SLOTS = new Set(["A","B","C","S","O","N","V","X","adj","adv","num","mw","place","time","sth","sb","vehicle","thing","方位词"]);
const STORE_KEY = "frame.states.v1";

function parseZh(str) {
  return str.split(/\s+/).filter(Boolean).map((tok) => {
    const i = tok.indexOf("|");
    return i === -1 ? { c: tok, p: "" } : { c: tok.slice(0, i), p: tok.slice(i + 1) };
  });
}
function parsePattern(str) {
  return str.split(/\s+/).filter(Boolean).map((tok) => {
    if (tok.includes("|")) { const i = tok.indexOf("|"); return { kind: "anchor", c: tok.slice(0, i), p: tok.slice(i + 1) }; }
    if (SLOTS.has(tok) || /^[A-Z]$/.test(tok)) return { kind: "slot", v: tok };
    return { kind: "plain", v: tok };
  });
}
function shuffle(a) { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }
const zhPlain = (s = "") => s.split(/\s+/).map((t) => t.split("|")[0]).join("");
function loadStates() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } }

const ACT_KEY = "frame.activity.v1";
function dayKey(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), a = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${a}`; }
function loadActivity() { try { return JSON.parse(localStorage.getItem(ACT_KEY)) || {}; } catch { return {}; } }
function computeStreak(act) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const cur = new Date(t);
  if (!act[dayKey(cur)]) cur.setDate(cur.getDate() - 1); // today still open — count the run up to yesterday
  let n = 0;
  while (act[dayKey(cur)]) { n++; cur.setDate(cur.getDate() - 1); }
  return n;
}
function heatCells(act, weeks) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const start = new Date(t); start.setDate(start.getDate() - t.getDay() - (weeks - 1) * 7); // Sunday of the earliest week
  const cols = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let r = 0; r < 7; r++) { const d = new Date(start); d.setDate(start.getDate() + w * 7 + r); const k = dayKey(d); col.push({ k, count: act[k] || 0, future: d > t }); }
    cols.push(col);
  }
  return cols;
}

function useOnline() {
  const [on, setOn] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on;
}

async function aiGrade(ex, user) {
  const res = await fetch("/api/grade", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: ex.type, prompt: ex.prompt, answer: ex.answer, user }),
  });
  if (!res.ok) throw new Error("grade " + res.status);
  return res.json();
}

const TONE_MARKS = {
  1: "āēīōūǖĀĒĪŌŪǕ", 2: "áéíóúǘÁÉÍÓÚǗ",
  3: "ǎěǐǒǔǚǍĚǏǑǓǙ", 4: "àèìòùǜÀÈÌÒÙǛ",
};
function pinyinTone(py = "") {
  for (const ch of py) for (const t of [1, 2, 3, 4]) if (TONE_MARKS[t].includes(ch)) return t;
  return 0;
}
const hasHan = (s = "") => /[㐀-鿿]/.test(s);
function cleanForSpeech(text = "") {
  return String(text)
    // blanks (___ / －－ / …) become a short pause, not spoken symbols
    .replace(/(\s*(?:[_＿\-—–.·]{2,}|…)\s*)+/g, "，")
    .replace(/\s{2,}/g, " ")
    .replace(/^[，,、\s]+|[，,、\s]+$/g, "")
    .trim();
}
function speak(text) {
  try {
    const synth = window.speechSynthesis;
    const clean = cleanForSpeech(text);
    if (!synth || !clean) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = hasHan(clean) ? "zh-CN" : "en-US";
    u.rate = 0.85;
    synth.speak(u);
  } catch {}
}
function Speaker({ text, label = "Listen" }) {
  if (!text || typeof window === "undefined" || !window.speechSynthesis) return null;
  return (
    <button type="button" className="spk" onClick={() => speak(text)} title={label} aria-label={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a8 8 0 0 1 0 13" />
      </svg>
    </button>
  );
}

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2c.3 2.5-1.2 3.8-2.3 5.2C8.4 8.8 7 10.4 7 13a5 5 0 0 0 10 0c0-1.7-.7-3-1.6-4.2.1 1.3-.8 2.1-1.6 2.2.9-2.4-.6-4.7-1.8-9z" />
    </svg>
  );
}

const prefersReduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function CountUp({ value, dur = 700 }) {
  const [n, setN] = useState(() => (prefersReduced() ? value : 0));
  useEffect(() => {
    if (prefersReduced() || value <= 0) { setN(value); return; }
    let raf, start = null;
    const step = (ts) => {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      setN(Math.round((1 - Math.pow(1 - p, 3)) * value));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);
  return <>{n}</>;
}

function Confetti({ count = 30 }) {
  const [show, setShow] = useState(true);
  const pieces = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      id: i, left: Math.random() * 100, delay: Math.random() * 0.25,
      dur: 1.7 + Math.random() * 1.3, w: 6 + Math.random() * 6,
      color: ["var(--jade)", "var(--gold)", "var(--jade-d)", "var(--tone1)", "var(--tone4)"][i % 5],
    })),
    [count]
  );
  useEffect(() => {
    if (prefersReduced()) { setShow(false); return; }
    const t = setTimeout(() => setShow(false), 3200);
    return () => clearTimeout(t);
  }, []);
  if (!show || prefersReduced()) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span key={p.id} style={{ left: p.left + "%", width: p.w, height: p.w * 0.5, background: p.color, animationDelay: p.delay + "s", animationDuration: p.dur + "s" }} />
      ))}
    </div>
  );
}

function Zh({ s, cls = "" }) {
  return <span className={cls}>{parseZh(s).map((t, i) => <ruby key={i} className={"rb t" + pinyinTone(t.p)}>{t.c}<rt>{t.p}</rt></ruby>)}</span>;
}
function Frame({ pattern }) {
  return (
    <div className="frame">
      {parsePattern(pattern).map((t, i) =>
        t.kind === "anchor" ? <ruby key={i} className={"rb anchor t" + pinyinTone(t.p)}>{t.c}<rt>{t.p}</rt></ruby>
        : t.kind === "slot" ? <span key={i} className="slot">{t.v}</span>
        : <span key={i} className="pw">{t.v}</span>
      )}
    </div>
  );
}
function Dot({ state, pulse }) { return <span className={"dot " + state + (pulse ? " pulse" : "")} title={STATE_LABEL[state]} />; }
function ThemeIcon({ dark }) {
  return dark ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
function Row({ s, onGo, i = 0, pulse }) {
  return (
    <div className="trow rise" style={{ animationDelay: i * 45 + "ms" }}>
      <Dot state={s.state} pulse={pulse} />
      <span className="tname">{s.name}</span>
      <span className="tcat">{CAT_LABEL[s.cat]}</span>
      <button className="btn small" onClick={onGo}>Practice</button>
    </div>
  );
}

export default function App() {
  const online = useOnline();
  const [theme, setTheme] = useState(() => {
    try { const t = localStorage.getItem("frame.theme.v1"); if (t) return t; } catch {}
    return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("frame.theme.v1", theme); } catch {}
  }, [theme]);
  const [tones, setTones] = useState(() => {
    try { return localStorage.getItem("frame.tones.v1") === "on"; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-tones", tones ? "on" : "off");
    try { localStorage.setItem("frame.tones.v1", tones ? "on" : "off"); } catch {}
  }, [tones]);
  const [structures, setStructures] = useState(() => {
    const saved = loadStates();
    return STRUCTURES.map((s) => ({ ...s, state: saved[s.id]?.state || "new", lastScore: saved[s.id]?.lastScore ?? null }));
  });
  const [tab, setTab] = useState("today");
  const [view, setView] = useState("home");
  const [active, setActive] = useState(null);
  const [openCats, setOpenCats] = useState({});

  const [exercises, setExercises] = useState([]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [showPy, setShowPy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [score, setScore] = useState(0);
  const [empty, setEmpty] = useState(false);
  const [justKnown, setJustKnown] = useState(null);
  const [activity, setActivity] = useState(loadActivity);

  useEffect(() => {
    if (!justKnown) return;
    const t = setTimeout(() => setJustKnown(null), 2200);
    return () => clearTimeout(t);
  }, [justKnown]);

  useEffect(() => {
    const map = {};
    structures.forEach((s) => (map[s.id] = { state: s.state, lastScore: s.lastScore }));
    try { localStorage.setItem(STORE_KEY, JSON.stringify(map)); } catch {}
  }, [structures]);

  const counts = useMemo(() => {
    const c = { new: 0, learning: 0, known: 0 };
    structures.forEach((s) => (c[s.state] = (c[s.state] || 0) + 1));
    return c;
  }, [structures]);

  const streak = useMemo(() => computeStreak(activity), [activity]);
  const heat = useMemo(() => heatCells(activity, 10), [activity]);
  function markToday() {
    const k = dayKey(new Date());
    setActivity((a) => { const n = { ...a, [k]: (a[k] || 0) + 1 }; try { localStorage.setItem(ACT_KEY, JSON.stringify(n)); } catch {} return n; });
  }

  const learningQueue = structures.filter((s) => s.state === "learning").slice(0, 4);
  const newQueue = structures.filter((s) => s.state === "new").slice(0, 3);
  const grouped = useMemo(
    () => CATS.map(([k, l]) => [l, k, structures.filter((s) => s.cat === k)]).filter(([, , a]) => a.length),
    [structures]
  );

  function startPractice(s) {
    setActive(s); setView("practice"); setIdx(0);
    setInput(""); setResult(null); setScore(0); setShowPy(false); setRevealed(false); setDrawerOpen(false);
    const bank = banks[s.id] || [];
    if (!bank.length) { setExercises([]); setEmpty(true); return; }
    setEmpty(false);
    setExercises(shuffle(bank).slice(0, 5));
  }

  async function check() {
    const ex = exercises[idx];
    if (!input.trim() || grading) return;
    if (isProduction(ex) && !online) { setRevealed(true); return; }

    setGrading(true);
    let r = null;
    if (online) {
      try { r = { ...(await aiGrade(ex, input)), source: "ai" }; } catch { r = null; }
    }
    if (!r) {
      if (isProduction(ex)) { setGrading(false); setRevealed(true); return; }
      r = { correct: gradeClosed(ex, input), correction: ex.answer, source: "local" };
    }
    if (r.correct) setScore((x) => x + 1);
    markToday();
    setResult(r); setGrading(false);
  }

  function selfMark(ok) { if (ok) setScore((x) => x + 1); markToday(); setResult({ correct: ok, source: "self" }); }

  function commit(finalScore) {
    const ratio = exercises.length ? finalScore / exercises.length : 0;
    setStructures((arr) => arr.map((s) => {
      if (s.id !== active.id) return s;
      let ns = s.state;
      if (ratio >= 0.6) ns = s.state === "new" ? "learning" : "known";
      else if (s.state === "new") ns = "learning";
      if (ns === "known" && s.state !== "known") setJustKnown(s.id);
      return { ...s, state: ns, lastScore: ratio };
    }));
  }
  function next() {
    if (idx + 1 >= exercises.length) commit(score);
    setResult(null); setInput(""); setShowPy(false); setRevealed(false); setDrawerOpen(false); setIdx((i) => i + 1);
  }

  const ex = exercises[idx];
  const done = exercises.length > 0 && idx >= exercises.length;
  const total = structures.length;
  const pct = Math.round((counts.known / total) * 100);
  const sessDone = idx + (result ? 1 : 0);
  const sessPct = exercises.length ? Math.round((sessDone / exercises.length) * 100) : 0;
  const prodOfflineReveal = ex && isProduction(ex) && !online;

  return (
    <div className="root">
      {!online && <div className="offbar">You're offline — grading from your saved bank. AI feedback returns when you reconnect.</div>}

      <header className="bar">
        <div className="brand">
          <span className="seal">字</span>
          <div><div className="title">Frame</div><div className="sub">grammar patterns, drilled</div></div>
        </div>
        <div className="barright">
          {view !== "practice" && (
            <nav className="tabs">
              <button className={tab === "today" ? "tab on" : "tab"} onClick={() => setTab("today")}>Today</button>
              <button className={tab === "library" ? "tab on" : "tab"} onClick={() => setTab("library")}>Library</button>
            </nav>
          )}
          <button
            className={tones ? "tonetog on" : "tonetog"}
            onClick={() => setTones((v) => !v)}
            title={tones ? "Tone colors on" : "Tone colors off"}
            aria-label="Toggle tone colors"
          >
            <span className="t1">ā</span><span className="t2">á</span><span className="t3">ǎ</span><span className="t4">à</span>
          </button>
          <button
            className="themetog"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle dark mode"
          >
            <ThemeIcon dark={theme === "dark"} />
          </button>
        </div>
      </header>

      {view === "home" && tab === "today" && (
        <main className="wrap viewfade">
          <div className="lead"><h1>Today</h1><p>A few patterns to get you started.</p></div>
          <div className="progwrap"><div className={"progbar" + (justKnown ? " bump" : "") + (pct === 100 ? " full" : "")}><span style={{ width: pct + "%" }} /></div><span className="progtxt">{counts.known} known · {counts.learning} learning · {counts.new} new</span></div>
          <section className="streakwrap rise">
            <div className="streak"><span className="flame"><FlameIcon /></span><div><div className="streaknum">{streak}</div><div className="streaklbl">day streak</div></div></div>
            <div className="heat" title="Your last 10 weeks of practice">
              {heat.map((col, ci) => (
                <div className="heatcol" key={ci}>
                  {col.map((c, ri) => <span key={ri} className={"heatcell l" + Math.min(c.count, 3) + (c.future ? " fut" : "")} />)}
                </div>
              ))}
            </div>
          </section>
          {learningQueue.length > 0 && <section className="qsec"><h2 className="qhead">Keep going</h2>{learningQueue.map((s, i) => <Row key={s.id} s={s} i={i} pulse={s.id === justKnown} onGo={() => startPractice(s)} />)}</section>}
          {newQueue.length > 0 && <section className="qsec"><h2 className="qhead">Start something new</h2>{newQueue.map((s, i) => <Row key={s.id} s={s} i={learningQueue.length + i} pulse={s.id === justKnown} onGo={() => startPractice(s)} />)}</section>}
          {learningQueue.length === 0 && newQueue.length === 0 && <div className="note">Everything's marked known — open the Library to review anything you like.</div>}
        </main>
      )}

      {view === "home" && tab === "library" && (
        <main className="wrap viewfade">
          <div className="lead"><h1>Library</h1><p>{total} patterns across {grouped.length} groups. Tap a group to open it.</p></div>
          {grouped.map(([label, key, arr]) => {
            const known = arr.filter((s) => s.state === "known").length;
            const open = openCats[key];
            return (
              <section key={key} className="catblock">
                <button className="catbar" onClick={() => setOpenCats((o) => ({ ...o, [key]: !o[key] }))}>
                  <span className={open ? "chev open" : "chev"}>›</span>
                  <span className="catname">{label}</span>
                  <span className="catprog"><span className="mini"><span style={{ width: (known / arr.length) * 100 + "%" }} /></span>{known}/{arr.length}</span>
                </button>
                {open && (
                  <div className="grid">
                    {arr.map((s, i) => (
                      <article key={s.id} className="card rise" style={{ animationDelay: i * 35 + "ms" }}>
                        <div className="cardhead"><span className="kicker">{s.name}</span><Dot state={s.state} pulse={s.id === justKnown} /></div>
                        <Frame pattern={s.pattern} />
                        {s.rule && <p className="rule">{s.rule}</p>}
                        {s.zh && <div className="exline"><Zh s={s.zh} cls="exzh" />{s.en && <span className="exen">{s.en}</span>}</div>}
                        <button className="btn" onClick={() => startPractice(s)}>Practice →</button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </main>
      )}

      {view === "practice" && active && (
        <main className="wrap viewfade">
          <button className="back" onClick={() => setView("home")}>← Back</button>
          <div className="lead"><span className="kicker">{active.name}</span><Frame pattern={active.pattern} /></div>

          {empty && <div className="note">No exercises for this one yet. Run <code>npm run gen</code> with your API key to build its bank.</div>}

          {!empty && ex && (
            <section className="ex">
              <div className="exhead"><span className="extype">{TYPE_LABEL[ex.type] || ex.type}</span><span className="prog">{sessDone} of {exercises.length} done</span></div>
              <div className={"exprog" + (sessPct === 100 ? " done" : "")}><span style={{ width: sessPct + "%" }} /></div>
              <div className="promptrow"><p className="prompt">{ex.prompt}</p><Speaker text={ex.prompt} label="Listen to the prompt" /></div>
              {ex.pinyin && (showPy ? <p className="pyline">{ex.pinyin}</p> : <button className="pylink" onClick={() => setShowPy(true)}>show pinyin</button>)}
              {ex.hint && <p className="hint">hint · {ex.hint}</p>}

              {!result && <textarea className="answer" rows={2} placeholder="Your answer…" value={input} onChange={(e) => setInput(e.target.value)} />}

              {!result && (
                prodOfflineReveal ? (
                  !revealed ? (
                    <button className="btn" onClick={() => setRevealed(true)} disabled={!input.trim()}>Reveal model answer</button>
                  ) : (
                    <div className="fb neutral">
                      <div className="verdict">Model answer<Speaker text={ex.answer} label="Listen to the answer" /></div>
                      <p className="corr"><span>e.g.</span> {ex.answer}</p>
                      <p className="selfq">Did yours work?</p>
                      <div className="row"><button className="btn" onClick={() => selfMark(true)}>Got it</button><button className="btn ghost" onClick={() => selfMark(false)}>Missed it</button></div>
                    </div>
                  )
                ) : (
                  <button className="btn" onClick={check} disabled={grading || !input.trim()}>{grading ? "Checking…" : "Check"}</button>
                )
              )}

              {result && (
                <div className={result.correct ? "fb good" : "fb bad"}>
                  <div className="verdict">
                    {result.correct ? "Correct" : "Not quite"}
                    <span className="src">{result.source === "ai" ? "AI-checked" : result.source === "self" ? "self-marked" : "offline check"}</span>
                    <Speaker text={result.correction || ex.answer} label="Listen to the answer" />
                  </div>
                  {result.feedback && <p>{result.feedback}</p>}
                  {!result.correct && (result.correction || ex.answer) && <p className="corr"><span>Answer:</span> {result.correction || ex.answer}</p>}
                  <button className="btn" onClick={next}>{idx + 1 < exercises.length ? "Next →" : "Finish"}</button>
                </div>
              )}
            </section>
          )}

          {done && (
            <section className="ex summary">
              {score / exercises.length >= 0.6 && <Confetti />}
              <div className="bignum"><CountUp value={score} /><span>/ {exercises.length}</span></div>
              <p>Marked <strong>{STATE_LABEL[structures.find((s) => s.id === active.id)?.state] || "Learning"}</strong> and saved to this device.</p>
              <div className="row"><button className="btn" onClick={() => startPractice(active)}>Again</button><button className="btn ghost" onClick={() => setView("home")}>Done</button></div>
            </section>
          )}

          {!empty && ex && !done && (
            <>
              <button className={"drawertab" + (drawerOpen ? " up" : "")} onClick={() => setDrawerOpen(true)}>
                <span className="dtword">译</span> Words ▴
              </button>
              {drawerOpen && <div className="drawerback" onClick={() => setDrawerOpen(false)} />}
              <div className={"drawer" + (drawerOpen ? " open" : "")} role="dialog" aria-label="Word translations">
                <div className="drawerhead">
                  <span>{ex.vocab?.length ? "Words in this exercise" : "About this pattern"}</span>
                  <button className="drawerx" onClick={() => setDrawerOpen(false)} aria-label="Close">×</button>
                </div>
                <div className="drawerbody">
                  {ex.vocab?.length ? (
                    <ul className="vocab">
                      {ex.vocab.map((v, i) => (
                        <li key={i}>
                          <ruby className={"rb t" + pinyinTone(v.py)}>{v.w}<rt>{v.py}</rt></ruby>
                          <span className="ven">{v.en}</span>
                          <Speaker text={v.w} label={"Listen to " + v.w} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="patref">
                      <Frame pattern={active.pattern} />
                      {active.rule && <p className="rule">{active.rule}</p>}
                      {active.zh && (
                        <div className="exline">
                          <Zh s={active.zh} cls="exzh" />{active.en && <span className="exen">{active.en}</span>}
                          <div className="row"><Speaker text={zhPlain(active.zh)} label="Listen to the example" /></div>
                        </div>
                      )}
                      <p className="drawernote">Per-word glosses appear here once this structure's bank is regenerated.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      )}
    </div>
  );
}
