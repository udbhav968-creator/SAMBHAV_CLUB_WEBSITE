import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto.js";

/** RFC 6238 TOTP (HMAC-SHA1, 6 digits). */
export function totp(secretHex: string, step: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", Buffer.from(secretHex, "hex")).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}
export const currentStep = (stepSeconds: number, nowMs = Date.now()) => Math.floor(nowMs / 1000 / stepSeconds);

/** Accepts the current step and `window` previous steps (server clock only — never the client's). */
export function verifyTotp(secretHex: string, code: string, stepSeconds: number, nowMs = Date.now(), window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const s = currentStep(stepSeconds, nowMs);
  let ok = false;
  for (let i = 0; i <= window; i++) ok = safeEqual(totp(secretHex, s - i), code) || ok; // constant work
  return ok;
}
