import { type Rng } from "./rng.js";

export type Move = "C" | "D";
export const PAYOFF: Record<`${Move}${Move}`, [number, number]> = { CC: [3, 3], CD: [0, 5], DC: [5, 0], DD: [1, 1] };
/** Critical discount factor for Grim Trigger: δ* = (T−R)/(T−P). */
export const criticalDelta = (T = 5, R = 3, P = 1): number => (T - R) / (T - P);

export type StrategyFn = (mine: Move[], theirs: Move[], rng: Rng) => Move;
export interface Strategy { id: string; name: string; description: string; play: StrategyFn }
const last = (h: Move[]) => h[h.length - 1];

export const STRATEGIES: Record<string, Strategy> = {
  tft:    { id: "tft",    name: "Tit-for-Tat",       description: "Cooperate first, then copy the opponent's last move.", play: (m, o) => (o.length ? last(o) : "C") },
  gtft:   { id: "gtft",   name: "Generous TFT",      description: "TFT that forgives one defection in three.", play: (m, o, r) => (!o.length || last(o) === "C" ? "C" : r() < 1 / 3 ? "C" : "D") },
  tf2t:   { id: "tf2t",   name: "Tit-for-Two-Tats",  description: "Defects only after two consecutive defections.", play: (m, o) => (o.length >= 2 && last(o) === "D" && o[o.length - 2] === "D" ? "D" : "C") },
  grim:   { id: "grim",   name: "Grim Trigger",      description: "Cooperates until the first defection, then defects forever.", play: (m, o) => (o.includes("D") ? "D" : "C") },
  pavlov: { id: "pavlov", name: "Pavlov (WSLS)",     description: "Win-stay, lose-shift.", play: (m, o) => (!m.length ? "C" : last(o) === "C" ? last(m) : last(m) === "C" ? "D" : "C") },
  stft:   { id: "stft",   name: "Suspicious TFT",    description: "Defects first, then copies.", play: (m, o) => (o.length ? last(o) : "D") },
  joss:   { id: "joss",   name: "Joss",              description: "TFT that sneaks in a defection 10% of the time.", play: (m, o, r) => { const t = o.length ? last(o) : "C"; return t === "C" && r() < 0.1 ? "D" : t; } },
  allc:   { id: "allc",   name: "Always Cooperate",  description: "Unconditional cooperator.", play: () => "C" },
  alld:   { id: "alld",   name: "Always Defect",     description: "Unconditional defector.", play: () => "D" },
  random: { id: "random", name: "Random",            description: "Fair coin each round.", play: (m, o, r) => (r() < 0.5 ? "C" : "D") },
};

/** Number of rounds when each round continues with probability delta (min 4, max cap). */
export function drawMatchLength(rng: Rng, delta = 0.9, cap = 25): number {
  let n = 1; while (n < cap && rng() < delta) n++; return Math.max(4, n);
}

export function playMatch(a: string, b: string, rounds: number, rng: Rng, noise = 0) {
  const ma: Move[] = [], mb: Move[] = []; let sa = 0, sb = 0;
  const flip = (x: Move): Move => (x === "C" ? "D" : "C");
  for (let i = 0; i < rounds; i++) {
    let x = STRATEGIES[a].play(ma, mb, rng), y = STRATEGIES[b].play(mb, ma, rng);
    if (noise && rng() < noise) x = flip(x);
    if (noise && rng() < noise) y = flip(y);
    ma.push(x); mb.push(y); const [pa, pb] = PAYOFF[`${x}${y}`]; sa += pa; sb += pb;
  }
  return { a: sa / rounds, b: sb / rounds, movesA: ma, movesB: mb };
}

export interface TournamentResult { matrix: Record<string, Record<string, number>>; ranking: { id: string; avg: number }[]; evolution: Record<string, number[]> }

/** Axelrod round-robin including self-play, followed by discrete replicator dynamics. */
export function tournament(ids: string[], rng: Rng, opts: { rounds?: number; noise?: number; reps?: number; generations?: number } = {}): TournamentResult {
  const { rounds = 200, noise = 0, reps = 5, generations = 80 } = opts;
  if (ids.length < 2) throw new RangeError("Need at least two strategies");
  for (const id of ids) if (!STRATEGIES[id]) throw new RangeError(`Unknown strategy ${id}`);
  const M: Record<string, Record<string, number>> = {};
  ids.forEach((a) => { M[a] = {}; ids.forEach((b) => (M[a][b] = 0)); });
  for (let r = 0; r < reps; r++)
    for (let i = 0; i < ids.length; i++)
      for (let j = i; j < ids.length; j++) {
        const res = playMatch(ids[i], ids[j], rounds, rng, noise);
        M[ids[i]][ids[j]] += res.a / reps;
        if (i !== j) M[ids[j]][ids[i]] += res.b / reps;
      }
  const ranking = ids.map((id) => ({ id, avg: ids.reduce((s, b) => s + M[id][b], 0) / ids.length })).sort((x, y) => y.avg - x.avg);
  const x: Record<string, number> = Object.fromEntries(ids.map((k) => [k, 1 / ids.length]));
  const evolution: Record<string, number[]> = Object.fromEntries(ids.map((k) => [k, [x[k]]]));
  for (let g = 0; g < generations; g++) {
    const f = Object.fromEntries(ids.map((k) => [k, ids.reduce((s, b) => s + x[b] * M[k][b], 0)]));
    const mean = ids.reduce((s, k) => s + x[k] * f[k], 0);
    ids.forEach((k) => { x[k] = (x[k] * f[k]) / mean; evolution[k].push(x[k]); });
  }
  return { matrix: M, ranking, evolution };
}
