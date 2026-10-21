import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { login, ApiError } from "../api/client";

export default function Login() {
  const nav = useNavigate(); const [sp] = useSearchParams(); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setErr("");
    try { const u = await login(String(f.get("identifier")), String(f.get("password"))); nav(u.passwordChangeRequired ? "/admin/security" : sp.get("next") || (u.role === "ADMIN" ? "/admin/attendance/live" : "/me"), { replace: true }); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Could not sign in"); } finally { setBusy(false); }
  }
  return <div className="wrap"><div className="card pad-lg auth-card enter"><div className="eyebrow">Welcome back</div><h1 className="auth-title" style={{ marginTop: 8 }}>Sign in</h1>
    <form className="stack" style={{ marginTop: 18 }} onSubmit={submit}>
      <div className="field"><label htmlFor="identifier">Email or username</label><input id="identifier" name="identifier" autoComplete="username" autoCapitalize="none" required /></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <div className="spread small"><Link to="/forgot">Forgot password?</Link><span className="muted">New here? <Link to="/register">Join Sambhav</Link></span></div></form></div></div>;
}
