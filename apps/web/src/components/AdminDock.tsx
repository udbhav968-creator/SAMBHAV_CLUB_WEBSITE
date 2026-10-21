import { useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const P = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
export const ICONS = {
  live: P("M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M5 12a7 7 0 0 1 14 0M2 12a10 10 0 0 1 20 0"),
  roll: P("M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"),
  sessions: P("M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"),
  reports: P("M4 20V10M10 20V4M16 20v-7M22 20H2"),
  alerts: P("M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"),
  security: P("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4"),
  shield: P("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"),
};
export const ZONES = [
  { key: "live", to: "/admin/attendance/live", title: "Take attendance", sub: "Live QR + code console", c: "#10b981" },
  { key: "roll", to: "/admin/attendance/roll", title: "Roll call", sub: "Mark present by hand", c: "#f59e0b" },
  { key: "sessions", to: "/admin/attendance/sessions", title: "Sessions", sub: "Create, open, close", c: "#8b5cf6" },
  { key: "reports", to: "/admin/attendance/reports", title: "Reports", sub: "Register + CSV export", c: "#0ea5e9" },
  { key: "alerts", to: "/admin/attendance/alerts", title: "Defaulters", sub: "Below 75% attendance", c: "#f43f5e" },
  { key: "security", to: "/admin/security", title: "Security", sub: "Password · OTP · audit", c: "#f97316" },
] as const;
export type ZoneKey = (typeof ZONES)[number]["key"];

/** Bottom-right admin dock. Rendered only for the attendance administrator. */
export default function AdminDock() {
  const { user } = useAuth(); const [open, setOpen] = useState(false);
  if (user?.role !== "ADMIN") return null;
  return <div className="dock">
    {open && <nav className="dockbar" aria-label="Attendance admin"><div className="ttl">Attendance admin · {user.username ?? user.name}</div>
      {ZONES.map((z) => <NavLink key={z.key} to={z.to} style={{ ["--c" as string]: z.c }} onClick={() => setOpen(false)} className={({ isActive }) => (isActive ? "on" : "")}>
        <span className="ic">{ICONS[z.key]}</span><span>{z.title}<small>{z.sub}</small></span></NavLink>)}</nav>}
    <button className={`fab ${open ? "open" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Attendance admin tools">{open ? P("M12 5v14M5 12h14") : ICONS.shield}</button>
  </div>;
}

export function AdminShell({ zone, title, lede, actions, children }: { zone: ZoneKey; title: string; lede?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const z = ZONES.find((x) => x.key === zone)!; const { user } = useAuth();
  return <div className="zone" data-zone={zone}>
    {user?.mustChangePassword && zone !== "security" && <div className="pw-gate" role="alert"><div className="wrap">{user.passwordChangeRequired
      ? <><b>Change your PIN first.</b> You're signed in with a short starter password, so admin tools stay locked until you set a strong one with the SMS code.</>
      : <><b>Your password is a short PIN.</b> Anyone who guesses it can run attendance — set a strong one with the SMS code.</>}
      <Link className="btn sm primary" to="/admin/security">Change password</Link></div></div>}
    <section className="zone-head"><div className="wrap"><div className="zone-icon">{ICONS[zone]}</div>
      <div className="crumbs enter">Admin / Attendance / {z.title}</div>
      <div className="spread"><h1 className="enter d1">{title}</h1><div className="row enter d2">{actions}</div></div>{lede && <p className="lede enter d2">{lede}</p>}</div></section>
    <section className="band"><div className="wrap stack" style={{ gap: 20 }}>{children}</div></section>
  </div>;
}
