import { useState } from "react";
import { api } from "../../api/client";
import { Bar, useToast } from "../../components/ui";
import GameHead from "./GameHead";

type M = "R" | "P" | "S"; const N: Record<M, string> = { R: "Rock", P: "Paper", S: "Scissors" };
interface R { you: M; bot: M; outcome: "win" | "loss" | "draw"; wins: number; losses: number; draws: number; points: number }
export default function Rps() {
  const toast = useToast(); const [log, setLog] = useState<R[]>([]); const last = log.at(-1);
  const play = async (m: M) => { const r = await api<R>("/games/rps", { body: { move: m } }); setLog([...log, r]); if (r.points) toast(`+${r.points} points`); };
  const f = (m: M) => (log.length ? log.filter((x) => x.you === m).length / log.length : 0);
  return <><GameHead id="rps" /><section className="band tight"><div className="wrap split">
    <div className="card stack"><div className="row">{(["R", "P", "S"] as M[]).map((m) => <button key={m} className="btn" style={{ flex: 1, padding: 18 }} onClick={() => play(m)}>{N[m]}</button>)}</div>
      {last ? <div className={`banner ${last.outcome === "win" ? "good" : last.outcome === "loss" ? "warn" : ""}`}>You played {N[last.you]}, bot played {N[last.bot]} — {last.outcome}.</div> : <p className="muted">The bot predicts you from frequency and your last two moves.</p>}
      <dl className="kv"><dt>Wins</dt><dd>{last?.wins ?? 0}</dd><dt>Losses</dt><dd>{last?.losses ?? 0}</dd><dt>Draws</dt><dd>{last?.draws ?? 0}</dd></dl></div>
    <div className="card stack"><h3>Your mix vs 1/3 equilibrium</h3>{(["R", "P", "S"] as M[]).map((m) => <div key={m}><div className="spread small"><span>{N[m]}</span><span className="mono">{(f(m) * 100).toFixed(1)}%</span></div><Bar value={f(m)} /></div>)}</div>
  </div></section></>;
}
