import { celebrate } from "../../lib/fx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { Bar, Empty, Loading, PageHead, useToast } from "../../components/ui";
import { fdate, pct } from "../../lib/format";
import { useSocketEvent } from "../../lib/socket";

export interface SessionRow { id: string; title: string; date: string; status: "SCHEDULED" | "OPEN" | "CLOSED"; present: number }
interface Mine { sessions: { id: string; title: string; date: string; present: boolean }[]; present: number; total: number; rate: number }

export default function Attendance() {
  const { can } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<{ sessions: SessionRow[] }>("/attendance/sessions") });
  const mine = useQuery({ queryKey: ["attendance", "me"], queryFn: () => api<Mine>("/attendance/me") });
  useSocketEvent("session:status", () => qc.invalidateQueries({ queryKey: ["sessions"] }));
  const open = sessions.data?.sessions.filter((s) => s.status === "OPEN") ?? [];
  async function checkIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try { const r = await api<{ already: boolean }>("/attendance/check-in", { body: { sessionId: f.sid, code: f.code } }); toast(r.already ? "You're already marked present" : "Checked in — welcome!"); if (!r.already) celebrate(); qc.invalidateQueries({ queryKey: ["attendance"] }); (e.target as HTMLFormElement).reset(); }
    catch (x) { toast(x instanceof ApiError ? x.message : "Check-in failed"); }
  }
  const m = mine.data;
  return <><PageHead crumb="Attendance" title="Attendance" lede="Check in with the 6-digit code (or scan the QR) on the coordinator's screen. Codes rotate every 30 seconds."
    actions={can("ADMIN") && <Link className="btn primary" to="/admin/attendance/live">Take attendance</Link>} />
    <section className="band"><div className="wrap stack" style={{ gap: 18 }}><div className="split">
      <div className="card pad-lg stack"><h3>Check in</h3>{open.length ? <form className="form" onSubmit={checkIn}>
        <div className="field"><label htmlFor="sid">Session</label><select id="sid" name="sid">{open.map((s) => <option key={s.id} value={s.id}>{s.title} · {fdate(s.date)}</option>)}</select></div>
        <div className="field"><label htmlFor="code">Code</label><input id="code" name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required className="mono" style={{ fontSize: "1.3rem", letterSpacing: ".2em" }} /></div>
        <div className="field full"><button className="btn primary" style={{ justifySelf: "start" }}>Check in</button></div></form> : <Empty title="No session is open right now">It appears here when a coordinator opens one.</Empty>}</div>
      <div className="card pad-lg">{!m ? <Loading /> : <><h3>Your attendance</h3><div className="ball-result" style={{ marginTop: 10, color: m.rate >= 0.75 ? "var(--good)" : "var(--warn)" }}>{m.total ? pct(m.rate) : "—"}</div><p className="small muted">{m.present} of {m.total} sessions since you joined · requirement 75%</p><Bar value={m.rate} tone={m.rate >= 0.75 ? "good" : "warn"} />
        <div className="stack" style={{ marginTop: 14 }}>{m.sessions.slice(-8).reverse().map((s) => <div key={s.id} className="spread small"><span>{fdate(s.date)} · {s.title}</span><span className={`att ${s.present ? "p" : "a"}`}>{s.present ? "P" : "–"}</span></div>)}</div></>}</div></div>
      {can("ADMIN") && <div className="banner good">You are the attendance administrator. Use the <b>admin dock</b> at the bottom-right to take attendance, run roll call, manage sessions, see reports and defaulters, or change your password.</div>}
    </div></section>
</>;
}
