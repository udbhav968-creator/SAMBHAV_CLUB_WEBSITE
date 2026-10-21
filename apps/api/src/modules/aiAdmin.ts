import { Router } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import type { Deps } from "../deps.js";
import { ah } from "../lib/http.js";
import { validate } from "../middleware/validate.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { promptFor } from "../lib/vihaan.js";

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** LLMOps dashboard data for the admin: quality, latency, cost and feedback for Vihaan. */
export function aiAdminRouter(d: Deps) {
  const r = Router();
  r.get("/", authenticate(d.config.JWT_ACCESS_SECRET), requireRole("ADMIN"), validate({ query: z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }) }), ah(async (req, res) => {
    const { days } = req.query as unknown as { days: number };
    const since = sql`now() - make_interval(days => ${days})`;
    const q = async (s: ReturnType<typeof sql>) => ((await d.db.execute(s)) as unknown as { rows: Row[] }).rows;
    const [totals, daily, tools, prompts, negative, today] = await Promise.all([
      q(sql`SELECT count(*) n,
              count(*) FILTER (WHERE mode='ai') ai, count(*) FILTER (WHERE mode='instant') instant,
              count(*) FILTER (WHERE mode='offline') offline, count(*) FILTER (WHERE mode='error') errors,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE mode='ai') p50,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE mode='ai') p95,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY first_token_ms) FILTER (WHERE mode='ai') ttft50,
              sum(input_tokens) tin, sum(output_tokens) tout, sum(cost_usd) cost,
              count(*) FILTER (WHERE rating=1) up, count(*) FILTER (WHERE rating=-1) down
            FROM ai_interactions WHERE created_at >= ${since}`),
      q(sql`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*) n, count(*) FILTER (WHERE mode='ai') ai,
              sum(cost_usd) cost, count(*) FILTER (WHERE rating=1) up, count(*) FILTER (WHERE rating=-1) down
            FROM ai_interactions WHERE created_at >= ${since} GROUP BY 1 ORDER BY 1`),
      q(sql`SELECT t tool, count(*) n FROM ai_interactions, jsonb_array_elements_text(tool_calls) t WHERE created_at >= ${since} GROUP BY 1 ORDER BY 2 DESC`),
      q(sql`SELECT prompt_version v, count(*) n, count(*) FILTER (WHERE rating=1) up, count(*) FILTER (WHERE rating=-1) down,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE mode='ai') p95, avg(cost_usd) FILTER (WHERE mode='ai') cost
            FROM ai_interactions WHERE created_at >= ${since} GROUP BY 1 ORDER BY 1 DESC`),
      q(sql`SELECT id, created_at, page, question, answer, feedback_note note, prompt_version v, model, tool_calls
            FROM ai_interactions WHERE rating=-1 AND created_at >= ${since} ORDER BY created_at DESC LIMIT 20`),
      q(sql`SELECT count(*) FILTER (WHERE mode='ai') ai FROM ai_interactions WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`),
    ]);
    const t = totals[0] ?? {}; const rated = num(t.up) + num(t.down);
    const cost = num(t.cost);
    res.set("Cache-Control", "no-store").json({
      window: { days },
      config: { model: d.llm?.model ?? null, aiEnabled: !!d.llm, prompt: promptFor(d.config.AI_PROMPT_VERSION).version, dailyCap: d.config.AI_DAILY_CAP, aiCallsToday: num(today[0]?.ai), retentionDays: d.config.AI_LOG_RETENTION_DAYS },
      totals: {
        requests: num(t.n), byMode: { ai: num(t.ai), instant: num(t.instant), offline: num(t.offline), error: num(t.errors) },
        latencyMs: { p50: Math.round(num(t.p50)), p95: Math.round(num(t.p95)), firstTokenP50: Math.round(num(t.ttft50)) },
        tokens: { input: num(t.tin), output: num(t.tout) }, costUsd: cost, projected30dUsd: (cost / days) * 30,
        feedback: { up: num(t.up), down: num(t.down), helpfulRate: rated ? num(t.up) / rated : null },
      },
      daily: daily.map((x) => ({ day: x.day, requests: num(x.n), ai: num(x.ai), costUsd: num(x.cost), up: num(x.up), down: num(x.down) })),
      tools: tools.map((x) => ({ tool: x.tool, count: num(x.n) })),
      prompts: prompts.map((x) => ({ version: x.v, requests: num(x.n), helpfulRate: num(x.up) + num(x.down) ? num(x.up) / (num(x.up) + num(x.down)) : null, p95Ms: Math.round(num(x.p95)), avgCostUsd: num(x.cost) })),
      needsReview: negative.map((x) => ({ id: x.id, at: x.created_at, page: x.page, question: x.question, answer: x.answer, note: x.note, prompt: x.v, model: x.model, tools: x.tool_calls })),
    });
  }));
  return r;
}
