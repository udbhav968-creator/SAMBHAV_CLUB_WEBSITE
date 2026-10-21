import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "../../components/AdminDock";
import { Avatar, Bar, Empty, Loading } from "../../components/ui";
import { pct } from "../../lib/format";
import { csvOf, downloadCsv, fetchReport } from "./data";

export default function Alerts() {
  const q = useQuery({ queryKey: ["report"], queryFn: fetchReport });
  const rows = (q.data?.rows ?? []).filter((r) => r.eligible >= 2 && r.rate < 0.75).sort((a, b) => a.rate - b.rate);
  const critical = rows.filter((r) => r.rate < 0.5);
  const exportCsv = () => downloadCsv(`sambhav-defaulters-${new Date().toISOString().slice(0, 10)}.csv`, csvOf([["Name", "Roll", "Programme", "Year", "Present", "Eligible", "Rate", "Band"], ...rows.map((r) => [r.name, r.rollNo, r.programme, r.year, r.present, r.eligible, pct(r.rate, 1), r.rate < 0.5 ? "Critical" : "Warning"])]));
  return <AdminShell zone="alerts" title="Defaulters" lede="Members below the 75% requirement with at least two eligible sessions." actions={<button className="btn primary" disabled={!rows.length} onClick={exportCsv}>Export list</button>}>
    {q.isLoading ? <Loading /> : !rows.length ? <Empty title="Everyone is on track">No member with 2+ eligible sessions is below 75%.</Empty> : <>
      <div className="stats" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }}><div><b>{rows.length}</b><span>Below 75%</span></div><div><b>{critical.length}</b><span>Critical (&lt; 50%)</span></div><div><b>{rows.length - critical.length}</b><span>Warning (50–74%)</span></div></div>
      <div className="grid g3">{rows.map((r) => <div key={r.id} className="card zc spot"><div className="spread"><div className="person"><Avatar name={r.name} /><div><b>{r.name}</b><span className="small muted">{r.rollNo ?? "—"} · {r.programme ?? ""}</span></div></div><span className={`pill ${r.rate < 0.5 ? "bad" : "warn"}`}>{r.rate < 0.5 ? "Critical" : "Warning"}</span></div>
        <div className="spread" style={{ marginTop: 14 }}><span className="small muted">{r.present} of {r.eligible} sessions</span><b className="mono">{pct(r.rate)}</b></div><Bar value={r.rate} />
        <p className="small muted" style={{ marginTop: 8 }}>Needs {Math.max(0, Math.ceil((0.75 * r.eligible - r.present) / 0.25))} consecutive sessions to reach 75%.</p></div>)}</div></>}
  </AdminShell>;
}
