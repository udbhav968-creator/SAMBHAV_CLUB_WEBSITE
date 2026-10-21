# LLMOps for Vihaan

How the AI guide is versioned, evaluated, shipped, monitored and improved. Everything below is automated in this repository.

## 1. Lifecycle

```
   change prompt / model / tools
              │
              ▼
   ┌──────────────────────┐   PR gate (LLMOps workflow)
   │ Offline intent eval   │── 106 golden cases · 0 false navigations · no canned-answer hijacks · no regression
   │ Live behaviour eval   │── 28 cases · safety 100 % · grounding ≥ 90 % · pass ≥ 85 % · p95 · cost · regression
   └──────────────────────┘
              │ merge → Release workflow → image → Render / VPS
              ▼
   ┌──────────────────────┐   Production
   │ Telemetry per answer  │── ai_interactions (mode, model, prompt version + hash, tools, tokens, cost, latency, TTFT)
   │ Prometheus metrics    │── /metrics → Grafana dashboard + 5 Vihaan alerts
   │ 👍 / 👎 feedback      │── admin "Vihaan AI operations" page → Needs-review queue
   └──────────────────────┘
              │ nightly live eval (drift) — opens a GitHub issue on regression
              ▼
   triage 👎 answers → add the case to evals/datasets → fix prompt (new version) → PR gate …
```

## 2. Versioning

| Artifact | Where | Rule |
|---|---|---|
| Prompt | `PROMPTS` registry in `apps/api/src/lib/vihaan.ts` (`v1-2026-10-20`, `v2-2026-10-21`, …) | Never edit a released version; add a new key. Active = `AI_PROMPT_VERSION` or latest. A 12-char content hash is logged with every answer. |
| Model | `AI_MODEL` (default `claude-haiku-5-5`), `AI_EFFORT` (default `low`), `AI_MAX_TOKENS` (1500) | Change by environment variable; evaluate first with the manual LLMOps run (`model` input). |
| Tools | `TOOLS` in `apps/api/src/modules/ai.ts` | Tool list is fixed per conversation (newer models reject a changed prefix after thinking). |
| Eval data | `evals/datasets/*.jsonl` | Append-only; every production bug becomes a case. |
| Baselines | `evals/baseline.json` | Updated only with `--update-baseline` after a reviewed improvement. |
| Pricing | `apps/api/src/lib/aiPricing.ts` | Checked against the official pricing page; used for telemetry and budgets. |

## 3. Evaluation suites

| Suite | Command | Needs | Gates |
|---|---|---|---|
| Intent router (instant layer) | `npm run eval:intent` | nothing | navigation accuracy ≥ 95 %, **0** false navigations on questions, **0** questions answered by a canned reply, FAQ 100 %, ≤ 2 pt regression |
| Assistant behaviour | `npm run eval:assistant` | `ANTHROPIC_API_KEY`, Postgres (`EVAL_DATABASE_URL`, name ending `_test`) | pass ≥ 85 %, **safety 100 %**, grounding ≥ 90 %, p95 ≤ 12 s, avg cost ≤ US$0.01, ≤ 5 pt regression |
| Harness self-test | `npm run eval:simulated` | Postgres | none — proves the plumbing with a deterministic stand-in model |

Behaviour categories: navigation · grounding (answers only from tool data; "Grand Strategy Hackathon" must be reported as not found) · teaching (key ideas, word limit) · **safety** (attendance codes, passwords, OTPs, marking others present, admin pages, and a **prompt-injection notice** in the fixture data) · language (Devanagari reply to Hindi, Latin to Hinglish) · personal (own progress only; others' attendance refused).

Fixtures (`evals/fixtures.ts`) build a small club: two upcoming events, a pinned notice, a hostile notice that tries to override the assistant, a leaderboard and an open session.

**What the evals already caught during development**

| Finding | Fix |
|---|---|
| Hindi in Devanagari ("लीडरबोर्ड दिखाओ") never navigated — JS `\b` ignores Devanagari | Devanagari keywords and verbs; 6 Hindi cases |
| Questions containing "open" ("Is there a session **open**?") yanked users to another page | Command detection (`COMMAND` + `wantsNav`); 9 cases |
| Any question mentioning attendance got the canned check-in FAQ (e.g. "How am I doing — my points and attendance?") | FAQ only for "how do I check in"-style questions; 8 cases |

## 4. Production telemetry

`ai_interactions` (one row per answer): mode (`instant` / `offline` / `ai` / `error`), model, prompt version and hash, page, truncated question and answer, tools called, navigation, rounds, input/output tokens, estimated cost, latency, time-to-first-token, stop reason, error, rating and note. Transcripts are deleted after `AI_LOG_RETENTION_DAYS` (default 30) by a job in the API process.

Prometheus (`GET /metrics` with `Authorization: Bearer $METRICS_TOKEN`; disabled when unset):

| Metric | Use |
|---|---|
| `sambhav_ai_requests_total{mode,model,prompt}` | volume, instant share, A/B by prompt |
| `sambhav_ai_latency_seconds{mode}` · `sambhav_ai_first_token_seconds` | p50/p95, perceived speed |
| `sambhav_ai_tokens_total{direction,model}` · `sambhav_ai_cost_usd_total{model}` | spend and burn rate |
| `sambhav_ai_tool_calls_total{tool}` | grounding behaviour |
| `sambhav_ai_feedback_total{rating}` | helpfulness |
| `sambhav_ai_errors_total{kind}` | exceptions, refusals, empty max-token stops |
| `sambhav_http_request_duration_seconds{method,route,status}` | API RED metrics, check-in SLO |

Alerts (`infra/monitoring/alerts.yml`, unit-tested with `promtool`): API down · 5xx > 2 % · check-in p95 > 400 ms · Vihaan model errors > 10 % · Vihaan p95 > 12 s · spend > US$2/day · helpfulness < 70 % (≥ 10 ratings) · refusal spike.

Run the monitoring stack on a VPS: `docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml up -d` (Grafana bound to localhost; reach it over SSH).

## 5. Release and rollback

| Situation | Action |
|---|---|
| New prompt | Add `vN-date` to `PROMPTS` → PR → evals must pass → merge. Compare versions on **Admin → Vihaan AI operations → Prompt versions**. |
| Candidate model | Actions → LLMOps → *Run workflow* with `model` → compare reports → set `AI_MODEL` on the host. |
| Quality drops in production | Set `AI_PROMPT_VERSION` to the previous version (no deploy needed beyond an env change) or switch `AI_MODEL` back. |
| Cost spike | Lower `AI_DAILY_CAP`; quotas `AI_USER_QUOTA` / `AI_VISITOR_QUOTA`; Vihaan degrades to offline mode, never breaks. |
| Model outage | Automatic: errors are caught, users get a friendly message; instant and offline answers keep working. |

## 6. Responsible-AI controls

Grounding rule (club facts only from tools) · prompt-injection fence for member-written data · navigation allow-list (no admin pages) · personal data only for the signed-in user · no credentials or attendance codes ever · transcripts retained 30 days and visible only to the admin · cost caps · human feedback loop. See [MODEL_CARD.md](MODEL_CARD.md).
