import { celebrate } from "../lib/fx";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register, ApiError } from "../api/client";

const PROGRAMMES = ["B.Tech AI/ML", "B.Tech AI&DS", "BSc AI", "BBA AI", "B.Tech CSE", "Other"];
export default function Register() {
  const nav = useNavigate(); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; setBusy(true); setErr("");
    try { await register({ email: f.email, password: f.password, name: f.name, rollNo: f.rollNo || undefined, programme: f.programme, year: Number(f.year) }); celebrate(1.2); nav("/me", { replace: true }); }
    catch (x) { setErr(x instanceof ApiError ? x.message + (x.details ? " — check the highlighted fields" : "") : "Could not create your account"); } finally { setBusy(false); }
  }
  return <div className="wrap"><div className="card pad-lg auth-card" style={{ maxWidth: 560 }}><h1 className="auth-title">Join Sambhav</h1><p className="muted small">Your profile is how coordinators record attendance and points.</p>
    <form className="form" style={{ marginTop: 16 }} onSubmit={submit}>
      <div className="field full"><label htmlFor="name">Full name</label><input id="name" name="name" required minLength={2} /></div>
      <div className="field full"><label htmlFor="email">College email</label><input id="email" name="email" type="email" required /></div>
      <div className="field"><label htmlFor="rollNo">Roll / enrolment no.</label><input id="rollNo" name="rollNo" /></div>
      <div className="field"><label htmlFor="programme">Programme</label><select id="programme" name="programme">{PROGRAMMES.map((p) => <option key={p}>{p}</option>)}</select></div>
      <div className="field"><label htmlFor="year">Year</label><select id="year" name="year">{[1, 2, 3, 4].map((y) => <option key={y}>{y}</option>)}</select></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" /><span className="small muted">8+ characters with a letter and a number</span></div>
      {err && <p className="err full">{err}</p>}
      <div className="full row"><button className="btn primary" disabled={busy}>{busy ? "Creating…" : "Create account"}</button><span className="small muted">Already a member? <Link to="/login">Sign in</Link></span></div></form></div></div>;
}
