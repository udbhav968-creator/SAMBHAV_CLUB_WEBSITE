import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { resolveBeauty, beautyPoints } from "@sambhav/game-core";
import type { Deps, Broadcaster } from "../deps.js";
import { verifyAccess, hasRole, isRevoked, type AuthUser } from "../middleware/auth.js";
import { recordGame } from "../modules/points.js";
import { logger } from "../lib/logger.js";
import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";

interface LiveRound { id: string; factor: number; endsAt: number; guesses: Map<string, { name: string; value: number }>; timer: NodeJS.Timeout }

/**
 * Realtime layer.
 *  - Rooms: `all` (broadcasts), `user:<id>` (personal), `session:<id>` (coordinators watching a check-in console),
 *    `arena:live` (live beauty-contest night).
 *  - Horizontal scale: Redis adapter fans events out across API replicas.
 *  - Live rounds are owned by the node where they were started (one per club night) and close on a server timer.
 */
export function attachRealtime(http: HttpServer, d: Deps): { io: Server; bus: Broadcaster } {
  const io = new Server(http, { cors: { origin: d.config.WEB_ORIGIN, credentials: true }, path: "/socket.io" });
  if (d.config.REDIS_URL) {
    const pub = new Redis(d.config.REDIS_URL), sub = pub.duplicate();
    [pub, sub].forEach((c) => c.on("error", (e) => logger.warn({ err: e.message }, "redis adapter error")));
    io.adapter(createAdapter(pub, sub));
  }
  io.use((socket, next) => {
    try { socket.data.user = verifyAccess(String(socket.handshake.auth?.token ?? ""), d.config.JWT_ACCESS_SECRET); next(); }
    catch { next(new Error("unauthorized")); }
  });

  let live: LiveRound | null = null;
  const publicRound = () => live && { id: live.id, factor: live.factor, endsAt: live.endsAt, entries: live.guesses.size };

  async function closeRound() {
    if (!live) return; const round = live; live = null; clearTimeout(round.timer);
    const entries = [...round.guesses.entries()];
    if (!entries.length) { io.to("arena:live").emit("live:result", { id: round.id, entries: 0 }); return; }
    const out = resolveBeauty(entries.map(([, g]) => g.value), round.factor);
    const ranked = entries.map(([uid, g], i) => ({ uid, name: g.name, value: g.value, rank: out.rank(i), distance: out.dist[i] })).sort((a, b) => a.rank - b.rank);
    await Promise.all(ranked.map((r) => recordGame(d, r.uid, "LIVE_GUESS", beautyPoints(r.rank, r.distance) + (r.rank === 1 ? 5 : 0), { round: round.id, value: r.value, target: out.target, rank: r.rank }).catch((e) => logger.error(e))));
    io.to("arena:live").emit("live:result", { id: round.id, average: out.avg, target: out.target, entries: ranked.length, top: ranked.slice(0, 10).map(({ name, value, rank }) => ({ name, value, rank })) });
  }

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as AuthUser;
    socket.join(["all", `user:${user.id}`]);

    // Re-check revocation and the password-change gate: a socket can outlive the token that opened it.
    socket.on("session:watch", async (sessionId: string) => {
      if (!hasRole(user, "ADMIN") || user.mcp || typeof sessionId !== "string" || (await isRevoked(user))) { socket.emit("auth:denied", { event: "session:watch" }); return; }
      socket.join(`session:${sessionId}`);
    });
    socket.on("session:unwatch", (sessionId: string) => socket.leave(`session:${sessionId}`));

    socket.on("live:join", () => { socket.join("arena:live"); socket.emit("live:state", publicRound()); });
    socket.on("live:start", (opts: { seconds?: number; factor?: number }, ack?: (r: unknown) => void) => {
      if (!hasRole(user, "COORDINATOR")) return ack?.({ error: "forbidden" });
      if (live) return ack?.({ error: "A round is already running" });
      const seconds = Math.min(300, Math.max(15, Number(opts?.seconds) || 60)), factor = [0.5, 2 / 3, 0.8].includes(Number(opts?.factor)) ? Number(opts.factor) : 2 / 3;
      live = { id: Date.now().toString(36), factor, endsAt: Date.now() + seconds * 1000, guesses: new Map(), timer: setTimeout(() => void closeRound(), seconds * 1000) };
      io.to("arena:live").emit("live:state", publicRound()); ack?.({ ok: true, round: publicRound() });
    });
    socket.on("live:guess", async (p: { value?: number }, ack?: (r: unknown) => void) => {
      if (!live || Date.now() > live.endsAt) return ack?.({ error: "No round is open" });
      const v = Number(p?.value); if (!(v >= 0 && v <= 100)) return ack?.({ error: "Pick a number from 0 to 100" });
      const [u] = await d.db.select({ name: users.name }).from(users).where(eq(users.id, user.id));
      live.guesses.set(user.id, { name: u?.name ?? "Member", value: Math.round(v * 10) / 10 });
      io.to("arena:live").emit("live:state", publicRound()); ack?.({ ok: true });
    });
    socket.on("live:close", () => { if (hasRole(user, "COORDINATOR")) void closeRound(); });
  });

  return { io, bus: { to: (room, event, payload) => { io.to(room).emit(event, payload); } } };
}
