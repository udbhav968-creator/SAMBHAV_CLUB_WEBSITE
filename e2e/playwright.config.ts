import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4300);
/** Full-stack browser tests against a throwaway database (see e2e/server.sh). Run: npm run e2e */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,                       // one shared database; specs build on the seeded admin
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "../playwright-report" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
  ],
  webServer: { command: "sh e2e/server.sh", cwd: "..", url: `http://localhost:${PORT}/readyz`, timeout: 120_000, reuseExistingServer: false, stdout: "ignore", stderr: "pipe" },
});
