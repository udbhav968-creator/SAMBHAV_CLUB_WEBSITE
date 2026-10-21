# Single-container image: API + built SPA served by Express (WEB_DIST).
# Used by render.yaml, Railway/Fly/Cloud Run and docker-compose.prod.yml.
#   docker build -t sambhav .   &&   docker run -p 4000:4000 --env-file .env sambhav

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/game-core/package.json packages/game-core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm i -g npm@11 && npm ci --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/game-core packages/game-core
COPY apps/api apps/api
COPY apps/web apps/web
RUN npm run build -w @sambhav/game-core && npm run build -w @sambhav/api && npm run build -w @sambhav/web \
 && npm prune --omit=dev

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production PORT=4000 WEB_DIST=/repo/web
WORKDIR /repo
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/game-core/package.json packages/game-core/
COPY --from=build /repo/packages/game-core/dist packages/game-core/dist
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/drizzle apps/api/drizzle
COPY --from=build /repo/apps/web/dist web
WORKDIR /repo/apps/api
USER app
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
# Migrate → idempotent seed (never overwrites a changed admin password) → serve.
# Node is PID 1's direct child (no npm wrapper) so SIGTERM reaches it; nothing writes to the image at runtime.
ENV HOME=/tmp
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/db/seed.js && exec node dist/server.js"]
