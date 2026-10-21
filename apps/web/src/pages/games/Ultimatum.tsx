import { useState } from "react";
import { acceptProbability } from "@sambhav/game-core";
import { api } from "../../api/client";
import { LineChart, useToast } from "../../components/ui";
import GameHead from "./GameHead";

export default function Ultimatum() {
  const toast = useToast(); const [mode, setMode] = useState<"propose" | "respond">("propose"); const [offer, setOffer] = useState(30);
  const [incoming, setIncoming] = useState<{ offerId: string; offer: number } | null>(null); const [msg, setMsg] = useState(""); const [earn, setEarn] = useState(0); const [n, setN] = useState(0);
  async function propose() { const r = await api<{ accepted: boolean; earned: number; points: number }>("/games/ultimatum/propose", { body: { offer } }); done(r.earned, r.points, r.accepted ? `Accepted — you keep ₹${r.earned}.` : `Rejected — both get ₹0.`); }
  async function respond(accept: boolean) { if (!incoming) return; const r = await api<{ earned: number; points: number }>(`/games/ultimatum/offers/${incoming.offerId}`, { body: { accept } }); setIncoming(null); done(r.earned, r.points, accept ? `You accepted ₹${r.earned}.` : "You rejected — costly punishment."); }
  const done = (e: number, p: number, m: string) => { setEarn(earn + e); setN(n + 1); setMsg(m); if (p) toast(`+${p} points`); };
  const curve = Array.from({ length: 21 }, (_, i) => [i * 5, (100 - i * 5) * acceptProbability(i * 5)] as [number, number]);
  return <><GameHead id="ultimatum" /><section className="band tight"><div className="wrap split">
    <div className="card stack"><div className="tabs" style={{ margin: 0 }}><button className={mode === "propose" ? "on" : ""} onClick={() => setMode("propose")}>You propose</button><button className={mode === "respond" ? "on" : ""} onClick={() => { setMode("respond"); if (!incoming) api<{ offerId: string; offer: number }>("/games/ultimatum/offers", { method: "POST" }).then(setIncoming); }}>You respond</button></div>
      {mode === "propose" ? <><label htmlFor="o">Offer to responder: <b className="mono">₹{offer}</b></label><input id="o" type="range" min={0} max={100} step={5} value={offer} onChange={(e) => setOffer(+e.target.value)} /><button className="btn primary" style={{ justifySelf: "start" }} onClick={propose}>Make offer</button></>
        : incoming ? <><p>The proposer offers you</p><div className="ball-result mono">₹{incoming.offer}</div><div className="row"><button className="btn primary" onClick={() => respond(true)}>Accept</button><button className="btn danger" onClick={() => respond(false)}>Reject</button></div></>
        : <button className="btn" onClick={() => api<{ offerId: string; offer: number }>("/games/ultimatum/offers", { method: "POST" }).then(setIncoming)}>Next offer</button>}
      {msg && <div className="banner">{msg}</div>}<dl className="kv"><dt>Rounds</dt><dd>{n}</dd><dt>Earnings</dt><dd>₹{earn}</dd></dl></div>
    <div className="card stack"><h3>Expected payoff by offer</h3><LineChart series={[{ pts: curve, color: "var(--accent)", label: "(100 − offer) × P(accept)" }]} /><p className="small muted">The subgame-perfect offer is ₹1; against real responders the best offer is near ₹35.</p></div>
  </div></section></>;
}
