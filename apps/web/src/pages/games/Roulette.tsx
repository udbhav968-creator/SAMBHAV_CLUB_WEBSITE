import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { betSpec, colourOf, expectedValue, fairRoll, sha256Hex, type Bets } from "@sambhav/game-core";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { LineChart, useToast } from "../../components/ui";
import { fmt, pct } from "../../lib/format";
import GameHead from "./GameHead";

interface Spin { result: number; colour: string; returned: number; staked: number; net: number; credits: number; expectedValue: number; proof: { serverSeedHash: string; clientSeed: string; nonce: number } }
interface Fair { serverSeedHash: string; clientSeed: string; nonce: number }
const OUT: [string, string][] = [["low", "1–18"], ["even", "Even"], ["red", "Red"], ["black", "Black"], ["odd", "Odd"], ["high", "19–36"]];

export default function Roulette() {
  const { user, setUser } = useAuth(); const toast = useToast(); const qc = useQueryClient();
  const [chip, setChip] = useState(10); const [bets, setBets] = useState<Bets>({}); const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState(user?.credits ?? 1000); const [hist, setHist] = useState<Spin[]>([]); const [fair, setFair] = useState<Fair | null>(null);
  const [revealed, setRevealed] = useState<{ serverSeed: string; ok: boolean } | null>(null);
  useEffect(() => { api<Fair>("/games/fair").then(setFair); }, []);
  const total = Object.values(bets).reduce((a, b) => a + b, 0);
  const place = (k: string) => { if (total + chip > credits) return toast("Not enough credits for that chip"); setBets((b) => ({ ...b, [k]: (b[k] ?? 0) + chip })); };

  async function spin() {
    if (!total) return toast("Place at least one bet"); setBusy(true);
    try {
      const s = await api<Spin>("/games/roulette/spin", { body: { bets } });
      setHist((h) => [...h, s]); setCredits(s.credits); setBets({}); setFair((f) => f && { ...f, nonce: f.nonce + 1 });
      if (user) setUser({ ...user, credits: s.credits }); qc.invalidateQueries({ queryKey: ["leaderboard"] });
      toast(`${s.result} ${s.colour} — ${s.returned ? `returned ₹${fmt(s.returned)}` : "no winning bet"}`);
    } catch (e) { toast(e instanceof ApiError ? e.message : "Spin failed"); } finally { setBusy(false); }
  }
  async function rotate() {
    const r = await api<{ revealed: { serverSeed: string; serverSeedHash: string; clientSeed: string; lastNonce: number }; next: Fair }>("/games/fair/rotate", { method: "POST" });
    const last = hist.at(-1); let ok = (await sha256Hex(r.revealed.serverSeed)) === r.revealed.serverSeedHash;
    if (last && last.proof.serverSeedHash === r.revealed.serverSeedHash) ok = ok && (await fairRoll(r.revealed.serverSeed, last.proof.clientSeed, last.proof.nonce, 37)) === last.result;
    setRevealed({ serverSeed: r.revealed.serverSeed, ok }); setFair(r.next);
  }
  let bank = 1000, ev = 1000; const path: [number, number][] = [[0, credits - hist.reduce((a, s) => a + s.net, 0)]]; const evp: [number, number][] = [[0, path[0][1]]];
  bank = path[0][1]; ev = bank; hist.forEach((s, i) => { bank += s.net; ev += s.expectedValue; path.push([i + 1, bank]); evp.push([i + 1, ev]); });
  const staked = hist.reduce((a, s) => a + s.staked, 0), net = hist.reduce((a, s) => a + s.net, 0);
  const cell = (n: number) => <button key={n} className={colourOf(n)} onClick={() => place(`n:${n}`)} style={{ gridRow: 3 - ((n - 1) % 3), gridColumn: Math.floor((n - 1) / 3) + 2 }}>{n}{bets[`n:${n}`] ? <span className="stake">{bets[`n:${n}`]}</span> : null}</button>;

  return <><GameHead id="roulette" /><section className="band tight"><div className="wrap grid" style={{ gap: 20 }}>
    <div className="split"><div className="table-surface stack">
      <div className="spread"><h3>Table · credits ₹{fmt(credits)}</h3><div className="chips">{[1, 5, 25, 100, 500].map((v) => <button key={v} data-v={v} className={`chip ${chip === v ? "on" : ""}`} onClick={() => setChip(v)}>{v}</button>)}</div></div>
      <div style={{ overflowX: "auto" }}><div className="rtable">
        <button className="green zero" style={{ gridRow: "1/4", gridColumn: 1 }} onClick={() => place("n:0")}>0{bets["n:0"] ? <span className="stake">{bets["n:0"]}</span> : null}</button>
        {Array.from({ length: 36 }, (_, i) => cell(i + 1))}
        {(["c3", "c2", "c1"] as const).map((c, r) => <button key={c} style={{ gridRow: r + 1, gridColumn: 14 }} onClick={() => place(c)}>2:1{bets[c] ? <span className="stake">{bets[c]}</span> : null}</button>)}
        {(["d1", "d2", "d3"] as const).map((k, i) => <button key={k} style={{ gridRow: 4, gridColumn: `${2 + i * 4}/${6 + i * 4}` }} onClick={() => place(k)}>{betSpec(k)!.label}{bets[k] ? <span className="stake">{bets[k]}</span> : null}</button>)}
        {OUT.map(([k, l], i) => <button key={k} className={k === "red" ? "red" : k === "black" ? "black" : ""} style={{ gridRow: 5, gridColumn: `${2 + i * 2}/${4 + i * 2}` }} onClick={() => place(k)}>{l}{bets[k] ? <span className="stake">{bets[k]}</span> : null}</button>)}
      </div></div>
      <div className="row"><button className="btn accent" disabled={busy} onClick={spin}>{busy ? "Spinning…" : "Spin"}</button><button className="btn sm" onClick={() => setBets({})}>Clear</button>
        <button className="btn sm ghost" style={{ color: "#fff" }} onClick={() => api<{ credits: number }>("/games/roulette/reset-credits", { method: "POST" }).then((r) => setCredits(r.credits)).catch((e) => toast(e.message))}>Reset credits</button></div>
      <div style={{ background: "var(--surface)", color: "var(--fg)", borderRadius: 6, padding: 12 }} className="small">Stake ₹{total} · Expected value <b style={{ color: "var(--bad)" }}>{fmt(expectedValue(bets), 2)}</b> (always −1/37 of the stake)</div>
    </div>
    <div className="table-surface stack"><div><div className="muted small">Last result</div><div className="ball-result">{hist.at(-1)?.result ?? "—"}</div></div>
      <div className="hist">{hist.slice(-18).reverse().map((s, i) => <span key={i} className={s.colour}>{s.result}</span>)}</div>
      <dl className="kv"><dt>Spins</dt><dd>{hist.length}</dd><dt>Staked</dt><dd>₹{fmt(staked)}</dd><dt>Actual return</dt><dd>{staked ? pct(net / staked, 2) : "—"}</dd><dt>Theory</dt><dd>−2.70%</dd></dl>
      <div className="small"><b>Next seed hash</b><div className="seedbox">{fair?.serverSeedHash ?? "…"}</div><div className="muted" style={{ marginTop: 4 }}>client seed {fair?.clientSeed} · nonce {fair?.nonce}</div></div>
      <button className="btn sm" onClick={rotate}>Reveal seed &amp; verify</button>
      {revealed && <div className="seedbox">{revealed.ok ? "✔ verified" : "✘ mismatch"} — seed {revealed.serverSeed}</div>}
    </div></div>
    <div className="card"><h3>Bankroll vs expected value</h3><LineChart series={[{ pts: path, color: "var(--brand)", label: "Your credits" }, { pts: evp, color: "var(--accent)", dash: "5 4", label: "EV path" }]} /></div>
  </div></section></>;
}
