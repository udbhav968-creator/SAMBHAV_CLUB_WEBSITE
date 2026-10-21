import { defineConfig } from "vitest/config";
export default defineConfig({ test: { coverage: { provider: "v8", include: ["src/**"], reporter: ["text-summary", "lcov"], thresholds: { statements: 85, branches: 60, functions: 78, lines: 83 } } } });
