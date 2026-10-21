import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Avatar, Empty, Loading, PageHead } from "../components/ui";

interface Row { id: string; name: string; programme: string | null; arena: number; quiz: number; attendance: number; total: number }
export default function Leaderboard() {
  const { user } = useAuth(); const q = useQuery({ queryKey: ["leaderboard"], queryFn: () => api<{ leaderboard: Row[] }>("/leaderboard?limit=100"), refetchInterval: 30_000 });
  const rows = q.data?.leaderboard ?? [];
  return <><PageHead crumb="Leaderboard" title="Leaderboard" lede="Arena points + 5 per correct quiz answer (best attempt per module) + 10 per session attended." />
    <section className="band"><div className="wrap">{q.isLoading ? <Loading /> : rows.length ? <div className="tablewrap"><table><thead><tr><th>#</th><th>Member</th><th>Arena</th><th>Quizzes</th><th>Attendance</th><th>Total</th></tr></thead><tbody>
      {rows.map((r, i) => <tr key={r.id} style={r.id === user?.id ? { background: "var(--brand-soft)" } : undefined}><td className="num">{i + 1}</td><td><div className="person"><Avatar name={r.name} /><b>{r.name}{r.id === user?.id ? " (you)" : ""}</b></div></td><td className="num">{r.arena}</td><td className="num">{r.quiz}</td><td className="num">{r.attendance}</td><td className="num"><b>{r.total}</b></td></tr>)}</tbody></table></div>
      : <Empty title="No points yet">Play, learn or attend to get on the board.</Empty>}</div></section></>;
}
