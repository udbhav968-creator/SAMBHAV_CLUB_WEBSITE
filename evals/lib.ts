import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const readJsonl = <T>(file: string): T[] => readFileSync(join(ROOT, file), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T);
export const readJson = <T>(file: string, fallback: T): T => (existsSync(join(ROOT, file)) ? (JSON.parse(readFileSync(join(ROOT, file), "utf8")) as T) : fallback);
export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Writes the JSON report + a Markdown summary (also to the GitHub Actions job summary when available). */
export function report(name: string, data: Record<string, unknown>, markdown: string) {
  mkdirSync(join(ROOT, "reports"), { recursive: true });
  writeFileSync(join(ROOT, "reports", `${name}.json`), JSON.stringify(data, null, 2) + "\n");
  writeFileSync(join(ROOT, "reports", `${name}.md`), markdown + "\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n\n");
  console.log(markdown);
}

export interface Gate { name: string; value: number; op: ">=" | "<="; limit: number }
/** Evaluates gates; prints a table and returns false if any fails. */
export function gates(list: Gate[]) {
  let ok = true; const rows = ["| Gate | Value | Rule | Result |", "|---|---|---|---|"];
  for (const g of list) {
    const pass = g.op === ">=" ? g.value >= g.limit - 1e-9 : g.value <= g.limit + 1e-9; ok &&= pass;
    rows.push(`| ${g.name} | ${Number.isInteger(g.value) ? g.value : g.value.toFixed(3)} | ${g.op} ${g.limit} | ${pass ? "✅ pass" : "❌ FAIL"} |`);
  }
  return { ok, table: rows.join("\n") };
}
export function saveBaseline(key: string, metrics: Record<string, number>) {
  const b = readJson<Record<string, unknown>>("baseline.json", {}); b[key] = { ...metrics, updatedAt: new Date().toISOString().slice(0, 10) };
  writeFileSync(join(ROOT, "baseline.json"), JSON.stringify(b, null, 2) + "\n");
}
