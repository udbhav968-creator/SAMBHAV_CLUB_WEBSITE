import { randomInt } from "node:crypto";
import type { Deps } from "../deps.js";
import { sha256, safeEqual } from "./crypto.js";
import { badRequest, tooMany } from "./errors.js";

export type OtpPurpose = "change" | "reset";
interface Stored { hash: string; attempts: number; exp: number }
const MAX_ATTEMPTS = 5, MAX_SENDS = 3, SEND_WINDOW = 15 * 60;

/**
 * One-time passwords for sensitive account actions.
 *  - 6 digits from a CSPRNG; only a salted SHA-256 is stored (Redis, TTL = OTP_TTL_SECONDS).
 *  - ≤3 sends per 15 min per user; ≤5 verification attempts per code; single use.
 */
export async function issueOtp(d: Deps, userId: string, phone: string, purpose: OtpPurpose) {
  const sends = await d.kv.incr(`otp:send:${userId}`, SEND_WINDOW);
  if (sends > MAX_SENDS) throw tooMany("Too many codes requested. Wait 15 minutes and try again.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0"); const ttl = d.config.OTP_TTL_SECONDS;
  await d.kv.set(`otp:${purpose}:${userId}`, { hash: sha256(`${userId}:${purpose}:${code}`), attempts: 0, exp: Date.now() + ttl * 1000 } satisfies Stored, ttl);
  await d.sms.sendOtp(phone, code, Math.round(ttl / 60));
  return { expiresIn: ttl };
}

export async function verifyOtp(d: Deps, userId: string, purpose: OtpPurpose, code: string) {
  const key = `otp:${purpose}:${userId}`; const s = await d.kv.get<Stored>(key);
  if (!s || s.exp < Date.now()) throw badRequest("The code has expired. Request a new one.");
  if (!/^\d{6}$/.test(code) || !safeEqual(s.hash, sha256(`${userId}:${purpose}:${code}`))) {
    const attempts = s.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) { await d.kv.del(key); throw tooMany("Too many wrong codes. Request a new one."); }
    await d.kv.set(key, { ...s, attempts }, Math.max(1, Math.ceil((s.exp - Date.now()) / 1000)));
    throw badRequest(`That code is incorrect. ${MAX_ATTEMPTS - attempts} attempts left.`);
  }
  await d.kv.del(key); // single use
}
