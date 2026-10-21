import { useState } from "react";
import { api } from "../../api/client";
import { LineChart, useToast } from "../../components/ui";
import GameHead from "./GameHead";

interface Round { roundId: string; value: number; format: "first" | "second" }
interface Result { value: number; bid: number; rivals: { value: number; bid: number }[]; won: boolean; price: number; profit: number; equilibriumBid: number; benchmarkProfit: number; points: number }
export default function Auction() {
  const toast = useToast(); const [format, setFormat] = useState<"first" | "second">("second"); const [round, setRound] = useState<Round | null>(null);
  const [bid, setBid] = useState(""); const [res, setRes] = useState<Result | null>(null); const [log, setLog] = useState<{ you: number; eq: number }[]>([]);
  const next = async (f = format) => { setRes(null); setBid(""); setRound(await api<Round>("/games/auction/rounds", { body: { format: f } })); };
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!round) return; const r = await api<Result>(`/games/auction/rounds/${round.roundId}/bid`, { body: { bid: Math.round(Number(bid)) } });
    setRes(r); const prev = log.at(-1) ?? { you: 0, eq: 0 }; setLog([...log, { you: prev.you + r.profit, eq: prev.eq + r.benchmarkProfit }]); if (r.points) toast(`+${r.points} points`);
  }
  return <><GameHead id="auction" /><section className="band tight"><div className="wrap split">
    <div className="card stack"><div className="tabs" style={{ margin: 0 }}>{(["first", "second"] as const).map((f) => <button key={f} className={format === f ? "on" : ""} onClick={() => { setFormat(f); void next(f); }}>{f === "first" ? "First-price" : "Second-price (Vickrey)"}</button>)}</div>
      {!round ? <button className="btn primary" style={{ justifySelf: "start" }} onClick={() => next()}>Start a round</button> : <>
        <div><div className="muted small">Your private value</div><div className="ball-result mono" style={{ color: "var(--brand)" }}>₹{round.value}</div></div>
        {!res ? <form className="row" onSubmit={submit} style={{ alignItems: "end" }}><div className="field" style={{ flex: 1 }}><label htmlFor="bid">Sealed bid ₹</label><input id="bid" type="number" min={0} value={bid} onChange={(e) => setBid(e.target.value)} required /></div><button className="btn primary">Submit bid</button></form>
          : <><div className="tablewrap"><table><thead><tr><th>Bidder</th><th>Value</th><th>Bid</th></tr></thead><tbody><tr><td>You</td><td className="num">{res.value}</td><td className="num">{res.bid}</td></tr>{res.rivals.map((r, i) => <tr key={i}><td>Rival {i + 1}</td><td className="num">{r.value}</td><td className="num">{r.bid}</td></tr>)}</tbody></table></div>
            <div className={`banner ${res.profit > 0 ? "good" : ""}`}>{res.won ? `You won and paid ₹${res.price}: profit ₹${res.profit}.` : `You lost; the winner paid ₹${res.price}.`} Equilibrium bid: ₹{res.equilibriumBid} (profit ₹{res.benchmarkProfit}).</div>
            <button className="btn primary" style={{ justifySelf: "start" }} onClick={() => next()}>Next round</button></>}</>}</div>
    <div className="card stack"><h3>You vs the equilibrium bidder</h3>{log.length > 1 ? <LineChart series={[{ pts: log.map((x, i) => [i + 1, x.you]), color: "var(--brand)", label: "You" }, { pts: log.map((x, i) => [i + 1, x.eq]), color: "var(--accent)", dash: "5 4", label: "Equilibrium" }]} /> : <p className="muted small">Play two rounds to see the comparison.</p>}
      <p className="small muted">{format === "first" ? "With 5 bidders and uniform values, bid 4/5 of your value." : "Bidding exactly your value is weakly dominant."}</p></div>
  </div></section></>;
}
