import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { io as connect, type Socket } from "socket.io-client";
import { createApp } from "../src/app.js";
import { attachRealtime } from "../src/realtime/socket.js";
import type { Broadcaster } from "../src/deps.js";
import { makeDeps, login, register } from "./setup.js";

let http: Server, url: string, d: Awaited<ReturnType<typeof makeDeps>>; const sockets: Socket[] = [];
const once = <T>(s: Socket, ev: string) => new Promise<T>((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), 4000); s.once(ev, (p: T) => { clearTimeout(t); res(p); }); });
const sock = (token: string) => { const s = connect(url, { auth: { token }, transports: ["websocket"] }); sockets.push(s); return s; };

beforeAll(async () => {
  d = await makeDeps(); let bus: Broadcaster = { to() {} }; d.bus = { to: (r, e, p) => bus.to(r, e, p) };
  http = createServer(createApp(d)); bus = attachRealtime(http, d).bus;
  await new Promise<void>((r) => http.listen(0, r)); url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(async () => { sockets.forEach((s) => s.close()); if (http) await new Promise((r) => http.close(r)); await d?.close(); });

describe("realtime", () => {
  it("rejects unauthenticated sockets", async () => {
    const s = connect(url, { auth: { token: "bad" }, transports: ["websocket"] }); sockets.push(s);
    const err = await once<Error>(s, "connect_error"); expect(err.message).toBe("unauthorized");
  });
  it("pushes check-ins to the coordinator console and runs a live 2/3 round", async () => {
    const admin = await login(http, "udbhav", "1234"); const m = await register(http, "rt@test.club", "Realtime Member");
    const sid = (await request(http).post("/api/v1/attendance/sessions").set("Authorization", `Bearer ${admin.token}`).send({ title: "Live", date: new Date() })).body.session.id;
    await request(http).post(`/api/v1/attendance/sessions/${sid}/open`).set("Authorization", `Bearer ${admin.token}`).expect(200);
    const console_ = sock(admin.token); await once(console_, "connect"); console_.emit("session:watch", sid);
    await new Promise((r) => setTimeout(r, 100));
    const { code } = (await request(http).get(`/api/v1/attendance/sessions/${sid}/code`).set("Authorization", `Bearer ${admin.token}`)).body;
    const marked = once<{ user: { name: string } }>(console_, "attendance:marked");
    await request(http).post("/api/v1/attendance/check-in").set("Authorization", `Bearer ${m.token}`).send({ sessionId: sid, code }).expect(201);
    expect((await marked).user.name).toBe("Realtime Member");

    const member = sock(m.token); await once(member, "connect");
    member.emit("live:join"); await once(member, "live:state"); console_.emit("live:join"); await once(console_, "live:state");
    const started = await new Promise<{ ok?: boolean }>((r) => console_.emit("live:start", { seconds: 15 }, r)); expect(started.ok).toBe(true);
    expect(await new Promise<{ ok?: boolean }>((r) => member.emit("live:guess", { value: 20 }, r))).toEqual({ ok: true });
    const result = once<{ entries: number; top: { name: string; rank: number }[] }>(member, "live:result");
    console_.emit("live:close");
    const r = await result; expect(r.entries).toBe(1); expect(r.top[0]).toMatchObject({ name: "Realtime Member", rank: 1 });
  });
});
