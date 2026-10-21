import { celebrate } from "../lib/fx";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Loading, PageHead, useToast } from "../components/ui";

const BLOOM: Record<string, string> = { L1: "Remember", L2: "Understand", L3: "Apply", L4: "Analyze", L5: "Evaluate", L6: "Create" };
interface Q { order: number; level: string; lo: string; prompt: string; options: string[] | null; open: boolean; rubric?: string[] }
interface M { id: string; code: string; title: string; short: string; game: string; outcomes: { id: string; text: string }[]; lessons: { title: string; html: string }[]; questions: Q[] }
interface Result { score: number; outOf: number; passed: boolean; best: number; results: { order: number; correct: boolean; chosen?: number; answer?: number; explanation?: string; model?: string }[] }

export default function Module() {
  const { id = "m1" } = useParams(); const { user } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["module", id, !!user], queryFn: () => api<{ module: M; completedLessons: number[] }>(`/modules/${id}`) });
  const [tab, setTab] = useState<"lessons" | "quiz">("lessons"); const [ans, setAns] = useState<Record<string, number>>({}); const [open, setOpen] = useState(""); const [rubric, setRubric] = useState<number[]>([]); const [res, setRes] = useState<Result | null>(null);
  if (q.isLoading || !q.data) return <div className="wrap band"><Loading /></div>;
  const m = q.data.module; const done = new Set(q.data.completedLessons);
  async function complete(i: number) { if (!user) return toast("Sign in to track progress"); await api(`/modules/${id}/lessons/${i}/complete`, { method: "POST" }); qc.invalidateQueries({ queryKey: ["module", id] }); }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!user) return toast("Sign in to submit the quiz");
    try { const r = await api<Result>(`/modules/${id}/attempts`, { body: { answers: ans, open: { text: open, rubric } } }); setRes(r); if (r.passed) celebrate(); qc.invalidateQueries({ queryKey: ["modules"] }); window.scrollTo({ top: 0 }); }
    catch (x) { toast(x instanceof ApiError ? x.message : "Could not submit"); }
  }
  return <><PageHead crumb={`Learn / ${m.code}`} title={m.title} lede={m.short} actions={<Link className="btn" to={`/arena/${m.game}`}>Try it in the Arena</Link>} />
    <section className="band"><div className="wrap split"><div style={{ minWidth: 0 }}><div className="tabs"><button className={tab === "lessons" ? "on" : ""} onClick={() => setTab("lessons")}>Lessons</button><button className={tab === "quiz" ? "on" : ""} onClick={() => setTab("quiz")}>Quiz</button></div>
      {tab === "lessons" ? <div className="stack" style={{ gap: 16 }}>{m.lessons.map((l, i) => <article key={i} className="card pad-lg lesson"><div className="spread"><h3>{i + 1}. {l.title}</h3>{done.has(i) ? <span className="pill good">Completed</span> : <button className="btn sm" onClick={() => complete(i)}>Mark complete</button>}</div>
        {/* Lesson HTML is first-party curriculum seeded by the server, not user input. */}<div dangerouslySetInnerHTML={{ __html: l.html }} /></article>)}</div>
      : <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        {res && <div className={`banner ${res.passed ? "good" : "warn"}`}>Score <b>{res.score}/{res.outOf}</b> — {res.passed ? "passed" : "4 needed to pass"}. Best: {res.best}/{res.outOf}.</div>}
        {m.questions.map((qq) => { const r = res?.results.find((x) => x.order === qq.order);
          return <div key={qq.order} className="q"><div className="spread"><span className={`bloom ${qq.level}`}>{qq.level} · {BLOOM[qq.level]}</span><span className="small muted">{qq.lo}</span></div><p style={{ marginTop: 8, fontWeight: 600, color: "var(--ink)" }}>{qq.order}. {qq.prompt}</p>
            {qq.open ? <><textarea value={open} onChange={(e) => setOpen(e.target.value)} placeholder="Write your design here…" style={{ marginTop: 10 }} />
              <div className="opts">{qq.rubric?.map((rb, k) => <label key={k} className="opt"><input type="checkbox" checked={rubric.includes(k)} onChange={(e) => setRubric(e.target.checked ? [...rubric, k] : rubric.filter((x) => x !== k))} /> {rb}</label>)}</div>{r?.model && <div className="why"><b>Model answer.</b> {r.model}</div>}</>
              : <div className="opts">{qq.options?.map((o, k) => <label key={k} className={`opt ${r ? (k === r.answer ? "right" : r.chosen === k ? "wrong" : "") : ""}`}><input type="radio" name={`q${qq.order}`} disabled={!!r} checked={ans[qq.order] === k} onChange={() => setAns({ ...ans, [qq.order]: k })} /> {o}</label>)}{r?.explanation && <div className="why">{r.explanation}</div>}</div>}</div>; })}
        {res ? <button type="button" className="btn" style={{ justifySelf: "start" }} onClick={() => { setRes(null); setAns({}); setRubric([]); }}>Try again</button> : <button className="btn primary" style={{ justifySelf: "start" }}>Submit quiz</button>}
      </form>}</div>
      <aside className="stack" style={{ gap: 16, alignContent: "start" }}><div className="card"><h3>Learning outcomes</h3><ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>{m.outcomes.map((o) => <li key={o.id} className="small" style={{ marginTop: 6 }}><b>{o.id}</b> {o.text}</li>)}</ul></div>
        <div className="card"><h3>Assessment map</h3><div className="tablewrap" style={{ marginTop: 10 }}><table><thead><tr><th>Q</th><th>Bloom</th><th>LO</th></tr></thead><tbody>{m.questions.map((x) => <tr key={x.order}><td>{x.order}</td><td><span className={`bloom ${x.level}`}>{x.level} {BLOOM[x.level]}</span></td><td>{x.lo}</td></tr>)}</tbody></table></div></div></aside>
    </div></section></>;
}
