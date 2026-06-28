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
function loadStates() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } }

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

function Zh({ s, cls = "" }) {
  return <span className={cls}>{parseZh(s).map((t, i) => <ruby key={i} className="rb">{t.c}<rt>{t.p}</rt></ruby>)}</span>;
}
function Frame({ pattern }) {
  return (
    <div className="frame">
      {parsePattern(pattern).map((t, i) =>
        t.kind === "anchor" ? <ruby key={i} className="rb anchor">{t.c}<rt>{t.p}</rt></ruby>
        : t.kind === "slot" ? <span key={i} className="slot">{t.v}</span>
        : <span key={i} className="pw">{t.v}</span>
      )}
    </div>
  );
}
function Dot({ state, pulse }) { return <span className={"dot " + state + (pulse ? " pulse" : "")} title={STATE_LABEL[state]} />; }
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
  const [score, setScore] = useState(0);
  const [empty, setEmpty] = useState(false);
  const [justKnown, setJustKnown] = useState(null);

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

  const learningQueue = structures.filter((s) => s.state === "learning").slice(0, 4);
  const newQueue = structures.filter((s) => s.state === "new").slice(0, 3);
  const grouped = useMemo(
    () => CATS.map(([k, l]) => [l, k, structures.filter((s) => s.cat === k)]).filter(([, , a]) => a.length),
    [structures]
  );

  function startPractice(s) {
    setActive(s); setView("practice"); setIdx(0);
    setInput(""); setResult(null); setScore(0); setShowPy(false); setRevealed(false);
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
    setResult(r); setGrading(false);
  }

  function selfMark(ok) { if (ok) setScore((x) => x + 1); setResult({ correct: ok, source: "self" }); }

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
    setResult(null); setInput(""); setShowPy(false); setRevealed(false); setIdx((i) => i + 1);
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
        {view !== "practice" && (
          <nav className="tabs">
            <button className={tab === "today" ? "tab on" : "tab"} onClick={() => setTab("today")}>Today</button>
            <button className={tab === "library" ? "tab on" : "tab"} onClick={() => setTab("library")}>Library</button>
          </nav>
        )}
      </header>

      {view === "home" && tab === "today" && (
        <main className="wrap">
          <div className="lead"><h1>Today</h1><p>A short queue, not the whole list. {counts.learning + counts.known} of {total} patterns underway.</p></div>
          <div className="progwrap"><div className={"progbar" + (justKnown ? " bump" : "") + (pct === 100 ? " full" : "")}><span style={{ width: pct + "%" }} /></div><span className="progtxt">{counts.known} known · {counts.learning} learning · {counts.new} new</span></div>
          {learningQueue.length > 0 && <section className="qsec"><h2 className="qhead">Keep going</h2>{learningQueue.map((s, i) => <Row key={s.id} s={s} i={i} pulse={s.id === justKnown} onGo={() => startPractice(s)} />)}</section>}
          {newQueue.length > 0 && <section className="qsec"><h2 className="qhead">Start something new</h2>{newQueue.map((s, i) => <Row key={s.id} s={s} i={learningQueue.length + i} pulse={s.id === justKnown} onGo={() => startPractice(s)} />)}</section>}
          {learningQueue.length === 0 && newQueue.length === 0 && <div className="note">Everything's marked known — open the Library to review anything you like.</div>}
        </main>
      )}

      {view === "home" && tab === "library" && (
        <main className="wrap">
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
        <main className="wrap">
          <button className="back" onClick={() => setView("home")}>← Back</button>
          <div className="lead"><span className="kicker">{active.name}</span><Frame pattern={active.pattern} /></div>

          {empty && <div className="note">No exercises for this one yet. Run <code>npm run gen</code> with your API key to build its bank.</div>}

          {!empty && ex && (
            <section className="ex">
              <div className="exhead"><span className="extype">{TYPE_LABEL[ex.type] || ex.type}</span><span className="prog">{sessDone} of {exercises.length} done</span></div>
              <div className={"exprog" + (sessPct === 100 ? " done" : "")}><span style={{ width: sessPct + "%" }} /></div>
              <p className="prompt">{ex.prompt}</p>
              {ex.pinyin && (showPy ? <p className="pyline">{ex.pinyin}</p> : <button className="pylink" onClick={() => setShowPy(true)}>show pinyin</button>)}
              {ex.hint && <p className="hint">hint · {ex.hint}</p>}

              {!result && <textarea className="answer" rows={2} placeholder="Your answer…" value={input} onChange={(e) => setInput(e.target.value)} />}

              {!result && (
                prodOfflineReveal ? (
                  !revealed ? (
                    <button className="btn" onClick={() => setRevealed(true)} disabled={!input.trim()}>Reveal model answer</button>
                  ) : (
                    <div className="fb neutral">
                      <div className="verdict">Model answer</div>
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
              <div className="bignum">{score}<span>/ {exercises.length}</span></div>
              <p>Marked <strong>{STATE_LABEL[structures.find((s) => s.id === active.id)?.state] || "Learning"}</strong> and saved to this device.</p>
              <div className="row"><button className="btn" onClick={() => startPractice(active)}>Again</button><button className="btn ghost" onClick={() => setView("home")}>Done</button></div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
