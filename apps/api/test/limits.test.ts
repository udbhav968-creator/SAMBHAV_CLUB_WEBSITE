import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { makeDeps, config } from "./setup.js";

/** Production limits, one shared source IP (supertest = 127.0.0.1) — i.e. a whole campus behind one NAT. */
let d: Awaited<ReturnType<typeof makeDeps>>; let app: ReturnType<typeof createApp>;
beforeAll(async () => { d = await makeDeps(); app = createApp({ ...d, config: { ...config, NODE_ENV: "production" } }); });
afterAll(async () => { await d?.close(); });

describe("rate limits under campus NAT", () => {
  it("lets many different students sign in from the same IP", async () => {
    for (let i = 0; i < 25; i++) {
      const r = await request(app).post("/api/v1/auth/login").send({ identifier: `student${i}@campus.edu`, password: "wrong-pass" });
      expect(r.status).toBe(401);
    }
  });
  it("still throttles brute force against one account", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await request(app).post("/api/v1/auth/login").send({ identifier: "victim@campus.edu", password: `guess-${i}` })).status);
    // Account lockout after 5 failures, and the (IP, account) limiter behind it.
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes.slice(5).every((c) => c === 429)).toBe(true);
  });
});
