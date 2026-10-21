import type { Config } from "../config.js";
import { appendFileSync } from "node:fs";
import { logger } from "./logger.js";

/** Outbound SMS port. Providers are thin HTTP adapters; tests inject a fake. */
export interface SmsSender { readonly provider: string; sendOtp(toE164: string, code: string, ttlMinutes: number): Promise<void> }

export const maskPhone = (e164: string | null | undefined) => (e164 ? `${e164.slice(0, e164.length - 10)} ••••••${e164.slice(-4)}` : null);
const message = (code: string, ttl: number) => `${code} is your Sambhav verification code. It expires in ${ttl} minutes. Never share it — Sambhav staff will never ask for it.`;

async function post(url: string, init: RequestInit, provider: string) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) { const body = await res.text().catch(() => ""); throw new Error(`${provider} SMS failed (${res.status}): ${body.slice(0, 200)}`); }
}

export function createSms(c: Config): SmsSender {
  switch (c.SMS_PROVIDER) {
    case "msg91": // India, DLT-registered OTP template with a ##OTP## variable
      return { provider: "msg91", async sendOtp(to, code) {
        const q = new URLSearchParams({ template_id: c.SMS_TEMPLATE_ID ?? "", mobile: to.replace(/^\+/, ""), otp: code });
        await post(`https://control.msg91.com/api/v5/otp?${q}`, { method: "POST", headers: { authkey: c.SMS_API_KEY ?? "", "Content-Type": "application/json" } }, "MSG91");
      } };
    case "fast2sms": // India, OTP route (10-digit Indian numbers)
      return { provider: "fast2sms", async sendOtp(to, code) {
        await post("https://www.fast2sms.com/dev/bulkV2", { method: "POST", headers: { authorization: c.SMS_API_KEY ?? "", "Content-Type": "application/json" },
          body: JSON.stringify({ route: "otp", variables_values: code, numbers: to.replace(/^\+91/, "") }) }, "Fast2SMS");
      } };
    case "twilio":
      return { provider: "twilio", async sendOtp(to, code, ttl) {
        const sid = c.TWILIO_ACCOUNT_SID ?? ""; const auth = Buffer.from(`${sid}:${c.SMS_API_KEY ?? ""}`).toString("base64");
        await post(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ To: to, From: c.SMS_SENDER ?? "", Body: message(code, ttl) }) }, "Twilio");
      } };
    default:
      if (c.NODE_ENV === "production") logger.warn("SMS_PROVIDER=console in production — OTPs are only written to the server log");
      return { provider: "console", async sendOtp(to, code) {
        logger.warn({ to: maskPhone(to), otp: code }, "DEV OTP (console SMS provider)");
        // End-to-end tests read codes from a file; never in production.
        if (c.SMS_OUTBOX_FILE && c.NODE_ENV !== "production") appendFileSync(c.SMS_OUTBOX_FILE, JSON.stringify({ to, code, at: Date.now() }) + "\n");
      } };
  }
}
