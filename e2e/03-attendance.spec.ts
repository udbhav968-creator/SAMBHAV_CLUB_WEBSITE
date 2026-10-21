import { test, expect } from "@playwright/test";
import { guard, register, signIn } from "./helpers";

test("admin runs a session; a member checks in live with the rotating code", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage(); const ga = guard(admin);
  const member = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage(); const gm = guard(member);

  await signIn(admin, "udbhav", "1234"); await admin.waitForURL("**/admin/attendance/live");
  await expect(admin.locator(".dock")).toBeVisible();
  await admin.fill("#qt", "E2E club night"); await admin.locator("form button.primary").click();
  await admin.waitForURL("**/attendance/console/**");
  const code = (await admin.locator(".code").first().innerText()).replace(/\D/g, "");
  expect(code).toMatch(/^\d{6}$/);

  await register(member, "Live Checker", `live-${Date.now()}@e2e.test`);
  await member.goto("/attendance");
  await member.fill("#code", code === "000000" ? "111111" : "000000"); await member.getByRole("button", { name: "Check in" }).click();
  await expect(member.locator("body")).toContainText(/didn't match|attempts left/i);
  const fresh = (await admin.locator(".code").first().innerText()).replace(/\D/g, "");
  await member.fill("#code", fresh); await member.getByRole("button", { name: "Check in" }).click();
  await expect(member.locator("body")).toContainText(/checked in|marked|present/i);

  // The projector console updates over WebSocket without a reload.
  await expect(admin.locator("main")).toContainText("Live Checker", { timeout: 10_000 });
  // Members never see the admin dock or the code.
  await expect(member.locator(".dock")).toHaveCount(0);
  ga.assertClean(); gm.assertClean();
});
