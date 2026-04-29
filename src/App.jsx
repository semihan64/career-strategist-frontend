import { useState, useEffect } from "react";

// ─── CSS (app-specific) ───────────────────────────────────────
const appCss = `
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:768px){
    .grid-2col{grid-template-columns:1fr !important}
    .score-grid{grid-template-columns:1fr !important}
    .pills-row{flex-wrap:wrap !important;gap:8px !important}
    .hide-mobile{display:none !important}
  }
`;

// ─── System prompt, colors, API ───────────────────────────────
const SYSTEM_PROMPT = `You are an AI Career Strategist. You think like a senior hiring manager and insider recruiter, not a career coach. Direct, specific, honest. Never generic.

You will receive a candidate CV and a job description. The CV may contain the candidate's name, extract it if present.

Return ONLY a valid JSON object. Plain ASCII only. No markdown, no backticks, no explanation.

RULES FOR NAME USE:
- Extract the candidate name from the CV if present, store in "candidateName"
- Use the name ONLY in: mindsetBanner and whatToDoNext
- Everywhere else use "you" / "your", neutral tone
- Do NOT repeat the name more than once per field
- If no name found, set candidateName to "" and use neutral tone throughout

JSON keys:

candidateName: string, extracted from CV, or empty string

matchScore: integer 0-100
skillsLevel: "High" or "Medium" or "Low"
domainLevel: "Strong" or "Moderate" or "Weak"
seniorityLevel: "Aligned" or "Slight stretch" or "Mismatch"

mindsetBanner: Write 2 to 3 sentences in this exact voice and style. Study these examples carefully and match them precisely:

EXAMPLE 1 (stretch role): "Aisha, five years of solid BA work and an IAM programme under your belt, that is not nothing. This role is a stretch, but the kind of stretch that actually makes sense for where you are. Walk in talking about outcomes you drove, not processes you followed."

EXAMPLE 2 (strong fit): "You have been doing this work at a higher level than your title suggests, and this role reflects that. The product design background is quietly one of your strongest cards here, most candidates will not have it. Do not bury it."

EXAMPLE 3 (low probability): "Honestly, this one is a bigger jump than it looks on paper. The experience is there in parts, but there are some real gaps that will come up in the room. Worth applying if you are okay with a long shot, but go in knowing what you are up against."

EXAMPLE 4 (good structure, no dashes): "Aisha brings hands-on transformation delivery and process redesign, exactly what frontline change work demands. The consulting angle is the only thing to shore up before the interview."

Now write one for this specific candidate and role. Use their name if known. Sound like a real person who read everything. No corporate words. No dashes of any kind. No em dashes. No hyphens used as pauses. No AI phrasing. Short sentences. Warm but direct.

ERROR HANDLING AND INPUT INTERPRETATION:
If the CV field is empty, is a job description, is just a name, or is unclear:
- Do NOT say "cannot evaluate" or sound technical or dismissive
- Do NOT use blunt system-like error messages
- Acknowledge what the user likely did in a natural human way
- Briefly explain the issue in plain language
- Guide them on what to do next
- Tone: calm, direct, human. No judgment, no blame, no robotic phrasing, no em dashes

Style examples for mindsetBanner in these cases:
- If CV appears to be a job description: "Looks like you may have pasted a job description here. Pop your own CV in the left box and I will give you the full picture."
- If CV is empty or just a name: "I do not have enough of your background to work with yet. Paste your CV on the left and I will break down exactly where you stand."
- If CV is very thin: "There is not much to go on here. The more of your background you share, the sharper the analysis will be."

Still return a valid JSON object with the same structure. Populate fields helpfully based on whatever information is available. Avoid generic placeholders. Keep the same warm direct tone throughout.

Return ONLY the JSON object. Nothing else.`;

const C = {
  bg: "#08090D", surface: "#0F1018", card: "#13141F", cardHover: "#181928",
  border: "#1E2030", borderLight: "#252740",
  accent: "#6B5CE7", accentBright: "#8B7CF8", accentGlow: "rgba(107,92,231,0.12)",
  amber: "#F59E0B", amberGlow: "rgba(245,158,11,0.1)",
  green: "#10B981", greenGlow: "rgba(16,185,129,0.1)",
  red: "#EF4444", redGlow: "rgba(239,68,68,0.1)",
  text: "#E2E4F0", textMuted: "#8892B0", textDim: "#8892B0",
};



// Point this to your deployed proxy URL
// Locally: http://localhost:3000/api/analyse
// Deployed: https://your-app.railway.app/api/analyse
const PROXY_URL = "https://career-strategist-backend-production.up.railway.app/api/analyse";



// ── Input preprocessing ──────────────────────────────────────

async function callClaude(_unused, userContent, cv, jd) {
  // Trim inputs to safe sizes
  const safeCv = (cv || "").slice(0, 5500).trim();
  const safeJd = (jd || "").slice(0, 7500).trim();

  if (!safeCv) throw new Error("CV_EMPTY");
  if (!safeJd) throw new Error("JD_EMPTY");

  let res, data;

  try {
    res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cv: safeCv,
        jd: safeJd,
      }),
    });
  } catch {
    throw new Error("NETWORK_ERROR");
  }

  try {
    data = await res.json();
  } catch {
    throw new Error("PARSE_ERROR");
  }

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (res.status === 404) throw new Error("SERVER_404");
  if (!res.ok || data.error) throw new Error(data.error || "HTTP_" + res.status);

  // Extract text from Claude response
  let clean = "";
  if (data.result) {
    // New backend format: already clean JSON string
    clean = data.result;
  } else if (data.content && data.content.length > 0) {
    // Raw Claude response format
    const raw = data.content
      .filter(b => b.type === "text")
      .map(b => b.text || "")
      .join("");
    if (!raw) throw new Error("EMPTY_RESPONSE");
    // Strip all markdown fences (multiline)
    const stripped = raw
      .split("\n")
      .filter(line => !line.match(/^```/))
      .join("\n")
      .trim();
    // Find outermost JSON object
    const s = stripped.indexOf("{");
    const e = stripped.lastIndexOf("}");
    if (s === -1 || e === -1) throw new Error("NO_JSON");
    clean = stripped.slice(s, e + 1);
  } else {
    throw new Error("EMPTY_RESPONSE");
  }

  clean = clean
    .replace(/‘|’/g, "'")
    .replace(/“|”/g, '"')
    .replace(/–|—/g, "-")
    .replace(/£/g, "GBP ");

  try {
    return JSON.parse(clean);
  } catch {
    throw new Error("INVALID_JSON");
  }
}




// ── Helpers ────────────────────────────────────────────────────

function pipeSplit(str) {
  return (str || "").split("|").map(s => s.trim()).filter(Boolean);
}

function BulletList({ items, dotColor, textSize = 13 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, textAlign: "left" }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 7, textAlign: "left" }}>
      {items.map((line, i) => (
        <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <div style={{ fontSize: 14, color: C.accentBright, fontFamily: "'IBM Plex Mono'", marginTop: 1, flexShrink: 0 }}>→</div>
          <p style={{ fontSize: 14, color: C.text, lineHeight: 1.7, fontFamily: "'IBM Plex Sans'", textAlign: "left" }}>{line}</p>
        </div>
      ))}
    </div>
  );
}

function Pill({ label, value, type }) {
  const col = {
    good: { dot: C.green,        text: C.green,        border: "rgba(16,185,129,0.25)" },
    warn: { dot: C.amber,        text: C.amber,        border: "rgba(245,158,11,0.25)" },
    bad:  { dot: C.red,          text: C.red,          border: "rgba(239,68,68,0.25)"  },
    neu:  { dot: C.accentBright, text: C.accentBright, border: "rgba(139,124,248,0.25)" },
  }[type] || { dot: C.accentBright, text: C.accentBright, border: "rgba(139,124,248,0.25)" };

  const dots = value === "High" || value === "Aligned" || value === "Strong" ? 3
             : value === "Medium" || value === "Moderate" || value === "Slight stretch" ? 2
             : 1;

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
    <div style={{ fontSize: 11, letterSpacing: 3, color: color || C.textMuted, fontFamily: "'IBM Plex Mono'", marginBottom: 8, textAlign: "left", display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 3, height: 12, background: color || C.accent, borderRadius: 2, flexShrink: 0 }} />
      {children}
    </div>
  );
}

function Card({ children, style = {}, glow }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", textAlign: "left", minWidth: 0, wordBreak: "break-word", boxShadow: glow ? `0 0 28px ${glow}` : "none", ...style }}>
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
    <div style={{ border: `1px solid ${open ? C.borderLight : C.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 8, transition: "border-color 0.2s" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: open ? C.cardHover : C.card, border: "none", padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left" }}>
        <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono'", color: C.accent, minWidth: 20, paddingTop: 2 }}>Q{num}</span>
        <span style={{ fontSize: 14, color: C.text, fontFamily: "'IBM Plex Sans'", flex: 1, lineHeight: 1.55 }}>{q}</span>
        <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 6, background: open ? C.accent : "rgba(107,92,231,0.12)", border: `1px solid ${open ? C.accent : "rgba(107,92,231,0.25)"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
          <span style={{ color: open ? "#fff" : C.accentBright, fontSize: 12, lineHeight: 1, display: "block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
        </div>
      </button>
      {open && (
        <div style={{ background: C.surface, padding: "14px 16px", display: "grid", gap: 12, animation: "fadeUp 0.2s ease" }}>
          {/* Why asking, most prominent */}
          <div style={{ background: `${C.amber}10`, border: `1px solid ${C.amber}30`, borderRadius: 6, padding: "8px 12px" }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: C.amber, marginBottom: 4, fontFamily: "'IBM Plex Mono'" }}>WHY THEY'RE ASKING THIS</div>
            <p style={{ fontSize: 14, color: C.text, lineHeight: 1.65, fontFamily: "'IBM Plex Sans'", fontWeight: 500 }}>{whyAsking}</p>
          </div>
          {[
            ["WHAT A STRONG ANSWER SHOWS", intent, C.accentBright],
            ["HOW YOU SHOULD APPROACH IT", approach, C.green],
            ["MISTAKE TO AVOID", mistake, C.red],
          ].map(([lbl, val, col]) => (
            <div key={lbl}>
              <div style={{ fontSize: 11, letterSpacing: 2, color: col, marginBottom: 5, fontFamily: "'IBM Plex Mono'" }}>{lbl}</div>
              <p style={{ fontSize: 14, color: C.text, lineHeight: 1.7, fontFamily: "'IBM Plex Sans'", textAlign: "left" }}>{val}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MindsetBanner({ text, verdict }) {
  const isStrong = verdict === "Strong fit";
  const isSkip   = verdict === "Low probability";
  const col    = isStrong ? C.green  : isSkip ? C.red  : C.amber;
  const bgRgba = isStrong ? "rgba(16,185,129,0.12)" : isSkip ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)";
  const borderRgba = isStrong ? "rgba(16,185,129,0.3)" : isSkip ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)";
  const Icon = () => isStrong
    ? <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{flexShrink:0}}><circle cx="10" cy="10" r="8" stroke={col} strokeWidth="1.5"/><path d="M6.5 10.5l2.5 2.5 4.5-5" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    : isSkip
    ? <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{flexShrink:0}}><circle cx="10" cy="10" r="8" stroke={col} strokeWidth="1.5"/><path d="M7 7l6 6M13 7l-6 6" stroke={col} strokeWidth="1.5" strokeLinecap="round"/></svg>
    : <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{flexShrink:0}}><polygon points="10,3 18,17 2,17" fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="round"/><line x1="10" y1="9" x2="10" y2="13" stroke={col} strokeWidth="1.5" strokeLinecap="round"/><circle cx="10" cy="15.5" r="0.8" fill={col}/></svg>;
  return (
    <div style={{ background: bgRgba, border: `1px solid ${borderRgba}`, borderRadius: 10, padding: "16px 20px", marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 14, animation: "fadeUp 0.35s ease both" }}>
      <Icon />
      <p style={{ fontSize: 17, color: col, fontWeight: 600, fontFamily: "'IBM Plex Sans'", lineHeight: 1.5, margin: 0, textAlign: "left" }}>{text}</p>
    </div>
  );
}

// ── Landing Page ─────────────────────────────────────────────

const landingCss = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body { background: #08090D; color: #E8E6FF; font-family: 'DM Sans', sans-serif; font-weight: 300; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=IBM+Plex+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');

  .wrap { width: 100%; max-width: 1100px; margin: 0 auto; padding: 0 60px; }
  @media(max-width:900px) { .wrap { padding: 0 32px; } }
  @media(max-width:600px) { .wrap { padding: 0 20px; } }

  .p-nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; transition: background 0.4s, border-color 0.4s; border-bottom: 1px solid transparent; }
  .p-nav.scrolled { background: rgba(8,9,13,0.9); backdrop-filter: blur(20px); border-bottom-color: #1C1C2A; }
  .p-nav .wrap { display: flex; align-items: center; justify-content: space-between; padding-top: 20px; padding-bottom: 20px; }
  .p-logo { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 500; color: #E8E6FF; text-decoration: none; }
  .p-logo b { color: #7C3AED; font-weight: 500; }
  .nav-cta { background: #7C3AED; color: #fff; border: none; border-radius: 6px; padding: 10px 22px; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; text-decoration: none; transition: transform 0.2s, box-shadow 0.2s; }
  .nav-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(124,58,237,0.4); }

  .hero-section { position: relative; overflow: hidden; min-height: 95vh; display: flex; align-items: center; }
  .hero-glow-a { position: absolute; top: 0; left: -200px; width: 700px; height: 700px; background: radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 65%); filter: blur(40px); pointer-events: none; }
  .hero-glow-b { position: absolute; bottom: 0; right: -100px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 65%); filter: blur(60px); pointer-events: none; }
  .hero-section .wrap { padding-top: 120px; padding-bottom: 80px; position: relative; }

  .eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #9B5FF5; font-family: 'IBM Plex Mono', monospace; margin-bottom: 28px; opacity: 0; transform: translateY(16px); animation: fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.2s forwards; }
  .eyebrow::before { content: ''; width: 20px; height: 1px; background: #9B5FF5; }
  .hero-title { font-family: 'Cormorant Garamond', serif; font-size: clamp(44px, 6.5vw, 82px); font-weight: 300; line-height: 1.05; max-width: 780px; margin-bottom: 24px; }
  .hero-title .l1 { display: block; opacity: 0; transform: translateY(24px); animation: fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.3s forwards; }
  .hero-title .l2 { display: block; font-style: italic; color: #9B5FF5; opacity: 0; transform: translateY(24px); animation: fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.45s forwards; }
  .hero-sub { font-size: 17px; color: #8892B0; max-width: 440px; line-height: 1.75; margin-bottom: 44px; opacity: 0; transform: translateY(16px); animation: fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.6s forwards; }
  .hero-btns { display: flex; align-items: center; gap: 20px; margin-bottom: 64px; flex-wrap: wrap; opacity: 0; transform: translateY(16px); animation: fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.75s forwards; }

  .btn-primary { background: #7C3AED; color: #fff; border: none; border-radius: 8px; padding: 14px 32px; font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 500; cursor: pointer; text-decoration: none; display: inline-block; transition: transform 0.2s, box-shadow 0.2s; }
  .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 32px rgba(124,58,237,0.4); }

  .stats-bar { display: grid; grid-template-columns: repeat(4,1fr); border: 1px solid #1C1C2A; border-radius: 12px; overflow: hidden; background: rgba(13,13,21,0.8); box-shadow: 0 0 0 1px rgba(124,58,237,0.08), inset 0 1px 0 rgba(255,255,255,0.03); opacity: 0; transform: translateY(16px); animation: fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.9s forwards; }
  .stat { padding: 22px 20px; border-right: 1px solid #1C1C2A; }
  .stat:last-child { border-right: none; }
  .stat-num { font-family: 'Cormorant Garamond', serif; font-size: 34px; font-weight: 300; color: #E8E6FF; line-height: 1; margin-bottom: 6px; }
  .stat-num em { color: #9B5FF5; font-style: normal; }
  .stat-lbl { font-size: 10px; color: #7A7A9A; letter-spacing: 0.1em; font-family: 'IBM Plex Mono', monospace; text-transform: uppercase; line-height: 1.5; }

  .features-section { padding: 80px 0 40px; }
  .features-section .wrap { display: flex; flex-direction: column; gap: 0; }

  .fcard { position: sticky; background: #0D0D15; border: 1px solid #1C1C2A; border-radius: 16px; padding: 56px; margin-bottom: 16px; transition: transform 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.5s cubic-bezier(0.16,1,0.3,1), border-color 0.3s; transform-origin: top center; }
  .fcard:hover { border-color: rgba(124,58,237,0.25); }
  .fcard.fc0 { top: 88px; z-index: 1; }
  .fcard.fc1 { top: 96px; z-index: 2; }
  .fcard.fc2 { top: 104px; z-index: 3; }
  .fcard.push1 { transform: scale(0.97) translateY(-8px); opacity: 0.65; }
  .fcard.push2 { transform: scale(0.94) translateY(-16px); opacity: 0.35; }

  .fcard-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 72px; align-items: center; }
  .fcard-inner.flip { direction: rtl; }
  .fcard-inner.flip > * { direction: ltr; }

  .ftag { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #9B5FF5; font-family: 'IBM Plex Mono', monospace; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
  .ftag::before { content: ''; width: 14px; height: 1px; background: #9B5FF5; }
  .ftitle { font-family: 'Cormorant Garamond', serif; font-size: clamp(28px, 3vw, 40px); font-weight: 300; line-height: 1.15; margin-bottom: 16px; }
  .ftitle em { font-style: italic; color: #9B5FF5; }
  .fbody { font-size: 14px; color: #8892B0; line-height: 1.8; margin-bottom: 20px; }
  .fpoints { display: flex; flex-direction: column; gap: 8px; }
  .fpoint { font-size: 13px; color: #8892B0; display: flex; gap: 8px; align-items: flex-start; }
  .fpoint::before { content: '→'; color: #9B5FF5; flex-shrink: 0; margin-top: 1px; font-size: 11px; }

  .mockup { background: #111119; border: 1px solid #1C1C2A; border-radius: 12px; overflow: hidden; box-shadow: 0 24px 48px rgba(0,0,0,0.4); transform: perspective(1000px) rotateY(-4deg) rotateX(2deg); transition: transform 0.6s cubic-bezier(0.16,1,0.3,1); }
  .mockup:hover { transform: none; }
  .fcard-inner.flip .mockup { transform: perspective(1000px) rotateY(4deg) rotateX(2deg); }
  .fcard-inner.flip .mockup:hover { transform: none; }
  .mbar { padding: 10px 14px; border-bottom: 1px solid #1C1C2A; display: flex; align-items: center; gap: 5px; }
  .mdot { width: 7px; height: 7px; border-radius: 50%; }
  .mtitle { font-size: 9px; letter-spacing: 0.15em; color: #4A4A6A; font-family: 'IBM Plex Mono', monospace; margin-left: 6px; }
  .mbody { padding: 18px; }
  .mscore { font-family: 'Cormorant Garamond', serif; font-size: 46px; font-weight: 300; line-height: 1; margin-bottom: 4px; }
  .mverdict { font-size: 13px; font-weight: 600; color: #F59E0B; margin-bottom: 4px; }
  .mreason { font-size: 11px; color: #8892B0; line-height: 1.5; margin-bottom: 12px; }
  .mpills { display: flex; gap: 6px; flex-wrap: wrap; }
  .mpill { padding: 4px 9px; border-radius: 4px; font-size: 10px; font-family: 'IBM Plex Mono', monospace; font-weight: 500; }
  .mpill.g { background: rgba(16,185,129,0.1); color: #10B981; border: 1px solid rgba(16,185,129,0.2); }
  .mpill.a { background: rgba(245,158,11,0.1); color: #F59E0B; border: 1px solid rgba(245,158,11,0.2); }
  .mq { background: #08090D; border: 1px solid #1C1C2A; border-radius: 7px; padding: 10px 12px; margin-bottom: 7px; }
  .mqn { font-size: 9px; color: #9B5FF5; font-family: 'IBM Plex Mono', monospace; margin-bottom: 3px; }
  .mqt { font-size: 11px; color: #E8E6FF; line-height: 1.5; }
  .mtag { display: inline-block; margin-top: 5px; padding: 2px 7px; border-radius: 3px; background: rgba(124,58,237,0.1); border: 1px solid rgba(124,58,237,0.2); font-size: 9px; color: #9B5FF5; font-family: 'IBM Plex Mono', monospace; }
  .mpitch { background: #08090D; border-left: 3px solid #7C3AED; border-radius: 0 7px 7px 0; padding: 12px 14px; font-size: 11px; color: #8892B0; line-height: 1.7; font-style: italic; margin-bottom: 10px; }
  .mpos-lbl { font-size: 9px; color: #4A4A6A; font-family: 'IBM Plex Mono', monospace; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.1em; }
  .mpos { font-size: 11px; color: #9B5FF5; font-weight: 500; line-height: 1.4; }

  .fact-section { border-top: 1px solid #1C1C2A; border-bottom: 1px solid #1C1C2A; padding: 18px 0; }
  .fact-section .wrap { display: flex; align-items: center; justify-content: center; gap: 16px; flex-wrap: wrap; }
  .fi { font-size: 12px; color: #8892B0; font-family: 'IBM Plex Mono', monospace; white-space: nowrap; }
  .fi span { color: #9B5FF5; font-weight: 500; }
  .fdot { color: #1C1C2A; font-size: 18px; line-height: 1; }

  .t-section { padding: 64px 0; overflow: hidden; }
  .t-section .wrap { margin-bottom: 24px; }
  .t-label { font-size: 10px; letter-spacing: 0.2em; color: #7A7A9A; font-family: 'IBM Plex Mono', monospace; text-transform: uppercase; display: flex; align-items: center; gap: 12px; }
  .t-label::after { content: ''; flex: 1; height: 1px; background: #1C1C2A; }
  .t-outer { overflow: hidden; width: 100%; }
  .t-track { display: flex; gap: 12px; width: max-content; animation: marquee 40s linear infinite; will-change: transform; }
  .t-track:hover { animation-play-state: paused; }
  .t-card { background: #111119; border: 1px solid #1C1C2A; border-radius: 10px; padding: 18px 20px; width: 260px; min-height: 180px; flex-shrink: 0; transition: border-color 0.3s, transform 0.3s; display: flex; flex-direction: column; justify-content: space-between; }
  .t-card:hover { border-color: rgba(124,58,237,0.3); transform: translateY(-3px); }
  .t-quote { font-size: 12px; color: #8892B0; line-height: 1.7; margin-bottom: 14px; }
  .t-auth { display: flex; align-items: center; gap: 8px; }
  .t-av { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg,#7C3AED,#4B3EC7); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 600; color: #fff; flex-shrink: 0; }
  .t-name { font-size: 12px; color: #E8E6FF; font-weight: 500; }
  .t-role { font-size: 10px; color: #7A7A9A; margin-top: 1px; }

  .cta-section { position: relative; overflow: hidden; padding: 120px 0; text-align: center; }
  .cta-glow { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 800px; height: 400px; background: radial-gradient(ellipse, rgba(124,58,237,0.12) 0%, transparent 70%); filter: blur(20px); pointer-events: none; }
  .cta-section .wrap { position: relative; }
  .cta-title { font-family: 'Cormorant Garamond', serif; font-size: clamp(38px, 5.5vw, 64px); font-weight: 300; line-height: 1.1; margin-bottom: 20px; }
  .cta-title em { font-style: italic; color: #9B5FF5; }
  .cta-sub { font-size: 16px; color: #8892B0; max-width: 500px; margin: 0 auto 40px; line-height: 1.7; }
  .cta-note { font-size: 12px; color: #7A7A9A; margin-top: 14px; font-family: 'IBM Plex Mono', monospace; }

  .footer-section { border-top: 1px solid #1C1C2A; }
  .footer-section .wrap { padding-top: 28px; padding-bottom: 28px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
  .f-logo { font-family: 'Cormorant Garamond', serif; font-size: 20px; font-weight: 500; }
  .f-logo b { color: #7C3AED; font-weight: 500; }
  .f-tag { font-size: 13px; color: #7A7A9A; font-style: italic; }

  .reveal { opacity: 0; transform: translateY(32px); transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1); }
  .reveal.on { opacity: 1; transform: none; }

  @keyframes fadeUp { to { opacity: 1; transform: translateY(0); } }
  @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }

  @media(max-width: 768px) {
    .fcard-inner { grid-template-columns: 1fr; gap: 32px; }
    .fcard-inner.flip { direction: ltr; }
    .fcard { padding: 28px 20px; }
    .mockup { transform: none !important; }
    .stats-bar { grid-template-columns: 1fr 1fr; }
    .stat:nth-child(2) { border-right: none; }
    .stat:nth-child(3), .stat:nth-child(4) { border-top: 1px solid #1C1C2A; }
    .stat:nth-child(4) { border-right: none; }
    .hero-title { font-size: clamp(36px, 9vw, 52px); }
    .hero-btns .btn-primary { width: 100%; text-align: center; }
  }
`;

const testimonials = [
  { initials: "AO", name: "Adaeze O.", role: "Senior Business Analyst, London", quote: "I tested it with just my name and a role title and it came back with genuinely intelligent analysis. Color me impressed." },
  { initials: "TK", name: "Taiwo K.", role: "Product Manager, Fintech", quote: "I thought I was underselling myself. Turns out I was telling the wrong story entirely. Perceive showed me exactly what to change." },
  { initials: "SM", name: "Sofia M.", role: "Data Analyst, SaaS", quote: "The interview questions were scarily accurate. One came up almost word for word in my actual interview." },
  { initials: "JB", name: "James B.", role: "Business Analyst, Financial Services", quote: "The hiring manager section is the most useful thing. I finally understood why I kept getting screened out at the same stage." },
  { initials: "NK", name: "Nadia K.", role: "Delivery Manager, Tech", quote: "I was sceptical but the pitch it wrote for me was better than anything I'd written myself. Used it in my next interview." },
  { initials: "RO", name: "Rachel O.", role: "Change Manager, Consulting", quote: "Finally something that doesn't just tell me I'm a great candidate. It told me exactly what was costing me offers. That's rare." },
];

function Mockup1() {
  return (
    <div className="mockup">
      <div className="mbar">
        <div className="mdot" style={{background:"#EF4444"}}></div>
        <div className="mdot" style={{background:"#F59E0B"}}></div>
        <div className="mdot" style={{background:"#10B981"}}></div>
        <span className="mtitle">MATCH ANALYSIS</span>
      </div>
      <div className="mbody">
        <div className="mscore">78<span style={{fontSize:20,color:"#1C1C2A"}}>%</span></div>
        <div style={{fontSize:9,letterSpacing:2,color:"#4A4A6A",fontFamily:"'IBM Plex Mono',monospace",marginBottom:10}}>MATCH SCORE</div>
        <div className="mverdict">Winnable, reposition first</div>
        <div className="mreason">Strong BA fundamentals. The consulting narrative gap must be addressed before the interview.</div>
        <div className="mpills">
          <span className="mpill g">Skills: High</span>
          <span className="mpill a">Domain: Moderate</span>
          <span className="mpill g">Seniority: Aligned</span>
        </div>
      </div>
    </div>
  );
}

function Mockup2() {
  return (
    <div className="mockup">
      <div className="mbar">
        <div className="mdot" style={{background:"#EF4444"}}></div>
        <div className="mdot" style={{background:"#F59E0B"}}></div>
        <div className="mdot" style={{background:"#10B981"}}></div>
        <span className="mtitle">INTERVIEW STRATEGY</span>
      </div>
      <div className="mbody">
        <div className="mq"><div className="mqn">Q1</div><div className="mqt">Walk me through a time a stakeholder pushed back on your analysis.</div><span className="mtag">Why they're asking →</span></div>
        <div className="mq"><div className="mqn">Q2</div><div className="mqt">How do you translate complex findings for non-technical stakeholders?</div><span className="mtag">How to approach it →</span></div>
        <div className="mq"><div className="mqn">Q3</div><div className="mqt">Give me an example where you delivered under tight constraints.</div><span className="mtag">Mistake to avoid →</span></div>
      </div>
    </div>
  );
}

function Mockup3() {
  return (
    <div className="mockup">
      <div className="mbar">
        <div className="mdot" style={{background:"#EF4444"}}></div>
        <div className="mdot" style={{background:"#F59E0B"}}></div>
        <div className="mdot" style={{background:"#10B981"}}></div>
        <span className="mtitle">YOUR 30-SECOND PITCH</span>
      </div>
      <div className="mbody">
        <div className="mpitch">"I'm a Business Analyst with five years across fintech and SaaS. Most recently I led the IAM transformation at Paysafe, deep in access governance and stakeholder alignment. My design background gives me an edge translating complex requirements into things teams can actually build."</div>
        <div className="mpos-lbl">Position as</div>
        <div className="mpos">A BA with deep IAM experience and rare UX fluency in regulated fintech environments</div>
      </div>
    </div>
  );
}

// ─── Career App ───────────────────────────────────────────────
export default function App() {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = appCss;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  const [screen, setScreen]   = useState("input");
  const [cv, setCv]           = useState("");
  const [jd, setJd]           = useState("");
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError]     = useState("");

  const LOADING_MESSAGES = [
    "Reading the room…",
    "Thinking like a hiring manager…",
    "We're about to create magic…",
    "Checking your positioning…",
    "Almost there, just a moment…",
    "Pulling the honest read…",
    "Analysing your fit…",
    "Finding your edge…",
  ];

  const [copiedPitch, setCopiedPitch] = useState(false);
  const [copiedAnswer, setCopiedAnswer] = useState(false);




  const handleAnalyse = async () => {
    // Fix 6: validate both fields present before anything else
    if (!cv.trim()) { setError("Paste your CV on the left to get started."); return; }
    if (!jd.trim()) { setError("Paste a job description to continue."); return; }
    // Fix 5: prevent double-submit
    if (loading) return;
    setError(""); setLoading(true); setResult(null);
    setLoadingMsg(LOADING_MESSAGES[0]);
    let msgIndex = 0;
    const msgInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[msgIndex]);
    }, 2200);
    try {
      const data = await callClaude(null, null, cv, jd);
      clearInterval(msgInterval);
      setResult(data); setScreen("result");
    } catch (err) {
      clearInterval(msgInterval);
      const msg = err.message || "";
      // Fix 4+5: map specific error codes to clear user messages
      if (msg === "CV_EMPTY") {
        setError("Paste your CV on the left to get started.");
      } else if (msg === "JD_EMPTY") {
        setError("Paste a job description on the right to continue.");
      } else if (msg === "RATE_LIMITED" || msg.includes("on a roll") || msg.includes("429")) {
        setError("You're on a roll. Check back in an hour.");
      } else if (msg === "NETWORK_ERROR" || msg.includes("Failed to fetch") || msg.includes("Load failed")) {
        setError("Can't reach the server. Check your connection and try again.");
      } else if (msg === "SERVER_404") {
        setError("The server is unavailable right now. Try again in a moment.");
      } else if (msg === "EMPTY_RESPONSE" || msg === "NO_JSON" || msg === "INVALID_JSON" || msg === "PARSE_ERROR") {
        setError("The analysis returned an unexpected response. Try again.");
      } else if (msg.includes("too long") || msg.includes("Too long") || msg.includes("Input too long") || msg.includes("413")) {
        setError("Something went wrong. Give it a moment and try again.");
      } else {
        setError("Something went wrong: " + msg.slice(0, 120));
      }
    }
    setLoading(false);
  };

  const copyText = (text, setter) => {
    navigator.clipboard.writeText(text);
    setter(true); setTimeout(() => setter(false), 2000);
  };

  const applyColor = (v) => v === "Apply now" ? C.green : v === "Skip this one" ? C.red : C.amber;
  const fitColor   = (v) => v === "Strong fit" ? C.green : v === "Low probability" ? C.red : C.amber;



  // ── INPUT ────────────────────────────────────────────────────
  if (screen === "input") return (
    <>
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'IBM Plex Sans', sans-serif", padding: "0", textAlign: "left", paddingTop: 64 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(24px, 5vw, 60px) 24px" }}>

          {/* Perceive header bar */}
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: C.bg, borderBottom: `1px solid ${C.border}`, animation: "fadeUp 0.4s ease" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px clamp(24px,5vw,60px)", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <a href="index.html" style={{ display: "flex", alignItems: "baseline", gap: 6, textDecoration: "none", cursor: "pointer" }}>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: C.text, letterSpacing: "0.02em" }}>Perceive</span>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: C.accent }}>.</span>
            </a>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(16,185,129,0.06)", border: "0.5px solid rgba(16,185,129,0.2)", borderRadius: 20, padding: "5px 14px 5px 10px" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.green, fontFamily: "'IBM Plex Mono'", opacity: 0.85 }}>No sign up. No data stored.</span>
            </div>
            </div>
          </div>

          {/* Hero copy block, Option B: Eyebrow above headline */}
          <div style={{ marginBottom: 0, animation: "fadeUp 0.5s ease 0.05s both", textAlign: "left", padding: "36px 0 40px" }}>
            {/* Eyebrow, flat label, no pill */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 16, height: 1, background: C.accent, flexShrink: 0 }} />
              <span style={{ fontSize: 10, letterSpacing: "0.2em", color: C.accent, fontFamily: "'IBM Plex Mono'", textTransform: "uppercase" }}>Role Intelligence</span>
            </div>
            {/* Headline with vertical rule */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
              <div style={{ width: 4, background: C.accent, borderRadius: 2, flexShrink: 0, alignSelf: "stretch", minHeight: 90 }} />
              <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(36px, 5vw, 52px)", fontWeight: 300, color: C.text, lineHeight: 1.1, margin: 0 }}>
                You're getting interviews…<br/>
                <span style={{ fontStyle: "italic", color: C.accent, fontWeight: 400 }}>so why aren't you getting offers?</span>
              </h1>
            </div>
            {/* Subtext */}
            <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.7, margin: 0, fontWeight: 400, paddingLeft: 20 }}>
              Most candidates walk in guessing. You won't.
            </p>
          </div>

          {/* Feature strip */}
          <div style={{ paddingBottom: 32, animation: "fadeUp 0.5s ease 0.3s both" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.18em", color: C.textMuted, textTransform: "uppercase", fontFamily: "'IBM Plex Mono'", marginBottom: 14, opacity: 0.6 }}>What you get</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[
                { label: "Match score", icon: <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#7C3AED" strokeWidth="1.3"/><path d="M4.5 7.5l2 2 3-3.5" stroke="#7C3AED" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> },
                { label: "Hiring manager view", icon: <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="2.5" stroke="#7C3AED" strokeWidth="1.3"/><path d="M2.5 12c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="#7C3AED" strokeWidth="1.3" strokeLinecap="round"/></svg> },
                { label: "Why you might get rejected", icon: <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#7C3AED" strokeWidth="1.3"/><path d="M7 4.5v3M7 9.5v.5" stroke="#7C3AED" strokeWidth="1.3" strokeLinecap="round"/></svg> },
                { label: "Your edge", icon: <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2L8.5 5.5H12.5L9.5 7.8L10.8 11.5L7 9.2L3.2 11.5L4.5 7.8L1.5 5.5H5.5Z" stroke="#7C3AED" strokeWidth="1.2" strokeLinejoin="round"/></svg> },
                { label: "30-second pitch", icon: <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M2 7h7M2 10h5" stroke="#7C3AED" strokeWidth="1.3" strokeLinecap="round"/></svg> },
                { label: "Interview questions", icon: <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="2" stroke="#7C3AED" strokeWidth="1.3"/><path d="M5 5.5h4M5 8h3" stroke="#7C3AED" strokeWidth="1.3" strokeLinecap="round"/></svg> },
                { label: "What to do next", icon: <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.5 7h9M8.5 4l3 3-3 3" stroke="#7C3AED" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> },
              ].map((item, i) => (
                <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(107,92,231,0.06)", border: "0.5px solid rgba(107,92,231,0.18)", borderRadius: 999, padding: "6px 12px 6px 9px", fontSize: 12, color: C.textMuted, animation: `fadeUp 0.4s ease ${0.35 + i * 0.08}s both`, cursor: "default" }}>
                  {item.icon}
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, animation: "fadeUp 0.4s ease 0.15s both" }}>
          <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, letterSpacing: "0.15em", color: C.textMuted, fontFamily: "'IBM Plex Mono'", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Your CV</label>
              <textarea value={cv} onChange={e => setCv(e.target.value.slice(0, 8000))} rows={9}
                placeholder="Paste your CV here. Include your name for a personalised analysis."
                style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 16px", color: C.text, fontSize: 14, fontFamily: "'IBM Plex Mono'", outline: "none", lineHeight: 1.7, transition: "border-color 0.2s" }}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e => e.target.style.borderColor = C.border} />

            </div>
            <div>
              <label style={{ fontSize: 11, letterSpacing: "0.15em", color: C.textMuted, fontFamily: "'IBM Plex Mono'", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Job Description</label>
              <textarea value={jd} onChange={e => { setJd(e.target.value.slice(0, 10000)); setError(""); }}
                placeholder="Paste the job description here..." rows={9}
                style={{ width: "100%", background: C.card, border: `1px solid ${error ? C.red : C.border}`, borderRadius: 10, padding: "14px 16px", color: C.text, fontSize: 14, fontFamily: "'IBM Plex Mono'", outline: "none", lineHeight: 1.7, transition: "border-color 0.2s" }}
                onFocus={e => { if (!error) e.target.style.borderColor = C.accent; }}
                onBlur={e => { if (!error) e.target.style.borderColor = C.border; }} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <span style={{ fontSize: 11, color: jd.length > 9000 ? C.amber : C.textMuted, fontFamily: "'IBM Plex Mono'", transition: "color 0.2s", opacity: 0.7 }}>{jd.length} / 10000 characters</span>
              </div>


            </div>
          </div>

          <button onClick={handleAnalyse} disabled={loading}
            style={{ width: "100%", background: loading ? C.surface : C.accent, color: "#fff", border: "none", borderRadius: 10, padding: "16px 0", fontSize: 14, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer", fontFamily: "'IBM Plex Sans'", letterSpacing: "0.04em", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, animation: "fadeUp 0.4s ease 0.25s both", transition: "opacity 0.2s, transform 0.15s" }}
            onMouseEnter={e => { if (!loading) e.target.style.opacity = "0.88"; }}
            onMouseLeave={e => { if (!loading) e.target.style.opacity = "1"; }}>
            {loading
              ? (<><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> {loadingMsg}</>)
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
    </>
  );

  // ── RESULT ───────────────────────────────────────────────────
  if (screen === "result" && result) {
    const r = result;
    const whyFitBullets   = pipeSplit(r.whyFit);
    const hmBullets       = pipeSplit(r.hiringManagerCares);
    const redFlagBullets  = pipeSplit(r.redFlags);
    const rejBullets      = pipeSplit(r.rejectionRisk);
    const actionBullets   = pipeSplit(r.whatToDoNext);

    return (
      <>
          <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'IBM Plex Sans', sans-serif", padding: "clamp(16px,4vw,28px) clamp(16px,4vw,20px)", paddingTop: 72, textAlign: "left", overflowX: "hidden" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", overflowX: "hidden", width: "100%" }}>

            {/* Nav */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: C.bg, borderBottom: `1px solid ${C.border}`, animation: "fadeUp 0.3s ease" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "14px clamp(24px,5vw,60px)", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, cursor: "pointer" }} onClick={() => window.location.href="index.html"}>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: C.text, letterSpacing: "0.02em" }}>Perceive</span>
              <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 500, color: C.accent }}>.</span>
            </div>
              <button onClick={() => { setResult(null); setScreen("input"); }}
                style={{ background: C.card, border: `1px solid ${C.border}`, color: C.textMuted, borderRadius: 6, padding: "7px 14px", fontSize: 11, cursor: "pointer", fontFamily: "'IBM Plex Mono'" }}>← NEW ROLE</button>
            </div></div>

            {/* Mindset banner, name used here */}
            <MindsetBanner text={r.mindsetBanner || r.fitReason} verdict={r.fitVerdict} />

            {/* Score card */}
            <Card style={{ marginBottom: 14, animation: "fadeUp 0.4s ease 0.05s both" }}>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "20px", alignItems: "start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: "'Bebas Neue'", fontSize: 68, color: C.text, lineHeight: 1, letterSpacing: "-1px" }}>
                    {r.matchScore}<span style={{ fontSize: 28, color: C.textMuted, fontWeight: 400 }}>%</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: "'IBM Plex Mono'", letterSpacing: 3, marginTop: 4 }}>MATCH SCORE</div>
                </div>
                <div className="score-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, minWidth: 0 }}>
                  <div style={{ borderLeft: `2px solid ${fitColor(r.fitVerdict)}40`, paddingLeft: 14 }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: C.textMuted, fontFamily: "'IBM Plex Mono'", marginBottom: 6 }}>REALITY CHECK</div>
                    <div style={{ fontSize: 18, color: fitColor(r.fitVerdict), fontWeight: 600, fontFamily: "'IBM Plex Sans'", marginBottom: 8 }}>{r.fitVerdict}</div>
                    <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.7, margin: 0, textAlign: "left", textAlign: "left" }}>{r.fitReason}</p>
                  </div>
                  <div style={{ borderLeft: `2px solid ${applyColor(r.applyVerdict)}40`, paddingLeft: 14 }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: C.textMuted, fontFamily: "'IBM Plex Mono'", marginBottom: 6 }}>SHOULD YOU APPLY?</div>
                    <div style={{ fontSize: 18, color: applyColor(r.applyVerdict), fontWeight: 600, fontFamily: "'IBM Plex Sans'", marginBottom: 8 }}>{r.applyVerdict}</div>
                    <p style={{ fontSize: 14, color: C.textMuted, lineHeight: 1.7, margin: 0, textAlign: "left", textAlign: "left" }}>{r.applyReason}</p>
                  </div>
                </div>
              </div>
              <div className="pills-row" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, display: "flex", gap: 0 }}>
                <div style={{ flex: 1, borderRight: "none", paddingLeft: 0, paddingRight: 24 }}>
                  <Pill label="SKILLS"    value={r.skillsLevel}    type={r.skillsLevel === "High" ? "good"    : r.skillsLevel === "Medium" ? "warn" : "bad"} />
                </div>
                <div style={{ flex: 1, borderLeft: `1px solid ${C.border}`, paddingLeft: 24, paddingRight: 24 }}>
                  <Pill label="DOMAIN"    value={r.domainLevel}    type={r.domainLevel === "Strong" ? "good"  : r.domainLevel === "Moderate" ? "warn" : "bad"} />
                </div>
                <div style={{ flex: 1, borderLeft: `1px solid ${C.border}`, paddingLeft: 24, paddingRight: 0 }}>
                  <Pill label="SENIORITY" value={r.seniorityLevel} type={r.seniorityLevel === "Aligned" ? "good" : r.seniorityLevel === "Slight stretch" ? "warn" : "bad"} />
                </div>
              </div>
            </Card>

            {/* Why Fit + Edge */}
            <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <Card style={{ animation: "fadeUp 0.4s ease 0.1s both" }}>
                <Label color={C.green}>WHY YOU FIT</Label>
                <BulletList items={whyFitBullets} dotColor={C.green} />
              </Card>
              <Card style={{ animation: "fadeUp 0.4s ease 0.13s both" }}>
                <Label color={C.accentBright}>YOUR EDGE</Label>
                <p style={{ fontSize: 14, color: C.text, lineHeight: 1.75, textAlign: "left", fontFamily: "'IBM Plex Sans'", textAlign: "left" }}>{r.edge}</p>
              </Card>
            </div>

            {/* HM Lens + Rejection Risk */}
            <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <Card style={{ animation: "fadeUp 0.4s ease 0.16s both" }}>
                <Label color={C.amber}>HIRING MANAGER LENS</Label>
                <BulletList items={hmBullets} dotColor={C.amber} />
                <Divider />
                <Label color={C.red}>RED FLAGS THEY'LL NOTICE</Label>
                <BulletList items={redFlagBullets} dotColor={C.red} />
              </Card>
              <Card style={{ animation: "fadeUp 0.4s ease 0.19s both" }}>
                <Label color={C.red}>WHY YOU MIGHT GET REJECTED</Label>
                <BulletList items={rejBullets} dotColor={C.red} />
                <Divider />
                {/* name used here in action bullets (via AI output) */}
                <Label color={C.accentBright}>WHAT YOU SHOULD DO NEXT</Label>
                <ActionList items={actionBullets} />
              </Card>
            </div>

            {/* 30-second pitch */}
            <Card style={{ marginBottom: 12, animation: "fadeUp 0.4s ease 0.22s both" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Label color={C.accentBright}>YOUR 30-SECOND PITCH</Label>
                <button onClick={() => copyText(r.pitch, setCopiedPitch)}
                  style={{ background: "none", border: `1px solid ${C.border}`, color: copiedPitch ? C.green : C.textMuted, borderRadius: 4, padding: "4px 10px", fontSize: 10, cursor: "pointer", fontFamily: "'IBM Plex Mono'", letterSpacing: 1, marginBottom: 10 }}>
                  {copiedPitch ? "COPIED ✓" : "COPY"}
                </button>
              </div>
              <div style={{ background: C.surface, borderRadius: 8, padding: "14px 16px", borderLeft: `3px solid ${C.accent}`, marginBottom: 12 }}>
                <p style={{ fontSize: 15, color: C.text, lineHeight: 1.9, fontStyle: "italic", textAlign: "left", fontFamily: "'IBM Plex Sans'" }}>"{r.pitch}"</p>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: C.textMuted, fontFamily: "'IBM Plex Mono'", whiteSpace: "nowrap", paddingTop: 2 }}>POSITION AS</div>
                <div style={{ fontSize: 14, color: C.accentBright, fontWeight: 600, lineHeight: 1.6, textAlign: "left", fontFamily: "'IBM Plex Sans'" }}>{r.positioning}</div>
              </div>
            </Card>

            {/* Interview strategy */}
            <Card style={{ marginBottom: 12, animation: "fadeUp 0.4s ease 0.25s both" }}>
              <Label color={C.accent}>INTERVIEW STRATEGY</Label>
              <div style={{ background: C.surface, borderRadius: 8, padding: "12px 14px", marginBottom: 14, borderLeft: `3px solid ${C.amber}` }}>
                <div style={{ fontSize: 11, letterSpacing: 2, color: C.amber, marginBottom: 6, fontFamily: "'IBM Plex Mono'" }}>WHAT THEY'RE REALLY TESTING</div>
                <p style={{ fontSize: 14, color: C.text, lineHeight: 1.75, textAlign: "left", fontFamily: "'IBM Plex Sans'", textAlign: "left" }}>{r.whatTheyAreTesting}</p>
              </div>
              <QCard q={r.q1} whyAsking={r.q1whyAsking} intent={r.q1intent} approach={r.q1approach} mistake={r.q1mistake} num={1} />
              <QCard q={r.q2} whyAsking={r.q2whyAsking} intent={r.q2intent} approach={r.q2approach} mistake={r.q2mistake} num={2} />
              <QCard q={r.q3} whyAsking={r.q3whyAsking} intent={r.q3intent} approach={r.q3approach} mistake={r.q3mistake} num={3} />
            </Card>

            {/* Example answer */}
            <Card style={{ animation: "fadeUp 0.4s ease 0.28s both", marginBottom: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Label color={C.green}>STRONG ANSWER. USE THIS AS YOUR TEMPLATE</Label>
                <button onClick={() => copyText(r.exampleAnswer, setCopiedAnswer)}
                  style={{ background: "none", border: `1px solid ${C.border}`, color: copiedAnswer ? C.green : C.textMuted, borderRadius: 4, padding: "4px 10px", fontSize: 10, cursor: "pointer", fontFamily: "'IBM Plex Mono'", letterSpacing: 1, marginBottom: 10 }}>
                  {copiedAnswer ? "COPIED ✓" : "COPY"}
                </button>
              </div>
              <div style={{ background: C.surface, borderRadius: 8, padding: "16px 18px", borderLeft: `3px solid ${C.green}` }}>
                <p style={{ fontSize: 15, color: C.text, lineHeight: 1.95, fontFamily: "'IBM Plex Sans'", textAlign: "left" }}>{r.exampleAnswer}</p>
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
      </>
    );
  }

  return null;
}