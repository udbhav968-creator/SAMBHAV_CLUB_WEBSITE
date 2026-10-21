import { test, expect } from "@playwright/test";
import { guard, signIn, waitForOtp } from "./helpers";

test("only udbhav can change his password, and only with the SMS OTP", async ({ page }) => {
  const g = guard(page);
  await signIn(page, "udbhav", "1234"); await page.waitForURL("**/admin/**");
  await page.goto("/admin/security");
  const sentAt = Date.now();
  await page.getByRole("button", { name: /send otp/i }).click();
  await expect(page.locator("#otp")).toBeVisible();
  const otp = await waitForOtp(sentAt);
  await page.fill("#otp", otp); await page.fill("#cur", "1234"); await page.fill("#np", "Udbhav2026x"); await page.fill("#cp", "Udbhav2026x");
  await page.locator("form button.primary").last().click();
  await page.waitForURL("**/login");
  await signIn(page, "udbhav", "1234");
  await expect(page.locator(".err")).toBeVisible();
  await signIn(page, "udbhav", "Udbhav2026x"); await page.waitForURL("**/admin/**");
  g.assertClean();
});

test("login lockout after repeated wrong passwords", async ({ page }) => {
  for (let i = 0; i < 5; i++) { await signIn(page, "lockme@e2e.test", `wrong-${i}`); await expect(page.locator(".err")).toBeVisible(); }
  await signIn(page, "lockme@e2e.test", "wrong-again");
  await expect(page.locator(".err")).toContainText(/locked|too many/i);
});
