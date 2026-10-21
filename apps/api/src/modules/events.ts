import { Router } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq, gte, lt } from "drizzle-orm";
import type { Deps } from "../deps.js";
import { ah } from "../lib/http.js";
import { validate } from "../middleware/validate.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { conflict, notFound } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { withSerializableRetry } from "../lib/http.js";
import { events, registrations, users } from "../db/schema.js";

const eventSchema = z.object({
  title: z.string().trim().min(3).max(140),
  type: z.enum(["Workshop", "Competition", "Talk", "Meetup", "Hackathon"]).default("Workshop"),
  startsAt: z.coerce.date(),
  venue: z.string().trim().max(120).optional(),
  capacity: z.coerce.number().int().min(1).max(5000).optional(),
  description: z.string().trim().max(4000).optional(),
});
const idParam = z.object({ id: z.string().uuid() });

export function eventsRouter(d: Deps) {
  const r = Router(); const auth = authenticate(d.config.JWT_ACCESS_SECRET); const optional = authenticate(d.config.JWT_ACCESS_SECRET, false);
  const staff = requireRole("COORDINATOR");

  r.get("/", optional, validate({ query: z.object({ scope: z.enum(["upcoming", "past", "all"]).default("all") }) }), ah(async (req, res) => {
    const { scope } = req.query as { scope: string }; const now = new Date();
    const regCount = d.db.select({ eventId: registrations.eventId, n: count().as("n") }).from(registrations).groupBy(registrations.eventId).as("rc");
    const rows = await d.db.select({ e: events, n: regCount.n }).from(events).leftJoin(regCount, eq(regCount.eventId, events.id))
      .where(scope === "upcoming" ? gte(events.startsAt, now) : scope === "past" ? lt(events.startsAt, now) : undefined)
      .orderBy(scope === "past" ? desc(events.startsAt) : asc(events.startsAt)).limit(200);
    const mine = req.user ? new Set((await d.db.select({ id: registrations.eventId }).from(registrations).where(eq(registrations.userId, req.user.id))).map((x) => x.id)) : new Set<string>();
    res.json({ events: rows.map(({ e, n }) => ({ ...e, registered: Number(n ?? 0), isRegistered: mine.has(e.id) })) });
  }));

  r.post("/", auth, staff, validate({ body: eventSchema }), ah(async (req, res) => {
    const [e] = await d.db.insert(events).values({ ...(req.body as z.infer<typeof eventSchema>), createdById: req.user!.id }).returning();
    await audit(d.db, req.user!.id, "create", "Event", e.id); d.bus.to("all", "events:changed", { id: e.id });
    res.status(201).json({ event: e });
  }));
  r.patch("/:id", auth, staff, validate({ params: idParam, body: eventSchema.partial() }), ah(async (req, res) => {
    const [e] = await d.db.update(events).set(req.body).where(eq(events.id, req.params.id)).returning(); if (!e) throw notFound("Event");
    await audit(d.db, req.user!.id, "update", "Event", e.id); d.bus.to("all", "events:changed", { id: e.id });
    res.json({ event: e });
  }));
  r.delete("/:id", auth, staff, validate({ params: idParam }), ah(async (req, res) => {
    await d.db.delete(events).where(eq(events.id, req.params.id));
    await audit(d.db, req.user!.id, "delete", "Event", req.params.id); d.bus.to("all", "events:changed", { id: req.params.id });
    res.status(204).end();
  }));

  /** Capacity-safe registration: count + insert inside a SERIALIZABLE transaction (no overbooking under concurrency). */
  r.post("/:id/registrations", auth, validate({ params: idParam }), ah(async (req, res) => {
    const reg = await withSerializableRetry(() => d.db.transaction(async (tx) => {
      const [e] = await tx.select().from(events).where(eq(events.id, req.params.id)); if (!e) throw notFound("Event");
      const [mine] = await tx.select().from(registrations).where(and(eq(registrations.eventId, e.id), eq(registrations.userId, req.user!.id)));
      if (mine) return mine; // idempotent
      if (e.startsAt < new Date()) throw conflict("This event has already started");
      if (e.capacity) { const [{ n }] = await tx.select({ n: count() }).from(registrations).where(eq(registrations.eventId, e.id)); if (n >= e.capacity) throw conflict("This event is full"); }
      const [row] = await tx.insert(registrations).values({ eventId: e.id, userId: req.user!.id }).returning();
      return row;
    }, { isolationLevel: "serializable" }));
    res.status(201).json({ registration: reg });
  }));
  r.delete("/:id/registrations", auth, validate({ params: idParam }), ah(async (req, res) => {
    await d.db.delete(registrations).where(and(eq(registrations.eventId, req.params.id), eq(registrations.userId, req.user!.id)));
    res.status(204).end();
  }));
  r.get("/:id/registrations", auth, staff, validate({ params: idParam }), ah(async (req, res) => {
    const rows = await d.db.select({ id: users.id, name: users.name, rollNo: users.rollNo, programme: users.programme, year: users.year, email: users.email, registeredAt: registrations.createdAt })
      .from(registrations).innerJoin(users, eq(users.id, registrations.userId)).where(eq(registrations.eventId, req.params.id)).orderBy(asc(registrations.createdAt));
    res.json({ registrations: rows });
  }));
  return r;
}
