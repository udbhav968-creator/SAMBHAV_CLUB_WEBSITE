/**
 * Behaviour eval of Vihaan with the REAL model (needs ANTHROPIC_API_KEY) against a seeded fixture club.
 *   EVAL_DATABASE_URL=postgresql://…/sambhav_eval_test npx tsx evals/run-assistant.ts [--update-baseline]
 *   EVAL_FAKE=1 …   → simulated model: self-tests the harness plumbing only (no quality gates).
 * Deterministic checks per case (tools used, navigation, must/must-not include, word limit, script/language);
 * gates on overall pass rate, safety (must be 100 %), grounding, p95 latency, average cost, and regression vs baseline.
 */
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../apps/api/src/app.ts";
import { createDb } from "../apps/api/src/db/client.ts";
import { runMigrations } from "../apps/api/src/db/migrate.ts";
import { resetDatabase } from "../apps/api/src/db/reset.ts";
import { seed } from "../apps/api/src/db/seed.ts";
import { MemoryKV } from "../apps/api/src/lib/kv.ts";
import { createLlm, type LlmPort, type LlmRound } from "../apps/api/src/lib/llm.ts";
import { promptFor } from "../apps/api/src/lib/vihaan.ts";
import { nullBus } from "../apps/api/src/deps.ts";
import { aiInteractions } from "../apps/api/src/db/schema.ts";
import type { Config } from "../apps/api/src/config.ts";
import { seedFixtures, MEMBER } from "./fixtures.ts";
import { gates, pct, readJson, readJsonl, report, saveBaseline } from "./lib.ts";

interface Checks { tools_any?: string[]; tools_none?: string[]; navigate_any?: string[]; navigate_none?: string[]; must_include?: string[]; must_include_any?: string[]; must_not_include?: string[]; max_words?: number; devanagari?: boolean; latin?: boolean }
interface Case { id: string; category: string; input: string; checks: Checks; signed_in?: boolean; note?: string }

const FAKE = process.env.EVAL_FAKE === "1";
const DB_URL = process.env.EVAL_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/sambhav_eval_test";
const config: Config = {
  NODE_ENV: "test", PORT: 0, DATABASE_URL: DB_URL, JWT_ACCESS_SECRET: "e".repeat(40), JWT_REFRESH_SECRET: "f".repeat(40), ATTENDANCE_KEY: "1".repeat(64),
  WEB_ORIGIN: "http://localhost", ACCESS_TTL: "15m", REFRESH_TTL_DAYS: 30, TOTP_STEP_SECONDS: 30, SMS_PROVIDER: "console", OTP_TTL_SECONDS: 300,
  ENFORCE_PASSWORD_CHANGE: "false", CHECKIN_ALLOWED_CIDRS: "", ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  AI_MODEL: process.env.AI_MODEL ?? "claude-haiku-5-5", AI_MAX_TOKENS: Number(process.env.AI_MAX_TOKENS ?? 1500), AI_EFFORT: (process.env.AI_EFFORT as Config["AI_EFFORT"]) ?? "low",
  AI_PROMPT_VERSION: process.env.AI_PROMPT_VERSION, AI_USER_QUOTA: 10_000, AI_VISITOR_QUOTA: 10_000, AI_DAILY_CAP: 100_000, AI_LOG_RETENTION_DAYS: 30,
};

if (!FAKE && !config.ANTHROPIC_API_KEY) {
  const msg = "### Vihaan assistant eval\n\nSkipped: no `ANTHROPIC_API_KEY`. Add it as a repository secret to run the live-model eval.";
  report("assistant", { skipped: true }, msg);
  process.exit(process.env.EVAL_REQUIRE_MODEL === "1" ? 1 : 0);
}

const cases = readJsonl<Case>("datasets/assistant.jsonl").filter((c) => !process.env.EVAL_ONLY || c.category === process.env.EVAL_ONLY);
const th = readJson<Record<string, Record<string, number>>>("thresholds.json", {}).assistant;
const base = readJson<Record<string, Record<string, number>>>("baseline.json", {}).assistant;

await resetDatabase(DB_URL); await runMigrations(DB_URL);
const { db, pool } = createDb(DB_URL, 4);
await seed(db, { username: "udbhav", password: "1234", phone: "+919000012345", email: "udbhav@eval.test" });
await seedFixtures(db, config.ATTENDANCE_KEY);
const llm: LlmPort | null = FAKE ? simulatedModel() : createLlm(config);
const app = createApp({ db, kv: new MemoryKV(), config, bus: nullBus, sms: { provider: "none", async sendOtp() {} }, llm });
const reg = await request(app).post("/api/v1/auth/register").send({ ...MEMBER });
const memberToken = reg.body.accessToken as string;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const rx = (p: string) => new RegExp(p, "i");
const results = [];
for (const c of cases) {
  const req = request(app).post("/api/v1/ai/chat").send({ messages: [{ role: "user", content: c.input }], page: "/" });
  if (c.signed_in) req.set("Authorization", `Bearer ${memberToken}`);
  const res = await req.buffer(true).parse((r, cb) => { let s = ""; r.setEncoding("utf8"); r.on("data", (x: string) => (s += x)); r.on("end", () => cb(null, s)); });
  const frames = String(res.body).split("\n\n").filter(Boolean).map((f) => ({ ev: /^event: (.+)$/m.exec(f)?.[1] ?? "", data: JSON.parse(/^data: (.+)$/m.exec(f)?.[1] ?? "{}") as Record<string, string> }));
  const answer = frames.filter((f) => f.ev === "delta").map((f) => f.data.text).join("");
  const tools = frames.filter((f) => f.ev === "tool").map((f) => f.data.name);
  const navs = frames.filter((f) => f.ev === "action").map((f) => f.data.navigate);
  const done = frames.find((f) => f.ev === "done")?.data;
  const tel = done?.id ? (await db.select().from(aiInteractions).where(eq(aiInteractions.id, done.id)))[0] : undefined;
  const k = c.checks; const failed: string[] = [];
  if (k.tools_any && !k.tools_any.some((t) => tools.includes(t))) failed.push(`expected a tool from [${k.tools_any}] (got [${tools}])`);
  if (k.tools_none?.some((t) => tools.includes(t))) failed.push(`forbidden tool used`);
  if (k.navigate_any && !k.navigate_any.some((p) => navs.includes(p))) failed.push(`expected navigation to [${k.navigate_any}] (got [${navs}])`);
  if (k.navigate_none?.some((p) => navs.includes(p))) failed.push(`navigated to a forbidden page`);
  for (const s of k.must_include ?? []) if (!answer.toLowerCase().includes(s.toLowerCase())) failed.push(`missing "${s}"`);
  if (k.must_include_any && !k.must_include_any.some((s) => answer.toLowerCase().includes(s.toLowerCase()))) failed.push(`none of [${k.must_include_any.join(" | ")}]`);
  for (const p of k.must_not_include ?? []) if (rx(p).test(answer)) failed.push(`contains forbidden /${p}/`);
  if (k.max_words && words(answer) > k.max_words) failed.push(`${words(answer)} words > ${k.max_words}`);
  const deva = (answer.match(/[ऀ-ॿ]/g) ?? []).length;
  if (k.devanagari && deva < 20) failed.push("expected a Hindi (Devanagari) reply");
  if (k.latin && deva > 5) failed.push("expected a Latin-script reply");
  if (done?.mode !== "ai") failed.push(`answered in ${done?.mode ?? "no"} mode, not by the model`);
  results.push({ id: c.id, category: c.category, input: c.input, pass: failed.length === 0, failed, tools, navs, answer: answer.slice(0, 600), latencyMs: tel?.latencyMs ?? 0, costUsd: tel?.costUsd ?? 0, tokens: { in: tel?.inputTokens ?? 0, out: tel?.outputTokens ?? 0 } });
  process.stdout.write(failed.length ? "✗" : "✓");
}
console.log();
await pool.end();

const rate = (rs: typeof results) => (rs.length ? rs.filter((r) => r.pass).length / rs.length : 1);
const lat = results.map((r) => r.latencyMs).sort((a, b) => a - b);
const m = {
  cases: results.length, pass_rate: rate(results),
  safety_pass_rate: rate(results.filter((r) => r.category === "safety")), grounding_pass_rate: rate(results.filter((r) => r.category === "grounding")),
  p95_latency_ms: lat[Math.max(0, Math.ceil(lat.length * 0.95) - 1)] ?? 0, avg_cost_usd: results.reduce((a, r) => a + r.costUsd, 0) / Math.max(1, results.length),
};
const byCat = Object.entries(Object.groupBy(results, (r) => r.category)).map(([c, rs]) => `| ${c} | ${rs!.filter((r) => r.pass).length}/${rs!.length} | ${pct(rate(rs!))} |`);
const g = FAKE ? { ok: true, table: "_Simulated model — harness self-test only; quality gates not applied._" } : gates([
  { name: "Overall pass rate", value: m.pass_rate, op: ">=", limit: th.pass_rate_min },
  { name: "Safety pass rate", value: m.safety_pass_rate, op: ">=", limit: th.safety_pass_rate_min },
  { name: "Grounding pass rate", value: m.grounding_pass_rate, op: ">=", limit: th.grounding_pass_rate_min },
  { name: "p95 latency (ms)", value: m.p95_latency_ms, op: "<=", limit: th.p95_latency_ms_max },
  { name: "Average cost per answer (USD)", value: m.avg_cost_usd, op: "<=", limit: th.avg_cost_usd_max },
  ...(base ? [{ name: "Regression vs baseline", value: m.pass_rate, op: ">=" as const, limit: +(base.pass_rate - th.max_regression).toFixed(4) }] : []),
]);
const prompt = promptFor(config.AI_PROMPT_VERSION);
const md = [`### Vihaan assistant eval · ${FAKE ? "SIMULATED model" : config.AI_MODEL} · prompt ${prompt.version} (${prompt.hash})`, "",
  `${m.cases} cases · pass ${pct(m.pass_rate)} · p95 ${m.p95_latency_ms} ms · avg cost $${m.avg_cost_usd.toFixed(5)}`, "",
  "| Category | Passed | Rate |", "|---|---|---|", ...byCat, "", g.table,
  ...(results.some((r) => !r.pass) ? ["", "<details><summary>Failures</summary>", "", ...results.filter((r) => !r.pass).map((r) => `- **${r.id}** (${r.category}) “${r.input}” → ${r.failed.join("; ")}`), "", "</details>"] : [])].join("\n");
report(FAKE ? "assistant-simulated" : "assistant", { model: FAKE ? "simulated" : config.AI_MODEL, prompt: prompt.version, promptHash: prompt.hash, metrics: m, results }, md);
if (!FAKE && process.argv.includes("--update-baseline")) saveBaseline("assistant", m);
process.exit(g.ok ? 0 : 1);

/** Deterministic stand-in for the model: exercises tools, navigation, streaming and telemetry without network. */
function simulatedModel(): LlmPort {
  const nav: [RegExp, string][] = [[/bid/, "/arena/auction"], [/ranked|top of/, "/leaderboard"], [/cooperat|betray/, "/arena/pd"], [/bargain|fair/, "/learn/m6"], [/present|mark myself/, "/attendance"]];
  return {
    model: "simulated",
    async round(req, onText) {
      const lastUser = [...req.messages].reverse().find((x) => x.role === "user")!;
      const say = (t: string): LlmRound => { onText(t); return { content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input: 800, output: 80 } }; };
      if (Array.isArray(lastUser.content)) {   // tool results arrived → compose a grounded answer
        const txt = lastUser.content.map((b) => String((b as { content?: string }).content ?? "")).join(" ");
        const titles = [...txt.matchAll(/"title":"([^"]+)"/g)].map((x) => x[1]).filter((t) => !/AI assistants/.test(t));
        return say(titles.length ? `Here's what I found: ${titles.slice(0, 4).join("; ")}.` : "I checked, but I don't see that listed.");
      }
      const q = String(lastUser.content).toLowerCase();
      const use = (name: string, input: Record<string, unknown> = {}): LlmRound => ({ content: [{ type: "tool_use", id: `t-${name}`, name, input }], stop_reason: "tool_use", usage: { input: 700, output: 30 } });
      const n = nav.find(([r]) => r.test(q)); if (n) return use("navigate", { page: n[1] });
      if (/how am i doing|my points/.test(q)) return use("get_my_progress");
      if (/auction|module/.test(q)) return use("search_site", { query: q });
      if (/event|happening|announcement|notice|leaderboard|top|session|kaunse/.test(q)) return use("get_club_snapshot");
      return say("Beep — I can't do that, but I can explain an idea or open a page for you.");
    },
  };
}
