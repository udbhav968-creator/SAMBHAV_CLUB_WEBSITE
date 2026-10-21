import { type Rng, clamp, randInt } from "./rng.js";

/* ---------- Guess 2/3 of the average (level-k bots) ---------- */
export function levelKGuesses(n: number, rng: Rng, prevTarget: number | null = null): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = rng(); const k = r < 0.25 ? 0 : r < 0.6 ? 1 : r < 0.85 ? 2 : r < 0.95 ? 3 : 9;
    const base = prevTarget == null ? 50 : prevTarget * 1.5;
    let g = k === 0 ? (prevTarget == null ? rng() * 100 : clamp(prevTarget + (rng() - 0.5) * 30, 0, 100))
          : k === 9 ? rng() * 3 : base * Math.pow(2 / 3, k);
    if (k) g += (rng() - 0.5) * 8;
    out.push(Math.round(clamp(g, 0, 100) * 10) / 10);
  }
  return out;
}
export function resolveBeauty(guesses: number[], factor = 2 / 3) {
  if (!guesses.length) throw new RangeError("No guesses");
  const avg = guesses.reduce((a, v) => a + v, 0) / guesses.length, target = avg * factor;
  const dist = guesses.map((g) => Math.abs(g - target)); const best = Math.min(...dist);
  const winners = dist.map((d, i) => (Math.abs(d - best) < 1e-9 ? i : -1)).filter((i) => i >= 0);
  const rank = (i: number) => 1 + dist.filter((d) => d < dist[i] - 1e-9).length;
  return { avg, target, winners, rank, dist };
}
export const beautyPoints = (rank: number, distance: number) => (rank === 1 ? 10 : Math.max(0, 8 - Math.floor(distance / 2)));

/* ---------- Sealed-bid auctions ---------- */
export type AuctionFormat = "first" | "second";
export const equilibriumBid = (format: AuctionFormat, value: number, bidders: number) => (format === "first" ? ((bidders - 1) / bidders) * value : value);
export function botBid(format: AuctionFormat, value: number, rng: Rng): number {
  return format === "first" ? Math.round(value * (0.75 + rng() * 0.06)) : Math.round(clamp(value + (rng() - 0.5) * 6, 0, 120));
}
export function resolveAuction(format: AuctionFormat, bids: number[]) {
  const order = bids.map((b, i) => ({ b, i })).sort((x, y) => y.b - x.b || x.i - y.i);
  const winner = order[0].i, price = format === "first" ? order[0].b : order[1]?.b ?? 0;
  return { winner, price };
}

/* ---------- Ultimatum ---------- */
/** Acceptance probability calibrated to experimental findings (offers ≥40% nearly always accepted, <20% usually rejected). */
export const acceptProbability = (offerPct: number) => 0.05 + 0.92 / (1 + Math.exp(-(offerPct - 22) / 6));
export function botOffer(rng: Rng): number {
  const r = rng();
  return r < 0.45 ? 40 + randInt(rng, 11) : r < 0.75 ? 30 + randInt(rng, 10) : r < 0.92 ? 20 + randInt(rng, 10) : 5 + randInt(rng, 15);
}

/* ---------- Rock-paper-scissors pattern-exploiting bot (serialisable state) ---------- */
export type Rps = "R" | "P" | "S";
export const BEATS: Record<Rps, Rps> = { R: "S", P: "R", S: "P" };
export const COUNTER: Record<Rps, Rps> = { R: "P", P: "S", S: "R" };
export interface RpsState { history: Rps[]; markov: Record<string, Record<Rps, number>> }
export const newRpsState = (): RpsState => ({ history: [], markov: {} });
export function rpsBotMove(s: RpsState, rng: Rng): Rps {
  const h = s.history; if (h.length < 3 || rng() < 0.15) return (["R", "P", "S"] as Rps[])[randInt(rng, 3)];
  const m = s.markov[h.slice(-2).join("")];
  const top = (f: Record<Rps, number>) => (Object.entries(f) as [Rps, number][]).sort((a, b) => b[1] - a[1])[0][0];
  if (m && m.R + m.P + m.S >= 2) return COUNTER[top(m)];
  const f: Record<Rps, number> = { R: 0, P: 0, S: 0 }; h.forEach((x) => f[x]++); return COUNTER[top(f)];
}
export function rpsRecord(s: RpsState, playerMove: Rps): void {
  const h = s.history; if (h.length >= 2) { const k = h.slice(-2).join(""); s.markov[k] ??= { R: 0, P: 0, S: 0 }; s.markov[k][playerMove]++; }
  h.push(playerMove); if (h.length > 200) h.shift();
}
export const rpsOutcome = (me: Rps, bot: Rps): "win" | "loss" | "draw" => (me === bot ? "draw" : BEATS[me] === bot ? "win" : "loss");
