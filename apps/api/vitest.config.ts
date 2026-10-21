import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    fileParallelism: false, testTimeout: 20000, hookTimeout: 30000,
    coverage: {
      provider: "v8", include: ["src/**"], exclude: ["src/server.ts", "src/db/seed.ts", "src/db/reset.ts"],
      reporter: ["text-summary", "lcov", "json-summary"],
      // Ratchet: CI fails if coverage drops below today's level.
      thresholds: { statements: 75, branches: 63, functions: 66, lines: 80 },
    },
  },
});
