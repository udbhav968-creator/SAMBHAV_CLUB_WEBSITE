import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import type { Deps } from "./deps.js";
import { logger } from "./lib/logger.js";
import { ah } from "./lib/http.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { limiter } from "./middleware/rateLimit.js";
import { configureAuth, verifyAccess } from "./middleware/auth.js";
import { randomUUID } from "node:crypto";
import { authRouter } from "./modules/auth.js";
import { usersRouter } from "./modules/users.js";
import { eventsRouter } from "./modules/events.js";
import { noticesRouter } from "./modules/notices.js";
import { attendanceRouter } from "./modules/attendance.js";
import { coursesRouter } from "./modules/courses.js";
import { gamesRouter } from "./modules/games.js";
import { adminRouter, leaderboardRouter } from "./modules/misc.js";
import { aiRouter } from "./modules/ai.js";
import { aiAdminRouter } from "./modules/aiAdmin.js";
import { httpMetrics, metricsHandler } from "./lib/metrics.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { count, eq, gte, ne, sql } from "drizzle-orm";
import { attendance, events, sessions, users } from "./db/schema.js";

export function createApp(d: Deps) {
  configureAuth(d.kv);
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  // Strict CSP that still allows the SPA (when served from this process) and Google Fonts.
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"], imgSrc: ["'self'", "data:", "blob:"], connectSrc: ["'self'", "ws:", "wss:"],
    objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
  } } }));
  app.use((_req, res, next) => { res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()"); next(); });
  app.use(cors({ origin: d.config.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  // Correlation id: accept a sane inbound X-Request-Id (from the edge) or mint one; echoed back and logged.
  app.use((req, res, next) => {
    const inbound = req.get("x-request-id"); const id = inbound && /^[\w.-]{8,64}$/.test(inbound) ? inbound : randomUUID();
    (req as express.Request & { id: string }).id = id; res.setHeader("X-Request-Id", id); next();
  });
  if (d.config.NODE_ENV !== "test") app.use(pinoHttp({ logger, genReqId: (req) => (req as unknown as { id: string }).id, redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'] }));

  app.use(httpMetrics);
  app.get("/metrics", metricsHandler(d.config.METRICS_TOKEN));
  app.get("/healthz", (_req, res) => { res.json({ status: "ok" }); });
  app.get("/readyz", ah(async (_req, res) => {
    const [db, kv] = await Promise.all([d.db.execute(sql`SELECT 1`).then(() => true).catch(() => false), d.kv.ping()]);
    res.status(db && kv ? 200 : 503).json({ db, kv });
  }));

  const v1 = express.Router();
  // Signed-in traffic is limited per user (cheap JWT verify), anonymous traffic per IP with a higher ceiling
  // because a whole campus can share one NAT address.
  const rlKey = (req: express.Request) => { const h = req.headers.authorization; if (h?.startsWith("Bearer ")) { try { return `u:${verifyAccess(h.slice(7), d.config.JWT_ACCESS_SECRET).id}`; } catch { /* expired → per IP */ } } return `ip:${req.ip ?? "anon"}`; };
  v1.use(limiter(d.kv, { prefix: "api", keyGenerator: rlKey, limit: (req: express.Request) => (rlKey(req).startsWith("u:") ? 300 : 3000) }));
  v1.use("/auth", authRouter(d));
  v1.use("/users", usersRouter(d));
  v1.use("/events", eventsRouter(d));
  v1.use("/notices", noticesRouter(d));
  v1.use("/attendance", attendanceRouter(d));
  v1.use("/modules", coursesRouter(d));
  v1.use("/games", gamesRouter(d));
  v1.use("/leaderboard", leaderboardRouter(d));
  v1.use("/admin", adminRouter(d));
  v1.use("/ai", aiRouter(d));
  v1.use("/admin/ai", aiAdminRouter(d));
  v1.get("/stats", ah(async (_req, res) => {
    const n = async (q: Promise<{ n: number }[]>) => (await q)[0].n;
    const [members, upcomingEvents, sessionsHeld, marks] = await Promise.all([
      n(d.db.select({ n: count() }).from(users).where(eq(users.isActive, true))), n(d.db.select({ n: count() }).from(events).where(gte(events.startsAt, new Date()))),
      n(d.db.select({ n: count() }).from(sessions).where(ne(sessions.status, "SCHEDULED"))), n(d.db.select({ n: count() }).from(attendance)),
    ]);
    res.set("Cache-Control", "public, max-age=30").json({ members, upcomingEvents, sessionsHeld, averageAttendance: sessionsHeld && members ? marks / (sessionsHeld * members) : 0 });
  }));
  app.use("/api/v1", v1);

  // Single-container mode: serve the built SPA (WEB_DIST) with immutable hashed assets and an index.html fallback.
  const webDist = process.env.WEB_DIST ? resolve(process.env.WEB_DIST) : null;
  if (webDist && existsSync(webDist)) {
    app.use("/assets", express.static(resolve(webDist, "assets"), { immutable: true, maxAge: "1y" }));
    // The service worker and manifest must always revalidate so new releases roll out immediately.
    app.get(["/sw.js", "/manifest.webmanifest"], (req, res, next) => { res.set("Cache-Control", "no-cache"); next(); });
    app.use(express.static(webDist, { index: false, maxAge: "1h", setHeaders: (res, p) => { if (/(sw\.js|manifest\.webmanifest)$/.test(p)) res.setHeader("Cache-Control", "no-cache"); } }));
    app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => { res.set("Cache-Control", "no-cache").sendFile(resolve(webDist, "index.html")); });
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
