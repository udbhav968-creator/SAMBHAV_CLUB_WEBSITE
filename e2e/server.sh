#!/usr/bin/env sh
# Boots a throwaway full stack for Playwright: fresh *_e2e database → migrations → seed → API serving the built SPA.
set -e
cd "$(dirname "$0")/../apps/api"
export NODE_ENV=development PORT="${E2E_PORT:-4300}" WEB_DIST="$(pwd)/../web/dist"
export DATABASE_URL="${E2E_DATABASE_URL:-postgresql://postgres@127.0.0.1:5432/sambhav_e2e}"
export REDIS_URL="${E2E_REDIS_URL:-}"   # empty → in-memory KV (isolated from other runs)
export JWT_ACCESS_SECRET=e2e-access-secret-0123456789abcdef0123 JWT_REFRESH_SECRET=e2e-refresh-secret-0123456789abcdef012
export ATTENDANCE_KEY=0000000000000000000000000000000000000000000000000000000000000000
export WEB_ORIGIN="http://localhost:${PORT}" ADMIN_USERNAME=udbhav ADMIN_PASSWORD=1234 ADMIN_PHONE=+919000012345 ADMIN_EMAIL=udbhav@e2e.test
export SMS_PROVIDER=console SMS_OUTBOX_FILE="${SMS_OUTBOX_FILE:-/tmp/sambhav-e2e-sms.jsonl}" LOG_LEVEL=warn
: > "$SMS_OUTBOX_FILE"
npx tsx src/db/reset.ts && npx tsx src/db/migrate.ts && npx tsx src/db/seed.ts
exec npx tsx src/server.ts
