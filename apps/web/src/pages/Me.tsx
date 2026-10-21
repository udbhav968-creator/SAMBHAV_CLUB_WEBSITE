import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Loading, PageHead } from "../components/ui";
import { pct } from "../lib/format";

interface Summary { attendance: { present: number; total: number; rate: number }; points: { arena: number; quiz: number; attendance: number; total: number }; rank: number | null; badges: string[]; events: { id: string; title: string; startsAt: string }[]; quiz: { moduleId: string; best: number }[] }
interface History { totals: { game: string; plays: number; points: number }[] }
export default function Me() {
  const { user } = useAuth();
  const s = useQuery({ queryKey: ["summary", user?.id], queryFn: () => api<Summary>(`/users/${user!.id}/summary`) });
  const h = useQuery({ queryKey: ["history"], queryFn: () => api<History>("/games/history") });
  const d = s.data;
  return <><PageHead crumb="My Sambhav" title={user!.name} lede={<span className="pill brand">{user!.role.toLowerCase()}{user!.title ? ` · ${user!.title}` : ""}</span>} />
    <section className="band"><div className="wrap stack" style={{ gap: 18 }}>{!d ? <Loading /> : <>
      <div className="stats"><div><b>{d.points.total}</b><span>Total points</span></div><div><b>{d.rank ?? "—"}</b><span>Rank</span></div><div><b>{d.attendance.total ? pct(d.attendance.rate) : "—"}</b><span>Attendance</span></div><div><b>{d.quiz.filter((q) => q.best >= 4).length}/6</b><span>Modules passed</span></div></div>
      <div className="grid g2"><div className="card"><h3>Arena record</h3>{h.data?.totals.length ? <div className="tablewrap" style={{ marginTop: 10 }}><table><thead><tr><th>Game</th><th>Plays</th><th>Points</th></tr></thead><tbody>{h.data.totals.map((t) => <tr key={t.game}><td>{t.game.toLowerCase().replace("_", " ")}</td><td className="num">{t.plays}</td><td className="num">{t.points}</td></tr>)}</tbody></table></div> : <p className="muted small" style={{ marginTop: 8 }}>No games yet. <Link to="/arena">Enter the Arena →</Link></p>}</div>
        <div className="card"><h3>Badges</h3><div className="row" style={{ marginTop: 10 }}>{d.badges.length ? d.badges.map((b) => <span key={b} className="pill accent">{b}</span>) : <span className="small muted">Earn badges through attendance and quizzes.</span>}</div>
          <h4 style={{ marginTop: 16 }}>Registered events</h4><ul className="small" style={{ paddingLeft: 18 }}>{d.events.map((e) => <li key={e.id}>{e.title}</li>)}</ul></div></div></>}
    </div></section></>;
}
