import { useEffect, useState } from "react";
import { getSocket, useSocketEvent } from "../../lib/socket";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/ui";
import GameHead from "./GameHead";

interface State { id: string; factor: number; endsAt: number; entries: number }
interface Result { id: string; average?: number; target?: number; entries: number; top?: { name: string; value: number; rank: number }[] }
/** Club-night multiplayer: one shared ⅔ round over WebSockets, closed by a server-side timer. */
export default function Live() {
  const { can } = useAuth(); const toast = useToast(); const [state, setState] = useState<State | null>(null); const [result, setResult] = useState<Result | null>(null);
  const [v, setV] = useState("33"); const [now, setNow] = useState(Date.now()); const [sent, setSent] = useState(false);
  useEffect(() => { getSocket().emit("live:join"); const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  useSocketEvent<State | null>("live:state", (s) => { setState(s); if (s && s.id !== state?.id) { setResult(null); setSent(false); } });
  useSocketEvent<Result>("live:result", (r) => { setResult(r); setState(null); });
  const left = state ? Math.max(0, Math.ceil((state.endsAt - now) / 1000)) : 0;
  const guess = () => getSocket().emit("live:guess", { value: Number(v) }, (r: { ok?: boolean; error?: string }) => { if (r.ok) { setSent(true); toast("Guess locked in"); } else toast(r.error ?? "Could not submit"); });
  return <><GameHead id="live" /><section className="band tight"><div className="wrap split">
    <div className="card stack">{state ? <><div className="spread"><h3>Round open</h3><span className="pill good"><span className="live-dot" /> {left}s left</span></div>
        <p>Target: <b>{state.factor === 2 / 3 ? "⅔" : state.factor} × average</b>. {state.entries} guesses in.</p>
        <div className="row" style={{ alignItems: "end" }}><div className="field" style={{ flex: 1 }}><label htmlFor="lv">Your number (0–100)</label><input id="lv" type="number" min={0} max={100} step={0.1} value={v} onChange={(e) => setV(e.target.value)} /></div><button className="btn primary" onClick={guess}>{sent ? "Update guess" : "Submit"}</button></div></>
      : <div className="empty"><b>Waiting for the coordinator to open a round</b>Keep this page open — it updates live.</div>}
      {can("COORDINATOR") && <div className="row"><button className="btn accent" disabled={!!state} onClick={() => getSocket().emit("live:start", { seconds: 60 }, (r: { error?: string }) => r.error && toast(r.error))}>Start 60-second round</button><button className="btn" disabled={!state} onClick={() => getSocket().emit("live:close")}>Close now</button></div>}</div>
    <div className="card stack"><h3>Last result</h3>{result ? result.entries ? <><dl className="kv"><dt>Entries</dt><dd>{result.entries}</dd><dt>Average</dt><dd>{result.average?.toFixed(2)}</dd><dt>Target</dt><dd>{result.target?.toFixed(2)}</dd></dl>
      <div className="tablewrap"><table><thead><tr><th>#</th><th>Member</th><th>Guess</th></tr></thead><tbody>{result.top?.map((t, i) => <tr key={i}><td>{t.rank}</td><td>{t.name}</td><td className="num">{t.value}</td></tr>)}</tbody></table></div></> : <p className="muted">No one guessed.</p> : <p className="muted small">Results appear here when the round closes. Winners earn 15 points.</p>}</div>
  </div></section></>;
}
