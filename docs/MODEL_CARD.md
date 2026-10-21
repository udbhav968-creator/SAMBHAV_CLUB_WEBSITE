# Model card — Vihaan (Sambhav AI guide)

| | |
|---|---|
| **System** | Two-layer assistant: a deterministic instant router (navigation + FAQ) in front of an LLM tool-use loop |
| **Model** | Anthropic Claude via the Messages API — default `claude-haiku-5-5`, effort `low`, ≤ 1,500 output tokens per round, ≤ 5 tool rounds |
| **Prompt** | Versioned registry; current `v2-2026-10-21` (adds prompt-injection fence over v1) |
| **Owner** | Sambhav tech lead · reviewed by the attendance administrator |
| **Intended users** | Club members and visitors on the Sambhav website (students) |

## Intended use

Open pages on request; explain game theory, probability and decision science with short worked examples; answer questions about the club **only** from live data returned by tools (events, notices, leaderboard top 3, open sessions, the signed-in member's own progress).

## Out of scope

Marking attendance or revealing attendance codes · passwords, OTPs or any account action · other members' personal data · academic grading decisions · real-money gambling advice (all games use virtual credits) · medical, legal or financial advice.

## Tools

| Tool | Data | Guardrail |
|---|---|---|
| `navigate` | — | allow-list of public pages; admin routes impossible |
| `get_club_snapshot` | upcoming events, latest notices, top 3, open sessions | read-only; member-written text treated as untrusted data |
| `search_site` | modules, games, events | read-only |
| `get_my_progress` | caller's own points, rank, attendance | user id from the JWT, never from the model |

## Evaluation

| Suite | Size | Latest result | Gate |
|---|---|---|---|
| Intent router (offline) | 106 cases · EN / Hinglish / Devanagari | 100 % · 0 false navigations · 0 hijacks | see [LLMOPS.md](LLMOPS.md) |
| Assistant behaviour (live) | 28 cases · 6 categories incl. prompt injection | Runs in CI once `ANTHROPIC_API_KEY` is configured; report in `evals/reports/assistant.md` | safety 100 %, pass ≥ 85 % |

## Known limitations

- The keyword router covers common phrasings; unusual ones fall through to the model (slower, costs a little), or to offline search without a key.
- The live preview site (claude.ai artifact) has no multiplayer Live Arena page, so "open the live arena" opens the Arena there.
- Answers can still be imperfect; members can rate every answer and the admin reviews 👎 cases weekly.
- Hindi quality depends on the model; Devanagari replies are checked by eval but not human-rated at scale.

## Data and privacy

Questions and answers are stored truncated (500 / 2,000 chars) with the page, tools used, tokens, cost and rating, for `AI_LOG_RETENTION_DAYS` (default 30), visible only to the admin. Request data is sent to Anthropic for inference under its API terms. No passwords, OTPs or codes are ever placed in prompts.

## Cost

Instant answers cost nothing. With Haiku 5.5 (US$0.10 / 0.50 per million input / output tokens, checked 2026-10-21), a typical tool-using answer is a fraction of a US cent. Hard ceilings: `AI_DAILY_CAP` model calls per day, per-user and per-IP quotas, and a Prometheus alert above US$2/day.
