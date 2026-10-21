import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Loading, PageHead } from "../components/ui";

interface Stats { members: number; events: number; sessionsHeld: number; attendanceMarks: number; gamesPlayed: number }
interface Entry { id: string; actorId: string | null; action: string; entity: string; entityId: string | null; createdAt: string }
export default function Admin() {
  const s = useQuery({ queryKey: ["admin-stats"], queryFn: () => api<Stats>("/admin/stats") });
  const a = useQuery({ queryKey: ["audit"], queryFn: () => api<{ entries: Entry[] }>("/admin/audit?take=100") });
  return <><PageHead crumb="Admin" title="Administration" lede="Platform health and the audit trail of every privileged action." actions={<Link className="btn primary" to="/admin/ai">Vihaan AI operations →</Link>} />
    <section className="band"><div className="wrap stack" style={{ gap: 18 }}>
      {s.data ? <div className="stats" style={{ gridTemplateColumns: "repeat(5,minmax(0,1fr))" }}><div><b>{s.data.members}</b><span>Active members</span></div><div><b>{s.data.events}</b><span>Events</span></div><div><b>{s.data.sessionsHeld}</b><span>Sessions</span></div><div><b>{s.data.attendanceMarks}</b><span>Attendance marks</span></div><div><b>{s.data.gamesPlayed}</b><span>Games played</span></div></div> : <Loading />}
      <div className="card"><h3>Audit log</h3><div className="tablewrap" style={{ marginTop: 10 }}><table><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>ID</th></tr></thead><tbody>{a.data?.entries.map((e) => <tr key={e.id}><td>{new Date(e.createdAt).toLocaleString()}</td><td>{e.action}</td><td>{e.entity}</td><td className="mono small">{e.entityId?.slice(0, 13)}</td></tr>)}</tbody></table></div></div>
    </div></section></>;
}
