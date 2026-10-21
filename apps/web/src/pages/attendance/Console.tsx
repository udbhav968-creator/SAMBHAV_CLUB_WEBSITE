import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../../api/client";
import { Avatar, PageHead, useToast } from "../../components/ui";
import { fdate, ftime } from "../../lib/format";
import { getSocket, useSocketEvent } from "../../lib/socket";
import type { SessionRow } from "./Attendance";

interface Code { code: string; expiresIn: number; stepSeconds: number; checkInUrl: string }
interface Mark { id: string; name: string; rollNo: string | null; method: string; markedAt: string }
interface Member { id: string; name: string; rollNo: string | null }

/** Projector view: rotating QR + code, live check-ins over WebSocket, manual roll call. */
export default function Console() {
  const { id = "" } = useParams(); const toast = useToast(); const qc = useQueryClient();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<{ sessions: SessionRow[] }>("/attendance/sessions") });
  const s = sessions.data?.sessions.find((x) => x.id === id);
  const marks = useQuery({ queryKey: ["marks", id], queryFn: () => api<{ attendance: Mark[] }>(`/attendance/sessions/${id}/attendance`) });
  const roster = useQuery({ queryKey: ["users"], queryFn: () => api<{ users: Member[] }>("/users") });
  const [code, setCode] = useState<Code | null>(null); const [left, setLeft] = useState(0);
  useEffect(() => { getSocket().emit("session:watch", id); return () => { getSocket().emit("session:unwatch", id); }; }, [id]);
  useSocketEvent<{ user: { name: string } }>("attendance:marked", (p) => { toast(`${p.user.name} checked in`); qc.invalidateQueries({ queryKey: ["marks", id] }); });
  useSocketEvent("attendance:changed", () => qc.invalidateQueries({ queryKey: ["marks", id] }));
  useEffect(() => {
    if (s?.status !== "OPEN") return; let stop = false; let timer: number;
    const load = async () => { try { const c = await api<Code>(`/attendance/sessions/${id}/code`); if (stop) return; setCode(c); setLeft(c.expiresIn); timer = window.setTimeout(load, c.expiresIn * 1000 + 150); } catch { /* closed */ } };
    void load(); const tick = window.setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => { stop = true; clearTimeout(timer); clearInterval(tick); };
  }, [id, s?.status]);
  const present = new Set(marks.data?.attendance.map((m) => m.id));
  const status = async (to: "open" | "close") => { await api(`/attendance/sessions/${id}/${to}`, { method: "POST" }); qc.invalidateQueries({ queryKey: ["sessions"] }); };
  const toggle = async (uid: string) => { await api(`/attendance/sessions/${id}/attendance/${uid}`, { method: "PUT", body: { present: !present.has(uid) } }); qc.invalidateQueries({ queryKey: ["marks", id] }); };
  if (!s) return <div className="wrap band"><Link to="/attendance">Back</Link></div>;
  return <div className="zone" data-zone="live"><PageHead crumb="Attendance / Console" title={s.title} lede={<>{fdate(s.date)} · {s.status === "OPEN" ? <><span className="live-dot" /> Live — accepting codes</> : "Not accepting codes"}</>}
    actions={<><Link className="btn" to="/attendance">Back</Link>{s.status === "OPEN" ? <button className="btn danger" onClick={() => status("close")}>Close session</button> : <button className="btn primary" onClick={() => status("open")}>Open for check-in</button>}</>} />
    <section className="band"><div className="wrap split"><div className="stack" style={{ gap: 18 }}>
      {s.status === "OPEN" && code && <div className="card pad-lg" style={{ textAlign: "center" }}><div className="eyebrow">Scan or type the code</div>
        <div className="row" style={{ justifyContent: "center", gap: 32, marginTop: 12 }}><div className="qr"><QRCodeSVG value={code.checkInUrl} size={200} /></div><div className="code">{code.code}</div></div>
        <div className="ring" style={{ marginTop: 14 }}><i style={{ width: `${(left / code.stepSeconds) * 100}%` }} /></div></div>}
      <div className="card"><h3>Roll call</h3><div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 8, marginTop: 12 }}>
        {roster.data?.users.map((u) => <button key={u.id} className="btn" style={{ justifyContent: "space-between", ...(present.has(u.id) ? { borderColor: "var(--good)", background: "var(--good-soft)" } : {}) }} onClick={() => toggle(u.id)}>
          <span className="person"><Avatar name={u.name} /><span style={{ textAlign: "left" }}><b style={{ fontSize: ".85rem" }}>{u.name}</b><span className="small muted">{u.rollNo}</span></span></span><span className={`att ${present.has(u.id) ? "p" : "a"}`}>{present.has(u.id) ? "P" : "–"}</span></button>)}</div></div></div>
      <aside className="card" style={{ alignSelf: "start" }}><h3>Checked in <span className="pill good">{marks.data?.attendance.length ?? 0}</span></h3><div className="stack" style={{ marginTop: 12 }}>
        {marks.data?.attendance.map((m) => <div key={m.id} className="spread"><div className="person"><Avatar name={m.name} /><b className="small">{m.name}</b></div><span className="small muted">{m.method} · {ftime(m.markedAt)}</span></div>)}</div></aside>
    </div></section></div>;
}
