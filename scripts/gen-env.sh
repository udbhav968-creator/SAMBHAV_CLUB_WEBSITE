#!/usr/bin/env sh
# Creates .env with fresh random secrets (won't overwrite an existing file).
set -e
[ -f .env ] && { echo ".env already exists — leaving it untouched"; exit 0; }
r() { openssl rand -hex 32; }
sed -e "s/^JWT_ACCESS_SECRET=.*/JWT_ACCESS_SECRET=$(r)/" \
    -e "s/^JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$(r)/" \
    -e "s/^ATTENDANCE_KEY=.*/ATTENDANCE_KEY=$(r)/" \
    -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 12)/" .env.example > .env
echo "Wrote .env — change ADMIN_PASSWORD before first start."
