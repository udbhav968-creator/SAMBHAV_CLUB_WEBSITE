import { BlockList, isIP } from "node:net";
import { Router } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq, gte, ne } from "drizzle-orm";
import type { Deps } from "../deps.js";
import { ah } from "../lib/http.js";
import { validate } from "../middleware/validate.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { badRequest, conflict, forbidden, notFound, tooMany } from "../lib/errors.js";
import { decrypt, encrypt, randomHex } from "../lib/crypto.js";
import { currentStep, totp, verifyTotp } from "../lib/totp.js";
import { audit } from "../lib/audit.js";
import { invalidateLeaderboard } from "./points.js";
import { attendance, sessions, users } from "../db/schema.js";

export const MAX_FAILS = 5;
const createSchema = z.object({ title: z.string().trim().min(2).max(120), date: z.coerce.date(), eventId: z.string().uuid().optional() });
const checkInSchema = z.object({ sessionId: z.string().uuid(), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"), via: z.enum(["CODE", "QR"]).default("CODE") });
const idParam = z.object({ id: z.string().uuid() });
const day = (d: Date) => new Date(d.toISOString().slice(0, 10));
const publicSession = { id: sessions.id, title: sessions.title, date: sessions.date, status: sessions.status, eventId: sessions.eventId, openedAt: sessions.openedAt, closedAt: sessions.closedAt };

/** Parse "10.0.0.0/8, 2001:db8::/32" into a BlockList; null when unset. */
export function campusList(spec: string): BlockList | null {
  const parts = spec.split(",").map((x) => x.trim()).filter(Boolean); if (!parts.length) return null;
  const list = new BlockList();
  for (const p of parts) {
    const [addr, bits] = p.split("/"); const type = isIP(addr) === 6 ? "ipv6" : "ipv4";
    if (!isIP(addr)) throw new Error(`CHECKIN_ALLOWED_CIDRS: invalid address "${p}"`);
    if (bits === undefined) list.addAddress(addr, type); else list.addSubnet(addr, Number(bits), type);
  }
  return list;
}
export function onCampus(list: BlockList, ip: string | undefined) {
  if (!ip) return false;
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  return isIP(v4) === 4 ? list.check(v4, "ipv4") : list.check(ip, "ipv6");
}

export function attendanceRouter(d: Deps) {
  const campus = campusList(d.config.CHECKIN_ALLOWED_CIDRS);
  const r = Router(); const auth = authenticate(d.config.JWT_ACCESS_SECRET); // Only the attendance administrator may run sessions, see codes, mark or report. Members may only check in.
  const staff = requireRole("ADMIN");
  const STEP = d.config.TOTP_STEP_SECONDS;
  const secretOf = (enc: string) => decrypt(enc, d.config.ATTENDANCE_KEY);
  const getSession = async (id: string) => { const [s] = await d.db.select().from(sessions).where(eq(sessions.id, id)); if (!s) throw notFound("Session"); return s; };

  r.get("/sessions", auth, ah(async (_req, res) => {
    const pc = d.db.select({ sid: attendance.sessionId, n: count().as("n") }).from(attendance).groupBy(attendance.sessionId).as("pc");
    const rows = await d.db.select({ s: publicSession, n: pc.n }).from(sessions).leftJoin(pc, eq(pc.sid, sessions.id)).orderBy(desc(sessions.date), desc(sessions.createdAt)).limit(200);
    res.json({ sessions: rows.map(({ s, n }) => ({ ...s, present: Number(n ?? 0) })) });
  }));

  r.post("/sessions", auth, staff, validate({ body: createSchema }), ah(async (req, res) => {
    const b = req.body as z.infer<typeof createSchema>;
    const [s] = await d.db.insert(sessions).values({ ...b, createdById: req.user!.id, secretEnc: encrypt(randomHex(20), d.config.ATTENDANCE_KEY) }).returning(publicSession);
    await audit(d.db, req.user!.id, "create", "Session", s.id);
    res.status(201).json({ session: s });
  }));

  const setStatus = (status: "OPEN" | "CLOSED") => ah(async (req, res) => {
    const [s] = await d.db.update(sessions).set(status === "OPEN" ? { status, openedAt: new Date(), closedAt: null } : { status, closedAt: new Date() }).where(eq(sessions.id, req.params.id)).returning(publicSession);
    if (!s) throw notFound("Session");
    d.bus.to("all", "session:status", { id: s.id, status: s.status }); res.json({ session: s });
  });
  r.post("/sessions/:id/open", auth, staff, validate({ params: idParam }), setStatus("OPEN"));
  r.post("/sessions/:id/close", auth, staff, validate({ params: idParam }), setStatus("CLOSED"));
  r.delete("/sessions/:id", auth, staff, validate({ params: idParam }), ah(async (req, res) => {
    await d.db.delete(sessions).where(eq(sessions.id, req.params.id)); await invalidateLeaderboard(d);
    await audit(d.db, req.user!.id, "delete", "Session", req.params.id); res.status(204).end();
  }));

  /** Projector endpoint: the current code and seconds left. The secret itself never leaves the server. */
  r.get("/sessions/:id/code", auth, staff, validate({ params: idParam }), ah(async (req, res) => {
    const s = await getSession(req.params.id);
    if (s.status !== "OPEN") throw conflict("Open the session first");
    const now = Date.now(), step = currentStep(STEP, now), code = totp(secretOf(s.secretEnc), step);
    const expiresIn = STEP - Math.floor((now / 1000) % STEP);
    res.set("Cache-Control", "no-store").json({ code, step, expiresIn, stepSeconds: STEP, checkInUrl: `${d.config.WEB_ORIGIN}/check-in?s=${s.id}&c=${code}` });
  }));

  r.post("/check-in", auth, validate({ body: checkInSchema }), ah(async (req, res) => {
    const { sessionId, code, via } = req.body as z.infer<typeof checkInSchema>; const uid = req.user!.id;
    // Anti-proxy attendance: when campus ranges are configured, the code only works from the campus network.
    if (campus && !onCampus(campus, req.ip)) throw forbidden("Check-in only works on the campus Wi-Fi. Connect to it and try again.", "off_campus");
    const s = await getSession(sessionId);
    if (s.status !== "OPEN") throw conflict("This session is not accepting check-ins");
    const failKey = `att:fail:${sessionId}:${uid}`;
    if (((await d.kv.get<number>(failKey)) ?? 0) >= MAX_FAILS) throw tooMany("Too many wrong codes for this session — ask a coordinator to mark you");
    if (!verifyTotp(secretOf(s.secretEnc), code, STEP)) {
      const n = await d.kv.incr(failKey, 6 * 3600);
      throw badRequest(`That code didn't match. ${Math.max(0, MAX_FAILS - n)} attempts left.`);
    }
    // Idempotent: the unique (session, user) index makes a double scan harmless.
    const [row] = await d.db.insert(attendance).values({ sessionId, userId: uid, method: via }).onConflictDoNothing().returning();
    if (!row) return res.json({ already: true });
    const [user] = await d.db.select({ id: users.id, name: users.name, rollNo: users.rollNo }).from(users).where(eq(users.id, uid));
    await invalidateLeaderboard(d);
    d.bus.to(`session:${sessionId}`, "attendance:marked", { sessionId, user, at: row.markedAt, method: via });
    res.status(201).json({ attendance: row, already: false });
  }));

  r.put("/sessions/:id/attendance/:userId", auth, staff, validate({ params: z.object({ id: z.string().uuid(), userId: z.string().uuid() }), body: z.object({ present: z.boolean() }) }), ah(async (req, res) => {
    const { id, userId } = req.params; const { present } = req.body as { present: boolean };
    await getSession(id);
    if (present) await d.db.insert(attendance).values({ sessionId: id, userId, method: "MANUAL", markedById: req.user!.id }).onConflictDoNothing();
    else await d.db.delete(attendance).where(and(eq(attendance.sessionId, id), eq(attendance.userId, userId)));
    await d.kv.del(`att:fail:${id}:${userId}`); await invalidateLeaderboard(d);
    await audit(d.db, req.user!.id, present ? "mark_present" : "mark_absent", "Attendance", `${id}:${userId}`);
    d.bus.to(`session:${id}`, "attendance:changed", { sessionId: id, userId, present });
    res.json({ ok: true });
  }));

  r.get("/sessions/:id/attendance", auth, staff, validate({ params: idParam }), ah(async (req, res) => {
    const rows = await d.db.select({ id: users.id, name: users.name, rollNo: users.rollNo, method: attendance.method, markedAt: attendance.markedAt })
      .from(attendance).innerJoin(users, eq(users.id, attendance.userId)).where(eq(attendance.sessionId, req.params.id)).orderBy(desc(attendance.markedAt));
    res.json({ attendance: rows });
  }));

  r.get("/me", auth, ah(async (req, res) => {
    const [u] = await d.db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, req.user!.id));
    const [held, mine] = await Promise.all([
      d.db.select({ id: sessions.id, title: sessions.title, date: sessions.date }).from(sessions).where(and(ne(sessions.status, "SCHEDULED"), gte(sessions.date, day(u.createdAt)))).orderBy(asc(sessions.date)),
      d.db.select({ sessionId: attendance.sessionId, markedAt: attendance.markedAt }).from(attendance).where(eq(attendance.userId, req.user!.id)),
    ]);
    const map = new Map(mine.map((m) => [m.sessionId, m.markedAt]));
    const present = held.filter((s) => map.has(s.id)).length;
    res.json({ sessions: held.map((s) => ({ ...s, present: map.has(s.id), markedAt: map.get(s.id) ?? null })), present, total: held.length, rate: held.length ? present / held.length : 0 });
  }));

  /** Register matrix: members × held sessions. JSON, or CSV with ?format=csv. */
  r.get("/report", auth, staff, validate({ query: z.object({ format: z.enum(["json", "csv"]).default("json") }) }), ah(async (req, res) => {
    const [held, members, marks] = await Promise.all([
      d.db.select({ id: sessions.id, title: sessions.title, date: sessions.date }).from(sessions).where(ne(sessions.status, "SCHEDULED")).orderBy(asc(sessions.date)),
      d.db.select({ id: users.id, name: users.name, rollNo: users.rollNo, programme: users.programme, year: users.year, createdAt: users.createdAt }).from(users).where(and(eq(users.isActive, true), ne(users.role, "ADMIN"))).orderBy(asc(users.name)), // the register covers members, not the administrator
      d.db.select({ s: attendance.sessionId, u: attendance.userId }).from(attendance),
    ]);
    const set = new Set(marks.map((m) => `${m.s}:${m.u}`));
    const rows = members.map((u) => {
      const eligible = held.filter((s) => s.date >= day(u.createdAt) || set.has(`${s.id}:${u.id}`));
      const present = eligible.filter((s) => set.has(`${s.id}:${u.id}`)).length;
      return { ...u, marks: held.map((s) => set.has(`${s.id}:${u.id}`)), present, eligible: eligible.length, rate: eligible.length ? present / eligible.length : 0 };
    });
    if ((req.query as { format: string }).format === "csv") {
      const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const lines = [["Name", "Roll", "Programme", "Year", ...held.map((s) => `${s.date.toISOString().slice(0, 10)} ${s.title}`), "Present", "Eligible", "Rate"].map(esc).join(",")];
      rows.forEach((x) => lines.push([x.name, x.rollNo, x.programme, x.year, ...x.marks.map((m) => (m ? "P" : "A")), x.present, x.eligible, (x.rate * 100).toFixed(1) + "%"].map(esc).join(",")));
      return res.type("text/csv").attachment(`sambhav-attendance-${new Date().toISOString().slice(0, 10)}.csv`).send(lines.join("\n"));
    }
    res.json({ sessions: held, rows });
  }));
  return r;
}
