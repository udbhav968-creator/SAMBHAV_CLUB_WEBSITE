import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getAccessToken, refreshSession } from "../api/client";
import { reduceMotion } from "../lib/fx";

/**
 * Vihaan — Sambhav's robot guide.
 *  - Streams answers from POST /api/v1/ai/chat (Server-Sent Events over fetch, so the access token travels in a header).
 *  - `action` events drive client-side navigation; `tool` events show what the robot is looking up.
 *  - Voice in (Web Speech recognition, en-IN) and voice out (speechSynthesis), both optional and feature-detected.
 */
/** `id` = telemetry interaction id (from the done event) used for thumbs up/down; `rated` once feedback is sent. */
type Msg = { role: "user" | "assistant"; content: string; id?: string; rated?: 1 | -1 };
type Mood = "" | "wave" | "think" | "talk" | "point";
const CHIPS: [string, string][] = [["What's on this week?", "What's on this week?"], ["Explain Nash equilibrium", "Explain Nash equilibrium with a tiny example"], ["Open Roulette Lab", "open roulette"], ["How do I check in?", "How do I check in to attendance?"], ["My progress", "How am I doing — points, rank and attendance?"]];
const TOOL_LABEL: Record<string, string> = { get_club_snapshot: "Checking the club board…", search_site: "Searching modules & games…", get_my_progress: "Reading your progress…", navigate: "Opening the page…" };
const HELLO = "Hi! I'm **Vihaan**, Sambhav's robot guide. Ask me to open a page, explain an idea like *Nash equilibrium*, or tell you what's on this week.";
const STORE = "sambhav.vihaan";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Tiny, escape-first markdown: **bold**, *italic*, `code`, "- " bullet lists, paragraphs. */
export function md(src: string) {
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const out: string[] = []; let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((l) => `<li>${l}</li>`).join("")}</ul>`); list = []; } };
  for (const line of src.split("\n")) {
    const m = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
    if (m) list.push(inline(m[1])); else { flush(); if (line.trim()) out.push(`<p>${inline(line)}</p>`); }
  }
  flush(); return out.join("");
}

export function Robot({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return <svg className={`vh-bot ${className}`} viewBox="0 0 120 120" aria-hidden="true">
    <defs><linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset=".55" stopColor="#22d3ee" /><stop offset="1" stopColor="#2fe39e" /></linearGradient>
      <radialGradient id={`b${id}`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff" /><stop offset=".45" stopColor="#ffd27a" /><stop offset="1" stopColor="#ffb224" stopOpacity="0" /></radialGradient></defs>
    <g><line x1="60" y1="20" x2="60" y2="9" stroke="#c7d2fe" strokeWidth="3" strokeLinecap="round" /><circle className="vh-bulb" cx="60" cy="8" r="7" fill={`url(#b${id})`} /></g>
    <g><rect x="22" y="20" width="76" height="62" rx="24" fill={`url(#g${id})`} /><rect x="31" y="31" width="58" height="38" rx="16" fill="#0b0d2a" />
      <g className="vh-eyes"><ellipse className="vh-eye" cx="47" cy="49" rx="6" ry="7" fill="#7dd3fc" /><ellipse className="vh-eye" cx="73" cy="49" rx="6" ry="7" fill="#7dd3fc" /></g>
      <path className="vh-mouth" d="M51 61 Q60 67 69 61" stroke="#2fe39e" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="20" cy="51" r="6" fill="#8b6cff" /><circle cx="100" cy="51" r="6" fill="#22d3ee" /></g>
    <g><rect x="38" y="84" width="44" height="26" rx="12" fill={`url(#g${id})`} opacity=".92" /><circle cx="60" cy="97" r="5" fill="#0b0d2a" /><circle className="vh-core" cx="60" cy="97" r="2.6" fill="#2fe39e" />
      <path className="vh-arm-r" d="M84 92 q12 -2 16 -12" stroke="#22d3ee" strokeWidth="6" fill="none" strokeLinecap="round" /><path d="M36 92 q-12 2 -14 10" stroke="#8b6cff" strokeWidth="6" fill="none" strokeLinecap="round" /></g>
  </svg>;
}

/** POST + parse an SSE stream. Calls onEvent for each frame; resolves when the stream ends. */
export async function streamChat(body: unknown, signal: AbortSignal, onEvent: (event: string, data: Record<string, string>) => void, retry = true): Promise<void> {
  const token = getAccessToken();
  const res = await fetch("/api/v1/ai/chat", { method: "POST", credentials: "include", signal, headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  if (res.status === 401 && retry && (await refreshSession())) return streamChat(body, signal, onEvent, false);
  if (res.status === 429) throw new Error("I've had a lot of questions in a short time — give me a few minutes to cool my circuits.");
  if (!res.ok || !res.body) { const b = await res.json().catch(() => null); throw new Error(b?.error?.message ?? "I couldn't reach the server just now."); }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += value; let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /^event: (.+)$/m.exec(frame)?.[1]; const data = /^data: (.+)$/m.exec(frame)?.[1];
      if (ev && data) onEvent(ev, JSON.parse(data));
    }
  }
}

type SR = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start(): void; stop(): void };
const SpeechRec = (globalThis as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR }).SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => SR }).webkitSpeechRecognition;

export default function Vihaan() {
  const nav = useNavigate(); const loc = useLocation();
  const [open, setOpen] = useState(false); const [msgs, setMsgs] = useState<Msg[]>([]); const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Sambhav's AI guide"); const [mode, setMode] = useState(""); const [mood, setMood] = useState<Mood>("");
  const [input, setInput] = useState(""); const [pending, setPending] = useState<string | null>(null); const [tip, setTip] = useState(false); const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(() => { try { return localStorage.getItem(`${STORE}.voice`) === "1"; } catch { return false; } });
  const fab = useRef<HTMLButtonElement>(null); const log = useRef<HTMLDivElement>(null); const inp = useRef<HTMLInputElement>(null);
  const ctl = useRef<AbortController | null>(null); const rec = useRef<SR | null>(null); const moodT = useRef<number>();

  const flash = useCallback((m: Mood, ms = 1600) => { setMood(m); clearTimeout(moodT.current); if (m) moodT.current = window.setTimeout(() => setMood(""), ms); }, []);

  // First-visit greeting bubble.
  // First-visit greeting, home page only, gone after 9 s — it must never sit on top of a form or button.
  useEffect(() => {
    if (loc.pathname !== "/") { setTip(false); return; }
    let seen = true; try { seen = localStorage.getItem(`${STORE}.tip`) === "1"; } catch { /* private mode */ }
    if (seen) return;
    const show = setTimeout(() => setTip(true), 2500), hide = setTimeout(() => setTip(false), 11_500);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [loc.pathname]);
  const dismissTip = () => { setTip(false); try { localStorage.setItem(`${STORE}.tip`, "1"); } catch { /* ignore */ } };

  // Eyes follow the pointer.
  useEffect(() => {
    if (reduceMotion()) return;
    const move = (e: PointerEvent) => { const el = fab.current; const eyes = el?.querySelector<SVGGElement>(".vh-eyes"); if (!el || !eyes) return; const r = el.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const d = Math.hypot(dx, dy) || 1; eyes.style.transform = `translate(${(dx / d) * 3}px,${(dy / d) * 2.5}px)`; };
    addEventListener("pointermove", move, { passive: true }); return () => removeEventListener("pointermove", move);
  }, []);

  const toggle = useCallback((next?: boolean) => {
    setOpen((o) => { const v = next ?? !o; if (v) { dismissTip(); flash("wave"); setTimeout(() => inp.current?.focus(), 60); } return v; });
  }, [flash]);
  // Open from anywhere: window event, Alt+V, Escape to close.
  useEffect(() => {
    const ev = (e: Event) => { toggle(true); const q = (e as CustomEvent<string | undefined>).detail; if (typeof q === "string" && q) setPending(q); };
    const key = (e: KeyboardEvent) => { if (e.altKey && e.key.toLowerCase() === "v") { e.preventDefault(); toggle(); } else if (e.key === "Escape") setOpen(false); };
    addEventListener("open-vihaan", ev); addEventListener("keydown", key);
    return () => { removeEventListener("open-vihaan", ev); removeEventListener("keydown", key); };
  }, [toggle]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [msgs, open]);

  const speak = (text: string) => {
    if (!voice || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text.replace(/[*`#_]/g, "").slice(0, 600)); u.lang = /[ऀ-ॿ]/.test(text) ? "hi-IN" : "en-IN"; u.rate = 1.04; u.pitch = 1.15;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  };

  const send = async (text: string) => {
    const q = text.trim().slice(0, 600); if (!q || busy) return;
    const history: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]); setInput(""); setBusy(true); setStatus("Thinking…"); flash("think", 60_000);
    const c = new AbortController(); ctl.current = c; let answer = "";
    const append = (t: string) => { answer += t; setMsgs((m) => { const n = m.slice(); n[n.length - 1] = { role: "assistant", content: answer }; return n; }); };
    try {
      await streamChat({ messages: history.slice(-12).filter((m) => m.content.trim()).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })), page: loc.pathname }, c.signal, (ev, data) => {
        if (ev === "delta") { if (!answer) flash("talk", 60_000); append(data.text); setStatus("Answering…"); }
        else if (ev === "tool") setStatus(TOOL_LABEL[data.name] ?? "Working…");
        else if (ev === "action" && data.navigate) { nav(data.navigate); flash("point"); }
        else if (ev === "done") {
          setMode(data.mode === "ai" ? "AI mode" : data.mode === "instant" ? "Instant" : "Offline mode");
          if (data.id) setMsgs((m) => { const n = m.slice(); n[n.length - 1] = { ...n[n.length - 1], id: data.id }; return n; });
        }
        else if (ev === "error") append(answer ? `\n\n${data.message}` : data.message);
      });
      if (!answer) append("Done!");
      speak(answer);
    } catch (e) {
      if (c.signal.aborted) append(answer ? " …(stopped)" : "Stopped."); else append((e as Error).message || "Something went wrong.");
    } finally { setBusy(false); setStatus("Sambhav's AI guide"); flash(""); ctl.current = null; }
  };

  // A question handed over from the Ctrl K palette.
  useEffect(() => { if (pending && !busy) { const q = pending; setPending(null); void send(q); } }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Feedback loop (LLMOps): ratings land in ai_interactions; 👎 answers are triaged on the admin AI page. */
  const rate = async (index: number, rating: 1 | -1) => {
    const id = msgs[index]?.id; if (!id) return;
    setMsgs((m) => m.map((x, j) => (j === index ? { ...x, rated: rating } : x)));
    await fetch("/api/v1/ai/feedback", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, rating }) }).catch(() => undefined);
  };

  const listen = () => {
    if (!SpeechRec) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new SpeechRec(); r.lang = "en-IN"; r.interimResults = true; rec.current = r;
    r.onresult = (e) => { const t = Array.from(e.results).map((x) => x[0].transcript).join(""); setInput(t); };
    r.onend = () => { setListening(false); const v = inp.current?.value.trim(); if (v) void send(v); };
    r.onerror = () => setListening(false);
    setListening(true); r.start();
  };

  const shown: Msg[] = msgs.length ? msgs : [{ role: "assistant", content: HELLO }];
  return <div className="vh-root">
    <button ref={fab} className={`vh-fab ${open ? "on" : ""} ${mood}`} aria-label="Ask Vihaan, the AI guide (Alt+V)" aria-expanded={open} onClick={() => toggle()}>
      <Robot /><span className="vh-name">Vihaan</span>
    </button>
    {tip && !open && <div className="vh-tip" role="status" onClick={() => toggle(true)}><b>Hi, I'm Vihaan!</b> Your robot guide. Ask me anything, or say “take me to roulette”.
      <button className="btn sm ghost" aria-label="Dismiss" onClick={(e) => { e.stopPropagation(); dismissTip(); }}>✕</button></div>}
    {open && <section className="vh-panel" role="dialog" aria-label="Vihaan chat">
      <header className="vh-head"><div className="vh-mini"><Robot className={busy ? "busy" : ""} /></div>
        <div style={{ minWidth: 0 }}><b>Vihaan</b><span className="vh-status" aria-live="polite">{status}</span></div>
        <button className="btn sm ghost" title="New chat" aria-label="New chat" onClick={() => { ctl.current?.abort(); setMsgs([]); setMode(""); }}>↺</button>
        <button className="btn sm ghost" aria-label="Close" onClick={() => setOpen(false)}>✕</button></header>
      <div className="vh-log" ref={log} aria-live="polite">
        {shown.map((m, i) => <div key={i} className={`vh-msg ${m.role === "user" ? "me" : "bot"}`}>
          {m.role === "assistant" && <div className="vh-av"><Robot /></div>}
          <div className="vh-bubble">{m.content ? <div dangerouslySetInnerHTML={{ __html: md(m.content) }} /> : <span className="vh-dots" aria-label="Vihaan is typing"><i /><i /><i /></span>}
            {m.id && <div className="vh-rate" role="group" aria-label="Was this helpful?">{m.rated
              ? <span className="small muted">{m.rated === 1 ? "Thanks!" : "Thanks — we'll use this to improve Vihaan."}</span>
              : <><button type="button" aria-label="Helpful" onClick={() => void rate(i, 1)}>👍</button><button type="button" aria-label="Not helpful" onClick={() => void rate(i, -1)}>👎</button></>}</div>}</div>
        </div>)}
      </div>
      {msgs.length < 2 && <div className="vh-chips">{CHIPS.map(([l, q]) => <button key={l} className="vh-chip" onClick={() => void send(q)}>{l}</button>)}</div>}
      <form className="vh-form" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
        <input ref={inp} value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? "Listening…" : "Ask Vihaan… e.g. “open the Nash solver”"} autoComplete="off" maxLength={600} aria-label="Message Vihaan" />
        {SpeechRec && <button type="button" className={`btn sm vh-mic ${listening ? "on" : ""}`} onClick={listen} aria-label={listening ? "Stop listening" : "Speak to Vihaan"} aria-pressed={listening}>🎙</button>}
        {busy ? <button type="button" className="btn sm" onClick={() => ctl.current?.abort()}>Stop</button> : <button className="btn primary sm" disabled={!input.trim()}>Send</button>}
      </form>
      <footer className="vh-foot">
        <label className="row small" style={{ gap: 6, margin: 0, fontWeight: 600 }}><input type="checkbox" style={{ width: "auto" }} checked={voice} onChange={(e) => { setVoice(e.target.checked); if (!e.target.checked) speechSynthesis?.cancel(); try { localStorage.setItem(`${STORE}.voice`, e.target.checked ? "1" : "0"); } catch { /* ignore */ } }} /> Speak replies</label>
        <span className="small muted">{mode || "Alt+V"}</span>
      </footer>
    </section>}
  </div>;
}
