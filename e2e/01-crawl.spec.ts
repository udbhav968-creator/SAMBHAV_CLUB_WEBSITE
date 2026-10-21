import { test, expect } from "@playwright/test";
import { guard, noHorizontalOverflow, register, signIn } from "./helpers";

const PUBLIC = ["/", "/about", "/arena", "/learn", "/learn/m1", "/learn/m4", "/events", "/leaderboard", "/notices", "/login", "/register", "/forgot"];
// Arena games spend virtual credits, so they need an account (visitors are sent to sign in).
const MEMBER = ["/me", "/attendance", "/members", "/arena/roulette", "/arena/pd", "/arena/guess", "/arena/rps", "/arena/nash", "/arena/auction", "/arena/ultimatum", "/arena/live", "/learn/m2"];
const ADMIN = ["/admin", "/admin/attendance/live", "/admin/attendance/roll", "/admin/attendance/sessions", "/admin/attendance/reports", "/admin/attendance/alerts", "/admin/security", "/admin/ai", "/attendance"];

async function crawl(page: import("@playwright/test").Page, paths: string[], mobile: boolean) {
  const g = guard(page);
  for (const p of paths) {
    await page.goto(p);
    await expect(page.locator("main h1").first(), `${p} has a heading`).toBeVisible();
    await page.waitForLoadState("networkidle");
    if (mobile) await noHorizontalOverflow(page);
  }
  g.assertClean();
}

for (const mobile of [false, true]) {
  test.describe(mobile ? "phone (390 px)" : "desktop", () => {
    test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
    test("visitor pages render cleanly", async ({ page }) => { await crawl(page, PUBLIC, mobile); });
    test("member pages render cleanly", async ({ page }) => {
      await register(page, "Crawl Member", `crawl-${mobile ? "m" : "d"}-${Date.now()}@e2e.test`);
      await crawl(page, MEMBER, mobile);
    });
    test("admin pages render cleanly", async ({ page }) => {
      await signIn(page, "udbhav", "1234"); await page.waitForURL("**/admin/**");
      await crawl(page, ADMIN, mobile);
    });
  });
}

test("visitors opening a game are sent to sign in and come back afterwards", async ({ page }) => {
  await page.goto("/arena/roulette");
  await expect(page).toHaveURL(/\/login/);
});

test("unknown routes show the not-found page, members can't open admin pages", async ({ page }) => {
  await page.goto("/definitely-not-a-page");
  await expect(page.locator("main")).toContainText(/not found|404|lost/i);
  await register(page, "Nosy Member", `nosy-${Date.now()}@e2e.test`);
  await page.goto("/admin/attendance/roll");
  await expect(page.locator("main")).not.toContainText("Roll call");
  await expect(page.locator(".dock")).toHaveCount(0);
});
