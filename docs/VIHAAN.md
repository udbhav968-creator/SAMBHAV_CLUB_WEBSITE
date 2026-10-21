# Vihaan — the AI robot guide

Vihaan is an animated robot (bottom-left on every page) that **navigates the site** and **answers questions** as a chatbot, grounded in the club's live data.

## What it does

| Capability | Example | How |
|---|---|---|
| Navigate | "take me to roulette", "leaderboard dikhao", "open GT-102" | Instant intent router (no model call) or the `navigate` tool → client routes |
| Teach | "explain Nash equilibrium with an example" | Model answer + link to the matching module / Arena game |
| Club facts | "what's on this week?", "who's leading?" | `get_club_snapshot` tool → real events, notices, top 3, open sessions |
| Find content | "anything on auctions?" | `search_site` tool → modules, games, events with page paths |
| Personal | "how am I doing?" | `get_my_progress` → points, rank, attendance of **the signed-in user only** |
| Voice | Mic button / "Speak replies" | Web Speech recognition (en-IN) in, `speechSynthesis` out (Hindi voice when the reply is in Devanagari) |
| Shortcuts | Alt + V; Ctrl K → "Ask Vihaan: …" | Global event `open-vihaan` |

## Architecture

```
React widget (components/Vihaan.tsx)
   │  POST /api/v1/ai/chat  {messages[≤16], page}     Authorization: Bearer <access> (optional)
   ▼
Express aiRouter (modules/ai.ts) ── SSE ──►  delta · action{navigate} · tool{name} · done{mode} · error
   ├─ 1. intentOf()     → obvious navigation / FAQ        mode = instant   (free, < 10 ms)
   ├─ 2. no key / quota → offlineAnswer() from live DB     mode = offline   (free)
   └─ 3. LlmPort.round() tool loop (≤ 5 rounds)           mode = ai
          tools: navigate · get_club_snapshot · search_site · get_my_progress
          LlmPort = Anthropic SDK streaming (lib/llm.ts); tests inject a scripted fake
```

| Design choice | Why |
|---|---|
| SSE over `fetch` (not `EventSource`) | Needs POST + the Authorization header; works through Caddy/Nginx with buffering off |
| Port interface for the model | Deterministic tests of the tool loop without network or cost |
| Instant router before the model | Most widget traffic is navigation; answers in milliseconds at zero cost |
| Last round has no tools | Guarantees the loop ends with a text answer |
| Tool errors returned as `is_error` results | The model can recover ("that page doesn't exist") instead of the request failing |
| Server-side page allow-list | The model can only navigate to public pages in `PAGES`; admin routes are unreachable |

## Safety and cost controls

| Control | Setting |
|---|---|
| Grounding | System prompt: answer club questions **only** from tool results; never invent people, dates or scores |
| Secrets | Never asks for or reveals passwords, OTPs or attendance codes; cannot mark attendance |
| Privacy | `get_my_progress` uses the authenticated user id from the JWT — never a model-supplied id |
| Request limit | 300 chat requests / 10 min per user or IP |
| Model quota | `AI_USER_QUOTA` (30 / 10 min per signed-in user), `AI_VISITOR_QUOTA` (200 / 10 min per IP — a campus shares one NAT) |
| Budget | `AI_DAILY_CAP` model calls per UTC day across the site; beyond it Vihaan answers in offline mode |
| Input bounds | ≤ 16 messages, ≤ 2,000 chars each, last message must be from the user; `AI_MAX_TOKENS` per round |

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Unset → offline mode |
| `AI_MODEL` | `claude-haiku-5-5` | Fast, low-cost; switch to a larger model for deeper tutoring |
| `AI_EFFORT` | `low` | Sent only to models that support effort |
| `AI_MAX_TOKENS` | 1500 | Per model round (thinking counts toward it) |
| `AI_PROMPT_VERSION` | latest | Pin or roll back a prompt version |
| `AI_USER_QUOTA` / `AI_VISITOR_QUOTA` / `AI_DAILY_CAP` | 30 / 200 / 3000 | See above |

## Tests (`apps/api/test/ai.test.ts`)

Intent routing (English + Hinglish, questions not hijacked) · validation · instant path never calls the model · offline answers from live data · full tool loop (navigate + snapshot, results fed back, streamed text) · bad tool input reported as an error result · progress tool scoped to the signed-in user · loop cap with tools disabled on the final round · daily budget enforced.

## LLMOps

Versioned prompts, eval gates, telemetry, feedback, dashboards and alerts: [LLMOPS.md](LLMOPS.md) · [MODEL_CARD.md](MODEL_CARD.md).

## Live preview site

The single-file preview (claude.ai artifact) runs the same Vihaan design in the browser, using the viewer's own Claude access with the same four tools; without it, the same instant router and offline answers apply.
