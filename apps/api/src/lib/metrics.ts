import { Registry, Counter, Histogram, collectDefaultMetrics } from "prom-client";
import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";

/**
 * Prometheus metrics (scrape GET /metrics with `Authorization: Bearer $METRICS_TOKEN`).
 * HTTP RED metrics plus Vihaan LLMOps signals: volume by mode, latency, tokens, estimated cost, tool use, feedback.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "sambhav_" });

export const httpDuration = new Histogram({ name: "sambhav_http_request_duration_seconds", help: "HTTP latency by route", labelNames: ["method", "route", "status"], buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], registers: [registry] });
export const aiRequests = new Counter({ name: "sambhav_ai_requests_total", help: "Vihaan answers by mode", labelNames: ["mode", "model", "prompt"], registers: [registry] });
export const aiLatency = new Histogram({ name: "sambhav_ai_latency_seconds", help: "Vihaan end-to-end answer latency", labelNames: ["mode"], buckets: [0.05, 0.25, 0.5, 1, 2, 4, 8, 15, 30], registers: [registry] });
export const aiFirstToken = new Histogram({ name: "sambhav_ai_first_token_seconds", help: "Time to first streamed token (AI mode)", buckets: [0.25, 0.5, 1, 2, 4, 8], registers: [registry] });
export const aiTokens = new Counter({ name: "sambhav_ai_tokens_total", help: "Model tokens", labelNames: ["direction", "model"], registers: [registry] });
export const aiCost = new Counter({ name: "sambhav_ai_cost_usd_total", help: "Estimated model spend (USD)", labelNames: ["model"], registers: [registry] });
export const aiTools = new Counter({ name: "sambhav_ai_tool_calls_total", help: "Vihaan tool calls", labelNames: ["tool"], registers: [registry] });
export const aiFeedback = new Counter({ name: "sambhav_ai_feedback_total", help: "Thumbs up/down on answers", labelNames: ["rating"], registers: [registry] });
export const aiErrors = new Counter({ name: "sambhav_ai_errors_total", help: "Model errors and refusals", labelNames: ["kind"], registers: [registry] });

/** Records latency per *route pattern* (not raw URL) to keep label cardinality bounded. */
export function httpMetrics(req: Request, res: Response, next: NextFunction) {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl ? `${req.baseUrl}/*` : "other";
    end({ method: req.method, route, status: String(res.statusCode) });
  });
  next();
}

export function metricsHandler(token: string | undefined) {
  return async (req: Request, res: Response) => {
    const given = Buffer.from((req.get("authorization") ?? "").replace(/^Bearer /, ""));
    const want = Buffer.from(token ?? "");
    if (!token || given.length !== want.length || !timingSafeEqual(given, want)) { res.status(404).json({ error: { code: "not_found", message: "No such endpoint" } }); return; }
    res.set("Content-Type", registry.contentType).send(await registry.metrics());
  };
}
