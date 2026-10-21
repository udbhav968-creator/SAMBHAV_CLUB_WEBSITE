import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Empty, Loading, Modal, PageHead, useToast } from "../components/ui";
import { fdate } from "../lib/format";
import { useSocketEvent } from "../lib/socket";
import type { NoticeRow } from "./Home";

export default function Notices() {
  const { can } = useAuth(); const toast = useToast(); const qc = useQueryClient(); const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["notices"], queryFn: () => api<{ notices: NoticeRow[] }>("/notices") });
  useSocketEvent<{ title: string }>("notice", (n) => { toast(`New notice: ${n.title}`); qc.invalidateQueries({ queryKey: ["notices"] }); });
  const refresh = () => qc.invalidateQueries({ queryKey: ["notices"] });
  async function post(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; await api("/notices", { body: { title: f.title, body: f.body, tag: f.tag, pinned: !!f.pinned } }); setOpen(false); refresh(); }
  return <><PageHead crumb="Notices" title="Notice board" actions={can("COORDINATOR") && <button className="btn primary" onClick={() => setOpen(true)}>Post notice</button>} />
    <section className="band"><div className="wrap"><div className="card pad-lg" style={{ maxWidth: 820 }}>{q.isLoading ? <Loading /> : q.data?.notices.length ? q.data.notices.map((n) => <div key={n.id} className="notice">
      <div className="spread"><h4>{n.pinned && <span className="pill accent" style={{ marginRight: 6 }}>Pinned</span>}{n.title}</h4><span className="small muted">{fdate(n.createdAt)}{n.author ? ` · ${n.author}` : ""}</span></div><p>{n.body}</p>
      <div className="row" style={{ marginTop: 6 }}><span className="pill brand">{n.tag}</span>{can("COORDINATOR") && <><button className="btn sm ghost" onClick={() => api(`/notices/${n.id}`, { method: "PATCH", body: { pinned: !n.pinned } }).then(refresh)}>{n.pinned ? "Unpin" : "Pin"}</button><button className="btn sm ghost" style={{ color: "var(--bad)" }} onClick={() => api(`/notices/${n.id}`, { method: "DELETE" }).then(refresh)}>Delete</button></>}</div></div>)
      : <Empty title="No notices yet" />}</div></div></section>
    {open && <Modal title="Post notice" onClose={() => setOpen(false)}><form className="form" onSubmit={post}><div className="field full"><label htmlFor="nt">Title</label><input id="nt" name="title" required /></div>
      <div className="field"><label htmlFor="ng">Tag</label><select id="ng" name="tag">{["General", "Event", "Deadline", "Result", "Info"].map((t) => <option key={t}>{t}</option>)}</select></div>
      <div className="field" style={{ justifyContent: "end" }}><label className="row" style={{ margin: 0, gap: 6 }}><input type="checkbox" name="pinned" value="1" style={{ width: "auto" }} /> Pin</label></div>
      <div className="field full"><label htmlFor="nb">Message</label><textarea id="nb" name="body" required /></div>
      <div className="full row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary">Post</button></div></form></Modal>}</>;
}
