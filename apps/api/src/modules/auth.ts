import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { and, eq, isNull, or } from "drizzle-orm";
import type { Deps } from "../deps.js";
import { ah } from "../lib/http.js";
import { validate } from "../middleware/validate.js";
import { authenticate, revokeAccessTokens, signAccess } from "../middleware/auth.js";
import { enforcePasswordChange } from "../lib/policy.js";
import { limiter } from "../middleware/rateLimit.js";
import { badRequest, conflict, tooMany, unauthorized } from "../lib/errors.js";
import { issueOtp, verifyOtp } from "../lib/otp.js";
import { maskPhone } from "../lib/sms.js";
import { randomToken, sha256 } from "../lib/crypto.js";
import { audit } from "../lib/audit.js";
import { refreshTokens, users, type User, type Role } from "../db/schema.js";

const REFRESH_COOKIE = "sambhav_rt";
const BCRYPT_COST = 12;
// Same cost as real hashes, so a missing account takes as long to reject as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("timing-equaliser", BCRYPT_COST);
const password = z.string().min(8, "At least 8 characters").max(128).regex(/[A-Za-z]/, "Include a letter").regex(/\d/, "Include a number");
export const registerSchema = z.object({
  email: z.string().email().toLowerCase(),
  password,
  name: z.string().trim().min(2).max(80),
  rollNo: z.string().trim().max(30).optional(),
  programme: z.string().trim().max(60).optional(),
  year: z.coerce.number().int().min(1).max(6).optional(),
});
/** Sign in with an email address or a username. `email` is accepted for older clients. */
const loginSchema = z.object({ identifier: z.string().trim().toLowerCase().min(3).max(120).optional(), email: z.string().trim().toLowerCase().optional(), password: z.string().min(1).max(128) })
  .refine((b) => b.identifier || b.email, "Enter your email or username");
const LOCK_AFTER = 5, LOCK_SECONDS = 15 * 60;

/** `passwordChangeRequired` tells the client the server is enforcing rotation right now (admin tools locked). */
export const publicUser = (u: User, enforce = false) => ({ passwordChangeRequired: enforce && u.mustChangePassword && u.role !== "MEMBER", id: u.id, email: u.email, username: u.username, name: u.name, role: u.role, rollNo: u.rollNo, programme: u.programme, year: u.year, title: u.title, credits: u.credits, interests: u.interests, phoneHint: maskPhone(u.phone), passwordChangedAt: u.passwordChangedAt, mustChangePassword: u.mustChangePassword });

export function authRouter(d: Deps) {
  const r = Router();
  // Campus Wi-Fi puts hundreds of students behind one NAT address, so credential endpoints are limited per
  // (IP, account) pair — brute force on one account is still capped (plus the per-account lockout) — and a
  // generous per-IP ceiling stops spraying across many accounts.
  const test = d.config.NODE_ENV === "test";
  const who = (req: { body?: { identifier?: unknown; email?: unknown } }) => String(req.body?.identifier ?? req.body?.email ?? "").trim().toLowerCase().slice(0, 120);
  const perAccount = limiter(d.kv, { prefix: "auth-acct", limit: test ? 1000 : 10, windowMs: 15 * 60_000, keyGenerator: (req) => `${req.ip ?? "anon"}|${who(req)}` });
  const perIp = limiter(d.kv, { prefix: "auth-ip", limit: test ? 5000 : 600, windowMs: 15 * 60_000, keyGenerator: (req) => req.ip ?? "anon" });
  const strict = [perIp, perAccount];

  async function issue(res: Response, user: { id: string; role: Role; mustChangePassword?: boolean }, family: string, ua?: string) {
    const raw = randomToken();
    await d.db.insert(refreshTokens).values({ userId: user.id, tokenHash: sha256(raw), family, userAgent: ua?.slice(0, 200), expiresAt: new Date(Date.now() + d.config.REFRESH_TTL_DAYS * 864e5) });
    res.cookie(REFRESH_COOKIE, raw, { httpOnly: true, secure: d.config.NODE_ENV === "production", sameSite: "strict", path: "/api/v1/auth", maxAge: d.config.REFRESH_TTL_DAYS * 864e5 });
    return signAccess(user, d.config.JWT_ACCESS_SECRET, d.config.ACCESS_TTL, !!user.mustChangePassword && enforcePasswordChange(d.config));
  }

  r.post("/register", strict, validate({ body: registerSchema }), ah(async (req, res) => {
    const { password: pw, ...b } = req.body as z.infer<typeof registerSchema>;
    if (await d.db.query.users.findFirst({ where: eq(users.email, b.email) })) throw conflict("An account with this email already exists");
    const [user] = await d.db.insert(users).values({ ...b, rollNo: b.rollNo || null, passwordHash: await bcrypt.hash(pw, BCRYPT_COST) }).returning();
    await audit(d.db, user.id, "register", "User", user.id);
    const accessToken = await issue(res, user, randomToken(12), req.get("user-agent"));
    res.status(201).json({ accessToken, user: publicUser(user) });
  }));

  const findByIdentifier = (id: string) => d.db.query.users.findFirst({ where: or(eq(users.email, id), eq(users.username, id)) });

  r.post("/login", strict, validate({ body: loginSchema }), ah(async (req, res) => {
    const b = req.body as z.infer<typeof loginSchema>; const id = (b.identifier ?? b.email)!;
    // Per-account lockout on top of the per-IP limiter: essential when a short PIN-style password is in use.
    const lockKey = `login:fail:${id}`;
    if (((await d.kv.get<number>(lockKey)) ?? 0) >= LOCK_AFTER) throw tooMany("Too many failed attempts. This account is locked for 15 minutes.");
    const user = await findByIdentifier(id);
    // Compare against a dummy hash when the account is missing so response time doesn't reveal it.
    const ok = await bcrypt.compare(b.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.isActive) {
      const n = await d.kv.incr(lockKey, LOCK_SECONDS);
      if (user) await audit(d.db, user.id, "login_failed", "User", user.id, { attempt: n });
      throw unauthorized(n >= LOCK_AFTER ? "Too many failed attempts. This account is locked for 15 minutes." : "Username/email or password is incorrect");
    }
    await d.kv.del(lockKey);
    // A password that no longer meets the policy (e.g. the 4-digit seeded admin PIN) must be rotated.
    const weak = !password.safeParse(b.password).success;
    if (weak !== user.mustChangePassword) await d.db.update(users).set({ mustChangePassword: weak }).where(eq(users.id, user.id));
    const u = { ...user, mustChangePassword: weak };
    await audit(d.db, user.id, "login", "User", user.id, weak ? { weakPassword: true } : undefined);
    const accessToken = await issue(res, u, randomToken(12), req.get("user-agent"));
    res.json({ accessToken, user: publicUser(u, enforcePasswordChange(d.config)) });
  }));

  /* ---------- password change & reset, both gated by an SMS OTP to the registered mobile ---------- */
  const strongPassword = password;
  r.post("/password/otp", authenticate(d.config.JWT_ACCESS_SECRET), strict, ah(async (req, res) => {
    const u = await d.db.query.users.findFirst({ where: eq(users.id, req.user!.id) });
    if (!u?.phone) throw conflict("No mobile number is registered for this account");
    const { expiresIn } = await issueOtp(d, u.id, u.phone, "change");
    await audit(d.db, u.id, "otp_sent", "User", u.id, { purpose: "change" });
    res.json({ sentTo: maskPhone(u.phone), expiresIn });
  }));

  r.post("/password/change", authenticate(d.config.JWT_ACCESS_SECRET), validate({ body: z.object({ currentPassword: z.string().min(1), otp: z.string(), newPassword: strongPassword }) }), ah(async (req, res) => {
    const { currentPassword, otp, newPassword } = req.body as { currentPassword: string; otp: string; newPassword: string };
    const u = await d.db.query.users.findFirst({ where: eq(users.id, req.user!.id) }); if (!u) throw unauthorized();
    if (!(await bcrypt.compare(currentPassword, u.passwordHash))) throw badRequest("Current password is incorrect");
    await verifyOtp(d, u.id, "change", otp);
    if (await bcrypt.compare(newPassword, u.passwordHash)) throw badRequest("Choose a password you haven't used here before");
    await d.db.update(users).set({ passwordHash: await bcrypt.hash(newPassword, BCRYPT_COST), passwordChangedAt: new Date(), mustChangePassword: false }).where(eq(users.id, u.id));
    await d.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, u.id), isNull(refreshTokens.revokedAt)));
    await revokeAccessTokens(d.kv, u.id);
    await audit(d.db, u.id, "password_changed", "User", u.id, { via: "otp" });
    res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
    res.json({ ok: true, message: "Password changed. Sign in again on every device." });
  }));

  /** Forgot password: always 202 so the endpoint can't be used to discover accounts. */
  r.post("/password/forgot", strict, validate({ body: z.object({ identifier: z.string().trim().toLowerCase().min(3).max(120) }) }), ah(async (req, res) => {
    const u = await findByIdentifier((req.body as { identifier: string }).identifier);
    if (u?.phone && u.isActive) { await issueOtp(d, u.id, u.phone, "reset").catch(() => undefined); await audit(d.db, u.id, "otp_sent", "User", u.id, { purpose: "reset" }); }
    res.status(202).json({ message: "If that account has a registered mobile number, a code has been sent to it." });
  }));

  r.post("/password/reset", strict, validate({ body: z.object({ identifier: z.string().trim().toLowerCase(), otp: z.string(), newPassword: strongPassword }) }), ah(async (req, res) => {
    const { identifier, otp, newPassword } = req.body as { identifier: string; otp: string; newPassword: string };
    const u = await findByIdentifier(identifier); if (!u) throw badRequest("The code has expired. Request a new one.");
    await verifyOtp(d, u.id, "reset", otp);
    await d.db.update(users).set({ passwordHash: await bcrypt.hash(newPassword, BCRYPT_COST), passwordChangedAt: new Date(), mustChangePassword: false }).where(eq(users.id, u.id));
    await d.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.userId, u.id), isNull(refreshTokens.revokedAt)));
    await revokeAccessTokens(d.kv, u.id);
    await d.kv.del(`login:fail:${identifier}`);
    await audit(d.db, u.id, "password_reset", "User", u.id, { via: "otp" });
    res.json({ ok: true, message: "Password reset. You can sign in now." });
  }));

  /** Refresh-token rotation with reuse detection: replaying a rotated token revokes its whole family. */
  r.post("/refresh", ah(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) throw unauthorized("No session");
    const tok = await d.db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, sha256(raw)) });
    if (!tok) throw unauthorized("Session not recognised");
    if (tok.revokedAt) {
      await d.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.family, tok.family), isNull(refreshTokens.revokedAt)));
      await audit(d.db, tok.userId, "refresh_reuse_detected", "RefreshToken", tok.id);
      throw unauthorized("Session was revoked — please sign in again");
    }
    const user = await d.db.query.users.findFirst({ where: eq(users.id, tok.userId) });
    if (tok.expiresAt < new Date() || !user?.isActive) throw unauthorized("Session expired");
    const revoked = await d.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.id, tok.id), isNull(refreshTokens.revokedAt))).returning({ id: refreshTokens.id });
    if (!revoked.length) throw unauthorized("Session already refreshed");
    const accessToken = await issue(res, user, tok.family, req.get("user-agent"));
    res.json({ accessToken, user: publicUser(user, enforcePasswordChange(d.config)) });
  }));

  r.post("/logout", ah(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (raw) await d.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(eq(refreshTokens.tokenHash, sha256(raw)), isNull(refreshTokens.revokedAt)));
    res.clearCookie(REFRESH_COOKIE, { path: "/api/v1/auth" });
    res.status(204).end();
  }));

  r.get("/me", authenticate(d.config.JWT_ACCESS_SECRET), ah(async (req, res) => {
    const u = await d.db.query.users.findFirst({ where: eq(users.id, req.user!.id) });
    if (!u) throw unauthorized();
    res.json({ user: publicUser(u, enforcePasswordChange(d.config)) });
  }));
  return r;
}
