/** European single-zero roulette. Every standard bet has house edge exactly 1/37. */
export const WHEEL = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26] as const;
export const REDS: ReadonlySet<number> = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export const POCKETS = 37;
export type Colour = "red" | "black" | "green";
export const colourOf = (n: number): Colour => (n === 0 ? "green" : REDS.has(n) ? "red" : "black");

export type OutsideBet = "red" | "black" | "odd" | "even" | "low" | "high" | "d1" | "d2" | "d3" | "c1" | "c2" | "c3";
export type BetKey = OutsideBet | `n:${number}`;
export interface BetSpec { label: string; covers: (n: number) => boolean; payout: number; count: number }

const OUTSIDE: Record<OutsideBet, BetSpec> = {
  red:   { label: "Red",      covers: (n) => REDS.has(n),            payout: 1, count: 18 },
  black: { label: "Black",    covers: (n) => n > 0 && !REDS.has(n),  payout: 1, count: 18 },
  odd:   { label: "Odd",      covers: (n) => n > 0 && n % 2 === 1,   payout: 1, count: 18 },
  even:  { label: "Even",     covers: (n) => n > 0 && n % 2 === 0,   payout: 1, count: 18 },
  low:   { label: "1–18",     covers: (n) => n >= 1 && n <= 18,      payout: 1, count: 18 },
  high:  { label: "19–36",    covers: (n) => n >= 19,                payout: 1, count: 18 },
  d1:    { label: "1st 12",   covers: (n) => n >= 1 && n <= 12,      payout: 2, count: 12 },
  d2:    { label: "2nd 12",   covers: (n) => n >= 13 && n <= 24,     payout: 2, count: 12 },
  d3:    { label: "3rd 12",   covers: (n) => n >= 25,                payout: 2, count: 12 },
  c1:    { label: "Column 1", covers: (n) => n > 0 && n % 3 === 1,   payout: 2, count: 12 },
  c2:    { label: "Column 2", covers: (n) => n > 0 && n % 3 === 2,   payout: 2, count: 12 },
  c3:    { label: "Column 3", covers: (n) => n > 0 && n % 3 === 0,   payout: 2, count: 12 },
};

export function betSpec(key: string): BetSpec | null {
  if (key in OUTSIDE) return OUTSIDE[key as OutsideBet];
  const m = /^n:(\d{1,2})$/.exec(key);
  if (m) { const v = Number(m[1]); if (v >= 0 && v <= 36) return { label: `Straight ${v}`, covers: (n) => n === v, payout: 35, count: 1 }; }
  return null;
}

export type Bets = Record<string, number>;

/** Validates keys and stakes (positive integers). Returns total stake. */
export function validateBets(bets: Bets, maxTotal: number): number {
  const keys = Object.keys(bets);
  if (!keys.length) throw new RangeError("No bets placed");
  let total = 0;
  for (const k of keys) {
    if (!betSpec(k)) throw new RangeError(`Unknown bet: ${k}`);
    const s = bets[k];
    if (!Number.isInteger(s) || s <= 0) throw new RangeError(`Invalid stake on ${k}`);
    total += s;
  }
  if (total > maxTotal) throw new RangeError("Total stake exceeds available credits");
  return total;
}

/** Amount returned to the player (stake + winnings on each winning bet). */
export function settle(result: number, bets: Bets): { returned: number; staked: number; net: number; winners: string[] } {
  let returned = 0, staked = 0; const winners: string[] = [];
  for (const [k, s] of Object.entries(bets)) {
    const b = betSpec(k)!; staked += s;
    if (b.covers(result)) { returned += s * (b.payout + 1); winners.push(k); }
  }
  return { returned, staked, net: returned - staked, winners };
}

/** Expected net value of a set of bets: always −total/37 on a European wheel. */
export function expectedValue(bets: Bets): number {
  return Object.entries(bets).reduce((ev, [k, s]) => {
    const b = betSpec(k)!; const p = b.count / POCKETS;
    return ev + s * (p * (b.payout + 1)) - s;
  }, 0);
}
