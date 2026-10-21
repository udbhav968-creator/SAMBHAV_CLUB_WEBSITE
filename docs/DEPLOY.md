# Deploying Sambhav

Three supported routes. All use the same single-container image (`Dockerfile` at the repo root): the API serves the built React app, so one service hosts the whole site.

| Route | Best for | Monthly cost (indicative) | HTTPS | Effort |
|---|---|---|---|---|
| **A. Render Blueprint** (`render.yaml`) | Fastest launch, zero server admin | Free tier for a demo; ~US$15–25 for always-on app + DB + Key Value | Automatic | 15 min |
| **B. VPS + Caddy** (`docker-compose.prod.yml`) | University server or a small cloud VM; full control, lowest cost | ₹400–800 VM | Automatic (Let's Encrypt) | 30–45 min |
| **C. Any container platform** (Railway, Fly.io, Cloud Run, Azure Container Apps) | Existing cloud account | Varies | Platform-managed | 30 min |

> Prices and plan names change — confirm on the provider's pricing page before committing.

---

## 0. Before any route

| Item | How |
|---|---|
| Code on GitHub | Push this folder to a GitHub repository (private is fine). |
| Secrets | `sh scripts/gen-env.sh` creates `.env` with random JWT / attendance / DB secrets. |
| Admin | `ADMIN_USERNAME=udbhav`, `ADMIN_PHONE=` the admin's mobile in E.164 (`+91…`) — set it in host secrets, never commit it, `ADMIN_PASSWORD` = initial PIN (seeded once, never overwritten). Change it from **Admin → Security** after the first sign-in. |
| SMS for OTP | India: **MSG91** with a DLT-approved OTP template (`SMS_PROVIDER=msg91`, `SMS_API_KEY`, `SMS_TEMPLATE_ID`, `SMS_SENDER`). Alternatives: `fast2sms`, `twilio`. Without a provider, OTPs only appear in the server log (`console`). |
| Vihaan AI | Create a key at console.anthropic.com → set `ANTHROPIC_API_KEY`. Optional: without it Vihaan runs in offline mode (navigation + FAQ + live club data). Spend is bounded by `AI_DAILY_CAP`. |
| Domain | e.g. `sambhav.<college>.edu` or `sambhav.club`. Then replace `sambhav.example.edu` in `apps/web/index.html`, `public/robots.txt`, `public/sitemap.xml`. |

---

## A. Render (one click)

1. Render dashboard → **New → Blueprint** → select the repository. Render reads `render.yaml` and creates **sambhav** (web), **sambhav-db** (Postgres) and **sambhav-kv** (Key Value).
2. When prompted, fill the `sync: false` values: `WEB_ORIGIN` (e.g. `https://sambhav.onrender.com`), `ADMIN_PASSWORD`, `SMS_API_KEY`, `SMS_TEMPLATE_ID`, `SMS_SENDER`, `ANTHROPIC_API_KEY`.
3. Deploy. The container runs migrations and the idempotent seed, then starts. Health check: `/readyz` (DB + Redis).
4. Custom domain: service → **Settings → Custom Domains** → add the CNAME at your DNS provider → update `WEB_ORIGIN`.
5. Optional CI hook: copy the service's **Deploy Hook URL** into the GitHub secret `RENDER_DEPLOY_HOOK_URL` and set the repository variable `RENDER_DEPLOY_ENABLED=true`.

Free-tier caveat: free web services sleep when idle — the first visit is slow and live Socket.IO rooms drop. Use a paid instance for club nights.

---

## B. VPS / university server

```bash
# on the server (Ubuntu 22.04+/24.04, 1 vCPU / 2 GB RAM is enough for 1,000 members)
curl -fsSL https://get.docker.com | sh
git clone <your-repo> /opt/sambhav && cd /opt/sambhav
sh scripts/gen-env.sh                    # then edit .env: DOMAIN, NODE_ENV=production, SMS_*, ANTHROPIC_API_KEY
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f app
```

| What you get | Detail |
|---|---|
| Caddy edge | Automatic HTTPS + renewals, HSTS, `Permissions-Policy`, unbuffered SSE for Vihaan, WebSocket pass-through |
| App | Single container; scale with `deploy.replicas` — Socket.IO uses the Redis adapter and rate limits live in Redis |
| Data | Postgres 16 + Redis 7 (AOF, `noeviction`) on named volumes |
| Backups | `backup` service writes `./backups/sambhav-YYYY-MM-DD.dump` nightly, keeps 14 days — copy off-box with `rclone` |
| Restore | `docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U sambhav -d sambhav --clean < backups/<file>.dump` |
| Firewall | Open 80/443 only (`ufw allow 80,443/tcp`). Postgres and Redis are not exposed. |

Continuous deployment: `.github/workflows/release.yml` builds `ghcr.io/<owner>/sambhav` on every green `main`. Set `IMAGE=ghcr.io/<owner>/sambhav:latest` in `.env`, add `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` secrets and `VPS_DEPLOY_ENABLED=true` to roll the server automatically.

---

## C. Other container platforms

Build from the root `Dockerfile`, expose port `4000` (or honour the platform's `PORT`), attach managed Postgres (`DATABASE_URL`) and Redis (`REDIS_URL`), and set the variables from `.env.example`. Health path `/healthz` (liveness) and `/readyz` (readiness). The SSE endpoint `/api/v1/ai/chat` must not be buffered by the platform's proxy.

---

## Go-live checklist

| # | Check | Pass when |
|---|---|---|
| 1 | `https://<domain>/readyz` | `{"db":true,"kv":true}` |
| 2 | Admin sign-in as `udbhav` | Lands on the Admin dock; change the PIN with the SMS OTP |
| 3 | OTP | Arrives on the admin's registered mobile within 30 s |
| 4 | Attendance | Start a session, check in from a phone on campus Wi-Fi, see it live on the console |
| 5 | Vihaan | "take me to roulette" navigates; "what's on this week?" lists real events; footer shows **AI mode** when a key is set |
| 6 | PWA | Chrome/Android shows **Install app**; the shell opens offline |
| 7 | Sharing | Paste the URL into WhatsApp — the Open Graph card appears |
| 8 | Load | `k6 run -e BASE=https://staging… infra/k6/checkin-burst.js` meets p95 < 400 ms on a **staging** copy |
| 9 | Backups | A dump exists and a test restore succeeds |
| 10 | Security headers | securityheaders.com grade A |

## Rollback

| Platform | How |
|---|---|
| Render | Service → **Events** → pick the previous deploy → **Rollback** |
| VPS | `IMAGE=ghcr.io/<owner>/sambhav:sha-<previous> docker compose -f docker-compose.prod.yml up -d app` |
| Database | Migrations are forward-only; restore last night's dump if a migration must be undone |
