import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useToast } from "../components/ui";

/** Password reset by SMS OTP to the account's registered mobile number. */
export default function Forgot() {
  const nav = useNavigate(); const toast = useToast(); const [id, setId] = useState(""); const [step, setStep] = useState<1 | 2>(1); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function request(e: React.FormEvent) { e.preventDefault(); setBusy(true); setErr("");
    try { const r = await api<{ message: string }>("/auth/password/forgot", { body: { identifier: id } }); toast(r.message); setStep(2); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }
  async function reset(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; setErr("");
    if (f.newPassword !== f.confirm) return setErr("The two passwords don't match");
    setBusy(true); try { await api("/auth/password/reset", { body: { identifier: id, otp: f.otp, newPassword: f.newPassword } }); toast("Password reset — sign in with the new one"); nav("/login"); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Reset failed"); } finally { setBusy(false); } }
  return <div className="wrap"><div className="card pad-lg auth-card enter"><div className="eyebrow">Account recovery</div><h1 className="auth-title" style={{ marginTop: 8 }}>Reset your password</h1>
    {step === 1 ? <form className="stack" style={{ marginTop: 18 }} onSubmit={request}><p className="muted small">We'll text a 6-digit code to the mobile number registered on your account.</p>
      <div className="field"><label htmlFor="fid">Email or username</label><input id="fid" value={id} onChange={(e) => setId(e.target.value)} required autoCapitalize="none" /></div>
      {err && <p className="err">{err}</p>}<button className="btn primary" disabled={busy}>Send code</button></form>
    : <form className="stack" style={{ marginTop: 18 }} onSubmit={reset}><p className="muted small">If <b>{id}</b> has a registered mobile, a code is on its way. It expires in 5 minutes.</p>
      <div className="field"><label htmlFor="otp">6-digit code</label><input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className="mono" style={{ letterSpacing: ".3em", fontSize: "1.3rem" }} /></div>
      <div className="field"><label htmlFor="np">New password</label><input id="np" name="newPassword" type="password" minLength={8} required autoComplete="new-password" /><span className="small muted">8+ characters with a letter and a number</span></div>
      <div className="field"><label htmlFor="cp">Confirm new password</label><input id="cp" name="confirm" type="password" required autoComplete="new-password" /></div>
      {err && <p className="err">{err}</p>}<button className="btn primary" disabled={busy}>Reset password</button><button type="button" className="btn ghost sm" onClick={() => setStep(1)}>Send a new code</button></form>}
    <p className="small" style={{ marginTop: 14 }}><Link to="/login">Back to sign in</Link></p></div></div>;
}
