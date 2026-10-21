import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import { AdminShell } from "../../components/AdminDock";
import { Avatar, Bar, Empty, Loading } from "../../components/ui";
import { fdate, pct } from "../../lib/format";
import { downloadCsv, fetchReport } from "./data";

export default function Reports() {
  const q = useQuery({ queryKey: ["report"], queryFn: fetchReport }); const d = q.data;
  const avg = d && d.rows.length ? d.rows.reduce((a, r) => a + r.rate, 0) / d.rows.length : 0;
  const exportCsv = async () => downloadCsv(`sambhav-attendance-${new Date().toISOString().slice(0, 10)}.csv`, await api<string>("/attendance/report?format=csv", { raw: true }));
  return <AdminShell zone="reports" title="Attendance register" lede="Every member against every session held since they joined." actions={<button className="btn primary" onClick={exportCsv}>Export CSV</button>}>
    {!d ? <Loading /> : !d.sessions.length ? <Empty title="No sessions held yet" /> : <>
      <div className="stats"><div><b>{d.rows.length}</b><span>Members</span></div><div><b>{d.sessions.length}</b><span>Sessions held</span></div><div><b>{pct(avg)}</b><span>Average rate</span></div><div><b>{d.rows.filter((r) => r.rate >= 0.75).length}</b><span>At or above 75%</span></div></div>
      <div className="tablewrap"><table><thead><tr><th>Member</th><th>Roll</th>{d.sessions.map((s) => <th key={s.id} title={s.title}>{fdate(s.date).slice(0, 6)}</th>)}<th>Rate</th></tr></thead><tbody>
        {d.rows.map((r) => <tr key={r.id}><td><div className="person"><Avatar name={r.name} /><b>{r.name}</b></div></td><td className="mono">{r.rollNo}</td>{r.marks.map((m, i) => <td key={i}><span className={`att ${m ? "p" : "a"}`}>{m ? "P" : "–"}</span></td>)}
          <td><div className="row" style={{ flexWrap: "nowrap" }}><div style={{ width: 80 }}><Bar value={r.rate} /></div><span className="small">{r.eligible ? pct(r.rate) : "—"}</span></div></td></tr>)}</tbody></table></div></>}
  </AdminShell>;
}
