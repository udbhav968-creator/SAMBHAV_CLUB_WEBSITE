import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Loading, PageHead } from "../components/ui";

export interface ModuleRow { id: string; code: string; title: string; short: string; hours: number; game: string; lessonCount: number; progress: { lessons: number; best: number | null } | null }
const BLOOM = [["L1", "Remember"], ["L2", "Understand"], ["L3", "Apply"], ["L4", "Analyze"], ["L5", "Evaluate"], ["L6", "Create"]];
export default function Learn() {
  const q = useQuery({ queryKey: ["modules"], queryFn: () => api<{ modules: ModuleRow[] }>("/modules") });
  return <><PageHead crumb="Learn" title="Learning modules" lede="Six modules with stated learning outcomes; every quiz spans Bloom's six levels." />
    <section className="band"><div className="wrap stack" style={{ gap: 18 }}><div className="row" style={{ gap: 6 }}>{BLOOM.map(([k, n]) => <span key={k} className={`bloom ${k}`}>{k} {n}</span>)}</div>
      {q.isLoading ? <Loading /> : <div className="grid g3">{q.data?.modules.map((m) => { const p = m.progress; const f = p ? (p.lessons + (p.best != null ? 1 : 0)) / (m.lessonCount + 1) : 0;
        return <Link key={m.id} to={`/learn/${m.id}`} className="step spot reveal module"><div className="spread"><span className="pill brand mono">{m.code}</span><span className="small muted">{m.hours} h</span></div><h3>{m.title}</h3><p className="muted small">{m.short}</p>
          <div className="progress"><i style={{ width: `${f * 100}%` }} /></div><div className="spread small muted"><span>{p ? `${p.lessons}/${m.lessonCount} lessons` : `${m.lessonCount} lessons`}</span><span>{p?.best != null ? `Quiz best ${p.best}/6` : "Quiz not taken"}</span></div></Link>; })}</div>}
    </div></section></>;
}
