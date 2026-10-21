import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { logout } from "../api/client";
import { reduceMotion } from "../lib/fx";
import Palette from "./Palette";
import AdminDock from "./AdminDock";
import Vihaan from "./Vihaan";
import { GAMES } from "../pages/catalog";

const NAV: [string, string][] = [["/", "Home"], ["/about", "About"], ["/arena", "Arena"], ["/learn", "Learn"], ["/events", "Events"], ["/attendance", "Attendance"], ["/members", "Members"], ["/leaderboard", "Leaderboard"], ["/notices", "Notices"]];
const ROLE = { ADMIN: "Faculty / Admin", COORDINATOR: "Coordinator", MEMBER: "Member" } as const;

export const Logo = () => <svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b6cff" /><stop offset=".55" stopColor="#22d3ee" /><stop offset="1" stopColor="#2fe39e" /></linearGradient></defs><rect x="1" y="1" width="38" height="38" rx="11" fill="url(#lg1)" /><rect x="8" y="8" width="11" height="11" rx="3" fill="#fff" /><rect x="21" y="8" width="11" height="11" rx="3" fill="#fff" opacity=".4" /><rect x="8" y="21" width="11" height="11" rx="3" fill="#fff" opacity=".4" /><rect x="21" y="21" width="11" height="11" rx="3" fill="#ffb224" /></svg>;

function useChrome() {
  const bar = useRef<HTMLDivElement>(null); const glow = useRef<HTMLDivElement>(null); const [top, setTop] = useState(false); const loc = useLocation();
  useEffect(() => { scrollTo({ top: 0 }); }, [loc.pathname]);
  useEffect(() => {
    let t = false;
    const onScroll = () => { if (t) return; t = true; requestAnimationFrame(() => { const h = document.documentElement.scrollHeight - innerHeight; bar.current?.style.setProperty("--p", String(h > 0 ? scrollY / h : 0)); setTop(scrollY > 700); t = false; }); };
    const onMove = (e: PointerEvent) => { glow.current?.style.setProperty("--mx", `${e.clientX}px`); glow.current?.style.setProperty("--my", `${e.clientY}px`); };
    addEventListener("scroll", onScroll, { passive: true }); if (!reduceMotion()) addEventListener("pointermove", onMove, { passive: true });
    return () => { removeEventListener("scroll", onScroll); removeEventListener("pointermove", onMove); };
  }, []);
  return { bar, glow, top };
}

export default function Layout() {
  const { user, can } = useAuth(); const [open, setOpen] = useState(false); const nav = useNavigate(); const { bar, glow, top } = useChrome(); const loc = useLocation();
  const theme = () => { const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === "dark" : !matchMedia("(prefers-color-scheme: light)").matches; r.dataset.theme = dark ? "light" : "dark"; try { localStorage.setItem("sambhav.theme", r.dataset.theme); } catch { /* private mode */ } };
  return <>
    <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
    <div className="progressbar" ref={bar} /><div className="cursor-glow" ref={glow} />
    <div className="util"><div className="wrap"><div className="links"><span>Sambhav · Game Theory &amp; Strategy Society</span><Link to="/about">Code of conduct</Link>{can("ADMIN") && <Link to="/admin">Admin</Link>}</div>
      <div className="who">{user ? <><span>{user.name}</span><span className="pill">{ROLE[user.role]}</span><button className="btn sm ghost" onClick={() => logout().then(() => nav("/"))}>Sign out</button></> : <><Link to="/login">Sign in</Link><Link to="/register">Join</Link></>}
        <button className="btn sm ghost" onClick={theme} aria-label="Toggle colour theme">◐ Theme</button></div></div></div>
    <header className="mast"><div className="wrap" style={{ position: "relative" }}>
      <Link className="logo" to="/"><Logo /><span><b>SAMBHAV</b><small>Game Theory Society</small></span></Link>
      <button className="btn sm navtoggle" onClick={() => setOpen(!open)} aria-expanded={open}>Menu</button>
      <nav className={`nav ${open ? "open" : ""}`} aria-label="Primary" onClick={() => setOpen(false)}>
        {NAV.map(([to, l]) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "on" : "")}>{l}</NavLink>)}
      </nav>
      <button className="btn sm search" onClick={() => dispatchEvent(new Event("open-palette"))} aria-label="Search (Ctrl K)"><span className="lbl">Search</span> <span className="kbd">Ctrl K</span></button>
      <Link className="btn primary sm cta" to={user ? "/me" : "/register"}>{user ? "My Sambhav" : "Join Sambhav"}</Link>
    </div></header>
    <main><Outlet /></main>
    <footer><div className="wrap"><div className="cols">
      <div><div className="logo"><Logo /><span><b>SAMBHAV</b><small>Game Theory Society</small></span></div><p className="small muted" style={{ marginTop: 14, maxWidth: "32ch" }}>Strategy, probability and decision science — learned through play.</p></div>
      <div><h4>Arena</h4>{GAMES.slice(0, 5).map((g) => <Link key={g.id} to={`/arena/${g.id}`}>{g.title}</Link>)}</div>
      <div><h4>Club</h4><Link to="/events">Events</Link><Link to="/attendance">Attendance</Link><Link to="/members">Members</Link><Link to="/leaderboard">Leaderboard</Link></div>
      <div><h4>Learn</h4><Link to="/learn">All modules</Link><Link to="/about">Mission &amp; roles</Link></div>
    </div><div className="bigword" aria-hidden="true">SAMBHAV</div>
    <div className="base"><span>© {new Date().getFullYear()} Sambhav. Virtual credits only — no real-money play.</span><span>Press <span className="kbd">Ctrl K</span> to jump anywhere · <span className="kbd">Alt V</span> to ask Vihaan</span></div></div></footer>
    <button className={`totop ${top ? "show" : ""}`} aria-label="Back to top" onClick={() => scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" })}>↑</button>
    <Palette />
    <Vihaan />
    {(loc.pathname.startsWith("/attendance") || loc.pathname.startsWith("/admin") || loc.pathname === "/check-in") && <AdminDock />}
  </>;
}
