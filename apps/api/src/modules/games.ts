import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  cryptoRng, fairRoll, newServerSeed, sha256Hex, validateBets, settle, colourOf, expectedValue, POCKETS,
  STRATEGIES, PAYOFF, drawMatchLength, tournament, type Move,
  levelKGuesses, resolveBeauty, beautyPoints, botBid, resolveAuction, equilibriumBid, type AuctionFormat,
  acceptProbability, botOffer, newRpsState, rpsBotMove, rpsRecord, rpsOutcome, type RpsState, type Rps, solve,
} from "@sambhav/game-core";
import type { Deps } from "../deps.js";
import { ah } from "../lib/http.js";
import { validate } from "../middleware/validate.js";
import { authenticate } from "../middleware/auth.js";
import { limiter } from "../middleware/rateLimit.js";
import { badRequest, conflict, notFound, tooMany } from "../lib/errors.js";
import { recordGame } from "./points.js";
import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import { fairSeeds, gameRecords, users } from "../db/schema.js";

const HOUR = 3600;
const rng = cryptoRng;

/**
 * Server-authoritative games: every outcome and every point is computed here, never trusted from the client.
 * Ephemeral round state lives in the KV store with a TTL; finished outcomes go to the GameRecord ledger.
 */
export function gamesRouter(d: Deps) {
  const r = Router(); r.use(authenticate(d.config.JWT_ACCESS_SECRET)); r.use(limiter(d.kv, { prefix: "games", limit: 240 }));
  const uid = (req: { user?: { id: string } }) => req.user!.id;

  /* ---------- provably fair seeds ---------- */
  async function activeSeed(userId: string) {
    const [s] = await d.db.select().from(fairSeeds).where(and(eq(fairSeeds.userId, userId), eq(fairSeeds.active, true))).limit(1);
    if (s) return s;
    const seed = newServerSeed();
    const [n] = await d.db.insert(fairSeeds).values({ userId, serverSeed: seed, serverSeedHash: await sha256Hex(seed), clientSeed: randomUUID().slice(0, 8) }).returning();
    return n;
  }
  r.get("/fair", ah(async (req, res) => { const s = await activeSeed(uid(req)); res.json({ serverSeedHash: s.serverSeedHash, clientSeed: s.clientSeed, nonce: s.nonce }); }));
  r.put("/fair/client-seed", validate({ body: z.object({ clientSeed: z.string().trim().min(1).max(64) }) }), ah(async (req, res) => {
    const s = await activeSeed(uid(req)); const [u] = await d.db.update(fairSeeds).set({ clientSeed: req.body.clientSeed }).where(eq(fairSeeds.id, s.id)).returning();
    res.json({ serverSeedHash: u.serverSeedHash, clientSeed: u.clientSeed, nonce: u.nonce });
  }));
  r.post("/fair/rotate", ah(async (req, res) => {
    const old = await activeSeed(uid(req));
    await d.db.update(fairSeeds).set({ active: false, revealedAt: new Date() }).where(eq(fairSeeds.id, old.id));
    const next = await activeSeed(uid(req));
    res.json({ revealed: { serverSeed: old.serverSeed, serverSeedHash: old.serverSeedHash, clientSeed: old.clientSeed, lastNonce: old.nonce - 1 }, next: { serverSeedHash: next.serverSeedHash, clientSeed: next.clientSeed, nonce: next.nonce } });
  }));

  /* ---------- roulette ---------- */
  const betsSchema = z.object({ bets: z.record(z.string().max(5), z.number().int().positive().max(100_000)).refine((b) => Object.keys(b).length <= 40, "Too many bets") });
  r.post("/roulette/spin", validate({ body: betsSchema }), ah(async (req, res) => {
    const userId = uid(req); const { bets } = req.body as z.infer<typeof betsSchema>;
    const [user] = await d.db.select({ credits: users.credits }).from(users).where(eq(users.id, userId));
    const staked = validateBets(bets, user.credits);
    // Atomically claim the nonce (compare-and-set) so two concurrent spins can never reuse one outcome.
    const seed = await activeSeed(userId);
    const claimed = await d.db.update(fairSeeds).set({ nonce: sql`${fairSeeds.nonce} + 1` }).where(and(eq(fairSeeds.id, seed.id), eq(fairSeeds.nonce, seed.nonce), eq(fairSeeds.active, true))).returning({ id: fairSeeds.id });
    if (!claimed.length) throw conflict("Another spin is in progress — try again");
    const result = await fairRoll(seed.serverSeed, seed.clientSeed, seed.nonce, POCKETS);
    const s = settle(result, bets);
    // Conditional update guards against overspending under concurrency.
    const debited = await d.db.update(users).set({ credits: sql`${users.credits} + ${s.net}` }).where(and(eq(users.id, userId), gte(users.credits, staked))).returning({ credits: users.credits });
    if (!debited.length) throw conflict("Not enough credits");
    const [{ spins }] = await d.db.select({ spins: count() }).from(gameRecords).where(and(eq(gameRecords.userId, userId), eq(gameRecords.game, "ROULETTE")));
    await recordGame(d, userId, "ROULETTE", (spins + 1) % 10 === 0 ? 1 : 0, { result, bets, ...s, ev: expectedValue(bets), nonce: seed.nonce });
    const credits = debited[0].credits;
    res.json({ result, colour: colourOf(result), ...s, expectedValue: expectedValue(bets), credits, proof: { serverSeedHash: seed.serverSeedHash, clientSeed: seed.clientSeed, nonce: seed.nonce } });
  }));
  r.post("/roulette/reset-credits", ah(async (req, res) => {
    const key = `credits:reset:${uid(req)}`; if (await d.kv.get(key)) throw tooMany("Credits can be reset once every 24 hours");
    await d.db.update(users).set({ credits: 1000 }).where(eq(users.id, uid(req))); await d.kv.set(key, 1, 24 * HOUR);
    res.json({ credits: 1000 });
  }));

  /* ---------- prisoner's dilemma ---------- */
  interface PdMatch { opp: string; hidden: boolean; len: number; me: Move[]; op: Move[]; total: [number, number] }
  r.get("/pd/strategies", (_req, res) => { res.json({ strategies: Object.values(STRATEGIES).map(({ id, name, description }) => ({ id, name, description })) }); });
  r.post("/pd/matches", validate({ body: z.object({ opponent: z.string().default("mystery") }) }), ah(async (req, res) => {
    const ids = Object.keys(STRATEGIES); const { opponent } = req.body as { opponent: string };
    if (opponent !== "mystery" && !STRATEGIES[opponent]) throw badRequest("Unknown strategy");
    const m: PdMatch = { opp: opponent === "mystery" ? ids[Math.floor(rng() * ids.length)] : opponent, hidden: opponent === "mystery", len: drawMatchLength(rng), me: [], op: [], total: [0, 0] };
    const id = randomUUID(); await d.kv.set(`pd:${uid(req)}:${id}`, m, HOUR);
    res.status(201).json({ matchId: id, opponent: m.hidden ? null : STRATEGIES[m.opp].name, continuation: 0.9 });
  }));
  r.post("/pd/matches/:id/moves", validate({ body: z.object({ move: z.enum(["C", "D"]) }) }), ah(async (req, res) => {
    const key = `pd:${uid(req)}:${req.params.id}`; const m = await d.kv.get<PdMatch>(key); if (!m) throw notFound("Match");
    if (m.me.length >= m.len) throw conflict("Match is over");
    const mine = (req.body as { move: Move }).move, theirs = STRATEGIES[m.opp].play(m.op, m.me, rng);
    m.me.push(mine); m.op.push(theirs); const [a, b] = PAYOFF[`${mine}${theirs}`]; m.total[0] += a; m.total[1] += b;
    const done = m.me.length >= m.len; let points = 0;
    if (done) { const avg = m.total[0] / m.len; points = Math.round(avg * 2); await recordGame(d, uid(req), "PD", points, { opponent: m.opp, rounds: m.len, avg, moves: m.me.join(""), oppMoves: m.op.join("") }); await d.kv.del(key); }
    else await d.kv.set(key, m, HOUR);
    res.json({ round: m.me.length, you: mine, opponent: theirs, payoff: [a, b], total: m.total, done, points, reveal: done ? { id: m.opp, name: STRATEGIES[m.opp].name } : undefined });
  }));
  r.post("/pd/tournament", validate({ body: z.object({ strategies: z.array(z.string()).min(2).max(10), rounds: z.number().int().min(10).max(500).default(200), noise: z.number().min(0).max(0.3).default(0), reps: z.number().int().min(1).max(10).default(3) }) }), ah(async (req, res) => {
    const b = req.body as { strategies: string[]; rounds: number; noise: number; reps: number };
    res.json(tournament(b.strategies, rng, { rounds: b.rounds, noise: b.noise, reps: b.reps }));
  }));

  /* ---------- guess 2/3 ---------- */
  r.post("/guess", validate({ body: z.object({ guess: z.number().min(0).max(100) }) }), ah(async (req, res) => {
    const key = `guess:prev:${uid(req)}`; const prev = await d.kv.get<number>(key);
    const mine = Math.round((req.body as { guess: number }).guess * 10) / 10; const all = [mine, ...levelKGuesses(15, rng, prev)];
    const out = resolveBeauty(all); const rank = out.rank(0); const points = beautyPoints(rank, out.dist[0]);
    await d.kv.set(key, out.target, 6 * HOUR);
    await recordGame(d, uid(req), "GUESS", points, { guess: mine, target: out.target, rank });
    res.json({ guesses: all, average: out.avg, target: out.target, rank, won: rank === 1, points });
  }));
  r.delete("/guess", ah(async (req, res) => { await d.kv.del(`guess:prev:${uid(req)}`); res.status(204).end(); }));

  /* ---------- rock-paper-scissors ---------- */
  r.post("/rps", validate({ body: z.object({ move: z.enum(["R", "P", "S"]) }) }), ah(async (req, res) => {
    const key = `rps:${uid(req)}`; const st = (await d.kv.get<RpsState & { w: number; l: number; dr: number; bw: number; bl: number }>(key)) ?? { ...newRpsState(), w: 0, l: 0, dr: 0, bw: 0, bl: 0 };
    const me = (req.body as { move: Rps }).move, bot = rpsBotMove(st, rng), outcome = rpsOutcome(me, bot); rpsRecord(st, me);
    if (outcome === "win") { st.w++; st.bw++; } else if (outcome === "loss") { st.l++; st.bl++; } else st.dr++;
    let points = 0; if (st.history.length % 10 === 0) { points = Math.max(0, st.bw - st.bl); await recordGame(d, uid(req), "RPS", points, { wins: st.bw, losses: st.bl }); st.bw = 0; st.bl = 0; }
    await d.kv.set(key, st, 6 * HOUR);
    res.json({ you: me, bot, outcome, wins: st.w, losses: st.l, draws: st.dr, points });
  }));

  /* ---------- sealed-bid auction ---------- */
  interface AuctionRound { format: AuctionFormat; value: number; rivals: number[] }
  r.post("/auction/rounds", validate({ body: z.object({ format: z.enum(["first", "second"]).default("second") }) }), ah(async (req, res) => {
    const a: AuctionRound = { format: (req.body as { format: AuctionFormat }).format, value: 1 + Math.floor(rng() * 100), rivals: Array.from({ length: 4 }, () => 1 + Math.floor(rng() * 100)) };
    const id = randomUUID(); await d.kv.set(`auction:${uid(req)}:${id}`, a, HOUR);
    res.status(201).json({ roundId: id, format: a.format, value: a.value, bidders: 5 });
  }));
  r.post("/auction/rounds/:id/bid", validate({ body: z.object({ bid: z.number().int().min(0).max(1000) }) }), ah(async (req, res) => {
    const key = `auction:${uid(req)}:${req.params.id}`; const a = await d.kv.get<AuctionRound>(key); if (!a) throw notFound("Auction round"); await d.kv.del(key);
    const bid = (req.body as { bid: number }).bid; const rivalBids = a.rivals.map((v) => botBid(a.format, v, rng));
    const { winner, price } = resolveAuction(a.format, [bid, ...rivalBids]); const won = winner === 0; const profit = won ? a.value - price : 0;
    const eq = Math.round(equilibriumBid(a.format, a.value, 5)); const top = Math.max(...rivalBids);
    const benchmark = eq > top ? a.value - (a.format === "first" ? eq : top) : 0;
    const points = Math.max(0, Math.round(profit / 10));
    await recordGame(d, uid(req), "AUCTION", points, { format: a.format, value: a.value, bid, price, won, profit });
    res.json({ value: a.value, bid, rivals: a.rivals.map((v, i) => ({ value: v, bid: rivalBids[i] })), won, price, profit, equilibriumBid: eq, benchmarkProfit: benchmark, points });
  }));

  /* ---------- ultimatum ---------- */
  r.post("/ultimatum/propose", validate({ body: z.object({ offer: z.number().int().min(0).max(100) }) }), ah(async (req, res) => {
    const offer = (req.body as { offer: number }).offer; const accepted = rng() < acceptProbability(offer); const earned = accepted ? 100 - offer : 0;
    const points = Math.round(earned / 20); await recordGame(d, uid(req), "ULTIMATUM", points, { role: "proposer", offer, accepted });
    res.json({ offer, accepted, earned, points });
  }));
  r.post("/ultimatum/offers", ah(async (req, res) => {
    const id = randomUUID(), offer = botOffer(rng); await d.kv.set(`ult:${uid(req)}:${id}`, offer, HOUR); res.status(201).json({ offerId: id, offer });
  }));
  r.post("/ultimatum/offers/:id", validate({ body: z.object({ accept: z.boolean() }) }), ah(async (req, res) => {
    const key = `ult:${uid(req)}:${req.params.id}`; const offer = await d.kv.get<number>(key); if (offer == null) throw notFound("Offer"); await d.kv.del(key);
    const accept = (req.body as { accept: boolean }).accept; const earned = accept ? offer : 0; const points = Math.round(earned / 20);
    await recordGame(d, uid(req), "ULTIMATUM", points, { role: "responder", offer, accepted: accept });
    res.json({ offer, accepted: accept, earned, points });
  }));

  /* ---------- nash solver (stateless utility) ---------- */
  const matrix = z.array(z.array(z.number().finite()).min(1).max(3)).min(1).max(3);
  r.post("/nash/solve", validate({ body: z.object({ A: matrix, B: matrix }) }), (req, res) => { res.json(solve(req.body.A, req.body.B)); });

  r.get("/history", ah(async (req, res) => {
    const recs = await d.db.select().from(gameRecords).where(eq(gameRecords.userId, uid(req))).orderBy(desc(gameRecords.createdAt)).limit(50);
    const totals = await d.db.select({ game: gameRecords.game, plays: count(), points: sum(gameRecords.points) }).from(gameRecords).where(eq(gameRecords.userId, uid(req))).groupBy(gameRecords.game);
    res.json({ recent: recs, totals: totals.map((t) => ({ game: t.game, plays: t.plays, points: Number(t.points ?? 0) })) });
  }));
  return r;
}
