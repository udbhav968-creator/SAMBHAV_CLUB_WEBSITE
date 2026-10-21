import { expect, type Page, type ConsoleMessage, type Response } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Collects anything that should never happen on a healthy page. */
export function guard(page: Page) {
  const problems: string[] = [];
  // Hermetic runs: third-party font CDNs are stubbed so network policy can't cause false failures.
  void page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m: ConsoleMessage) => { if (m.type() === "error" && !/favicon|Failed to load resource: the server responded with a status of 4\d\d/.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.on("response", (r: Response) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  return { problems, assertClean: () => expect(problems, problems.join("\n")).toEqual([]) };
}
export async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "page scrolls sideways").toBeLessThanOrEqual(1);
}
export async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.fill("#identifier", identifier); await page.fill("#password", password);
  await page.click("form button.primary");
}
export async function register(page: Page, name: string, email: string, password = "Passw0rd!") {
  await page.goto("/register");
  await page.fill("#name", name); await page.fill("#email", email); await page.fill("#password", password);
  await page.click("form button.primary"); await page.waitForURL("**/me");
}
const OUTBOX = process.env.SMS_OUTBOX_FILE ?? "/tmp/sambhav-e2e-sms.jsonl";
/** Waits for the next OTP "SMS" written after `since` (ms) and returns its code. */
export async function waitForOtp(since: number, timeoutMs = 10_000): Promise<string> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const lines = readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as { code: string; at: number });
    const hit = lines.filter((l) => l.at >= since).at(-1);
    if (hit) return hit.code;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("No OTP arrived in the SMS outbox");
}
