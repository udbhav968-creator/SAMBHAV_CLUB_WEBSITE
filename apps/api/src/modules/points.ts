import { sql } from "drizzle-orm";
import type { Deps } from "../deps.js";
import { gameRecords, type GameKind } from "../db/schema.js";

export const POINTS = { attendance: 10, perCorrectAnswer: 5 } as const;
const LB_KEY = "lb:v1";

/** Append to the ledger and invalidate the cached leaderboard. */
export async function recordGame(d: Deps, userId: string, game: GameKind, points: number, payload: unknown) {
  const [rec] = await d.db.insert(gameRecords).values({ userId, game, points: Math.max(0, Math.round(points)), payload }).returning();
  if (rec.points) { await d.kv.del(LB_KEY); d.bus.to(`user:${userId}`, "points", { game, points: rec.points }); }
  return rec;
}
export const invalidateLeaderboard = (d: Deps) => d.kv.del(LB_KEY);

export interface LeaderRow { id: string; name: string; programme: string | null; arena: number; quiz: number; attendance: number; total: number }

/** Cache-aside: aggregate in SQL, cache for 30 s, invalidate on every point-changing write. */
export async function leaderboard(d: Deps, limit = 100): Promise<LeaderRow[]> {
  const cached = await d.kv.get<LeaderRow[]>(LB_KEY);
  if (cached) return cached.slice(0, limit);
  const res = await d.db.execute<{ id: string; name: string; programme: string | null; arena: string; attendance: string; quiz: string }>(sql`
    SELECT u.id, u.name, u.programme,
           COALESCE(g.pts, 0) AS arena,
           COALESCE(a.cnt, 0) * ${POINTS.attendance} AS attendance,
           COALESCE(q.best, 0) * ${POINTS.perCorrectAnswer} AS quiz
      FROM users u
      LEFT JOIN (SELECT user_id, SUM(points) AS pts FROM game_records GROUP BY user_id) g ON g.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM attendance GROUP BY user_id) a ON a.user_id = u.id
      LEFT JOIN (SELECT user_id, SUM(best) AS best FROM (SELECT user_id, module_id, MAX(score) AS best FROM quiz_attempts GROUP BY 1, 2) t GROUP BY 1) q ON q.user_id = u.id
     WHERE u.is_active = true`);
  const out = res.rows.map((r) => { const arena = Number(r.arena), attendance = Number(r.attendance), quiz = Number(r.quiz); return { id: r.id, name: r.name, programme: r.programme, arena, attendance, quiz, total: arena + attendance + quiz }; })
    .filter((r) => r.total > 0).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  await d.kv.set(LB_KEY, out, 30);
  return out.slice(0, limit);
}
