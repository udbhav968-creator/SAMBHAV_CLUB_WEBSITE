import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Empty, Loading, Modal, PageHead, useToast } from "../components/ui";
import { useSocketEvent } from "../lib/socket";
import { EventLine, type EventRow } from "./Home";

export default function Events() {
  const { user, can } = useAuth(); const toast = useToast(); const qc = useQueryClient(); const [edit, setEdit] = useState<Partial<EventRow> | null>(null);
  const q = useQuery({ queryKey: ["events", "all", !!user], queryFn: () => api<{ events: EventRow[] }>("/events") });
  useSocketEvent("events:changed", () => qc.invalidateQueries({ queryKey: ["events"] }));
  const reg = useMutation({ mutationFn: ({ id, on }: { id: string; on: boolean }) => api(`/events/${id}/registrations`, { method: on ? "POST" : "DELETE" }),
    onSuccess: (_d, v) => { toast(v.on ? "Registered" : "Registration cancelled"); qc.invalidateQueries({ queryKey: ["events"] }); }, onError: (e) => toast(e instanceof ApiError ? e.message : "Failed") });
  const now = new Date().toISOString(); const up = q.data?.events.filter((e) => e.startsAt >= now) ?? []; const past = q.data?.events.filter((e) => e.startsAt < now).reverse() ?? [];
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const body = { title: f.title, type: f.type, startsAt: new Date(f.startsAt).toISOString(), venue: f.venue || undefined, capacity: f.capacity ? Number(f.capacity) : undefined, description: f.description || undefined };
    try { await api(edit?.id ? `/events/${edit.id}` : "/events", { method: edit?.id ? "PATCH" : "POST", body }); setEdit(null); toast("Event saved"); qc.invalidateQueries({ queryKey: ["events"] }); } catch (x) { toast((x as Error).message); }
  }
  const action = (e: EventRow) => <>{!user ? null : e.isRegistered ? <><span className="pill good">Registered</span><button className="btn sm ghost" onClick={() => reg.mutate({ id: e.id, on: false })}>Cancel</button></> : <button className="btn sm primary" onClick={() => reg.mutate({ id: e.id, on: true })}>Register</button>}{can("COORDINATOR") && <button className="btn sm" onClick={() => setEdit(e)}>Edit</button>}</>;
  return <><PageHead crumb="Events" title="Events" lede="Workshops, tournaments and talks." actions={can("COORDINATOR") && <button className="btn primary" onClick={() => setEdit({})}>New event</button>} />
    <section className="band"><div className="wrap stack" style={{ gap: 18 }}>{q.isLoading ? <Loading /> : <>
      <div className="card pad-lg"><h2 style={{ fontSize: "1.3rem" }}>Upcoming</h2>{up.length ? up.map((e) => <EventLine key={e.id} e={e} action={action(e)} />) : <Empty title="Nothing scheduled">Check back soon.</Empty>}</div>
      <div className="card pad-lg"><h2 style={{ fontSize: "1.3rem" }}>Past</h2>{past.length ? past.map((e) => <EventLine key={e.id} e={e} />) : <p className="muted small">No past events.</p>}</div></>}</div></section>
    {edit && <Modal title={edit.id ? "Edit event" : "New event"} onClose={() => setEdit(null)}><form className="form" onSubmit={save}>
      <div className="field full"><label htmlFor="t">Title</label><input id="t" name="title" required defaultValue={edit.title} /></div>
      <div className="field"><label htmlFor="ty">Type</label><select id="ty" name="type" defaultValue={edit.type}>{["Workshop", "Competition", "Talk", "Meetup", "Hackathon"].map((t) => <option key={t}>{t}</option>)}</select></div>
      <div className="field"><label htmlFor="s">Starts</label><input id="s" name="startsAt" type="datetime-local" required defaultValue={edit.startsAt?.slice(0, 16)} /></div>
      <div className="field"><label htmlFor="v">Venue</label><input id="v" name="venue" defaultValue={edit.venue ?? ""} /></div>
      <div className="field"><label htmlFor="c">Capacity</label><input id="c" name="capacity" type="number" min={1} defaultValue={edit.capacity ?? ""} /></div>
      <div className="field full"><label htmlFor="d">Description</label><textarea id="d" name="description" defaultValue={edit.description ?? ""} /></div>
      <div className="full row" style={{ justifyContent: "space-between" }}>{edit.id ? <button type="button" className="btn danger" onClick={() => api(`/events/${edit.id}`, { method: "DELETE" }).then(() => { setEdit(null); qc.invalidateQueries({ queryKey: ["events"] }); })}>Delete</button> : <span />}<div className="row"><button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save</button></div></div></form></Modal>}</>;
}
