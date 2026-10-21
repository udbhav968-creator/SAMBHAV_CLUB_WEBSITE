import { useMemo, useState } from "react";
import { solve } from "@sambhav/game-core";
import { frac } from "../../lib/format";
import GameHead from "./GameHead";

const PRESETS: Record<string, { r: string[]; c: string[]; A: number[][]; B: number[][] }> = {
  "Prisoner's Dilemma": { r: ["Cooperate", "Defect"], c: ["Cooperate", "Defect"], A: [[3, 0], [5, 1]], B: [[3, 5], [0, 1]] },
  "Stag Hunt": { r: ["Stag", "Hare"], c: ["Stag", "Hare"], A: [[4, 0], [3, 3]], B: [[4, 3], [0, 3]] },
  "Battle of the Sexes": { r: ["Opera", "Football"], c: ["Opera", "Football"], A: [[3, 0], [0, 2]], B: [[2, 0], [0, 3]] },
  "Chicken": { r: ["Swerve", "Straight"], c: ["Swerve", "Straight"], A: [[0, -1], [1, -10]], B: [[0, 1], [-1, -10]] },
  "Matching Pennies": { r: ["Heads", "Tails"], c: ["Heads", "Tails"], A: [[1, -1], [-1, 1]], B: [[-1, 1], [1, -1]] },
  "Rock-Paper-Scissors": { r: ["Rock", "Paper", "Scissors"], c: ["Rock", "Paper", "Scissors"], A: [[0, -1, 1], [1, 0, -1], [-1, 1, 0]], B: [[0, 1, -1], [-1, 0, 1], [1, -1, 0]] },
};
/** Runs entirely in the browser using the shared game-core solver (same code the API uses). */
export default function Nash() {
  const [g, setG] = useState(structuredClone(PRESETS["Prisoner's Dilemma"])); const sol = useMemo(() => solve(g.A, g.B), [g]);
  const pure = new Set(sol.equilibria.filter((e) => e.pure).map((e) => `${e.p.indexOf(1)},${e.q.indexOf(1)}`));
  const setCell = (M: "A" | "B", i: number, j: number, v: string) => { const n = structuredClone(g); n[M][i][j] = Number(v) || 0; setG(n); };
  const resize = (k: number) => setG({ r: Array.from({ length: k }, (_, i) => g.r[i] ?? `R${i + 1}`), c: Array.from({ length: k }, (_, j) => g.c[j] ?? `C${j + 1}`), A: Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => g.A[i]?.[j] ?? 0)), B: Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => g.B[i]?.[j] ?? 0)) });
  return <><GameHead id="nash" /><section className="band tight"><div className="wrap grid" style={{ gap: 20 }}>
    <div className="card"><div className="spread"><select style={{ width: "auto" }} onChange={(e) => setG(structuredClone(PRESETS[e.target.value]))}>{Object.keys(PRESETS).map((k) => <option key={k}>{k}</option>)}</select><div className="row"><button className="btn sm" onClick={() => resize(2)}>2×2</button><button className="btn sm" onClick={() => resize(3)}>3×3</button></div></div>
      <div className="pm tablewrap" style={{ marginTop: 14 }}><table><thead><tr><th>Row \ Col</th>{g.c.map((c, j) => <th key={j}>{c}</th>)}</tr></thead><tbody>{g.A.map((row, i) => <tr key={i}><th>{g.r[i]}</th>{row.map((_, j) => <td key={j} className={pure.has(`${i},${j}`) ? "ne" : ""}>
        <span className={sol.rowBestResponse[j][i] ? "br" : ""}><input aria-label={`Row payoff ${i + 1},${j + 1}`} value={g.A[i][j]} onChange={(e) => setCell("A", i, j, e.target.value)} /></span> , <span className={sol.colBestResponse[i][j] ? "br" : ""}><input aria-label={`Column payoff ${i + 1},${j + 1}`} value={g.B[i][j]} onChange={(e) => setCell("B", i, j, e.target.value)} /></span></td>)}</tr>)}</tbody></table></div>
      <p className="small muted" style={{ marginTop: 8 }}>Underlined = best response · shaded = pure Nash equilibrium.</p></div>
    <div className="card stack"><h3>Equilibria</h3>{sol.equilibria.map((e, k) => <div key={k} className="q" style={{ padding: 12 }}><b>{e.pure ? "Pure" : "Mixed"} equilibrium {k + 1}</b>
      <div className="small mono" style={{ marginTop: 6 }}>Row: {e.p.map((x, i) => (x > 1e-9 ? `${g.r[i]} ${frac(x)}` : null)).filter(Boolean).join(" · ")}<br />Col: {e.q.map((x, j) => (x > 1e-9 ? `${g.c[j]} ${frac(x)}` : null)).filter(Boolean).join(" · ")}<br />Payoffs: ({frac(e.u)}, {frac(e.v)})</div></div>)}</div>
  </div></section></>;
}
