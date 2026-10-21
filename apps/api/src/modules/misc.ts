import { Router } from "express";
import { z } from "zod";
import type { Deps } from "../deps.js";
import { ah } from "../lib/http.js";
import { validate } from "../middleware/validate.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { leaderboard } from "./points.js";
import { count, desc, eq, ne } from "drizzle-orm";
import { attendance, auditLog, events, gameRecords, sessions, users } from "../db/schema.js";

export function leaderboardRouter(d: Deps) {
  const r = Router();
  r.get("/", validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }) }), ah(async (req, res) => {
    res.json({ leaderboard: await leaderboard(d, (req.query as unknown as { limit: number }).limit) });
  }));
  return r;
}

export function adminRouter(d: Deps) {
  const r = Router(); r.use(authenticate(d.config.JWT_ACCESS_SECRET), requireRole("ADMIN"));
  r.get("/audit", validate({ query: z.object({ take: z.coerce.number().int().min(1).max(500).default(100), entity: z.string().optional() }) }), ah(async (req, res) => {
    const q = req.query as unknown as { take: number; entity?: string };
    res.json({ entries: await d.db.select().from(auditLog).where(q.entity ? eq(auditLog.entity, q.entity) : undefined).orderBy(desc(auditLog.createdAt)).limit(q.take) });
  }));
  r.get("/stats", ah(async (_req, res) => {
    const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
    const [members, ev, held, marks, plays] = await Promise.all([
      n(d.db.select({ n: count() }).from(users).where(eq(users.isActive, true))), n(d.db.select({ n: count() }).from(events)),
      n(d.db.select({ n: count() }).from(sessions).where(ne(sessions.status, "SCHEDULED"))), n(d.db.select({ n: count() }).from(attendance)), n(d.db.select({ n: count() }).from(gameRecords)),
    ]);
    res.json({ members, events: ev, sessionsHeld: held, attendanceMarks: marks, gamesPlayed: plays });
  }));
  return r;
}
