import { celebrate } from "../../lib/fx";
import { useState } from "react";
import { api } from "../../api/client";
import { LineChart, useToast } from "../../components/ui";
import GameHead from "./GameHead";

interface R { guesses: number[]; average: number; target: number; rank: number; won: boolean; points: number }
export default function Guess() {
  const toast = useToast(); const [v, setV] = useState("33"); const [hist, setHist] = useState<(R & { mine: number })[]>([]); const last = hist.at(-1);
  async function play(e: React.FormEvent) { e.preventDefault(); const g = Math.max(0, Math.min(100, Number(v))); const r = await api<R>("/games/guess", { body: { guess: g } }); setHist([...hist, { ...r, mine: g }]); if (r.points) toast(`+${r.points} points`); if (r.won) celebrate(); }
  return <><GameHead id="guess" /><section className="band tight"><div className="wrap split">
    <div className="card stack"><h3>Round {hist.length + 1}</h3><p className="muted">Closest to ⅔ of the average of 16 guesses wins.</p>
      <form className="row" onSubmit={play} style={{ alignItems: "end" }}><div className="field" style={{ flex: 1 }}><label htmlFor="g">Your guess (0–100)</label><input id="g" type="number" step="0.1" min={0} max={100} value={v} onChange={(e) => setV(e.target.value)} /></div><button className="btn primary">Submit</button></form>
      {last && <><dl className="kv"><dt>Average</dt><dd>{last.average.toFixed(2)}</dd><dt>Target</dt><dd>{last.target.toFixed(2)}</dd><dt>Your rank</dt><dd>{last.rank} / 16</dd></dl>
        <div className={`banner ${last.won ? "good" : ""}`}>{last.won ? "You won this round!" : `You were ${Math.abs(last.mine - last.target).toFixed(2)} away.`}</div>
        <button className="btn sm" style={{ justifySelf: "start" }} onClick={() => api("/games/guess", { method: "DELETE" }).then(() => setHist([]))}>Reset bots' memory</button></>}</div>
    <div className="card stack"><h3>Level-k ladder</h3><p className="small mono">L0 50 → L1 33.3 → L2 22.2 → L3 14.8 → Nash 0</p>
      {hist.length > 1 && <LineChart series={[{ pts: hist.map((h, i) => [i + 1, h.target]), color: "var(--accent)", label: "Target" }, { pts: hist.map((h, i) => [i + 1, h.mine]), color: "var(--brand)", label: "You" }]} />}</div>
  </div></section></>;
}
