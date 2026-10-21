import { Router } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import type { Deps } from "../deps.js";
import { ah } from "../lib/http.js";
import { validate } from "../middleware/validate.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { notFound } from "../lib/errors.js";
import { notices, users } from "../db/schema.js";

const schema = z.object({ title: z.string().trim().min(2).max(140), body: z.string().trim().min(1).max(4000), tag: z.enum(["General", "Event", "Deadline", "Result", "Info"]).default("General"), pinned: z.boolean().default(false) });
const idParam = z.object({ id: z.string().uuid() });

export function noticesRouter(d: Deps) {
  const r = Router(); const auth = authenticate(d.config.JWT_ACCESS_SECRET); const staff = requireRole("COORDINATOR");
  r.get("/", ah(async (_req, res) => {
    const rows = await d.db.select({ n: notices, author: users.name }).from(notices).leftJoin(users, eq(users.id, notices.authorId)).orderBy(desc(notices.pinned), desc(notices.createdAt)).limit(100);
    res.json({ notices: rows.map(({ n, author }) => ({ ...n, author })) });
  }));
  r.post("/", auth, staff, validate({ body: schema }), ah(async (req, res) => {
    const [n] = await d.db.insert(notices).values({ ...(req.body as z.infer<typeof schema>), authorId: req.user!.id }).returning();
    d.bus.to("all", "notice", { id: n.id, title: n.title }); res.status(201).json({ notice: n });
  }));
  r.patch("/:id", auth, staff, validate({ params: idParam, body: schema.partial() }), ah(async (req, res) => {
    const [n] = await d.db.update(notices).set(req.body).where(eq(notices.id, req.params.id)).returning(); if (!n) throw notFound("Notice");
    res.json({ notice: n });
  }));
  r.delete("/:id", auth, staff, validate({ params: idParam }), ah(async (req, res) => { await d.db.delete(notices).where(eq(notices.id, req.params.id)); res.status(204).end(); }));
  return r;
}
