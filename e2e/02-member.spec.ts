import { test, expect } from "@playwright/test";
import { guard, register } from "./helpers";

test("a new member plays, learns and is guided by Vihaan", async ({ page }) => {
  const g = guard(page);
  await register(page, "Flow Member", `flow-${Date.now()}@e2e.test`);
  await expect(page.locator("main")).toContainText("Flow Member");

  // Roulette: place a bet and spin; credits and the result update.
  await page.goto("/arena/roulette");
  await page.locator(".rtable button", { hasText: "Red" }).first().click();
  await page.getByRole("button", { name: /spin/i }).click();
  await expect(page.locator(".ball-result")).not.toHaveText("", { timeout: 8000 });

  // Quiz: answer and submit; a score banner appears.
  await page.goto("/learn/m2");
  await page.locator(".tabs button", { hasText: "Quiz" }).click();
  const groups = await page.locator('input[type="radio"]').evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLInputElement).name))]);
  for (const n of groups) await page.locator(`input[name="${n}"]`).first().check();
  await page.getByRole("button", { name: /submit/i }).click();
  await expect(page.locator(".banner")).toContainText(/\d+\s*\/\s*\d+|score/i);

  // Vihaan: navigation by voice-style command and an offline answer.
  await page.locator(".vh-fab").click();
  await expect(page.locator(".vh-panel")).toBeVisible();
  await page.fill(".vh-form input", "take me to the nash solver"); await page.press(".vh-form input", "Enter");
  await expect(page).toHaveURL(/\/arena\/nash$/);
  await page.fill(".vh-form input", "how do I check in?"); await page.press(".vh-form input", "Enter");
  await expect(page.locator(".vh-msg.bot .vh-bubble").last()).toContainText(/6-digit code/i);
  // LLMOps feedback loop: rate the answer.
  await page.locator(".vh-msg.bot").last().getByRole("button", { name: "Helpful", exact: true }).click();
  await expect(page.locator(".vh-msg.bot").last()).toContainText("Thanks!");
  // Ctrl K hands a question to Vihaan.
  await page.keyboard.press("Escape"); await page.keyboard.press("Control+k");
  await page.fill(".palette input", "auction strategy"); await page.locator(".palette li a").last().click();
  await expect(page.locator(".vh-msg.me").last()).toHaveText("auction strategy");
  g.assertClean();
});
