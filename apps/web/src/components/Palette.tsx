import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GAMES } from "../pages/catalog";

const PAGES: [string, string][] = [["Home", "/"], ["Arena", "/arena"], ["Learn", "/learn"], ["Events", "/events"], ["Attendance", "/attendance"], ["Members", "/members"], ["Leaderboard", "/leaderboard"], ["Notices", "/notices"], ["My Sambhav", "/me"], ["About", "/about"]];
/** Ctrl/⌘+K command palette. */
export default function Palette() {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [sel, setSel] = useState(0); const nav = useNavigate();
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } if (e.key === "Escape") setOpen(false); };
    const o = () => setOpen(true); addEventListener("keydown", k); addEventListener("open-palette", o); return () => { removeEventListener("keydown", k); removeEventListener("open-palette", o); }; }, []);
  const items = useMemo(() => [...PAGES.map(([t, h]) => [t, h, "Page"]), ...GAMES.map((g) => [g.title, `/arena/${g.id}`, "Arena"]), ...["m1", "m2", "m3", "m4", "m5", "m6"].map((m, i) => [`Module GT-${["101", "102", "201", "202", "301", "302"][i]}`, `/learn/${m}`, "Module"])]
    .filter(([t]) => t.toLowerCase().includes(q.toLowerCase())).slice(0, 11).concat(q.trim() ? [[`Ask Vihaan: “${q.trim()}”`, `vihaan:${q.trim()}`, "AI"]] : []), [q]);
  if (!open) return null;
  const go = (h: string) => { if (h.startsWith("vihaan:")) dispatchEvent(new CustomEvent("open-vihaan", { detail: h.slice(7) })); else nav(h); setOpen(false); setQ(""); };
  return <div className="palette" onClick={(e) => e.target === e.currentTarget && setOpen(false)}><div className="box" role="dialog" aria-label="Jump to">
    <input autoFocus placeholder="Jump to a page, game or module…" value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
      onKeyDown={(e) => { if (e.key === "ArrowDown") { setSel(Math.min(items.length - 1, sel + 1)); e.preventDefault(); } if (e.key === "ArrowUp") { setSel(Math.max(0, sel - 1)); e.preventDefault(); } if (e.key === "Enter" && items[sel]) go(items[sel][1]); }} />
    <ul>{items.map(([t, h, k], i) => <li key={h}><a href={h} className={i === sel ? "sel" : ""} onClick={(e) => { e.preventDefault(); go(h); }}><span>{t}</span><span className="small muted">{k}</span></a></li>)}</ul></div></div>;
}
