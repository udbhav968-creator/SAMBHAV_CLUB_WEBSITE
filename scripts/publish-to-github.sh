#!/usr/bin/env sh
# Publishes this project to https://github.com/udbhav968-creator/SAMBHAV_CLUB_WEBSITE (run from the project folder).
# Uses YOUR git identity and GitHub login — git opens a browser or asks for a personal access token on first push.
set -e
REPO="${1:-https://github.com/udbhav968-creator/SAMBHAV_CLUB_WEBSITE.git}"
cd "$(dirname "$0")/.."
command -v git >/dev/null || { echo "Install git first: https://git-scm.com/downloads"; exit 1; }
if [ -z "$(git config --global user.name)" ] || [ -z "$(git config --global user.email)" ]; then
  echo "Set your git identity once, then re-run:"; echo '  git config --global user.name  "Your Name"'; echo '  git config --global user.email "you@example.com"'; exit 1
fi
if [ -f .env ]; then echo "Note: .env exists and is ignored by .gitignore — it will NOT be uploaded."; fi
if [ ! -d .git ]; then
  git init -q -b main
  git add -A
  git commit -q -F - <<'MSG'
Sambhav club platform: Arena, LMS, admin attendance, Vihaan AI, LLMOps

- React 18 + Vite web app (PWA) and Express + PostgreSQL + Redis API
- Game-theory Arena, Bloom-tagged learning modules, events, leaderboard
- TOTP/QR attendance run only by the admin, SMS-OTP password changes
- Vihaan AI robot guide (Claude tool use, instant router, offline mode)
- Security hardening, CI (lint, types, coverage, Playwright), security scans
- LLMOps: prompt registry, eval gates, telemetry, feedback, metrics, alerts
- Render Blueprint, VPS + Caddy, GHCR release pipeline, monitoring stack

MSG
  echo "Created the first commit."
fi
git remote get-url origin >/dev/null 2>&1 && git remote set-url origin "$REPO" || git remote add origin "$REPO"
echo "Pushing to $REPO …"
if ! git push -u origin main; then
  echo; echo "Push was rejected. If the GitHub repo already has files (e.g. a README), run:"
  echo "  git pull --rebase origin main --allow-unrelated-histories && git push -u origin main"; exit 1
fi
cat <<'NEXT'

Done. Next steps on GitHub (Settings → Secrets and variables → Actions):
  1. Add secret ANTHROPIC_API_KEY to turn on the live-model Vihaan eval (optional).
  2. Actions tab → enable workflows if GitHub asks. CI, Security and LLMOps run automatically.
Then deploy: open the repo's README and click "Deploy to Render".
NEXT
