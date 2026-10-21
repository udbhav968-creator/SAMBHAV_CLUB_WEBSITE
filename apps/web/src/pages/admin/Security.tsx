import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, ApiError, logout } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { AdminShell } from "../../components/AdminDock";
import { Loading, useToast } from "../../components/ui";
import { fdate } from "../../lib/format";

interface Entry { id: string; action: string; entity: string; createdAt: string; meta: Record<string, unknown> | null }
/** Password change protected by current password + SMS OTP to the admin's registered mobile. */
export default function Security() {
  const { user } = useAuth(); const toast = useToast(); const nav = useNavigate();
  const [step, setStep] = useState<"idle" | "sent">("idle"); const [sentTo, setSentTo] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [left, setLeft] = useState(0);
  const audit = useQuery({ queryKey: ["audit-sec"], queryFn: () => api<{ entries: Entry[] }>("/admin/audit?take=40&entity=User") });
  async function send() { setBusy(true); setErr("");
    try { const r = await api<{ sentTo: string; expiresIn: number }>("/auth/password/otp", { method: "POST" }); setSentTo(r.sentTo); setStep("sent"); setLeft(r.expiresIn);
      const t = window.setInterval(() => setLeft((l) => { if (l <= 1) { clearInterval(t); return 0; } return l - 1; }), 1000); toast(`Code sent to ${r.sentTo}`); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Could not send the code"); } finally { setBusy(false); } }
  async function change(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; setErr("");
    if (f.newPassword !== f.confirm) return setErr("The two new passwords don't match");
    setBusy(true);
    try { await api("/auth/password/change", { body: { currentPassword: f.currentPassword, otp: f.otp, newPassword: f.newPassword } }); toast("Password changed — please sign in again"); await logout(); nav("/login"); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Change failed"); } finally { setBusy(false); }
  }
  return <AdminShell zone="security" title="Security" lede="Only you can change this password, and only with a one-time code sent to your registered mobile.">
    <div className="split">
      <div className="card pad-lg zc stack"><div className="eyebrow">Change password</div>
        {step === "idle" ? <><p className="muted">Step 1 — we'll text a 6-digit code to <b>{user?.phoneHint ?? "your registered mobile"}</b>. It expires in 5 minutes and works once.</p>
          {err && <p className="err" role="alert">{err}</p>}<button className="btn primary lg" style={{ justifySelf: "start" }} disabled={busy || !user?.phoneHint} onClick={send}>{busy ? "Sending…" : "Send OTP"}</button></>
        : <form className="stack" onSubmit={change}><p className="muted small">Code sent to <b>{sentTo}</b> · {left > 0 ? `expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "expired — send a new one"}</p>
          <div className="field"><label htmlFor="otp">OTP</label><input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className="mono" style={{ letterSpacing: ".35em", fontSize: "1.4rem" }} /></div>
          <div className="field"><label htmlFor="cur">Current password</label><input id="cur" name="currentPassword" type="password" required autoComplete="current-password" /></div>
          <div className="field"><label htmlFor="np">New password</label><input id="np" name="newPassword" type="password" minLength={8} required autoComplete="new-password" /><span className="small muted">8+ characters with a letter and a number</span></div>
          <div className="field"><label htmlFor="cp">Confirm new password</label><input id="cp" name="confirm" type="password" required autoComplete="new-password" /></div>
          {err && <p className="err" role="alert">{err}</p>}
          <div className="row"><button className="btn primary" disabled={busy}>Change password</button><button type="button" className="btn ghost" disabled={busy} onClick={send}>Resend code</button></div></form>}
      </div>
      <div className="card pad-lg zc"><div className="eyebrow">Account</div><dl className="kv" style={{ marginTop: 10 }}><dt>Username</dt><dd>{user?.username}</dd><dt>Role</dt><dd>{user?.role}</dd><dt>Registered mobile</dt><dd>{user?.phoneHint ?? "—"}</dd>
        <dt>Password last changed</dt><dd>{user?.passwordChangedAt ? fdate(user.passwordChangedAt) : "Never (initial PIN)"}</dd></dl>
        <div className="banner warn" style={{ marginTop: 14 }}>Protection in place: 5 wrong passwords lock the account for 15 minutes · 3 codes per 15 minutes · 5 tries per code · all sessions signed out after a change.</div></div>
    </div>
    <div className="card zc"><h3>Recent account activity</h3>{!audit.data ? <Loading /> : <div className="tablewrap" style={{ marginTop: 10 }}><table><thead><tr><th>When</th><th>Event</th><th>Details</th></tr></thead><tbody>
      {audit.data.entries.map((e) => <tr key={e.id}><td>{new Date(e.createdAt).toLocaleString()}</td><td><span className={`pill ${/fail|reuse/.test(e.action) ? "bad" : /password|otp/.test(e.action) ? "warn" : "good"}`}>{e.action.replace(/_/g, " ")}</span></td><td className="small muted">{e.meta ? JSON.stringify(e.meta) : ""}</td></tr>)}</tbody></table></div>}</div>
  </AdminShell>;
}
