import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { AdminShell } from "../../components/AdminDock";
import { Empty, Loading, useToast } from "../../components/ui";
import { fdate } from "../../lib/format";
import { fetchSessions } from "./data";

export default function Sessions() {
  const toast = useToast(); const qc = useQueryClient(); const q = useQuery({ queryKey: ["sessions"], queryFn: fetchSessions });
  const refresh = () => qc.invalidateQueries({ queryKey: ["sessions"] });
  const act = async (path: string, method = "POST") => { try { await api(path, { method }); refresh(); } catch (x) { toast((x as Error).message); } };
  async function create(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    await api("/attendance/sessions", { body: { title: f.title, date: new Date(f.date).toISOString() } }); (e.target as HTMLFormElement).reset(); toast("Session scheduled"); refresh(); }
  return <AdminShell zone="sessions" title="Sessions" lede="Plan meetings ahead, open them when the room fills, close them when you're done. Closed sessions refuse codes.">
    <form className="card zc form" onSubmit={create}><div className="field"><label htmlFor="st">Title</label><input id="st" name="title" required placeholder="Weekly meet #5" /></div>
      <div className="field"><label htmlFor="sd">Date</label><input id="sd" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></div>
      <div className="field" style={{ justifyContent: "end" }}><button className="btn primary">Schedule session</button></div></form>
    {q.isLoading ? <Loading /> : q.data?.sessions.length ? <div className="tablewrap"><table><thead><tr><th>Date</th><th>Session</th><th>Status</th><th>Present</th><th>Actions</th></tr></thead><tbody>
      {q.data.sessions.map((s) => <tr key={s.id}><td>{fdate(s.date)}</td><td>{s.title}</td><td><span className={`pill ${s.status === "OPEN" ? "good" : s.status === "SCHEDULED" ? "brand" : ""}`}>{s.status === "OPEN" ? "Live" : s.status.toLowerCase()}</span></td><td className="num">{s.present}</td>
        <td><div className="row" style={{ flexWrap: "nowrap" }}>{s.status === "OPEN" ? <><Link className="btn sm primary" to={`/attendance/console/${s.id}`}>Console</Link><button className="btn sm" onClick={() => act(`/attendance/sessions/${s.id}/close`)}>Close</button></>
          : <button className="btn sm" onClick={() => act(`/attendance/sessions/${s.id}/open`)}>{s.status === "CLOSED" ? "Reopen" : "Open"}</button>}
          <button className="btn sm ghost" style={{ color: "var(--bad)" }} onClick={() => { if (window.confirm(`Delete “${s.title}” and its attendance marks?`)) act(`/attendance/sessions/${s.id}`, "DELETE"); }}>Delete</button></div></td></tr>)}</tbody></table></div>
      : <Empty title="No sessions yet">Schedule the first one above.</Empty>}
  </AdminShell>;
}
