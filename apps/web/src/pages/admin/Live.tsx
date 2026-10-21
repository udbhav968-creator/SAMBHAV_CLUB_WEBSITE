import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { AdminShell } from "../../components/AdminDock";
import { Empty, Loading, useToast } from "../../components/ui";
import { fdate } from "../../lib/format";
import { fetchSessions, type SessionRow } from "./data";

export default function Live() {
  const q = useQuery({ queryKey: ["sessions"], queryFn: fetchSessions }); const nav = useNavigate(); const toast = useToast(); const qc = useQueryClient();
  const open = q.data?.sessions.filter((s) => s.status === "OPEN") ?? []; const ready = q.data?.sessions.filter((s) => s.status === "SCHEDULED") ?? [];
  async function quickStart(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const title = String(new FormData(e.currentTarget).get("title"));
    try { const { session } = await api<{ session: SessionRow }>("/attendance/sessions", { body: { title, date: new Date().toISOString() } });
      await api(`/attendance/sessions/${session.id}/open`, { method: "POST" }); qc.invalidateQueries({ queryKey: ["sessions"] }); nav(`/attendance/console/${session.id}`); }
    catch (x) { toast((x as Error).message); }
  }
  const openIt = async (id: string) => { await api(`/attendance/sessions/${id}/open`, { method: "POST" }); nav(`/attendance/console/${id}`); };
  return <AdminShell zone="live" title="Take attendance" lede="Start a session and put the console on the projector. Members scan the QR or type the 6-digit code, which changes every 30 seconds.">
    <div className="split">
      <form className="card pad-lg zc stack" onSubmit={quickStart}><div className="eyebrow">Quick start</div><h3>Start a session now</h3>
        <div className="field"><label htmlFor="qt">Session title</label><input id="qt" name="title" required minLength={2} placeholder={`Weekly meet · ${fdate(new Date())}`} /></div>
        <button className="btn primary lg" style={{ justifySelf: "start" }}>Start &amp; open console <span className="arr">→</span></button></form>
      <div className="card pad-lg zc"><div className="eyebrow">Live now</div><h3 style={{ marginBottom: 10 }}>Open sessions</h3>
        {q.isLoading ? <Loading /> : open.length ? open.map((s) => <div key={s.id} className="spread" style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}><div><b>{s.title}</b><div className="small muted"><span className="live-dot" /> {s.present} checked in · {fdate(s.date)}</div></div><Link className="btn sm primary" to={`/attendance/console/${s.id}`}>Console</Link></div>)
          : <Empty title="Nothing is live">Start a session to begin taking attendance.</Empty>}</div></div>
    {ready.length > 0 && <div className="card zc"><h3>Scheduled — ready to open</h3><div className="stack" style={{ marginTop: 10 }}>{ready.map((s) => <div key={s.id} className="spread"><span>{s.title} · <span className="muted small">{fdate(s.date)}</span></span><button className="btn sm" onClick={() => openIt(s.id)}>Open &amp; take attendance</button></div>)}</div></div>}
  </AdminShell>;
}
