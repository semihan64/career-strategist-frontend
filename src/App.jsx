import { useState, useEffect, useRef } from "react";

const PROXY_URL = "https://career-strategist-backend-production.up.railway.app/api/analyse";

// ── Design tokens ─────────────────────────────────────────────
const C = {
  bg: "#0E0F18", surface: "#13142A", card: "#161830", cardHover: "#1A1B35",
  border: "#2A2C4A", borderLight: "#262840",
  accent: "#6B5CE7", accentBright: "#9B8FF8", accentGlow: "rgba(107,92,231,0.15)",
  amber: "#F59E0B", amberBg: "rgba(245,158,11,0.08)", amberBorder: "rgba(245,158,11,0.2)",
  green: "#10B981", greenBg: "rgba(16,185,129,0.08)", greenBorder: "rgba(16,185,129,0.2)",
  red: "#EF4444", redBg: "rgba(239,68,68,0.08)", redBorder: "rgba(239,68,68,0.2)",
  text: "#E8E6FF", textMuted: "#8892B0", textDim: "#555870",
  serif: "'Cormorant Garamond', serif",
  mono: "'IBM Plex Mono', monospace",
  sans: "'IBM Plex Sans', sans-serif",
};

// ── Global styles ─────────────────────────────────────────────
const G = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@0,400;0,500&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: ${C.bg};
    color: ${C.text};
    font-family: ${C.sans};
    font-size: 16px;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }
  /* Accessibility: never use italic for body text */
  p, li, span { font-style: normal !important; }
  textarea {
    resize: vertical;
    font-family: ${C.sans};
    font-size: 15px;
    line-height: 1.75;
  }
  textarea::placeholder { color: ${C.textDim}; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-thumb { background: ${C.accent}; border-radius: 2px; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  @media(max-width:768px) {
    .grid-2col { grid-template-columns: 1fr !important; }
    .score-grid { grid-template-columns: 1fr !important; }
    .pills-row { flex-direction: column !important; gap: 0 !important; }
    .pills-row > div { padding: 16px 0 !important; border-right: none !important; border-bottom: 1px solid #1E2035; }
    .pills-row > div:last-child { border-bottom: none !important; }
    .hide-mobile { display: none !important; }
    .input-grid { grid-template-columns: 1fr !important; }
  }
  /* Nav hamburger */
  .hamburger { display: none; flex-direction: column; gap: 5px; background: none; border: none; cursor: pointer; padding: 6px; }
  .hamburger span { display: block; width: 22px; height: 2px; background: #8892B0; border-radius: 2px; transition: all 0.25s; }
  .hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
  .hamburger.open span:nth-child(2) { opacity: 0; }
  .hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
  .mobile-menu { display: none; position: fixed; top: 60px; left: 0; right: 0; background: rgba(14,15,24,0.98); backdrop-filter: blur(20px); border-bottom: 1px solid #222440; z-index: 99; flex-direction: column; padding: 12px 16px; gap: 8px; }
  .mobile-menu.open { display: flex; }
  .status-text { display: inline; }
  @media(max-width: 640px) {
    .status-text { display: none !important; }
    .status-pill { padding: 6px 10px !important; border-radius: 50% !important; }
  }
  @media(max-width: 640px) {
    .nav-desktop-actions { display: none !important; }
    .hamburger { display: flex !important; }
    .tab-long { display: none !important; }
    .tab-short { display: inline !important; }
  }
  @media print {
    nav { display: none !important; }
    .tabs-nav { display: none !important; }
    button { display: none !important; }
    .tab-content-hidden { display: block !important; }
    body { background: white !important; color: black !important; }
  }
  @media(max-width:600px) {
    .score-card-grid { grid-template-columns: 1fr !important; }
  }
`;

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
  } catch { throw new Error("NETWORK_ERROR"); }

  try { data = await res.json(); } catch { throw new Error("PARSE_ERROR"); }

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (res.status === 404) throw new Error("SERVER_404");
  if (!res.ok || data.error) throw new Error(data.error || "HTTP_" + res.status);

  let raw = "";
  if (data.result) {
    raw = data.result;
  } else if (data.content && data.content.length > 0) {
    raw = data.content.filter(b => b.type === "text").map(b => b.text || "").join("");
  }
  if (!raw) throw new Error("EMPTY_RESPONSE");

  const lines = raw.split("\n");
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "```json" || t === "```") continue;
    kept.push(lines[i]);
  }
  const stripped = kept.join("\n").trim();
  const s = stripped.indexOf("{");
  const e = stripped.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("NO_JSON");
  let clean = stripped.slice(s, e + 1);

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

// ── UI Components ─────────────────────────────────────────────

function SectionLabel({ children, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 3, height: 14, background: color || C.accent, borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 12, letterSpacing: "0.05em", color: color || C.textMuted, fontFamily: C.sans, fontWeight: 600 }}>{children}</span>
    </div>
  );
}

function Card({ children, style = {}, glow }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: "24px 26px", minWidth: 0, wordBreak: "break-word",
      boxShadow: glow ? `0 0 32px ${glow}` : "0 2px 12px rgba(0,0,0,0.3)",
      ...style
    }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: `1px solid ${C.border}`, margin: "16px 0" }} />;
}

function BulletList({ items, color, size = 14 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((line, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left" }}>
          <div style={{ width: 5, height: 5, background: color, borderRadius: "50%", marginTop: 7, flexShrink: 0, opacity: 0.8 }} />
          <p style={{ fontSize: 15, color: C.text, lineHeight: 1.8, fontFamily: C.sans, fontWeight: 400, textAlign: "left", margin: 0 }}>{line}</p>
        </div>
      ))}
    </div>
  );
}

function ActionList({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((line, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left" }}>
          <span style={{ color: C.accent, fontFamily: C.mono, fontSize: 13, marginTop: 3, flexShrink: 0, fontWeight: 600 }}>→</span>
          <p style={{ fontSize: 15, color: C.text, lineHeight: 1.8, fontFamily: C.sans, fontWeight: 400, textAlign: "left", margin: 0 }}>{line}</p>
        </div>
      ))}
    </div>
  );
}

function Pill({ label, value, type }) {
  const col = {
    good: C.green, warn: C.amber, bad: C.red, neu: C.accentBright,
  }[type] || C.accentBright;

  const dots = value === "High" || value === "Aligned" || value === "Strong" ? 3
    : value === "Medium" || value === "Moderate" || value === "Slight stretch" ? 2 : 1;

  return (
    <div style={{ flex: 1, padding: "0 20px", textAlign: "left" }}>
      <div style={{ fontSize: 13, letterSpacing: "0.05em", color: C.textDim, fontFamily: C.sans, marginBottom: 10, fontWeight: 500 }}>{label}</div>
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i <= dots ? col : C.border, transition: "background 0.2s" }} />
        ))}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: col, fontFamily: C.sans }}>{value}</div>
    </div>
  );
}

function MindsetBanner({ text, verdict }) {
  const isStrong = verdict === "Strong fit";
  const isSkip = verdict === "Low probability";
  const col = isStrong ? C.green : isSkip ? C.red : C.amber;
  const bg = isStrong ? C.greenBg : isSkip ? C.redBg : C.amberBg;
  const border = isStrong ? C.greenBorder : isSkip ? C.redBorder : C.amberBorder;

  const Icon = () => isStrong
    ? <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{flexShrink:0,marginTop:2}}><circle cx="11" cy="11" r="9" stroke={col} strokeWidth="1.5"/><path d="M7 11.5l3 3 5-6" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    : isSkip
    ? <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{flexShrink:0,marginTop:2}}><circle cx="11" cy="11" r="9" stroke={col} strokeWidth="1.5"/><path d="M8 8l6 6M14 8l-6 6" stroke={col} strokeWidth="1.5" strokeLinecap="round"/></svg>
    : <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{flexShrink:0,marginTop:2}}><path d="M11 3L20 19H2L11 3Z" stroke={col} strokeWidth="1.5" strokeLinejoin="round" fill="none"/><line x1="11" y1="9" x2="11" y2="14" stroke={col} strokeWidth="1.5" strokeLinecap="round"/><circle cx="11" cy="16.5" r="1" fill={col}/></svg>;

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "18px 22px", marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 14, animation: "fadeUp 0.4s ease both" }}>
      <Icon />
      <p style={{ fontSize: 16, color: col, fontWeight: 500, fontFamily: C.sans, lineHeight: 1.6, margin: 0, textAlign: "left" }}>{text}</p>
    </div>
  );
}

function QCard({ q, whyAsking, intent, approach, mistake, num }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${open ? C.borderLight : C.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 8, transition: "border-color 0.2s" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: open ? C.cardHover : C.card, border: "none", padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 14, textAlign: "left" }}>
        <span style={{ fontSize: 12, fontFamily: C.mono, color: C.accent, minWidth: 22, paddingTop: 3, fontWeight: 500 }}>Q{num}</span>
        <span style={{ fontSize: 15, color: C.text, fontFamily: C.sans, flex: 1, lineHeight: 1.75, fontWeight: 400 }}>{q}</span>
        <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 6, background: open ? C.accent : "rgba(107,92,231,0.1)", border: `1px solid ${open ? C.accent : "rgba(107,92,231,0.2)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
          <span style={{ color: open ? "#fff" : C.accentBright, fontSize: 13, display: "block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
        </div>
      </button>
      {open && (
        <div style={{ background: C.surface, padding: "16px 18px", display: "grid", gap: 14, animation: "fadeUp 0.2s ease" }}>
          <div style={{ background: C.amberBg, border: `1px solid ${C.amberBorder}`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, letterSpacing: "0.02em", color: C.amber, marginBottom: 8, fontFamily: C.sans, fontWeight: 600, textAlign: "left" }}>Why they're asking this</div>
            <p style={{ fontSize: 15, color: C.text, lineHeight: 1.8, fontFamily: C.sans, fontWeight: 400, margin: 0, textAlign: "left" }}>{whyAsking}</p>
          </div>
          {[
            ["What a strong answer shows", intent, C.accentBright],
            ["How to approach the question", approach, C.green],
            ["Mistake to avoid", mistake, C.red],
          ].map(([lbl, val, col]) => (
            <div key={lbl}>
              <div style={{ fontSize: 12, letterSpacing: "0.02em", color: col, marginBottom: 8, fontFamily: C.sans, fontWeight: 600, textAlign: "left" }}>{lbl}</div>
              <p style={{ fontSize: 15, color: C.text, lineHeight: 1.8, fontFamily: C.sans, fontWeight: 400, margin: 0, textAlign: "left" }}>{val}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Feature chip icons ────────────────────────────────────────
const chipIcons = {
  "Match score": <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#9B8FF8" strokeWidth="1.3"/><path d="M4.5 7.5l2 2 3-3.5" stroke="#9B8FF8" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  "Hiring manager view": <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="2.5" stroke="#9B8FF8" strokeWidth="1.3"/><path d="M2.5 12c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="#9B8FF8" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  "Why you might get rejected": <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#9B8FF8" strokeWidth="1.3"/><path d="M7 4.5v3M7 9.5v.5" stroke="#9B8FF8" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  "Your edge": <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2L8.5 5.5H12.5L9.5 7.8L10.8 11.5L7 9.2L3.2 11.5L4.5 7.8L1.5 5.5H5.5Z" stroke="#9B8FF8" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  "30-second pitch": <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M2 7h7M2 10h5" stroke="#9B8FF8" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  "Interview questions": <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="2" stroke="#9B8FF8" strokeWidth="1.3"/><path d="M5 5.5h4M5 8h3" stroke="#9B8FF8" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  "What to do next": <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.5 7h9M8.5 4l3 3-3 3" stroke="#9B8FF8" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};


// ── Tab icons ─────────────────────────────────────────────────
const TAB_ICONS = {
  fit: {
    on:  <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#9B8FF8" strokeWidth="1.3"/><circle cx="8" cy="8" r="3" stroke="#9B8FF8" strokeWidth="1.3"/><circle cx="8" cy="8" r="1" fill="#9B8FF8"/></svg>,
    off: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#3D4060" strokeWidth="1.3"/><circle cx="8" cy="8" r="3" stroke="#3D4060" strokeWidth="1.3"/><circle cx="8" cy="8" r="1" fill="#3D4060"/></svg>,
  },
  pitch: {
    on:  <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M13 2H3a1 1 0 00-1 1v7a1 1 0 001 1h2l2 3 2-3h4a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="#9B8FF8" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
    off: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M13 2H3a1 1 0 00-1 1v7a1 1 0 001 1h2l2 3 2-3h4a1 1 0 001-1V3a1 1 0 00-1-1z" stroke="#3D4060" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  },
  interview: {
    on:  <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="5.5" cy="4.5" r="2" stroke="#9B8FF8" strokeWidth="1.3"/><path d="M1.5 13c0-2.5 1.8-4 4-4s4 1.5 4 4" stroke="#9B8FF8" strokeWidth="1.3" strokeLinecap="round"/><circle cx="11.5" cy="4.5" r="2" stroke="#9B8FF8" strokeWidth="1.3"/><path d="M9.5 13c0-2.5 1.3-4 3-4" stroke="#9B8FF8" strokeWidth="1.3" strokeLinecap="round"/></svg>,
    off: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="5.5" cy="4.5" r="2" stroke="#3D4060" strokeWidth="1.3"/><path d="M1.5 13c0-2.5 1.8-4 4-4s4 1.5 4 4" stroke="#3D4060" strokeWidth="1.3" strokeLinecap="round"/><circle cx="11.5" cy="4.5" r="2" stroke="#3D4060" strokeWidth="1.3"/><path d="M9.5 13c0-2.5 1.3-4 3-4" stroke="#3D4060" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  },
};

const TAB_HINTS = {
  fit: "Fit", pitch: "Narrative", interview: "Prep",
};

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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [activeTab, setActiveTab] = useState("fit");

  const MSGS = [
    "Reading the room…", "Thinking like a hiring manager…",
    "Checking your positioning…", "Pulling the honest read…",
    "Analysing your fit…", "Finding your edge…", "Almost there…",
  ];

  const extractTextFromFile = async (file) => {
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "txt") {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsText(file);
      });
    }

    if (ext === "pdf") {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const typedArray = new Uint8Array(e.target.result);
            const pdfjsLib = window["pdfjs-dist/build/pdf"];
            pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
            const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
            let text = "";
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const content = await page.getTextContent();
              text += content.items.map(item => item.str).join(" ") + "\n";
            }
            resolve(text.trim());
          } catch (err) {
            reject(new Error("Could not read PDF. Try copying and pasting your CV text instead."));
          }
        };
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsArrayBuffer(file);
      });
    }

    if (ext === "docx") {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const result = await window.mammoth.extractRawText({ arrayBuffer: e.target.result });
            resolve(result.value.trim());
          } catch (err) {
            reject(new Error("Could not read Word document. Try copying and pasting your CV text instead."));
          }
        };
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsArrayBuffer(file);
      });
    }

    throw new Error("Unsupported file type. Please upload a PDF, Word (.docx), or text file.");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const text = await extractTextFromFile(file);
      if (!text || text.length < 50) throw new Error("No text found in file. Try copying and pasting your CV instead.");
      setCv(text.slice(0, 8000));
    } catch (err) {
      setUploadError(err.message);
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleAnalyse = async () => {
    if (!cv.trim()) { setError("Paste your CV on the left to get started."); return; }
    if (!jd.trim()) { setError("Paste a job description to continue."); return; }
    if (loading) return;
    setError(""); setLoading(true); setResult(null); setLoadingMsg(MSGS[0]);
    let idx = 0;
    const t = setInterval(() => { idx = (idx + 1) % MSGS.length; setLoadingMsg(MSGS[idx]); }, 2200);
    try {
      const data = await callClaude(cv, jd);
      clearInterval(t); setResult(data); setScreen("result"); window.scrollTo({ top: 0, behavior: "instant" });
    } catch (err) {
      clearInterval(t);
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

  const buildAnalysisText = (r) => {
    const lines = [
      `PERCEIVE ANALYSIS`,
      `==================`,
      ``,
      `MATCH SCORE: ${r.matchScore}%`,
      `Reality Check: ${r.fitVerdict}`,
      `${r.fitReason}`,
      ``,
      `Should You Apply: ${r.applyVerdict}`,
      `${r.applyReason}`,
      ``,
      `Skills: ${r.skillsLevel} | Domain: ${r.domainLevel} | Seniority: ${r.seniorityLevel}`,
      ``,
      `─────────────────────────────`,
      `MINDSET`,
      `─────────────────────────────`,
      r.mindsetBanner,
      ``,
      `─────────────────────────────`,
      `WHY YOU FIT`,
      `─────────────────────────────`,
      ...(r.whyFit || "").split("|").map(s => `• ${s.trim()}`),
      ``,
      `YOUR EDGE`,
      r.edge,
      ``,
      `─────────────────────────────`,
      `YOUR STORY — 30-SECOND PITCH`,
      `─────────────────────────────`,
      r.pitch,
      ``,
      `Position as: ${r.positioning}`,
      ``,
      `─────────────────────────────`,
      `WHAT YOU SHOULD DO NEXT`,
      `─────────────────────────────`,
      ...(r.whatToDoNext || "").split("|").map(s => `→ ${s.trim()}`),
      ``,
      `─────────────────────────────`,
      `IN THE ROOM — INTERVIEW PREP`,
      `─────────────────────────────`,
      `What they're testing: ${r.whatTheyAreTesting}`,
      ``,
      `Q1: ${r.q1}`,
      `Why asking: ${r.q1whyAsking}`,
      `How to approach: ${r.q1approach}`,
      `Mistake to avoid: ${r.q1mistake}`,
      ``,
      `Q2: ${r.q2}`,
      `Why asking: ${r.q2whyAsking}`,
      `How to approach: ${r.q2approach}`,
      `Mistake to avoid: ${r.q2mistake}`,
      ``,
      `Q3: ${r.q3}`,
      `Why asking: ${r.q3whyAsking}`,
      `How to approach: ${r.q3approach}`,
      `Mistake to avoid: ${r.q3mistake}`,
      ``,
      `─────────────────────────────`,
      `STRONG ANSWER TEMPLATE`,
      `─────────────────────────────`,
      r.exampleAnswer,
      ``,
      `─ Analysed by Perceive · perceive-app.vercel.app ─`,
    ];
    return lines.join("\n");
  };

  const [copiedAll, setCopiedAll] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const copyText = (text, setter) => {
    navigator.clipboard.writeText(text);
    setter(true); setTimeout(() => setter(false), 2000);
  };

  const applyColor = v => v === "Apply now" ? C.green : v === "Skip this one" ? C.red : C.amber;
  const fitColor = v => v === "Strong fit" ? C.green : v === "Low probability" ? C.red : C.amber;

  // ── Load PDF.js + mammoth on mount ──────────────────────────
  useEffect(() => {
    const scripts = [
      { src: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", id: "pdfjs" },
      { src: "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js", id: "mammoth" },
    ];
    scripts.forEach(({ src, id }) => {
      if (!document.getElementById(id)) {
        const s = document.createElement("script");
        s.src = src; s.id = id; s.async = true;
        document.head.appendChild(s);
      }
    });
  }, []);

  // ── INPUT SCREEN ──────────────────────────────────────────
  if (screen === "input") return (
    <>
      <style>{G}</style>
      <div style={{ minHeight: "100vh", background: C.bg, paddingTop: 68 }}>

        {/* Nav */}
        <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "rgba(8,9,13,0.92)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(20px,5vw,60px)", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontFamily: C.serif, fontSize: 24, fontWeight: 400, color: C.text, letterSpacing: "0.02em" }}>Perceive</span>
              <span style={{ fontFamily: C.serif, fontSize: 24, color: C.accent }}>.</span>
            </div>
            <div className="status-pill" style={{ display: "flex", alignItems: "center", gap: 6, background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 20, padding: "5px 14px 5px 10px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, animation: "pulse 2s infinite" }} />
              <span className="status-text" style={{ fontSize: 13, color: C.green, fontFamily: C.mono }}>No sign up. No data stored.</span>
            </div>
          </div>
        </nav>

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(20px,5vw,60px) 40px" }}>

          {/* Hero */}
          <div style={{ padding: "44px 0 36px", animation: "fadeUp 0.6s ease both", textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 18, height: 1, background: C.accent }} />
              <span style={{ fontSize: 12, letterSpacing: "0.22em", color: C.accent, fontFamily: C.mono, textTransform: "uppercase" }}>Role Intelligence</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 18, marginBottom: 16 }}>
              <div style={{ width: 3, background: `linear-gradient(to bottom, ${C.accent}, transparent)`, borderRadius: 2, flexShrink: 0, alignSelf: "stretch", minHeight: 80 }} />
              <h1 style={{ fontFamily: C.serif, fontSize: "clamp(34px,5.5vw,58px)", fontWeight: 300, color: C.text, lineHeight: 1.08, margin: 0 }}>
                You're getting interviews…<br/>
                <span style={{ fontStyle: "italic", color: C.accent, fontWeight: 300 }}>so why aren't you getting offers?</span>
              </h1>
            </div>
            <p style={{ fontSize: 15, color: C.textMuted, lineHeight: 1.7, paddingLeft: 21, fontWeight: 300, textAlign: "left" }}>Most candidates walk in guessing. You won't.</p>
          </div>

          {/* Feature chips */}
          <div style={{ paddingBottom: 32, animation: "fadeUp 0.6s ease 0.1s both", textAlign: "left" }}>
            <div style={{ fontSize: 12, letterSpacing: "0.2em", color: C.text, textTransform: "uppercase", fontFamily: C.mono, marginBottom: 12, opacity: 0.6 }}>What you get</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(chipIcons).map(([label, icon], i) => (
                <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(107,92,231,0.06)", border: `1px solid rgba(107,92,231,0.3)`, borderRadius: 999, padding: "6px 13px 6px 10px", fontSize: 12, color: C.text, fontFamily: C.sans, fontWeight: 300 }}>
                  {icon}{label}
                </div>
              ))}
            </div>
          </div>

          {/* Inputs */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 28, animation: "fadeUp 0.6s ease 0.15s both", textAlign: "left" }}>
            <div className="input-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, width: "100%" }}>
              {/* CV */}
              <div style={{ textAlign: "left" }}>
                <label style={{ fontSize: 12, letterSpacing: "0.18em", color: C.textDim, fontFamily: C.mono, textTransform: "uppercase", display: "block", marginBottom: 10 }}>Your CV</label>

                {/* Upload zone */}
                <label style={{ display: "block", cursor: "pointer" }}>
                  <div style={{ border: `2px dashed ${uploading ? C.accent : cv ? C.green : C.border}`, borderRadius: 10, padding: "16px", marginBottom: 10, background: uploading ? "rgba(107,92,231,0.04)" : cv ? "rgba(16,185,129,0.04)" : "rgba(255,255,255,0.01)", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 12 }}>
                    {uploading ? (
                      <>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(107,92,231,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <div style={{ width: 14, height: 14, border: "2px solid rgba(155,143,248,0.3)", borderTopColor: C.accentBright, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: C.accentBright, fontWeight: 500 }}>Reading your CV...</div>
                          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Just a moment</div>
                        </div>
                      </>
                    ) : cv ? (
                      <>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.5 3.5 6.5-7" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: C.green, fontWeight: 500 }}>CV loaded</div>
                          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Click to replace · or edit below</div>
                        </div>
                        <button onClick={e => { e.preventDefault(); setCv(""); }} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}>×</button>
                      </>
                    ) : (
                      <>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(107,92,231,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 5L8 2l3 3" stroke="#9B8FF8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 13h12" stroke="#9B8FF8" strokeWidth="1.4" strokeLinecap="round"/></svg>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>Upload your CV</div>
                          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>PDF, Word or TXT · or paste below</div>
                        </div>
                      </>
                    )}
                  </div>
                  <input type="file" accept=".pdf,.docx,.txt" onChange={handleFileUpload} style={{ display: "none" }} />
                </label>

                {uploadError && (
                  <div style={{ padding: "8px 12px", background: C.redBg, border: `1px solid ${C.redBorder}`, borderRadius: 8, marginBottom: 10 }}>
                    <p style={{ fontSize: 12, color: C.red, margin: 0, fontFamily: C.sans }}>{uploadError}</p>
                  </div>
                )}

                {/* Divider */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                  <span style={{ fontSize: 11, color: C.textDim, fontFamily: C.mono }}>or paste manually</span>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                </div>

                <textarea value={cv} onChange={e => setCv(e.target.value.slice(0, 8000))} rows={7}
                  placeholder="Paste your full CV here..."
                  style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", color: C.text, fontSize: 13, lineHeight: 1.7, outline: "none", transition: "border-color 0.2s, box-shadow 0.2s" }}
                  onFocus={e => { e.target.style.borderColor = C.accent; e.target.style.boxShadow = `0 0 0 3px ${C.accentGlow}`; }}
                  onBlur={e => { e.target.style.borderColor = C.border; e.target.style.boxShadow = "none"; }} />
              </div>
              {/* JD */}
              <div style={{ textAlign: "left" }}>
                <label style={{ fontSize: 12, letterSpacing: "0.18em", color: C.textDim, fontFamily: C.mono, textTransform: "uppercase", display: "block", marginBottom: 8, textAlign: "left" }}>Job Description</label>
                <textarea value={jd} onChange={e => { setJd(e.target.value.slice(0, 10000)); setError(""); }} rows={10}
                  placeholder="Paste the job description here..."
                  style={{ width: "100%", background: C.card, border: `1px solid ${error ? C.red : C.border}`, borderRadius: 10, padding: "14px 16px", color: C.text, fontSize: 13, lineHeight: 1.7, outline: "none", transition: "border-color 0.2s, box-shadow 0.2s" }}
                  onFocus={e => { if (!error) { e.target.style.borderColor = C.accent; e.target.style.boxShadow = `0 0 0 3px ${C.accentGlow}`; } }}
                  onBlur={e => { if (!error) { e.target.style.borderColor = C.border; e.target.style.boxShadow = "none"; } }} />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <span style={{ fontSize: 13, color: jd.length > 9000 ? C.amber : C.textDim, fontFamily: C.mono }}>{jd.length} / 10000</span>
                </div>
              </div>
            </div>

            {/* Analyse button */}
            <button onClick={handleAnalyse} disabled={loading}
              style={{ width: "100%", background: loading ? C.surface : `linear-gradient(135deg, ${C.accent}, #5548CC)`, color: "#fff", border: "none", borderRadius: 10, padding: "16px 0", fontSize: 14, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer", fontFamily: C.sans, letterSpacing: "0.04em", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, transition: "opacity 0.2s, transform 0.15s, box-shadow 0.2s", boxShadow: loading ? "none" : "0 4px 24px rgba(107,92,231,0.3)" }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(107,92,231,0.45)"; }}}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = loading ? "none" : "0 4px 24px rgba(107,92,231,0.3)"; }}>
              {loading
                ? <><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />{loadingMsg}</>
                : "Analyse this role →"}
            </button>

            {error && (
              <div style={{ marginTop: 12, padding: "11px 16px", borderRadius: 8, background: error.includes("on a roll") ? C.amberBg : C.redBg, border: `1px solid ${error.includes("on a roll") ? C.amberBorder : C.redBorder}`, textAlign: "center" }}>
                <p style={{ fontSize: 13, color: error.includes("on a roll") ? C.amber : C.red, margin: 0, fontFamily: C.sans }}>{error}</p>
              </div>
            )}

            <p style={{ fontSize: 13, color: C.textDim, textAlign: "center", marginTop: 12, fontFamily: C.sans }}>Your CV and job description are not stored. All analysis happens in real time.</p>
          </div>
        </div>
      </div>
    </>
  );

  // ── RESULT SCREEN ─────────────────────────────────────────
  if (screen === "result" && result) {
    const r = result;
    const whyFit  = pipeSplit(r.whyFit);
    const hm      = pipeSplit(r.hiringManagerCares);
    const flags   = pipeSplit(r.redFlags);
    const rej     = pipeSplit(r.rejectionRisk);
    const actions = pipeSplit(r.whatToDoNext);

    const tabs = [
      { id: "fit",       label: "Fit & Decision" },
      { id: "pitch",     label: "Your Narrative" },
      { id: "interview", label: "Interview Prep" },
    ];

    return (
      <>
        <style>{G}</style>
        <div style={{ minHeight: "100vh", background: C.bg, paddingTop: 64, overflowX: "hidden" }}>

          {/* Nav */}
          <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "rgba(14,15,24,0.95)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(16px,4vw,48px)", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
                <span style={{ fontFamily: C.serif, fontSize: 22, fontWeight: 400, color: C.text }}>Perceive</span>
                <span style={{ fontFamily: C.serif, fontSize: 22, color: C.accent }}>.</span>
              </div>
              {/* Desktop actions */}
              <div className="nav-desktop-actions" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => { setResult(null); setScreen("input"); setActiveTab("fit"); setMenuOpen(false); window.scrollTo({ top: 0, behavior: "instant" }); }}
                  style={{ background: C.accent, border: `1px solid ${C.accent}`, color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: C.sans, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v3M8 11v3M2 8h3M11 8h3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round"/><circle cx="8" cy="8" r="3" stroke="#fff" strokeWidth="1.3"/></svg>
                  Analyse New Role
                </button>
                <button onClick={() => { const txt = buildAnalysisText(result); navigator.clipboard.writeText(txt); setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2000); }}
                  style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", color: C.green, borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: C.sans, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5" y="1" width="9" height="11" rx="2" stroke="#10B981" strokeWidth="1.3"/><rect x="2" y="4" width="9" height="11" rx="2" stroke="#10B981" strokeWidth="1.3"/></svg>
                  {copiedAll ? "Copied ✓" : "Copy Analysis"}
                </button>
                <button onClick={() => window.print()}
                  style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: C.sans, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3" stroke="#8892B0" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 12h12" stroke="#8892B0" strokeWidth="1.3" strokeLinecap="round"/></svg>
                  Save as PDF
                </button>
              </div>
              {/* Hamburger */}
              <button className={`hamburger${menuOpen ? " open" : ""}`} onClick={() => setMenuOpen(!menuOpen)}>
                <span/><span/><span/>
              </button>
            </div>
          </nav>

          {/* Mobile menu */}
          {menuOpen && (
            <div className="mobile-menu open">
              <button onClick={() => { setResult(null); setScreen("input"); setActiveTab("fit"); setMenuOpen(false); }}
                style={{ padding: "12px 16px", borderRadius: 10, fontFamily: C.sans, fontSize: 14, fontWeight: 500, cursor: "pointer", border: `1px solid ${C.accent}`, background: C.accent, color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v3M8 11v3M2 8h3M11 8h3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round"/><circle cx="8" cy="8" r="3" stroke="#fff" strokeWidth="1.3"/></svg>
                Analyse New Role
              </button>
              <button onClick={() => { const txt = buildAnalysisText(result); navigator.clipboard.writeText(txt); setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2000); setMenuOpen(false); }}
                style={{ padding: "12px 16px", borderRadius: 10, fontFamily: C.sans, fontSize: 14, fontWeight: 500, cursor: "pointer", border: "1px solid rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.08)", color: C.green, display: "flex", alignItems: "center", gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="5" y="1" width="9" height="11" rx="2" stroke="#10B981" strokeWidth="1.3"/><rect x="2" y="4" width="9" height="11" rx="2" stroke="#10B981" strokeWidth="1.3"/></svg>
                {copiedAll ? "Copied ✓" : "Copy Analysis"}
              </button>
              <button onClick={() => { window.print(); setMenuOpen(false); }}
                style={{ padding: "12px 16px", borderRadius: 10, fontFamily: C.sans, fontSize: 14, fontWeight: 500, cursor: "pointer", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, display: "flex", alignItems: "center", gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3" stroke="#8892B0" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 12h12" stroke="#8892B0" strokeWidth="1.3" strokeLinecap="round"/></svg>
                Save as PDF
              </button>
            </div>
          )}

          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(16px,3vw,28px) clamp(16px,4vw,28px) 40px", textAlign: "left" }}>

            {/* ── Always visible: Mindset + Score ── */}

            <MindsetBanner text={r.mindsetBanner || r.fitReason} verdict={r.fitVerdict} />

            <Card style={{ marginBottom: 20, animation: "fadeUp 0.4s ease 0.05s both" }}>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 28, alignItems: "start", marginBottom: 18 }}>
                <div>
                  <div style={{ fontFamily: C.serif, fontSize: 80, fontWeight: 300, color: C.text, lineHeight: 0.9, letterSpacing: "-2px" }}>
                    {r.matchScore}<span style={{ fontSize: 30, color: C.textDim, fontWeight: 300 }}>%</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.textDim, fontFamily: C.mono, letterSpacing: "0.2em", marginTop: 8, textTransform: "uppercase" }}>Match Score</div>
                </div>
                <div className="score-grid score-card-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, minWidth: 0 }}>
                  <div style={{ borderLeft: `2px solid ${fitColor(r.fitVerdict)}30`, paddingLeft: 18, textAlign: "left" }}>
                    <div style={{ fontSize: 12, letterSpacing: "0.18em", color: C.textDim, fontFamily: C.mono, marginBottom: 8, textTransform: "uppercase" }}>Reality Check</div>
                    <div style={{ fontSize: 20, color: fitColor(r.fitVerdict), fontWeight: 600, marginBottom: 10 }}>{r.fitVerdict}</div>
                    <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.8, margin: 0, fontWeight: 400, textAlign: "left" }}>{r.fitReason}</p>
                  </div>
                  <div style={{ borderLeft: `2px solid ${applyColor(r.applyVerdict)}30`, paddingLeft: 18, textAlign: "left" }}>
                    <div style={{ fontSize: 12, letterSpacing: "0.18em", color: C.textDim, fontFamily: C.mono, marginBottom: 8, textTransform: "uppercase" }}>Should You Apply?</div>
                    <div style={{ fontSize: 20, color: applyColor(r.applyVerdict), fontWeight: 600, marginBottom: 10 }}>{r.applyVerdict}</div>
                    <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.8, margin: 0, fontWeight: 400, textAlign: "left" }}>{r.applyReason}</p>
                  </div>
                </div>
              </div>
              <div className="pills-row" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18, display: "flex" }}>
                <Pill label="Skills" value={r.skillsLevel} type={r.skillsLevel === "High" ? "good" : r.skillsLevel === "Medium" ? "warn" : "bad"} />
                <div style={{ width: 1, background: C.border }} />
                <Pill label="Domain" value={r.domainLevel} type={r.domainLevel === "Strong" ? "good" : r.domainLevel === "Moderate" ? "warn" : "bad"} />
                <div style={{ width: 1, background: C.border }} />
                <Pill label="Seniority" value={r.seniorityLevel} type={r.seniorityLevel === "Aligned" ? "good" : r.seniorityLevel === "Slight stretch" ? "warn" : "bad"} />
              </div>
            </Card>

            {/* ── Connected tabs ── */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, position: "relative", zIndex: 2, marginBottom: 0 }}>
              {tabs.map((tab, i) => {
                const isActive = activeTab === tab.id;
                const cardRadius = activeTab === "fit" ? "0 12px 12px 12px"
                                 : activeTab === "interview" ? "12px 0 12px 12px"
                                 : "12px";
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    style={{
                      flex: 1, minWidth: 0,
                      padding: isActive ? "13px 16px" : "10px 16px",
                      border: `1px solid ${isActive ? "#4A3EC0" : "#1A1C30"}`,
                      borderBottom: isActive ? `1px solid ${C.surface}` : `1px solid #4A3EC0`,
                      borderRadius: "10px 10px 0 0",
                      background: isActive ? C.surface : "#0A0B14",
                      color: isActive ? C.text : "#3D4060",
                      fontFamily: C.sans, fontSize: 13, fontWeight: isActive ? 500 : 400,
                      cursor: "pointer", transition: "all 0.2s",
                      transform: isActive ? "translateY(0)" : "translateY(6px)",
                      marginBottom: isActive ? "-1px" : "0",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      zIndex: isActive ? 10 : 1, position: "relative",
                      whiteSpace: "nowrap", overflow: "hidden",
                      margin: "0 -1px",
                    }}>
                    {isActive ? TAB_ICONS[tab.id].on : TAB_ICONS[tab.id].off}
                    <span className="tab-long">{tab.label}</span>
                    <span className="tab-short" style={{ display: "none", textAlign: "left" }}>{TAB_HINTS[tab.id]}</span>
                  </button>
                );
              })}
            </div>

            {/* ── Tab: Your Fit ── */}
            {activeTab === "fit" && (
              <div style={{ animation: "fadeUp 0.3s ease both", background: C.surface, border: "1px solid #4A3EC0", borderRadius: "0 12px 12px 12px", padding: "clamp(16px,3vw,24px)", marginBottom: 16, position: "relative", zIndex: 0 }}>
                {/* Mode header */}
                <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.border}`, textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.accentGlow, border: `1px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: C.accent, fontWeight: 600, fontFamily: C.mono }}>1</span>
                    </div>
                    <div style={{ fontSize: 11, letterSpacing: "0.15em", color: C.accent, fontFamily: C.mono, textTransform: "uppercase" }}>Decide if this is worth your time</div>
                  </div>

                </div>
                <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12, textAlign: "left" }}>
                  <Card>
                    <SectionLabel color={C.green}>Why You Fit</SectionLabel>
                    <BulletList items={whyFit} color={C.green} />
                  </Card>
                  <Card>
                    <SectionLabel color={C.accentBright}>Your Edge</SectionLabel>
                    <p style={{ fontSize: 15, color: C.text, lineHeight: 1.8, fontFamily: C.sans, fontWeight: 400, margin: 0, textAlign: "left" }}>{r.edge}</p>
                  </Card>
                </div>
                <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12, textAlign: "left" }}>
                  <Card>
                    <SectionLabel color={C.amber}>Hiring Manager Lens</SectionLabel>
                    <BulletList items={hm} color={C.amber} />
                    <Divider />
                    <SectionLabel color={C.red}>Red Flags They'll Notice</SectionLabel>
                    <BulletList items={flags} color={C.red} />
                  </Card>
                  <Card>
                    <SectionLabel color={C.red}>Why You Might Get Rejected</SectionLabel>
                    <BulletList items={rej} color={C.red} />
                    <Divider />
                    <SectionLabel color={C.accentBright}>What You Should Do Next</SectionLabel>
                    <ActionList items={actions} />
                  </Card>
                </div>
                {/* Progression cue */}
                <button onClick={() => setActiveTab("pitch")} style={{ marginTop: 20, width: "100%", padding: "14px 18px", background: "rgba(107,92,231,0.06)", border: `1px solid rgba(107,92,231,0.2)`, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.2s", textAlign: "left", fontFamily: C.sans }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(107,92,231,0.12)"; e.currentTarget.style.borderColor = `${C.accent}`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(107,92,231,0.06)"; e.currentTarget.style.borderColor = "rgba(107,92,231,0.2)"; }}>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 13, color: C.accentBright, fontWeight: 500, marginBottom: 3 }}>Next: Your Narrative</div>
                    <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 300 }}>Fix how you're being perceived. Build your pitch.</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{flexShrink:0, marginLeft: 12}}><path d="M4 9h10M10 5l4 4-4 4" stroke={C.accentBright} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            )}

            {/* ── Tab: Your Pitch ── */}
            {activeTab === "pitch" && (
              <div style={{ animation: "fadeUp 0.3s ease both", background: C.surface, border: "1px solid #4A3EC0", borderRadius: "12px", padding: "clamp(16px,3vw,24px)", marginBottom: 16, position: "relative", zIndex: 0 }}>
                {/* Mode header */}
                <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.border}`, textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.accentGlow, border: `1px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: C.accent, fontWeight: 600, fontFamily: C.mono }}>2</span>
                    </div>
                    <div style={{ fontSize: 11, letterSpacing: "0.15em", color: C.accent, fontFamily: C.mono, textTransform: "uppercase" }}>Fix how you're being perceived</div>
                  </div>

                </div>
                <Card style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <SectionLabel color={C.accentBright}>Your 30-Second Pitch</SectionLabel>
                    <button onClick={() => copyText(r.pitch, setCopiedPitch)}
                      style={{ background: "none", border: `1px solid ${C.border}`, color: copiedPitch ? C.green : C.textDim, borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: C.mono, letterSpacing: "0.08em", transition: "all 0.2s" }}>
                      {copiedPitch ? "COPIED ✓" : "COPY"}
                    </button>
                  </div>
                  <div style={{ background: C.surface, borderRadius: 10, padding: "24px 24px", borderLeft: `3px solid ${C.accent}`, marginBottom: 20 }}>
                    <p style={{ fontSize: 16, color: C.text, lineHeight: 1.85, fontFamily: C.sans, fontWeight: 400, margin: 0, textAlign: "left" }}>"{r.pitch}"</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 16px", background: C.surface, borderRadius: 8 }}>
                    <span style={{ fontSize: 12, letterSpacing: "0.18em", color: C.textDim, fontFamily: C.mono, textTransform: "uppercase", paddingTop: 4, flexShrink: 0 }}>Position as</span>
                    <p style={{ fontSize: 15, color: C.accentBright, fontWeight: 500, lineHeight: 1.55, fontFamily: C.sans, margin: 0, textAlign: "left" }}>{r.positioning}</p>
                  </div>
                </Card>
                <Card>
                  <SectionLabel color={C.red}>Why You Might Get Rejected</SectionLabel>
                  <BulletList items={rej} color={C.red} />
                  <Divider />
                  <SectionLabel color={C.accentBright}>What You Should Do Next</SectionLabel>
                  <ActionList items={actions} />
                </Card>
                {/* Progression cue */}
                <button onClick={() => setActiveTab("interview")} style={{ marginTop: 20, width: "100%", padding: "14px 18px", background: "rgba(107,92,231,0.06)", border: `1px solid rgba(107,92,231,0.2)`, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.2s", textAlign: "left", fontFamily: C.sans }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(107,92,231,0.12)"; e.currentTarget.style.borderColor = `${C.accent}`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(107,92,231,0.06)"; e.currentTarget.style.borderColor = "rgba(107,92,231,0.2)"; }}>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 13, color: C.accentBright, fontWeight: 500, marginBottom: 3 }}>Next: Interview Prep</div>
                    <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 300 }}>Walk in knowing exactly what to say.</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{flexShrink:0, marginLeft: 12}}><path d="M4 9h10M10 5l4 4-4 4" stroke={C.accentBright} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            )}

            {/* ── Tab: Interview ── */}
            {activeTab === "interview" && (
              <div style={{ animation: "fadeUp 0.3s ease both", background: C.surface, border: "1px solid #4A3EC0", borderRadius: "12px 0 12px 12px", padding: "clamp(16px,3vw,24px)", marginBottom: 16, position: "relative", zIndex: 0 }}>
                {/* Mode header */}
                <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.border}`, textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.accentGlow, border: `1px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: C.accent, fontWeight: 600, fontFamily: C.mono }}>3</span>
                    </div>
                    <div style={{ fontSize: 11, letterSpacing: "0.15em", color: C.accent, fontFamily: C.mono, textTransform: "uppercase" }}>Walk in knowing exactly what to say</div>
                  </div>

                </div>
                <Card style={{ marginBottom: 12 }}>
                  <SectionLabel color={C.accent}>Interview Strategy</SectionLabel>
                  <div style={{ background: C.surface, borderRadius: 10, padding: "16px 18px", marginBottom: 18, borderLeft: `3px solid ${C.amber}` }}>
                    <div style={{ fontSize: 12, letterSpacing: "0.18em", color: C.amber, marginBottom: 8, fontFamily: C.mono, textTransform: "uppercase", textAlign: "left" }}>What they're really testing</div>
                    <p style={{ fontSize: 15, color: C.text, lineHeight: 1.8, fontFamily: C.sans, fontWeight: 400, margin: 0, textAlign: "left" }}>{r.whatTheyAreTesting}</p>
                  </div>
                  <QCard q={r.q1} whyAsking={r.q1whyAsking} intent={r.q1intent} approach={r.q1approach} mistake={r.q1mistake} num={1} />
                  <QCard q={r.q2} whyAsking={r.q2whyAsking} intent={r.q2intent} approach={r.q2approach} mistake={r.q2mistake} num={2} />
                  <QCard q={r.q3} whyAsking={r.q3whyAsking} intent={r.q3intent} approach={r.q3approach} mistake={r.q3mistake} num={3} />
                </Card>
                <Card style={{ marginBottom: 28 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <SectionLabel color={C.green}>Strong Answer — Use This as Your Template</SectionLabel>
                    <button onClick={() => copyText(r.exampleAnswer, setCopiedAnswer)}
                      style={{ background: "none", border: `1px solid ${C.border}`, color: copiedAnswer ? C.green : C.textDim, borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: C.mono, letterSpacing: "0.08em" }}>
                      {copiedAnswer ? "COPIED ✓" : "COPY"}
                    </button>
                  </div>
                  <div style={{ background: C.surface, borderRadius: 10, padding: "18px 20px", borderLeft: `3px solid ${C.green}` }}>
                    <p style={{ fontSize: 15, color: C.text, lineHeight: 1.85, fontFamily: C.sans, fontWeight: 400, margin: 0, textAlign: "left" }}>{r.exampleAnswer}</p>
                  </div>
                </Card>
              </div>
            )}

            {/* ── Completion feeling ── */}
            {activeTab === "interview" && (() => {
              const isStrong = r.fitVerdict === "Strong fit";
              const isSkip = r.fitVerdict === "Low probability";
              const headline = isStrong
                ? "You're in a strong position here."
                : isSkip
                ? "This one isn't worth your time. Move on."
                : "You can win this if you tighten your story.";
              const sub = isStrong
                ? "You've done the work. Walk in with confidence."
                : isSkip
                ? "Your time is better spent on a role that fits. Use what you've learned here."
                : "The gaps are real but closeable. Use the pitch and prep above before you go in.";
              const col = isStrong ? C.green : isSkip ? C.red : C.amber;
              const bg = isStrong ? C.greenBg : isSkip ? C.redBg : C.amberBg;
              const border = isStrong ? C.greenBorder : isSkip ? C.redBorder : C.amberBorder;
              return (
                <div style={{ margin: "8px 0 24px", padding: "24px 28px", background: bg, border: `1px solid ${border}`, borderRadius: 12, textAlign: "left" }}>
                  <div style={{ fontSize: 22, fontFamily: C.serif, fontWeight: 400, color: col, marginBottom: 8 }}>{headline}</div>
                  <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.7, margin: 0, fontFamily: C.sans }}>{sub}</p>
                </div>
              );
            })()}

            {/* Analyse another */}
            <div style={{ textAlign: "center", paddingBottom: 32 }}>
              <button onClick={() => { setResult(null); setJd(""); setScreen("input"); setActiveTab("fit"); }}
                style={{ background: `linear-gradient(135deg, ${C.accent}, #5548CC)`, color: "#fff", border: "none", borderRadius: 10, padding: "14px 40px", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: C.sans, letterSpacing: "0.04em", boxShadow: "0 4px 24px rgba(107,92,231,0.3)", transition: "transform 0.2s, box-shadow 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(107,92,231,0.45)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 4px 24px rgba(107,92,231,0.3)"; }}>
                Analyse Another Role →
              </button>
            </div>

          </div>
        </div>
      </>
    );
  }

  return null;
}