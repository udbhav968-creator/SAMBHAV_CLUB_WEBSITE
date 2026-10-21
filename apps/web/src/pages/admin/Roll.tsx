import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import { AdminShell } from "../../components/AdminDock";
import { Avatar, Empty, Loading, useToast } from "../../components/ui";
import { fdate } from "../../lib/format";
import { fetchSessions } from "./data";

interface Member { id: string; name: string; rollNo: string | null; isActive?: boolean }
export default function Roll() {
  const toast = useToast(); const qc = useQueryClient(); const [sid, setSid] = useState(""); const [q, setQ] = useState("");
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: fetchSessions });
  const roster = useQuery({ queryKey: ["users"], queryFn: () => api<{ users: Member[] }>("/users") });
  const cur = sid || sessions.data?.sessions[0]?.id || "";
  const marks = useQuery({ queryKey: ["marks", cur], enabled: !!cur, queryFn: () => api<{ attendance: { id: string }[] }>(`/attendance/sessions/${cur}/attendance`) });
  const present = new Set(marks.data?.attendance.map((m) => m.id));
  const people = (roster.data?.users ?? []).filter((u) => u.isActive !== false && (u.name + (u.rollNo ?? "")).toLowerCase().includes(q.toLowerCase()));
  const toggle = async (uid: string) => { try { await api(`/attendance/sessions/${cur}/attendance/${uid}`, { method: "PUT", body: { present: !present.has(uid) } }); qc.invalidateQueries({ queryKey: ["marks", cur] }); } catch (x) { toast((x as Error).message); } };
  const markAll = async () => { await Promise.all(people.filter((u) => !present.has(u.id)).map((u) => api(`/attendance/sessions/${cur}/attendance/${u.id}`, { method: "PUT", body: { present: true } }))); qc.invalidateQueries({ queryKey: ["marks", cur] }); toast("Marked everyone shown as present"); };
  return <AdminShell zone="roll" title="Roll call" lede="Mark members present by hand — for anyone without a phone, or to correct a record. Every change is audited."
    actions={<button className="btn primary" disabled={!cur} onClick={markAll}>Mark all shown present</button>}>
    {sessions.isLoading ? <Loading /> : !sessions.data?.sessions.length ? <Empty title="No sessions yet">Create one on the Sessions page first.</Empty> : <>
      <div className="form" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="field"><label htmlFor="rs">Session</label><select id="rs" value={cur} onChange={(e) => setSid(e.target.value)}>{sessions.data.sessions.map((s) => <option key={s.id} value={s.id}>{fdate(s.date)} · {s.title} ({s.status.toLowerCase()})</option>)}</select></div>
        <div className="field"><label htmlFor="rq">Filter</label><input id="rq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or roll no." /></div></div>
      <div className="stats" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}><div><b>{present.size}</b><span>Present</span></div><div><b>{Math.max(0, people.length - people.filter((u) => present.has(u.id)).length)}</b><span>Not marked</span></div><div><b>{people.length}</b><span>Shown</span></div></div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10 }}>{people.map((u) => <button key={u.id} className="btn" style={{ justifyContent: "space-between", padding: "10px 14px", ...(present.has(u.id) ? { borderColor: "var(--z1)", background: "color-mix(in srgb,var(--z1) 18%,transparent)" } : {}) }} onClick={() => toggle(u.id)}>
        <span className="person"><Avatar name={u.name} /><span style={{ textAlign: "left" }}><b style={{ fontSize: ".88rem" }}>{u.name}</b><span className="small muted">{u.rollNo ?? "—"}</span></span></span><span className={`att ${present.has(u.id) ? "p" : "a"}`}>{present.has(u.id) ? "P" : "–"}</span></button>)}</div></>}
  </AdminShell>;
}
