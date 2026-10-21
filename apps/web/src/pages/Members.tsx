import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Avatar, Empty, Loading, Modal, PageHead, useToast } from "../components/ui";
import { pct } from "../lib/format";

interface U { id: string; name: string; email?: string; rollNo?: string | null; programme: string | null; year: number | null; title: string | null; role: "ADMIN" | "COORDINATOR" | "MEMBER"; isActive?: boolean }
interface Summary { attendance: { present: number; total: number; rate: number }; points: { arena: number; quiz: number; attendance: number; total: number }; rank: number | null; badges: string[]; events: { id: string; title: string }[] }

export default function Members() {
  const { can, user } = useAuth(); const toast = useToast(); const qc = useQueryClient(); const [q, setQ] = useState(""); const [view, setView] = useState<U | null>(null); const [edit, setEdit] = useState<U | null>(null);
  const list = useQuery({ queryKey: ["users", q], queryFn: () => api<{ users: U[] }>(`/users${q ? `?q=${encodeURIComponent(q)}` : ""}`) });
  const sum = useQuery({ queryKey: ["summary", view?.id], enabled: !!view, queryFn: () => api<Summary>(`/users/${view!.id}/summary`) });
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const body: Record<string, unknown> = { title: f.title || null }; if (can("ADMIN")) body.role = f.role;
    try { await api(`/users/${edit!.id}`, { method: "PATCH", body }); setEdit(null); toast("Saved"); qc.invalidateQueries({ queryKey: ["users"] }); } catch (x) { toast((x as Error).message); }
  }
  return <><PageHead crumb="Members" title="Member directory" lede={`${list.data?.users.length ?? "…"} members`} />
    <section className="band"><div className="wrap stack" style={{ gap: 16 }}>
      <div className="field" style={{ maxWidth: 420 }}><label htmlFor="q">Search</label><input id="q" placeholder="Name or roll number" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {list.isLoading ? <Loading /> : list.data?.users.length ? <div className="tablewrap"><table><thead><tr><th>Member</th>{can("COORDINATOR") && <th>Roll</th>}<th>Programme</th><th>Year</th><th>Role</th>{can("COORDINATOR") && <th />}</tr></thead><tbody>
        {list.data.users.map((u) => <tr key={u.id} style={{ cursor: "pointer", opacity: u.isActive === false ? 0.5 : 1 }} onClick={() => setView(u)}><td><div className="person"><Avatar name={u.name} /><div><b>{u.name}</b>{u.title && <span className="small muted">{u.title}</span>}</div></div></td>
          {can("COORDINATOR") && <td className="mono">{u.rollNo}</td>}<td>{u.programme}</td><td>{u.year}</td><td><span className={`pill ${u.role === "ADMIN" ? "bad" : u.role === "COORDINATOR" ? "brand" : "good"}`}>{u.role.toLowerCase()}</span></td>
          {can("COORDINATOR") && <td><button className="btn sm" onClick={(e) => { e.stopPropagation(); setEdit(u); }}>Edit</button></td>}</tr>)}</tbody></table></div> : <Empty title="No members found" />}
    </div></section>
    {view && <Modal title={view.name} onClose={() => setView(null)}>{!sum.data ? <Loading /> : <div className="stack">
      <div className="stats" style={{ gridTemplateColumns: "repeat(3,1fr)" }}><div><b>{sum.data.attendance.total ? pct(sum.data.attendance.rate) : "—"}</b><span>Attendance</span></div><div><b>{sum.data.points.total}</b><span>Points</span></div><div><b>{sum.data.rank ?? "—"}</b><span>Rank</span></div></div>
      <div className="row">{sum.data.badges.map((b) => <span key={b} className="pill accent">{b}</span>)}</div>
      <dl className="kv"><dt>Arena</dt><dd>{sum.data.points.arena}</dd><dt>Quizzes</dt><dd>{sum.data.points.quiz}</dd><dt>Attendance</dt><dd>{sum.data.points.attendance}</dd></dl>
      <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn" onClick={() => setView(null)}>Close</button></div></div>}</Modal>}
    {edit && <Modal title={`Edit ${edit.name}`} onClose={() => setEdit(null)}><form className="form" onSubmit={save}>
      <div className="field"><label htmlFor="ti">Club title</label><input id="ti" name="title" defaultValue={edit.title ?? ""} placeholder="e.g. Events Head" /></div>
      {can("ADMIN") && <div className="field"><label htmlFor="ro">Role</label><select id="ro" name="role" defaultValue={edit.role}><option>MEMBER</option><option>COORDINATOR</option><option>ADMIN</option></select></div>}
      <div className="full row" style={{ justifyContent: "space-between" }}>{can("ADMIN") && edit.id !== user?.id ? <button type="button" className="btn danger" onClick={() => api(`/users/${edit.id}`, { method: "DELETE" }).then(() => { setEdit(null); qc.invalidateQueries({ queryKey: ["users"] }); })}>Deactivate</button> : <span />}
        <div className="row"><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save</button></div></div></form></Modal>}</>;
}
