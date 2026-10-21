import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { fairRoll, sha256Hex } from "@sambhav/game-core";
import { createApp } from "../src/app.js";
import { totp, currentStep } from "../src/lib/totp.js";
import { decrypt } from "../src/lib/crypto.js";
import { sessions } from "../src/db/schema.js";
import { makeDeps, login, register, config, outbox, ADMIN } from "./setup.js";

let d: Awaited<ReturnType<typeof makeDeps>>; let app: ReturnType<typeof createApp>;
let admin: { token: string; user: { id: string } }, coord: { token: string; user: { id: string } }, alice: { token: string; user: { id: string }; cookie: string[] }, bob: { token: string; user: { id: string } };
const H = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  d = await makeDeps(); app = createApp(d);
  admin = await login(app, "udbhav", "1234");
  const c = await register(app, "coord@test.club", "Diya Coordinator");
  await request(app).patch(`/api/v1/users/${c.user.id}`).set(H(admin.token)).send({ role: "COORDINATOR", title: "Tech Lead" }).expect(200);
  coord = await login(app, "coord@test.club", "Passw0rd!");
  alice = await register(app, "alice@test.club", "Alice Member", { rollNo: "GU-001", programme: "BSc AI", year: 2 });
  bob = await register(app, "bob@test.club", "Bob Member", { rollNo: "GU-002" });
});
afterAll(async () => { await d?.close(); });

describe("auth", () => {
  it("rejects weak passwords and duplicate emails", async () => {
    await request(app).post("/api/v1/auth/register").send({ email: "x@test.club", password: "short", name: "X" }).expect(400);
    await request(app).post("/api/v1/auth/register").send({ email: "alice@test.club", password: "Passw0rd!", name: "Dup" }).expect(409);
  });
  it("wrong password → 401 with a generic message", async () => {
    const r = await request(app).post("/api/v1/auth/login").send({ email: "alice@test.club", password: "nope" }).expect(401);
    expect(r.body.error.message).toBe("Username/email or password is incorrect");
  });
  it("rotates refresh tokens and revokes the family on reuse", async () => {
    const s = await login(app, "bob@test.club", "Passw0rd!");
    const first = await request(app).post("/api/v1/auth/refresh").set("Cookie", s.cookie).expect(200);
    expect(first.body.accessToken).toBeTruthy();
    await request(app).post("/api/v1/auth/refresh").set("Cookie", s.cookie).expect(401);            // replay of rotated token
    await request(app).post("/api/v1/auth/refresh").set("Cookie", first.headers["set-cookie"]).expect(401); // family revoked
  });
  it("/me requires a token", async () => {
    await request(app).get("/api/v1/auth/me").expect(401);
    const r = await request(app).get("/api/v1/auth/me").set(H(alice.token)).expect(200); expect(r.body.user.role).toBe("MEMBER");
  });
});

describe("RBAC", () => {
  it("members cannot create events, promote themselves or read reports", async () => {
    await request(app).post("/api/v1/events").set(H(alice.token)).send({ title: "Hack", startsAt: new Date(Date.now() + 864e5) }).expect(403);
    await request(app).patch(`/api/v1/users/${alice.user.id}`).set(H(alice.token)).send({ role: "ADMIN" }).expect(403);
    await request(app).get("/api/v1/attendance/report").set(H(alice.token)).expect(403);
    await request(app).get("/api/v1/admin/stats").set(H(coord.token)).expect(403);
    await request(app).get("/api/v1/attendance/report").set(H(coord.token)).expect(403);
  });
  it("members can edit their own profile but not titles", async () => {
    await request(app).patch(`/api/v1/users/${alice.user.id}`).set(H(alice.token)).send({ interests: "auctions" }).expect(200);
    await request(app).patch(`/api/v1/users/${alice.user.id}`).set(H(alice.token)).send({ title: "President" }).expect(403);
  });
});

describe("events", () => {
  let eventId: string;
  it("coordinator creates an event with capacity 1", async () => {
    const r = await request(app).post("/api/v1/events").set(H(coord.token)).send({ title: "Nash Night", type: "Workshop", startsAt: new Date(Date.now() + 3 * 864e5), capacity: 1 }).expect(201);
    eventId = r.body.event.id;
  });
  it("enforces capacity and idempotent registration", async () => {
    await request(app).post(`/api/v1/events/${eventId}/registrations`).set(H(alice.token)).expect(201);
    await request(app).post(`/api/v1/events/${eventId}/registrations`).set(H(alice.token)).expect(201);
    const full = await request(app).post(`/api/v1/events/${eventId}/registrations`).set(H(bob.token)).expect(409);
    expect(full.body.error.message).toMatch(/full/);
    const list = await request(app).get("/api/v1/events?scope=upcoming").set(H(alice.token)).expect(200);
    expect(list.body.events[0]).toMatchObject({ registered: 1, isRegistered: true });
    const regs = await request(app).get(`/api/v1/events/${eventId}/registrations`).set(H(coord.token)).expect(200);
    expect(regs.body.registrations).toHaveLength(1);
  });
  it("concurrent registrations never exceed capacity", async () => {
    const e = await request(app).post("/api/v1/events").set(H(coord.token)).send({ title: "Tiny room", startsAt: new Date(Date.now() + 864e5), capacity: 2 }).expect(201);
    const people = await Promise.all(Array.from({ length: 6 }, (_, i) => register(app, `p${i}@test.club`, `Person ${i}`)));
    const res = await Promise.all(people.map((p) => request(app).post(`/api/v1/events/${e.body.event.id}/registrations`).set(H(p.token))));
    expect(res.filter((r) => r.status === 201).length).toBeLessThanOrEqual(2);
    const list = await request(app).get("/api/v1/events").expect(200);
    expect(list.body.events.find((x: { id: string }) => x.id === e.body.event.id).registered).toBeLessThanOrEqual(2);
  });
});

describe("attendance", () => {
  let sid: string;
  it("coordinators cannot run attendance — only the admin can", async () => {
    await request(app).post("/api/v1/attendance/sessions").set(H(coord.token)).send({ title: "Nope", date: new Date() }).expect(403);
    await request(app).get("/api/v1/attendance/report").set(H(coord.token)).expect(403);
  });
  it("creates and opens a session; only staff can see the code", async () => {
    sid = (await request(app).post("/api/v1/attendance/sessions").set(H(admin.token)).send({ title: "Weekly meet #1", date: new Date() }).expect(201)).body.session.id;
    await request(app).get(`/api/v1/attendance/sessions/${sid}/code`).set(H(admin.token)).expect(409);
    await request(app).post(`/api/v1/attendance/sessions/${sid}/open`).set(H(admin.token)).expect(200);
    await request(app).get(`/api/v1/attendance/sessions/${sid}/code`).set(H(alice.token)).expect(403);
    const c = await request(app).get(`/api/v1/attendance/sessions/${sid}/code`).set(H(admin.token)).expect(200);
    expect(c.body.code).toMatch(/^\d{6}$/); expect(c.body.checkInUrl).toContain(sid);
    expect(JSON.stringify(c.body)).not.toMatch(/secret/i);
  });
  it("rejects a wrong code, accepts the right one, and is idempotent", async () => {
    await request(app).post("/api/v1/attendance/check-in").set(H(alice.token)).send({ sessionId: sid, code: "000000" }).expect(400);
    const { code } = (await request(app).get(`/api/v1/attendance/sessions/${sid}/code`).set(H(admin.token))).body;
    const ok = await request(app).post("/api/v1/attendance/check-in").set(H(alice.token)).send({ sessionId: sid, code }).expect(201);
    expect(ok.body.already).toBe(false);
    expect((await request(app).post("/api/v1/attendance/check-in").set(H(alice.token)).send({ sessionId: sid, code }).expect(200)).body.already).toBe(true);
  });
  it("accepts the previous step's code but not older ones", async () => {
    const [s] = await d.db.select().from(sessions).where(eq(sessions.id, sid));
    const secret = decrypt(s.secretEnc, config.ATTENDANCE_KEY), step = currentStep(30);
    const p = await register(app, "late@test.club", "Late Comer");
    await request(app).post("/api/v1/attendance/check-in").set(H(p.token)).send({ sessionId: sid, code: totp(secret, step - 3) }).expect(400);
    await request(app).post("/api/v1/attendance/check-in").set(H(p.token)).send({ sessionId: sid, code: totp(secret, step - 1) }).expect(201);
  });
  it("locks out after 5 wrong codes; a coordinator can still mark manually", async () => {
    for (let i = 0; i < 5; i++) await request(app).post("/api/v1/attendance/check-in").set(H(bob.token)).send({ sessionId: sid, code: "111111" }).expect(400);
    const { code } = (await request(app).get(`/api/v1/attendance/sessions/${sid}/code`).set(H(admin.token))).body;
    await request(app).post("/api/v1/attendance/check-in").set(H(bob.token)).send({ sessionId: sid, code }).expect(429);
    await request(app).put(`/api/v1/attendance/sessions/${sid}/attendance/${bob.user.id}`).set(H(admin.token)).send({ present: true }).expect(200);
    const list = await request(app).get(`/api/v1/attendance/sessions/${sid}/attendance`).set(H(admin.token)).expect(200);
    expect(list.body.attendance.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining(["Alice Member", "Bob Member"]));
  });
  it("closed sessions refuse check-ins; reports include CSV", async () => {
    await request(app).post(`/api/v1/attendance/sessions/${sid}/close`).set(H(admin.token)).expect(200);
    await request(app).post("/api/v1/attendance/check-in").set(H(alice.token)).send({ sessionId: sid, code: "123456" }).expect(409);
    const me = await request(app).get("/api/v1/attendance/me").set(H(alice.token)).expect(200);
    expect(me.body).toMatchObject({ present: 1, total: 1, rate: 1 });
    const csv = await request(app).get("/api/v1/attendance/report?format=csv").set(H(admin.token)).expect(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/); expect(csv.text).toMatch(/Alice Member,GU-001,BSc AI,2,P/);
  });
});

describe("learning modules", () => {
  it("withholds answer keys until submission and grades Bloom-tagged items", async () => {
    const m = await request(app).get("/api/v1/modules/m4").expect(200);
    expect(m.body.module.questions).toHaveLength(6);
    expect(m.body.module.questions.map((q: { level: string }) => q.level)).toEqual(["L1", "L2", "L3", "L4", "L5", "L6"]);
    expect(JSON.stringify(m.body)).not.toMatch(/answerIndex|explanation/);
    await request(app).post("/api/v1/modules/m4/attempts").set(H(alice.token)).send({ answers: { 1: 1 } }).expect(400);
    const r = await request(app).post("/api/v1/modules/m4/attempts").set(H(alice.token))
      .send({ answers: { 1: 1, 2: 0, 3: 2, 4: 0, 5: 0 }, open: { text: "Hypothesis: Martingale raises the median but increases ruin; 1000 players x 100 spins.", rubric: [0, 1, 2] } }).expect(201);
    expect(r.body).toMatchObject({ score: 6, passed: true, best: 6 });
    await request(app).post("/api/v1/modules/m4/lessons/0/complete").set(H(alice.token)).expect(200);
    await request(app).post("/api/v1/modules/m4/lessons/9/complete").set(H(alice.token)).expect(400);
    const list = await request(app).get("/api/v1/modules").set(H(alice.token)).expect(200);
    expect(list.body.modules.find((x: { id: string }) => x.id === "m4").progress).toEqual({ lessons: 1, best: 6 });
  });
});

describe("games", () => {
  it("roulette: server-authoritative, debits credits and is verifiable after seed rotation", async () => {
    const fair = (await request(app).get("/api/v1/games/fair").set(H(bob.token)).expect(200)).body;
    await request(app).post("/api/v1/games/roulette/spin").set(H(bob.token)).send({ bets: { "n:40": 10 } }).expect(400);
    await request(app).post("/api/v1/games/roulette/spin").set(H(bob.token)).send({ bets: { red: 5000 } }).expect(400);
    const spin = (await request(app).post("/api/v1/games/roulette/spin").set(H(bob.token)).send({ bets: { red: 10, "n:17": 5 } }).expect(200)).body;
    expect(spin.credits).toBe(1000 + spin.net); expect(spin.expectedValue).toBeCloseTo(-15 / 37);
    const rot = (await request(app).post("/api/v1/games/fair/rotate").set(H(bob.token)).expect(200)).body;
    expect(await sha256Hex(rot.revealed.serverSeed)).toBe(fair.serverSeedHash);
    expect(await fairRoll(rot.revealed.serverSeed, fair.clientSeed, spin.proof.nonce, 37)).toBe(spin.result);
  });
  it("roulette: concurrent spins never overspend", async () => {
    const p = await register(app, "spinner@test.club", "Spinner");
    const res = await Promise.all(Array.from({ length: 8 }, () => request(app).post("/api/v1/games/roulette/spin").set(H(p.token)).send({ bets: { red: 400 } })));
    const ok = res.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThan(0); ok.forEach((r) => expect(r.body.credits).toBeGreaterThanOrEqual(0));
  });
  it("prisoner's dilemma match runs to completion and awards points", async () => {
    const m = (await request(app).post("/api/v1/games/pd/matches").set(H(alice.token)).send({ opponent: "tft" }).expect(201)).body;
    let last; for (let i = 0; i < 30; i++) { last = (await request(app).post(`/api/v1/games/pd/matches/${m.matchId}/moves`).set(H(alice.token)).send({ move: "C" }).expect(200)).body; if (last.done) break; }
    expect(last.done).toBe(true); expect(last.points).toBe(6); expect(last.reveal.id).toBe("tft");
    await request(app).post(`/api/v1/games/pd/matches/${m.matchId}/moves`).set(H(alice.token)).send({ move: "C" }).expect(404);
  });
  it("guess, rps, auction, ultimatum and Nash solver respond with valid outcomes", async () => {
    const g = (await request(app).post("/api/v1/games/guess").set(H(alice.token)).send({ guess: 22 }).expect(200)).body;
    expect(g.guesses).toHaveLength(16); expect(g.target).toBeCloseTo(g.average * 2 / 3);
    expect(["win", "loss", "draw"]).toContain((await request(app).post("/api/v1/games/rps").set(H(alice.token)).send({ move: "R" }).expect(200)).body.outcome);
    const a = (await request(app).post("/api/v1/games/auction/rounds").set(H(alice.token)).send({ format: "second" }).expect(201)).body;
    const b = (await request(app).post(`/api/v1/games/auction/rounds/${a.roundId}/bid`).set(H(alice.token)).send({ bid: a.value }).expect(200)).body;
    expect(b.profit).toBeGreaterThanOrEqual(0);
    await request(app).post(`/api/v1/games/auction/rounds/${a.roundId}/bid`).set(H(alice.token)).send({ bid: 1 }).expect(404);
    const u = (await request(app).post("/api/v1/games/ultimatum/propose").set(H(alice.token)).send({ offer: 40 }).expect(200)).body;
    expect(u.earned).toBe(u.accepted ? 60 : 0);
    const n = (await request(app).post("/api/v1/games/nash/solve").set(H(alice.token)).send({ A: [[3, 0], [5, 1]], B: [[3, 5], [0, 1]] }).expect(200)).body;
    expect(n.equilibria[0].p).toEqual([0, 1]);
  });
});

describe("leaderboard & stats", () => {
  it("aggregates arena + quiz + attendance and caches", async () => {
    const lb = (await request(app).get("/api/v1/leaderboard").expect(200)).body.leaderboard;
    const a = lb.find((x: { name: string }) => x.name === "Alice Member");
    expect(a.quiz).toBe(30); expect(a.attendance).toBe(10); expect(a.arena).toBeGreaterThanOrEqual(6);
    expect(a.total).toBe(a.quiz + a.attendance + a.arena);
    const s = (await request(app).get(`/api/v1/users/${alice.user.id}/summary`).set(H(bob.token)).expect(200)).body;
    expect(s.points.total).toBe(a.total); expect(s.rank).toBeGreaterThan(0);
    const st = (await request(app).get("/api/v1/stats").expect(200)).body; expect(st.sessionsHeld).toBe(1);
  });
  it("health endpoints", async () => {
    await request(app).get("/healthz").expect(200);
    expect((await request(app).get("/readyz").expect(200)).body).toEqual({ db: true, kv: true });
  });
});

describe("admin account security (username login, lockout, SMS OTP)", () => {
  it("admin signs in with username; the full mobile number is never exposed", async () => {
    const r = await request(app).post("/api/v1/auth/login").send({ identifier: "Udbhav", password: "1234" }).expect(200);
    expect(r.body.user).toMatchObject({ username: "udbhav", role: "ADMIN" });
    expect(r.body.user.phoneHint).toBe("+91 ••••••2345"); expect(JSON.stringify(r.body)).not.toContain("9000012345");
  });
  it("locks an account after 5 wrong passwords, even with the right one afterwards", async () => {
    await register(app, "lock@test.club", "Lock Test");
    for (let i = 0; i < 5; i++) await request(app).post("/api/v1/auth/login").send({ identifier: "lock@test.club", password: "wrong" }).expect(401);
    const r = await request(app).post("/api/v1/auth/login").send({ identifier: "lock@test.club", password: "Passw0rd!" }).expect(429);
    expect(r.body.error.message).toMatch(/locked/);
  });
  it("changing the password needs the current password AND the OTP sent to the registered mobile", async () => {
    const s = await login(app, "udbhav", "1234");
    const sent = await request(app).post("/api/v1/auth/password/otp").set(H(s.token)).expect(200);
    expect(sent.body.sentTo).toBe("+91 ••••••2345");
    const { to, code } = outbox.at(-1)!; expect(to).toBe(ADMIN.phone); expect(code).toMatch(/^\d{6}$/);
    await request(app).post("/api/v1/auth/password/change").set(H(s.token)).send({ currentPassword: "nope", otp: code, newPassword: "Sambhav2026" }).expect(400);
    const wrong = await request(app).post("/api/v1/auth/password/change").set(H(s.token)).send({ currentPassword: "1234", otp: code === "000000" ? "111111" : "000000", newPassword: "Sambhav2026" }).expect(400);
    expect(wrong.body.error.message).toMatch(/attempts left/);
    await request(app).post("/api/v1/auth/password/change").set(H(s.token)).send({ currentPassword: "1234", otp: code, newPassword: "weak" }).expect(400);
    await request(app).post("/api/v1/auth/password/change").set(H(s.token)).send({ currentPassword: "1234", otp: code, newPassword: "Sambhav2026" }).expect(200);
    await request(app).get("/api/v1/attendance/me").set(H(s.token)).expect(401);                                   // old access token revoked at once
    await request(app).post("/api/v1/auth/refresh").set("Cookie", s.cookie).expect(401);                      // other sessions revoked
    const fresh = await login(app, "udbhav", "Sambhav2026");
    await request(app).post("/api/v1/auth/password/change").set(H(fresh.token)).send({ currentPassword: "Sambhav2026", otp: code, newPassword: "Another2026" }).expect(400); // OTP is single use
    await request(app).post("/api/v1/auth/login").send({ identifier: "udbhav", password: "1234" }).expect(401);
    admin = await login(app, "udbhav", "Sambhav2026");
  });
  it("members without a registered mobile cannot request an OTP", async () => {
    await request(app).post("/api/v1/auth/password/otp").set(H(bob.token)).expect(409);
  });
  it("forgot-password resets via OTP without revealing whether an account exists", async () => {
    const a = await request(app).post("/api/v1/auth/password/forgot").send({ identifier: "nobody@test.club" }).expect(202);
    const before = outbox.length;
    const b = await request(app).post("/api/v1/auth/password/forgot").send({ identifier: "udbhav" }).expect(202);
    expect(a.body.message).toBe(b.body.message); expect(outbox.length).toBe(before + 1);
    await request(app).post("/api/v1/auth/password/reset").send({ identifier: "udbhav", otp: outbox.at(-1)!.code, newPassword: "Reset2026x" }).expect(200);
    await login(app, "udbhav", "Reset2026x");
  });
  it("limits OTP sends to 3 per 15 minutes", async () => {
    const s = await login(app, "udbhav", "Reset2026x");
    await request(app).post("/api/v1/auth/password/otp").set(H(s.token)).expect(200); // 3rd code in this window
    const r = await request(app).post("/api/v1/auth/password/otp").set(H(s.token)).expect(429);
    expect(r.body.error.message).toMatch(/Too many codes/);
  });
});
