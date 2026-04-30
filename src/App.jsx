import { useState } from "react";

const PROXY_URL = "https://career-strategist-backend-production.up.railway.app/api/analyse";

const C = {
  bg: "#08090D", surface: "#0F1018", card: "#13141F", cardHover: "#181928",
  border: "#1E2030", borderLight: "#252740",
  accent: "#6B5CE7", accentBright: "#8B7CF8",
  amber: "#F59E0B", green: "#10B981", red: "#EF4444",
  text: "#E2E4F0", textMuted: "#8892B0",
};


// ── cleanInput ────────────────────────────────────────────────
function cleanInput(raw, maxChars) {
  if (!raw || typeof raw !== "string") return "";
  let text = raw;
  text = text.split("\r\n").join("\n").split("\r").join("\n");
  text = text.split("\u2018").join("'").split("\u2019").join("'");
  text = text.split("\u201C").join('"').split("\u201D").join('"');
  text = text.split("\u2013").join("-").split("\u2014").join("-");
  text = text.split("\u00A0").join(" ").split("\u2022").join("-");
  text = text.split("\u00B7").join("-").split("\t").join(" ");
  const lines = text.split("\n");
  const cleaned = [];
  let blankCount = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    while (line.indexOf("  ") !== -1) line = line.split("  ").join(" ");
    line = line.trim();
    if (line === "") {
      blankCount++;
      if (blankCount <= 1) cleaned.push("");
    } else {
      blankCount = 0;
      cleaned.push(line);
    }
  }
  text = cleaned.join("\n").trim();
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    const lastNewline = text.lastIndexOf("\n");
    if (lastNewline > maxChars * 0.8) text = text.slice(0, lastNewline);
    text = text.trim();
  }
  return text;
}

// ── callClaude ────────────────────────────────────────────────
async function callClaude(cv, jd) {
  const safeCv = cleanInput(cv, 5500);
  const safeJd = cleanInput(jd, 7500);
  if (!safeCv) throw new Error("CV_EMPTY");
  if (!safeJd) throw new Error("JD_EMPTY");

  let res, data;
  try {
    res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cv: safeCv, jd: safeJd }),
    });
  } catch {
    throw new Error("NETWORK_ERROR");
  }

  try { data = await res.json(); } catch { throw new Error("PARSE_ERROR"); }

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (res.status === 404) throw new Error("SERVER_404");
  if (!res.ok || data.error) throw new Error(data.error || "HTTP_" + res.status);

  let clean = "";
  if (data.result) {
    clean = data.result;
  } else if (data.content && data.content.length > 0) {
    const raw = data.content.filter(b => b.type === "text").map(b => b.text || "").join("");
    if (!raw) throw new Error("EMPTY_RESPONSE");
    const stripped = raw.split("\n").filter(line => !line.startsWith("```")).join("\n").trim();
    const s = stripped.indexOf("{");
    const e = stripped.lastIndexOf("}");
    if (s === -1 || e === -1) throw new Error("NO_JSON");
    clean = stripped.slice(s, e + 1);
  } else {
    throw new Error("EMPTY_RESPONSE");
  }

  clean = clean
    .split("\u2018").join("'").split("\u2019").join("'")
    .split("\u201C").join('"').split("\u201D").join('"')
    .split("\u2013").join("-").split("\u2014").join("-")
    .split("\u00A3").join("GBP ");

  try { return JSON.parse(clean); } catch { throw new Error("INVALID_JSON"); }
}

// ── Helpers ────────────────────────────────────────────────────
function pipeSplit(str) {
  return (str || "").split("|").map(s => s.trim()).filter(Boolean);
}

function BulletList({ items, dotColor, textSize = 13 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((line, i) => (
        <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <div style={{ width: 5, height: 5, background: dotColor, borderRadius: "50%", marginTop: 6, flexShrink: 0 }} />
          <p style={{ fontSize: textSize, color: C.text, lineHeight: 1.6, fontFamily: "'IBM Plex Sans'" }}>{line}</p>
        </div>
      ))}
    </div>
  );
}

function ActionList({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {items.map((line, i) => (
        <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <div style={{ fontSize: 14, color: C.accentBright, fontFamily: "'IBM Plex Mono'", marginTop: 1, flexShrink: 0 }}>→</div>
          <p style={{ fontSize: 14, color: C.text, lineHeight: 1.7, fontFamily: "'IBM Plex Sans'" }}>{line}</p>
        </div>
      ))}
    </div>
  );
}

function Pill({ label, value, type }) {
  const col = {
    good: { dot: C.green, text: C.green, border: "rgba(16,185,129,0.25)" },
    warn: { dot: C.amber, text: C.amber, border: "rgba(245,158,11,0.25)" },
    bad:  { dot: C.red,   text: C.red,   border: "rgba(239,68,68,0.25)" },
    neu:  { dot: C.accentBright, text: C.accentBright, border: "rgba(139,124,248,0.25)" },
  }[type] || { dot: C.accentBright, text: C.accentBright, border: "rgba(139,124,248,0.25)" };
  const dots = value === "High" || value === "Aligned" || value === "Strong" ? 3
             : value === "Medium" || value === "Moderate" || value === "Slight stretch" ? 2 : 1;
  return (
    <div style={{ flex: 1, borderRight: `1px solid ${C.border}`, padding: "0 24px" }}>
      <div style={{ fontSize: 9, letterSpacing: 2, color: C.textMuted, fontFamily: "'IBM Plex Mono'", marginBottom: 10, opacity: 0.7 }}>{label}</div>
      <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i <= dots ? col.dot : C.border }} />
        ))}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: col.text }}>{value}</div>
    </div>
  );
}

function Label({ children, color }) {
  return (
    <div style={{ fontSize: 11, letterSpacing: 3, color: color || C.textMuted, fontFamily: "'IBM Plex Mono'", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 3, height: 12, background: color || C.accent, borderRadius: 2, flexShrink: 0 }} />
      {children}
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", minWidth: 0, wordBreak: "break-word", ...style }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: `1px solid ${C.border}`, margin: "12px 0" }} />;
}

function QCard({ q, whyAsking, intent, approach, mistake, num }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${open ? C.borderLight : C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: open ? C.cardHover : C.card, border: "none", padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left" }}>
        <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono'", color: C.accent, minWidth: 20, paddingTop: 2 }}>Q{num}</span>
        <span style={{ fontSize: 14, color: C.text, fontFamily: "'IBM Plex Sans'", flex: 1, lineHeight: 1.55 }}>{q}</span>
        <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 6, background: open ? C.accent : "rgba(107,92,231,0.12)", border: `1px solid ${open ? C.accent : "rgba(107,92,231,0.25)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: open ? "#fff" : C.accentBright, fontSize: 12, display: "block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
        </div>
      </button>
      {open && (
        <div style={{ background: C.surface, padding: "14px 16px", display: "grid", gap: 12 }}>
          <div style={{ background: `${C.amber}10`, border: `1px solid ${C.amber}30`, borderRadius: 6, padding: "8px 12px" }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: C.amber, marginBottom: 4, fontFamily: "'IBM Plex Mono'" }}>WHY THEY'RE ASKING THIS</div>
            <p style={{ fontSize: 14, color: C.text, lineHeight: 1.65, fontFamily: "'IBM Plex Sans'", fontWeight: 500 }}>{whyAsking}</p>
          </div>
          {[["WHAT A STRONG ANSWER SHOWS", intent, C.accentBright], ["HOW YOU SHOULD APPROACH IT", approach, C.green], ["MISTAKE TO AVOID", mistake, C.red]].map(([lbl, val, col]) => (
            <div key={lbl}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: col, marginBottom: 5, fontFamily: "'IBM Plex Mono'" }}>{lbl}</div>
              <p style={{ fontSize: 14, color: C.text, lineHeight: 1.7, fontFamily: "'IBM Plex Sans'" }}>{val}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MindsetBanner({ text, verdict }) {
  const isStrong = verdict === "Strong fit";
  const isSkip = verdict === "Low probability";
  const col = isStrong ? C.green : isSkip ? C.red : C.amber;
  const bg = isStrong ? "rgba(16,185,129,0.12)" : isSkip ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)";
  const border = isStrong ? "rgba(16,185,129,0.3)" : isSkip ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)";
  const Icon = () => isStrong
    ? <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{flexShrink:0}}><circle cx="10" cy="10" r="8" stroke={col} strokeWidth="1.5"/><path d="M6.5 10.5l2.5 2.5 4.5-5" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    : isSkip
    ? <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{flexShrink:0}}><circle cx="10" cy="10" r="8" stroke={col} strokeWidth="1.5"/><path d="M7 7l6 6M13 7l-6 6" stroke={col} strokeWidth="1.5" strokeLinecap="round"/></svg>
    : <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{flexShrink:0}}><polygon points="10,3 18,17 2,17" fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="round"/><line x1="10" y1="9" x2="10" y2="13" stroke={col} strokeWidth="1.5" strokeLinecap="round"/><circle cx="10" cy="15.5" r="0.8" fill={col}/></svg>;
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "16px 20px", marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 14 }}>
      <Icon />
      <p style={{ fontSize: 17, color: col, fontWeight: 600, fontFamily: "'IBM Plex Sans'", lineHeight: 1.5, margin: 0 }}>{text}</p>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("input");
  const [cv, setCv] = useState("");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [copiedPitch, setCopiedPitch] = useState(false);
  const [copiedAnswer, setCopiedAnswer] = useState(false);

  const LOADING_MESSAGES = [
    "Reading the room…", "Thinking like a hiring manager…",
    "Checking your positioning…", "Almost there, just a moment…",
    "Pulling the honest read…", "Analysing your fit…", "Finding your edge…",
  ];

  const handleAnalyse = async () => {
    if (!cv.trim()) { setError("Paste your CV on the left to get started."); return; }
    if (!jd.trim()) { setError("Paste a job description to continue."); return; }
    if (loading) return;
    setError(""); setLoading(true); setResult(null);
    setLoadingMsg(LOADING_MESSAGES[0]);
    let msgIndex = 0;
    const msgInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[msgIndex]);
    }, 2200);
    try {
      const data = await callClaude(cv, jd);
      clearInterval(msgInterval);
      setResult(data); setScreen("result");
    } catch (err) {
      clearInterval(msgInterval);
      const msg = err.message || "";
      if (msg === "CV_EMPTY") setError("Paste your CV on the left to get started.");
      else if (msg === "JD_EMPTY") setError("Paste a job description to continue.");
      else if (msg === "RATE_LIMITED" || msg.includes("429")) setError("You're on a roll. Check back in an hour.");
      else if (msg === "NETWORK_ERROR" || msg.includes("fetch")) setError("Can't reach the server. Check your connection and try again.");
      else if (msg === "SERVER_404") setError("The server is unavailable right now. Try again in a moment.");
      else if (["EMPTY_RESPONSE","NO_JSON","INVALID_JSON","PARSE_ERROR"].includes(msg)) setError("The analysis returned an unexpected response. Try again.");
      else setError("Something went wrong. Give it a moment and try again.");
    }
    setLoading(false);
  };

  const copyText = (text, setter) => {
    navigator.clipboard.writeText(text);
    setter(true); setTimeout(() => setter(false), 2000);
  };

  const applyColor = v => v === "Apply now" ? C.green : v === "Skip this one" ? C.red : C.amber;
  const fitColor   = v => v === "Strong fit" ? C.green : v === "Low probability" ? C.red : C.amber;

  // ── INPUT ──────────────────────────────────────────────────
  if (screen === "input") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'IBM Plex Sans', sans-serif", paddingTop: 64 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(24px,5vw,60px) 24px" }}>

        {/* Nav */}
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: C.bg, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px clamp(24px,5vw,60px)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: C.text }}>Perceive</span>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: C.accent }}>.</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(16,185,129,0.06)", border: "0.5px solid rgba(16,185,129,0.2)", borderRadius: 20, padding: "5px 14px 5px 10px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
              <span style={{ fontSize: 11, color: C.green, fontFamily: "'IBM Plex Mono'" }}>No sign up. No data stored.</span>
            </div>
          </div>
        </div>

        {/* Hero */}
        <div style={{ padding: "36px 0 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 16, height: 1, background: C.accent }} />
            <span style={{ fontSize: 10, letterSpacing: "0.2em", color: C.accent, fontFamily: "'IBM Plex Mono'", textTransform: "uppercase" }}>Role Intelligence</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
            <div style={{ width: 4, background: C.accent, borderRadius: 2, flexShrink: 0, alignSelf: "stretch", minHeight: 90 }} />
            <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(36px,5vw,52px)", fontWeight: 300, color: C.text, lineHeight: 1.1, margin: 0 }}>
              You're getting interviews…<br/>
              <span style={{ fontStyle: "italic", color: C.accent }}>so why aren't you getting offers?</span>
            </h1>
          </div>
          <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.7, paddingLeft: 20 }}>Most candidates walk in guessing. You won't.</p>
        </div>

        {/* Feature chips */}
        <div style={{ paddingBottom: 32 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.18em", color: C.textMuted, textTransform: "uppercase", fontFamily: "'IBM Plex Mono'", marginBottom: 14, opacity: 0.6 }}>What you get</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {["Match score","Hiring manager view","Why you might get rejected","Your edge","30-second pitch","Interview questions","What to do next"].map((label, i) => (
              <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(107,92,231,0.06)", border: "0.5px solid rgba(107,92,231,0.18)", borderRadius: 999, padding: "6px 12px", fontSize: 12, color: C.textMuted }}>
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Inputs */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24 }}>
          <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, letterSpacing: "0.15em", color: C.textMuted, fontFamily: "'IBM Plex Mono'", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Your CV</label>
              <textarea value={cv} onChange={e => setCv(e.target.value.slice(0, 8000))} rows={9}
                placeholder="Paste your CV here. Include your name for a personalised analysis."
                style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", color: C.text, fontSize: 14, fontFamily: "'IBM Plex Mono'", outline: "none", lineHeight: 1.7 }}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e => e.target.style.borderColor = C.border} />
            </div>
            <div>
              <label style={{ fontSize: 11, letterSpacing: "0.15em", color: C.textMuted, fontFamily: "'IBM Plex Mono'", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Job Description</label>
              <textarea value={jd} onChange={e => { setJd(e.target.value.slice(0, 10000)); setError(""); }} rows={9}
                placeholder="Paste the job description here..."
                style={{ width: "100%", background: C.card, border: `1px solid ${error ? C.red : C.border}`, borderRadius: 10, padding: "14px 16px", color: C.text, fontSize: 14, fontFamily: "'IBM Plex Mono'", outline: "none", lineHeight: 1.7 }}
                onFocus={e => { if (!error) e.target.style.borderColor = C.accent; }}
                onBlur={e => { if (!error) e.target.style.borderColor = C.border; }} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <span style={{ fontSize: 11, color: jd.length > 9000 ? C.amber : C.textMuted, fontFamily: "'IBM Plex Mono'", opacity: 0.7 }}>{jd.length} / 10000 characters</span>
              </div>
            </div>
          </div>

          <button onClick={handleAnalyse} disabled={loading}
            style={{ width: "100%", background: loading ? C.surface : C.accent, color: "#fff", border: "none", borderRadius: 10, padding: "16px 0", fontSize: 14, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer", fontFamily: "'IBM Plex Sans'", letterSpacing: "0.04em", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            {loading
              ? (<><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />{loadingMsg}</>)
              : "Analyse this role →"}
          </button>

          {error && (
            <div style={{ marginTop: 12, padding: "10px 16px", borderRadius: 8, background: error.includes("on a roll") ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${error.includes("on a roll") ? "rgba(245,158,11,0.25)" : "rgba(239,68,68,0.25)"}`, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: error.includes("on a roll") ? C.amber : C.red, margin: 0 }}>{error}</p>
            </div>
          )}
          <p style={{ fontSize: 11, color: C.textMuted, textAlign: "center", marginTop: 10, fontFamily: "'IBM Plex Sans'", opacity: 0.7 }}>Your CV and job description are not stored. All analysis happens in real time.</p>
        </div>
      </div>
    </div>
  );

  // ── RESULT ─────────────────────────────────────────────────
  if (screen === "result" && result) {
    const r = result;
    const whyFitBullets  = pipeSplit(r.whyFit);
    const hmBullets      = pipeSplit(r.hiringManagerCares);
    const redFlagBullets = pipeSplit(r.redFlags);
    const rejBullets     = pipeSplit(r.rejectionRisk);
    const actionBullets  = pipeSplit(r.whatToDoNext);
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'IBM Plex Sans', sans-serif", padding: "clamp(16px,4vw,28px) clamp(16px,4vw,20px)", paddingTop: 72, overflowX: "hidden" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>

          {/* Nav */}
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: C.bg, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "14px clamp(24px,5vw,60px)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: C.text }}>Perceive</span>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: C.accent }}>.</span>
              </div>
              <button onClick={() => { setResult(null); setScreen("input"); }}
                style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 6, padding: "7px 14px", fontSize: 11, cursor: "pointer", fontFamily: "'IBM Plex Mono'" }}>← NEW ROLE</button>
            </div>
          </div>

          <MindsetBanner text={r.mindsetBanner || r.fitReason} verdict={r.fitVerdict} />

          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 20, alignItems: "start", marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 68, color: C.text, lineHeight: 1, letterSpacing: "-1px" }}>
                  {r.matchScore}<span style={{ fontSize: 28, color: C.textMuted }}>%</span>
                </div>
                <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'IBM Plex Mono'", letterSpacing: 3, marginTop: 4 }}>MATCH SCORE</div>
              </div>
              <div className="score-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, minWidth: 0 }}>
                <div style={{ borderLeft: `2px solid ${fitColor(r.fitVerdict)}40`, paddingLeft: 14 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: C.textMuted, fontFamily: "'IBM Plex Mono'", marginBottom: 6 }}>REALITY CHECK</div>
                  <div style={{ fontSize: 18, color: fitColor(r.fitVerdict), fontWeight: 600, marginBottom: 8 }}>{r.fitVerdict}</div>
                  <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.7, margin: 0 }}>{r.fitReason}</p>
                </div>
                <div style={{ borderLeft: `2px solid ${applyColor(r.applyVerdict)}40`, paddingLeft: 14 }}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: C.textMuted, fontFamily: "'IBM Plex Mono'", marginBottom: 6 }}>SHOULD YOU APPLY?</div>
                  <div style={{ fontSize: 18, color: applyColor(r.applyVerdict), fontWeight: 600, marginBottom: 8 }}>{r.applyVerdict}</div>
                  <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.7, margin: 0 }}>{r.applyReason}</p>
                </div>
              </div>
            </div>
            <div className="pills-row" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: "flex" }}>
              <div style={{ flex: 1, paddingRight: 24 }}><Pill label="SKILLS" value={r.skillsLevel} type={r.skillsLevel === "High" ? "good" : r.skillsLevel === "Medium" ? "warn" : "bad"} /></div>
              <div style={{ flex: 1, borderLeft: `1px solid ${C.border}`, paddingLeft: 24, paddingRight: 24 }}><Pill label="DOMAIN" value={r.domainLevel} type={r.domainLevel === "Strong" ? "good" : r.domainLevel === "Moderate" ? "warn" : "bad"} /></div>
              <div style={{ flex: 1, borderLeft: `1px solid ${C.border}`, paddingLeft: 24 }}><Pill label="SENIORITY" value={r.seniorityLevel} type={r.seniorityLevel === "Aligned" ? "good" : r.seniorityLevel === "Slight stretch" ? "warn" : "bad"} /></div>
            </div>
          </Card>

          <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <Card><Label color={C.green}>WHY YOU FIT</Label><BulletList items={whyFitBullets} dotColor={C.green} /></Card>
            <Card><Label color={C.accentBright}>YOUR EDGE</Label><p style={{ fontSize: 14, color: C.text, lineHeight: 1.75, fontFamily: "'IBM Plex Sans'" }}>{r.edge}</p></Card>
          </div>

          <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <Card>
              <Label color={C.amber}>HIRING MANAGER LENS</Label>
              <BulletList items={hmBullets} dotColor={C.amber} />
              <Divider />
              <Label color={C.red}>RED FLAGS THEY'LL NOTICE</Label>
              <BulletList items={redFlagBullets} dotColor={C.red} />
            </Card>
            <Card>
              <Label color={C.red}>WHY YOU MIGHT GET REJECTED</Label>
              <BulletList items={rejBullets} dotColor={C.red} />
              <Divider />
              <Label color={C.accentBright}>WHAT YOU SHOULD DO NEXT</Label>
              <ActionList items={actionBullets} />
            </Card>
          </div>

          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Label color={C.accentBright}>YOUR 30-SECOND PITCH</Label>
              <button onClick={() => copyText(r.pitch, setCopiedPitch)} style={{ background: "none", border: `1px solid ${C.border}`, color: copiedPitch ? C.green : C.textMuted, borderRadius: 4, padding: "4px 10px", fontSize: 10, cursor: "pointer", fontFamily: "'IBM Plex Mono'", marginBottom: 10 }}>
                {copiedPitch ? "COPIED ✓" : "COPY"}
              </button>
            </div>
            <div style={{ background: C.surface, borderRadius: 8, padding: "14px 16px", borderLeft: `3px solid ${C.accent}`, marginBottom: 12 }}>
              <p style={{ fontSize: 15, color: C.text, lineHeight: 1.9, fontStyle: "italic", fontFamily: "'IBM Plex Sans'" }}>"{r.pitch}"</p>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: C.textMuted, fontFamily: "'IBM Plex Mono'", whiteSpace: "nowrap", paddingTop: 2 }}>POSITION AS</div>
              <div style={{ fontSize: 14, color: C.accentBright, fontWeight: 600, lineHeight: 1.6, fontFamily: "'IBM Plex Sans'" }}>{r.positioning}</div>
            </div>
          </Card>

          <Card style={{ marginBottom: 12 }}>
            <Label color={C.accent}>INTERVIEW STRATEGY</Label>
            <div style={{ background: C.surface, borderRadius: 8, padding: "12px 14px", marginBottom: 14, borderLeft: `3px solid ${C.amber}` }}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: C.amber, marginBottom: 6, fontFamily: "'IBM Plex Mono'" }}>WHAT THEY'RE REALLY TESTING</div>
              <p style={{ fontSize: 14, color: C.text, lineHeight: 1.75, fontFamily: "'IBM Plex Sans'" }}>{r.whatTheyAreTesting}</p>
            </div>
            <QCard q={r.q1} whyAsking={r.q1whyAsking} intent={r.q1intent} approach={r.q1approach} mistake={r.q1mistake} num={1} />
            <QCard q={r.q2} whyAsking={r.q2whyAsking} intent={r.q2intent} approach={r.q2approach} mistake={r.q2mistake} num={2} />
            <QCard q={r.q3} whyAsking={r.q3whyAsking} intent={r.q3intent} approach={r.q3approach} mistake={r.q3mistake} num={3} />
          </Card>

          <Card style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Label color={C.green}>STRONG ANSWER. USE THIS AS YOUR TEMPLATE</Label>
              <button onClick={() => copyText(r.exampleAnswer, setCopiedAnswer)} style={{ background: "none", border: `1px solid ${C.border}`, color: copiedAnswer ? C.green : C.textMuted, borderRadius: 4, padding: "4px 10px", fontSize: 10, cursor: "pointer", fontFamily: "'IBM Plex Mono'", marginBottom: 10 }}>
                {copiedAnswer ? "COPIED ✓" : "COPY"}
              </button>
            </div>
            <div style={{ background: C.surface, borderRadius: 8, padding: "16px 18px", borderLeft: `3px solid ${C.green}` }}>
              <p style={{ fontSize: 15, color: C.text, lineHeight: 1.95, fontFamily: "'IBM Plex Sans'" }}>{r.exampleAnswer}</p>
            </div>
          </Card>

          <div style={{ textAlign: "center", paddingBottom: 28 }}>
            <button onClick={() => { setResult(null); setJd(""); setScreen("input"); }}
              style={{ background: `linear-gradient(135deg, ${C.accent}, #4B3EC7)`, color: "#fff", border: "none", borderRadius: 8, padding: "14px 36px", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "'IBM Plex Mono'", letterSpacing: 1 }}>
              ANALYSE ANOTHER ROLE →
            </button>
          </div>

        </div>
      </div>
    );
  }

  return null;
}