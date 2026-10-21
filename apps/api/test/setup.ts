import { sql } from "drizzle-orm";
import request from "supertest";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { MemoryKV } from "../src/lib/kv.js";
import { nullBus, type Deps } from "../src/deps.js";
import type { Config } from "../src/config.js";

export const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/sambhav_test";
export const config: Config = {
  NODE_ENV: "test", PORT: 0, DATABASE_URL: TEST_DB, JWT_ACCESS_SECRET: "a".repeat(40), JWT_REFRESH_SECRET: "b".repeat(40),
  ATTENDANCE_KEY: "0".repeat(64), WEB_ORIGIN: "http://localhost:5173", ACCESS_TTL: "15m", REFRESH_TTL_DAYS: 30, TOTP_STEP_SECONDS: 30,
  SMS_PROVIDER: "console", OTP_TTL_SECONDS: 300, AI_MODEL: "test-model", AI_MAX_TOKENS: 700, AI_EFFORT: "low", AI_LOG_RETENTION_DAYS: 30, AI_USER_QUOTA: 30, AI_VISITOR_QUOTA: 200, AI_DAILY_CAP: 3000,
  ENFORCE_PASSWORD_CHANGE: "false", CHECKIN_ALLOWED_CIDRS: "",
};
/** Fake SMS gateway: tests read the code that "arrived" on the phone. */
export const outbox: { to: string; code: string }[] = [];
export const ADMIN = { username: "udbhav", password: "1234", phone: "+919000012345", email: "admin@test.club" };

export async function makeDeps(): Promise<Deps & { close: () => Promise<void> }> {
  const { db, pool } = createDb(TEST_DB, 5);
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;`);
  await runMigrations(TEST_DB);
  await seed(db, ADMIN);
  const sms = { provider: "fake", async sendOtp(to: string, code: string) { outbox.push({ to, code }); } };
  return { db, kv: new MemoryKV(), config, bus: nullBus, sms, llm: null, close: () => pool.end() };
}

export async function login(app: Parameters<typeof request>[0], email: string, password: string) {
  const res = await request(app).post("/api/v1/auth/login").send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken as string, user: res.body.user, cookie: res.headers["set-cookie"] as unknown as string[] };
}
export async function register(app: Parameters<typeof request>[0], email: string, name: string, extra: Record<string, unknown> = {}) {
  const res = await request(app).post("/api/v1/auth/register").send({ email, password: "Passw0rd!", name, ...extra });
  if (res.status !== 201) throw new Error(`register failed ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken as string, user: res.body.user, cookie: res.headers["set-cookie"] as unknown as string[] };
}
