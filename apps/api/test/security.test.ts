import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { campusList, onCampus } from "../src/modules/attendance.js";
import { makeDeps, login, register, config, outbox } from "./setup.js";

let d: Awaited<ReturnType<typeof makeDeps>>;
const H = (t: string) => ({ Authorization: `Bearer ${t}` });
beforeAll(async () => { d = await makeDeps(); });
afterAll(async () => { await d?.close(); });

describe("access-token hardening", () => {
  it("rejects unsigned, wrong-algorithm, wrong-audience and forged tokens", async () => {
    const app = createApp(d);
    const s = await login(app, "udbhav", "1234");
    const payload = jwt.decode(s.token) as Record<string, unknown>;
    const none = jwt.sign({ ...payload }, "", { algorithm: "none" });
    const wrongAud = jwt.sign({ sub: payload.sub, role: "ADMIN", ims: Date.now() }, config.JWT_ACCESS_SECRET, { issuer: "sambhav", audience: "someone-else" });
    const forged = jwt.sign({ sub: payload.sub, role: "ADMIN", ims: Date.now() }, "x".repeat(40), { issuer: "sambhav", audience: "sambhav-api" });
    for (const t of [none, wrongAud, forged]) await request(app).get("/api/v1/attendance/me").set(H(t)).expect(401);
    await request(app).get("/api/v1/attendance/me").set(H(s.token)).expect(200);
  });

  it("deactivating or demoting a member ends their sessions immediately", async () => {
    const app = createApp(d);
    const admin = await login(app, "udbhav", "1234");
    const m = await register(app, "sec-m@test.club", "Sec Member");
    const c = await register(app, "sec-c@test.club", "Sec Coord");
    await request(app).patch(`/api/v1/users/${c.user.id}`).set(H(admin.token)).send({ role: "COORDINATOR" }).expect(200);
    const coord = await login(app, "sec-c@test.club", "Passw0rd!");
    await request(app).post("/api/v1/notices").set(H(coord.token)).send({ title: "Hello team", body: "Meeting at five" }).expect(201);
    // demote → the coordinator token stops working at once
    await request(app).patch(`/api/v1/users/${c.user.id}`).set(H(admin.token)).send({ role: "MEMBER" }).expect(200);
    await request(app).post("/api/v1/notices").set(H(coord.token)).send({ title: "Still here?", body: "x" }).expect(401);
    // deactivate via PATCH → access and refresh both dead
    await request(app).patch(`/api/v1/users/${m.user.id}`).set(H(admin.token)).send({ isActive: false }).expect(200);
    await request(app).get("/api/v1/attendance/me").set(H(m.token)).expect(401);
    await request(app).post("/api/v1/auth/refresh").set("Cookie", m.cookie).expect(401);
  });
});

describe("weak admin password gate (production policy)", () => {
  it("blocks admin tools until the seeded PIN is rotated via SMS OTP", async () => {
    const app = createApp({ ...d, config: { ...d.config, ENFORCE_PASSWORD_CHANGE: "true" } });
    const s = await login(app, "udbhav", "1234");
    expect(s.user.mustChangePassword).toBe(true);
    const r = await request(app).post("/api/v1/attendance/sessions").set(H(s.token)).send({ title: "Blocked", date: "2026-10-21" }).expect(403);
    expect(r.body.error.code).toBe("password_change_required");
    await request(app).get("/api/v1/attendance/me").set(H(s.token)).expect(200);          // ordinary pages still work
    // Inline role checks are gated too: no role changes and only the member view of the directory.
    const victim = await register(app, "gate-victim@test.club", "Gate Victim");
    await request(app).patch(`/api/v1/users/${victim.user.id}`).set(H(s.token)).send({ role: "ADMIN" }).expect(403);
    const dir = await request(app).get("/api/v1/users").set(H(s.token)).expect(200);
    expect(JSON.stringify(dir.body)).not.toContain("gate-victim@test.club");
    await request(app).post("/api/v1/auth/password/otp").set(H(s.token)).expect(200);     // the way out is open
    await request(app).post("/api/v1/auth/password/change").set(H(s.token)).send({ currentPassword: "1234", otp: outbox.at(-1)!.code, newPassword: "Udbhav2026x" }).expect(200);
    const after = await login(app, "udbhav", "Udbhav2026x");
    expect(after.user.mustChangePassword).toBe(false);
    await request(app).post("/api/v1/attendance/sessions").set(H(after.token)).send({ title: "Allowed now", date: "2026-10-21" }).expect(201);
  });
});

describe("campus-only check-in (anti-proxy attendance)", () => {
  it("matches IPv4, IPv4-mapped IPv6 and IPv6 ranges", () => {
    const l = campusList("10.20.0.0/16, 203.0.113.7, 2001:db8::/32")!;
    expect(onCampus(l, "10.20.5.9")).toBe(true);
    expect(onCampus(l, "::ffff:10.20.5.9")).toBe(true);
    expect(onCampus(l, "203.0.113.7")).toBe(true);
    expect(onCampus(l, "2001:db8::1")).toBe(true);
    expect(onCampus(l, "10.21.0.1")).toBe(false);
    expect(onCampus(l, "8.8.8.8")).toBe(false);
    expect(campusList("  ")).toBeNull();
    expect(() => campusList("not-an-ip/8")).toThrow();
  });
  it("refuses check-ins from outside the configured network", async () => {
    const app = createApp({ ...d, config: { ...d.config, CHECKIN_ALLOWED_CIDRS: "10.0.0.0/8" } });
    const m = await register(app, "offcampus@test.club", "Off Campus");
    const r = await request(app).post("/api/v1/attendance/check-in").set(H(m.token)).send({ sessionId: "00000000-0000-4000-8000-000000000000", code: "123456" }).expect(403);
    expect(r.body.error.code).toBe("off_campus");
  });
});

describe("operational headers", () => {
  it("echoes a request id and sends security headers", async () => {
    const app = createApp(d);
    const a = await request(app).get("/healthz").expect(200);
    expect(a.headers["x-request-id"]).toMatch(/^[\w-]{36}$/);
    const b = await request(app).get("/healthz").set("X-Request-Id", "edge-abc12345").expect(200);
    expect(b.headers["x-request-id"]).toBe("edge-abc12345");
    const c = await request(app).get("/healthz").set("X-Request-Id", "<script>").expect(200);
    expect(c.headers["x-request-id"]).not.toBe("<script>");
    expect(a.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(a.headers["permissions-policy"]).toContain("camera=(self)");
    expect(a.headers["x-powered-by"]).toBeUndefined();
  });
});
