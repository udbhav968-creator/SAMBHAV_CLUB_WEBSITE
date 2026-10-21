import { describe, it, expect } from "vitest";
import {
  seeded, fairRoll, sha256Hex, settle, expectedValue, validateBets, colourOf, WHEEL,
  playMatch, tournament, criticalDelta, solve, resolveBeauty, levelKGuesses, resolveAuction,
  equilibriumBid, acceptProbability, newRpsState, rpsBotMove, rpsRecord, rpsOutcome, type Rps,
} from "../src/index.js";

describe("provably fair RNG", () => {
  it("is deterministic for the same seed/client/nonce and in range", async () => {
    const a = await fairRoll("seed", "client", 1, 37), b = await fairRoll("seed", "client", 1, 37);
    expect(a).toBe(b); expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThan(37);
  });
  it("is approximately uniform over 37 pockets (chi-square)", async () => {
    const N = 7400, c = Array(37).fill(0);
    for (let i = 0; i < N; i++) c[await fairRoll("s3cr3t", "c", i, 37)]++;
    const e = N / 37, chi = c.reduce((s, o) => s + (o - e) ** 2 / e, 0);
    expect(chi).toBeLessThan(70); // df=36, p≈0.001 critical ≈ 67.0 — generous bound
  });
  it("commits with SHA-256", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("roulette", () => {
  it("has 37 distinct pockets and correct colours", () => {
    expect(new Set(WHEEL).size).toBe(37); expect(colourOf(0)).toBe("green"); expect(colourOf(32)).toBe("red"); expect(colourOf(15)).toBe("black");
  });
  it("settles straight, dozen and even-money bets", () => {
    expect(settle(17, { "n:17": 10 }).returned).toBe(360);
    expect(settle(13, { d2: 10, red: 10 }).returned).toBe(30);
    expect(settle(0, { red: 10, black: 10 }).net).toBe(-20);
  });
  it("EV is −stake/37 for any combination", () => {
    expect(expectedValue({ red: 37 })).toBeCloseTo(-1, 10);
    expect(expectedValue({ "n:7": 37, d1: 74 })).toBeCloseTo(-3, 10);
  });
  it("rejects bad bets", () => {
    expect(() => validateBets({ "n:40": 1 }, 100)).toThrow();
    expect(() => validateBets({ red: 1.5 }, 100)).toThrow();
    expect(() => validateBets({ red: 200 }, 100)).toThrow();
  });
});

describe("prisoner's dilemma", () => {
  const r = seeded(42);
  it("TFT vs ALLD loses only the first round", () => {
    const m = playMatch("tft", "alld", 10, r); expect(m.a).toBeCloseTo(0.9, 10); expect(m.b).toBeCloseTo(1.4, 10);
  });
  it("critical delta is 0.5 for (5,3,1)", () => expect(criticalDelta()).toBe(0.5));
  it("ALLD dies out under replicator dynamics among reciprocators", () => {
    const t = tournament(["tft", "grim", "alld", "allc"], seeded(7), { rounds: 100, reps: 2 });
    expect(t.evolution.alld.at(-1)!).toBeLessThan(0.01);
    expect(t.ranking[0].id).not.toBe("alld");
  });
});

describe("Nash solver", () => {
  it("PD: unique pure NE at (D,D)", () => {
    const s = solve([[3, 0], [5, 1]], [[3, 5], [0, 1]]);
    expect(s.equilibria).toHaveLength(1); expect(s.equilibria[0].p).toEqual([0, 1]); expect(s.dominatedRows).toEqual([[0, 1]]);
  });
  it("Battle of the Sexes: two pure + one mixed (3/5, 2/5)", () => {
    const s = solve([[3, 0], [0, 2]], [[2, 0], [0, 3]]);
    const mixed = s.equilibria.find((e) => !e.pure)!;
    expect(s.equilibria).toHaveLength(3); expect(mixed.p[0]).toBeCloseTo(0.6); expect(mixed.q[0]).toBeCloseTo(0.4);
  });
  it("RPS: uniform mixed equilibrium, value 0", () => {
    const A = [[0, -1, 1], [1, 0, -1], [-1, 1, 0]], B = A.map((r) => r.map((x) => -x));
    const s = solve(A, B); expect(s.equilibria).toHaveLength(1);
    s.equilibria[0].p.forEach((x) => expect(x).toBeCloseTo(1 / 3)); expect(s.equilibria[0].u).toBeCloseTo(0);
  });
  it("Quiz item GT-102 Q3: p = 0.4", () => {
    const s = solve([[1, 0], [0, 1]], [[4, 1], [0, 2]]);
    expect(s.equilibria.find((e) => !e.pure)!.p[0]).toBeCloseTo(0.4);
  });
});

describe("behavioural games", () => {
  it("2/3 game: target and ranking", () => {
    const r = resolveBeauty([0, 50, 100]); expect(r.target).toBeCloseTo(100 / 3); expect(r.winners).toEqual([1]); expect(r.rank(0)).toBe(2);
  });
  it("level-k bots stay in [0,100]", () => { levelKGuesses(200, seeded(1)).forEach((g) => { expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThanOrEqual(100); }); });
  it("auctions: second-price winner pays second bid; equilibrium bids", () => {
    expect(resolveAuction("second", [50, 80, 60])).toEqual({ winner: 1, price: 60 });
    expect(resolveAuction("first", [50, 80, 60])).toEqual({ winner: 1, price: 80 });
    expect(equilibriumBid("first", 80, 4)).toBe(60);
  });
  it("ultimatum acceptance is increasing and EV peaks between 30 and 40", () => {
    expect(acceptProbability(10)).toBeLessThan(acceptProbability(40));
    const ev = (x: number) => (100 - x) * acceptProbability(x); const best = [10, 20, 30, 35, 40, 50].sort((a, b) => ev(b) - ev(a))[0];
    expect(best).toBeGreaterThanOrEqual(30); expect(best).toBeLessThanOrEqual(40);
  });
  it("RPS bot exploits a player who always plays Rock", () => {
    const s = newRpsState(), rng = seeded(9); let wins = 0;
    for (let i = 0; i < 100; i++) { const bot = rpsBotMove(s, rng); if (rpsOutcome("R" as Rps, bot) === "loss") wins++; rpsRecord(s, "R"); }
    expect(wins).toBeGreaterThan(70);
  });
});
