import { useEffect, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useToast, LineChart } from "../../components/ui";
import GameHead from "./GameHead";

interface Strat { id: string; name: string; description: string }
interface MoveRes { round: number; you: "C" | "D"; opponent: "C" | "D"; total: [number, number]; done: boolean; points: number; reveal?: { name: string } }
interface Tour { ranking: { id: string; avg: number }[]; evolution: Record<string, number[]> }
const COL = ["#14549a", "#1f7a4d", "#b8322a", "#7a3fa0", "#a86a00", "#0f6e80", "#5b4a9e", "#8a4b2a", "#6fb36f", "#7d8794"];

export default function Pd() {
  const toast = useToast(); const [strats, setStrats] = useState<Strat[]>([]); const [opp, setOpp] = useState("mystery");
  const [match, setMatch] = useState<{ id: string; name: string | null; rounds: MoveRes[] } | null>(null);
  const [sel, setSel] = useState<string[]>(["tft", "gtft", "grim", "pavlov", "alld", "allc", "random"]); const [noise, setNoise] = useState(0); const [tour, setTour] = useState<Tour | null>(null);
  useEffect(() => { api<{ strategies: Strat[] }>("/games/pd/strategies").then((r) => setStrats(r.strategies)); }, []);
  const last = match?.rounds.at(-1);
  async function start() { const r = await api<{ matchId: string; opponent: string | null }>("/games/pd/matches", { body: { opponent: opp } }); setMatch({ id: r.matchId, name: r.opponent, rounds: [] }); }
  async function move(m: "C" | "D") {
    if (!match) return;
    try { const r = await api<MoveRes>(`/games/pd/matches/${match.id}/moves`, { body: { move: m } }); setMatch({ ...match, name: r.reveal?.name ?? match.name, rounds: [...match.rounds, r] }); if (r.done) toast(`Match over — +${r.points} points`); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Move failed"); }
  }
  async function runTour() { try { setTour(await api<Tour>("/games/pd/tournament", { body: { strategies: sel, noise: noise / 100, rounds: 200, reps: 3 } })); } catch (e) { toast((e as Error).message); } }
  const name = (id: string) => strats.find((s) => s.id === id)?.name ?? id;
  return <><GameHead id="pd" /><section className="band tight"><div className="wrap grid" style={{ gap: 20 }}>
    <div className="split"><div className="card"><div className="spread"><h3>Play a match</h3><div className="row"><select value={opp} onChange={(e) => setOpp(e.target.value)} style={{ width: "auto" }}><option value="mystery">Mystery opponent</option>{strats.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="btn sm primary" onClick={start}>New match</button></div></div>
      {!match ? <div className="empty" style={{ marginTop: 14 }}><b>Choose an opponent to start</b>Each round continues with probability 0.9.</div> : <div className="stack" style={{ marginTop: 14 }}>
        <div className="spread"><h4>{match.name ?? "Mystery strategy"}</h4><span className="mono">You {last?.total[0] ?? 0} · Opp {last?.total[1] ?? 0}</span></div>
        <div className="pdround">{match.rounds.map((r, i) => <span key={i} className={r.you} title={`Opp: ${r.opponent}`}>{r.you}</span>)}</div>
        <div className="pdround">{match.rounds.map((r, i) => <span key={i} className={r.opponent}>{r.opponent}</span>)}</div>
        {last?.done ? <div className="banner good">Match over after {last.round} rounds — average {(last.total[0] / last.round).toFixed(2)}, +{last.points} points.</div>
          : <div className="row"><button className="btn primary" onClick={() => move("C")}>Cooperate</button><button className="btn danger" onClick={() => move("D")}>Defect</button></div>}</div>}</div>
      <div className="card"><h3>Payoffs</h3><div className="tablewrap" style={{ marginTop: 10 }}><table><thead><tr><th /><th>Opp C</th><th>Opp D</th></tr></thead><tbody><tr><th>You C</th><td className="mono">(3, 3)</td><td className="mono">(0, 5)</td></tr><tr><th>You D</th><td className="mono">(5, 0)</td><td className="mono">(1, 1)</td></tr></tbody></table></div><p className="small muted" style={{ marginTop: 10 }}>Grim Trigger sustains cooperation when δ ≥ (T−R)/(T−P) = 0.5.</p></div></div>
    <div className="card"><h3>Axelrod tournament</h3><div className="row" style={{ gap: "6px 14px", marginTop: 10 }}>{strats.map((s) => <label key={s.id} className="row small" style={{ gap: 6, margin: 0, fontWeight: 500, color: "var(--fg)" }}><input type="checkbox" style={{ width: "auto" }} checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} />{s.name}</label>)}</div>
      <div className="row" style={{ marginTop: 10 }}><label htmlFor="noise" style={{ margin: 0 }}>Noise %</label><input id="noise" type="number" min={0} max={30} value={noise} onChange={(e) => setNoise(+e.target.value)} style={{ width: 80 }} /><button className="btn primary" onClick={runTour}>Run tournament</button></div>
      {tour && <div className="grid g2" style={{ marginTop: 16 }}><div className="tablewrap"><table><thead><tr><th>#</th><th>Strategy</th><th>Avg payoff</th></tr></thead><tbody>{tour.ranking.map((r, i) => <tr key={r.id}><td>{i + 1}</td><td>{name(r.id)}</td><td className="num">{r.avg.toFixed(3)}</td></tr>)}</tbody></table></div>
        <div><h4>Population share % (replicator dynamics)</h4><LineChart series={Object.entries(tour.evolution).map(([id, xs], i) => ({ pts: xs.map((x, g) => [g, x * 100] as [number, number]), color: COL[i % COL.length], label: name(id) }))} /></div></div>}</div>
  </div></section></>;
}
