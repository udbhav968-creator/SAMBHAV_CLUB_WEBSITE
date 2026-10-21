/**
 * Offline eval of Vihaan's instant router (no model, no network) — runs on every PR.
 *   npx tsx evals/run-intent.ts [--update-baseline]
 * Gates: navigation accuracy, ZERO false navigations on questions (safety: a question must never yank the
 * user to another page), FAQ accuracy, and no regression versus the committed baseline.
 */
import { intentOf, LATEST_PROMPT } from "../apps/api/src/lib/vihaan.ts";
import { gates, pct, readJson, readJsonl, report, saveBaseline } from "./lib.ts";

interface Case { id: string; input: string; expect: { navigate: string | null; text?: string }; lang: string; category: string }
const cases = readJsonl<Case>("datasets/intent.jsonl");
const th = readJson<Record<string, Record<string, number>>>("thresholds.json", {}).intent;
const base = readJson<Record<string, Record<string, number>>>("baseline.json", {}).intent;

const results = cases.map((c) => {
  const got = intentOf(c.input); const nav = got && "navigate" in got ? got.navigate : null;
  // Questions must reach the model untouched: no navigation AND no canned instant answer.
  const navOk = c.category === "question" ? got === null : nav === c.expect.navigate;
  const textOk = c.expect.text ? !!got && new RegExp(c.expect.text, "i").test(got.text) : true;
  return { ...c, got: nav, text: got?.text ?? null, pass: navOk && textOk };
});
const navCases = results.filter((r) => r.expect.navigate);
const questions = results.filter((r) => r.category === "question");
const faqs = results.filter((r) => r.category === "faq");
const m = {
  cases: results.length,
  navigation_accuracy: navCases.filter((r) => r.pass).length / navCases.length,
  false_navigation: questions.filter((r) => r.got !== null).length,
  hijacked_questions: questions.filter((r) => !r.pass).length,
  faq_accuracy: faqs.filter((r) => r.pass).length / faqs.length,
  overall_accuracy: results.filter((r) => r.pass).length / results.length,
};
const byLang = Object.entries(Object.groupBy(results, (r) => r.lang)).map(([lang, rs]) => `${lang}: ${pct(rs!.filter((r) => r.pass).length / rs!.length)} (${rs!.length})`).join(" · ");
const g = gates([
  { name: "Navigation accuracy", value: m.navigation_accuracy, op: ">=", limit: th.navigation_accuracy_min },
  { name: "False navigations on questions", value: m.false_navigation, op: "<=", limit: th.false_navigation_max },
  { name: "Questions answered by a canned reply instead of the model", value: m.hijacked_questions, op: "<=", limit: 0 },
  { name: "FAQ accuracy", value: m.faq_accuracy, op: ">=", limit: th.faq_accuracy_min },
  ...(base ? [{ name: "Regression vs baseline (overall)", value: m.overall_accuracy, op: ">=" as const, limit: +(base.overall_accuracy - th.max_regression).toFixed(4) }] : []),
]);
const failures = results.filter((r) => !r.pass);
const md = [`### Vihaan intent-router eval · prompt ${LATEST_PROMPT}`, "", `${m.cases} cases · overall ${pct(m.overall_accuracy)} · by language: ${byLang}`, "", g.table,
  ...(failures.length ? ["", "<details><summary>Failures</summary>", "", "| id | input | expected | got |", "|---|---|---|---|", ...failures.map((f) => `| ${f.id} | ${f.input} | ${f.expect.navigate ?? (f.expect.text ? `text /${f.expect.text}/` : "no navigation")} | ${f.got ?? (f.text ? f.text.slice(0, 40) : "—")} |`), "", "</details>"] : [])].join("\n");
report("intent", { metrics: m, failures }, md);
if (process.argv.includes("--update-baseline")) saveBaseline("intent", m);
process.exit(g.ok ? 0 : 1);
