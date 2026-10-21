import { Router } from "express";
import { z } from "zod";
import { and, asc, count, eq, gte, ilike, max, ne, or, isNull, type SQL } from "drizzle-orm";
import type { Deps } from "../deps.js";
import { ah } from "../lib/http.js";
import { validate } from "../middleware/validate.js";
import { authenticate, hasRole, requireRole, revokeAccessTokens } from "../middleware/auth.js";
import { forbidden, notFound } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { publicUser } from "./auth.js";
import { leaderboard } from "./points.js";
import { attendance, events, quizAttempts, refreshTokens, registrations, sessions, users } from "../db/schema.js";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  rollNo: z.string().trim().max(30).nullable().optional(),
  programme: z.string().trim().max(60).nullable().optional(),
  year: z.coerce.number().int().min(1).max(6).nullable().optional(),
  interests: z.string().trim().max(300).nullable().optional(),
  title: z.string().trim().max(60).nullable().optional(),          // coordinators+
  role: z.enum(["ADMIN", "COORDINATOR", "MEMBER"]).optional(),      // admin only
  isActive: z.boolean().optional(),                                 // admin only
});
const listQuery = z.object({ q: z.string().max(80).optional(), programme: z.string().optional(), year: z.coerce.number().int().optional(), role: z.enum(["ADMIN", "COORDINATOR", "MEMBER"]).optional() });
const day = (d: Date) => new Date(d.toISOString().slice(0, 10));

/** Attendance rate over sessions held since the member joined. */
export async function attendanceSummary(d: Deps, userId: string, joined: Date) {
  const [[{ held }], [{ present }]] = await Promise.all([
    d.db.select({ held: count() }).from(sessions).where(and(ne(sessions.status, "SCHEDULED"), gte(sessions.date, day(joined)))),
    d.db.select({ present: count() }).from(attendance).where(eq(attendance.userId, userId)),
  ]);
  const total = Math.max(held, present);
  return { present, total, rate: total ? present / total : 0 };
}

export function usersRouter(d: Deps) {
  const r = Router(); const auth = authenticate(d.config.JWT_ACCESS_SECRET);

  r.get("/", auth, validate({ query: listQuery }), ah(async (req, res) => {
    const q = req.query as z.infer<typeof listQuery>; const staff = hasRole(req.user, "COORDINATOR");
    const where: (SQL | undefined)[] = [
      staff ? undefined : eq(users.isActive, true),
      q.programme ? eq(users.programme, q.programme) : undefined, q.year ? eq(users.year, q.year) : undefined, q.role ? eq(users.role, q.role) : undefined,
      q.q ? or(ilike(users.name, `%${q.q}%`), ilike(users.rollNo, `%${q.q}%`)) : undefined,
    ];
    const list = await d.db.select().from(users).where(and(...where)).orderBy(asc(users.name)).limit(500);
    // Members see a directory; staff also see emails and account status.
    res.json({ users: list.map((u) => staff ? { ...publicUser(u), isActive: u.isActive, createdAt: u.createdAt } : { id: u.id, name: u.name, programme: u.programme, year: u.year, title: u.title, role: u.role }) });
  }));

  r.get("/:id/summary", auth, validate({ params: z.object({ id: z.string().uuid() }) }), ah(async (req, res) => {
    const u = await d.db.query.users.findFirst({ where: eq(users.id, req.params.id) }); if (!u) throw notFound("Member");
    const [att, lb, regs, quiz] = await Promise.all([
      attendanceSummary(d, u.id, u.createdAt), leaderboard(d, 10_000),
      d.db.select({ id: events.id, title: events.title, startsAt: events.startsAt }).from(registrations).innerJoin(events, eq(events.id, registrations.eventId)).where(eq(registrations.userId, u.id)),
      d.db.select({ moduleId: quizAttempts.moduleId, best: max(quizAttempts.score) }).from(quizAttempts).where(eq(quizAttempts.userId, u.id)).groupBy(quizAttempts.moduleId),
    ]);
    const row = lb.find((x) => x.id === u.id) ?? { arena: 0, quiz: 0, attendance: 0, total: 0 };
    const badges: string[] = [];
    if (att.total >= 3 && att.rate === 1) badges.push("Perfect attendance"); else if (att.total >= 3 && att.rate >= 0.75) badges.push("Regular");
    const passed = quiz.filter((q) => (q.best ?? 0) >= 4).length; if (passed >= 6) badges.push("Nash Navigator"); else if (passed >= 3) badges.push("Strategist");
    const rank = lb.findIndex((x) => x.id === u.id) + 1;
    res.json({ user: { id: u.id, name: u.name, programme: u.programme, year: u.year, title: u.title, role: u.role }, attendance: att, points: row, rank: rank || null, badges, events: regs, quiz });
  }));

  r.patch("/:id", auth, validate({ params: z.object({ id: z.string().uuid() }), body: patchSchema }), ah(async (req, res) => {
    const b = req.body as z.infer<typeof patchSchema>; const self = req.user!.id === req.params.id;
    if (!self && !hasRole(req.user, "COORDINATOR")) throw forbidden();
    if ((b.role || b.isActive !== undefined) && !hasRole(req.user, "ADMIN")) throw forbidden("Only admins can change roles or deactivate accounts");
    if (b.title !== undefined && !hasRole(req.user, "COORDINATOR")) throw forbidden("Club titles are assigned by coordinators");
    if (self && (b.role && b.role !== "ADMIN" || b.isActive === false) && req.user!.role === "ADMIN") {
      const [{ n }] = await d.db.select({ n: count() }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));
      if (n <= 1) throw forbidden("You are the last admin");
    }
    const [u] = await d.db.update(users).set(b).where(eq(users.id, req.params.id)).returning(); if (!u) throw notFound("Member");
    // Role change or deactivation takes effect immediately: end every session of that account.
    if (b.role !== undefined || b.isActive === false) {
      await d.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, u.id), isNull(refreshTokens.revokedAt)));
      await revokeAccessTokens(d.kv, u.id);
    }
    await audit(d.db, req.user!.id, "update", "User", u.id, { fields: Object.keys(b) });
    res.json({ user: publicUser(u) });
  }));

  r.delete("/:id", auth, requireRole("ADMIN"), validate({ params: z.object({ id: z.string().uuid() }) }), ah(async (req, res) => {
    // Soft delete preserves attendance history and the points ledger.
    await d.db.update(users).set({ isActive: false }).where(eq(users.id, req.params.id));
    await d.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, req.params.id), isNull(refreshTokens.revokedAt)));
    await revokeAccessTokens(d.kv, req.params.id);
    await audit(d.db, req.user!.id, "deactivate", "User", req.params.id);
    res.status(204).end();
  }));
  return r;
}
