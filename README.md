# Sambhav — Game Theory & Strategy Society

[![CI](https://github.com/udbhav968-creator/SAMBHAV_CLUB_WEBSITE/actions/workflows/ci.yml/badge.svg)](https://github.com/udbhav968-creator/SAMBHAV_CLUB_WEBSITE/actions/workflows/ci.yml)
[![Security](https://github.com/udbhav968-creator/SAMBHAV_CLUB_WEBSITE/actions/workflows/security.yml/badge.svg)](https://github.com/udbhav968-creator/SAMBHAV_CLUB_WEBSITE/actions/workflows/security.yml)
[![LLMOps](https://github.com/udbhav968-creator/SAMBHAV_CLUB_WEBSITE/actions/workflows/llmops.yml/badge.svg)](https://github.com/udbhav968-creator/SAMBHAV_CLUB_WEBSITE/actions/workflows/llmops.yml)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/udbhav968-creator/SAMBHAV_CLUB_WEBSITE)

Full-stack club platform: a game-theory **Arena**, a learning-management layer with Bloom-tagged assessments, events, **TOTP/QR attendance run by the club admin**, member records, a live leaderboard, and **Vihaan** — an animated AI robot guide that navigates the site and answers questions, operated with a full LLMOps pipeline.

| Layer | Stack |
|---|---|
| Web | React 18 · TypeScript · Vite 6 · React Router 7 · React Query · Socket.IO client · installable PWA |
| API | Node 22 · Express 4 · Drizzle ORM · PostgreSQL 16 · Redis 7 · Socket.IO (Redis adapter) · Zod · JWT · Prometheus metrics |
| AI | Claude (default `claude-haiku-5-5`) via streaming tool use · instant router · offline mode · versioned prompts |
| Shared | `@sambhav/game-core` — tested engines for roulette, Prisoner's Dilemma, Nash, auctions, ultimatum, RPS, level-k, provably-fair RNG |
| Quality | ESLint · strict TypeScript · Vitest (unit, integration, coverage gates) · Playwright end-to-end · eval suites |
| Ops | Single-container image · Render Blueprint · VPS + Caddy HTTPS · GHCR releases · Prometheus + Grafana + alerts · nightly backups · k6 |

## Deploy

| Route | Steps |
|---|---|
| **Push the code first** | See [PUSH_TO_GITHUB.md](PUSH_TO_GITHUB.md) (GitHub Desktop, command line or VS Code). |
| **Render (recommended)** | Click **Deploy to Render** above → fill the prompted secrets (admin password, admin mobile, SMS key, Anthropic key, site URL). Postgres and Key Value are created for you. |
| **VPS / university server** | `sh scripts/gen-env.sh` → edit `.env` → `docker compose -f docker-compose.prod.yml up -d --build` (automatic HTTPS). Add `-f docker-compose.monitoring.yml` for Prometheus + Grafana. |

Full guide, costs, go-live checklist and rollback: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## Run locally

```bash
npm i -g npm@11 && npm ci
docker compose up -d postgres redis
cp .env.example apps/api/.env          # then: sh scripts/gen-env.sh for real secrets
npm run db:migrate && npm run db:seed
npm run dev:api                        # http://localhost:4000
npm run dev:web                        # http://localhost:5173
```

## Quality gates (all run in CI)

| Command | What it checks |
|---|---|
| `npm run lint` | ESLint (TypeScript + React hooks) |
| `npm run typecheck` | Strict TypeScript across packages |
| `npm run coverage` | 19 engine + 60 API tests with coverage thresholds (needs `TEST_DATABASE_URL`) |
| `npm run test -w @sambhav/web` | XSS-safe chat formatting, SSE parsing, palette → Vihaan hand-off |
| `npm run e2e` | 12 Playwright journeys: every page for visitor/member/admin on desktop and phone, live attendance between two browsers, OTP password change, lockout, Vihaan |
| `npm run eval:intent` | Vihaan instant-router golden set (106 cases, EN/Hinglish/Devanagari) |
| `npm run eval:assistant` | Live-model behaviour eval (28 cases incl. prompt injection) — needs `ANTHROPIC_API_KEY` |
| `k6 run infra/k6/checkin-burst.js` | 500-member check-in burst, p95 < 400 ms (staging) |

## Attendance administrator

| | |
|---|---|
| Who runs attendance | Only the **ADMIN** account (username `udbhav`). Coordinators and members cannot create sessions, see codes, mark or export. |
| First sign-in | `ADMIN_PASSWORD` is seeded once. In production, admin tools stay **locked until it is changed** if it is a short PIN. |
| Changing the password | Current password **+** 6-digit OTP texted to the admin's registered mobile (`ADMIN_PHONE`, kept in host secrets). Nobody else can change it. |
| Admin dock | Bottom-right on attendance pages: Take attendance · Roll call · Sessions · Reports · Defaulters · Security. |
| Anti-proxy option | `CHECKIN_ALLOWED_CIDRS` restricts check-in to campus Wi-Fi. |

## Vihaan, the AI guide

Animated robot (bottom-left, **Alt + V**, or Ctrl K → "Ask Vihaan"). Opens pages on request (English, Hinglish, Hindi), explains game theory, answers club questions only from live data, speaks and listens, and asks for 👍/👎 on every answer. Without an API key it keeps working in offline mode.

**LLMOps:** versioned prompt registry · eval gates on every AI PR · nightly drift eval that opens an issue on regression · per-answer telemetry (tokens, cost, latency, tools, prompt version) · feedback loop with an admin review queue (**Admin → Vihaan AI operations**) · Prometheus metrics, Grafana dashboard and alerts · quotas and a daily budget cap · 30-day transcript retention. Details: [docs/LLMOPS.md](docs/LLMOPS.md) · [docs/MODEL_CARD.md](docs/MODEL_CARD.md).

## Security

Strict CSP and security headers · bcrypt-12 · pinned-algorithm JWTs with instant revocation · rotating refresh tokens with reuse detection · lockouts and NAT-safe rate limits · SMS-OTP password changes · audit log · CodeQL, dependency review, gitleaks, Trivy, SBOM, Dependabot · non-root, read-only containers. See [SECURITY.md](SECURITY.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Documentation

| Document | Contents |
|---|---|
| [docs/DEPLOY.md](docs/DEPLOY.md) | Render, VPS and container deployment; checklist; rollback |
| [docs/LLMOPS.md](docs/LLMOPS.md) · [docs/MODEL_CARD.md](docs/MODEL_CARD.md) | AI lifecycle, evals, telemetry, monitoring, responsible-AI controls |
| [docs/VIHAAN.md](docs/VIHAAN.md) | AI guide architecture and tools |
| [SECURITY.md](SECURITY.md) · [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) | Controls, reporting, STRIDE threat model |
| [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) · [docs/API.md](docs/API.md) | Data model, sequence diagrams, REST/SSE/WebSocket reference |
| [docs/ROADMAP.md](docs/ROADMAP.md) · [docs/DESIGN.md](docs/DESIGN.md) | Improvement roadmap; visual system |

## Repository layout

```
apps/api/            Express API — src/{modules,lib,middleware,realtime,db}, drizzle/ migrations, test/
apps/web/            React app — src/{pages,components,api,auth,lib}, public/ (PWA, SEO), test/
packages/game-core/  shared game engines + tests
e2e/                 Playwright end-to-end suite (boots a throwaway full stack)
evals/               Vihaan eval datasets, runners, thresholds, baseline
infra/               nginx, Caddy, k6 load test, monitoring (Prometheus, alerts, Grafana)
.github/workflows/   ci · security · llmops · release
```

All casino-style games use virtual credits only.
