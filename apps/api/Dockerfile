# ---- build ----
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/game-core/package.json packages/game-core/
COPY apps/api/package.json apps/api/
RUN npm i -g npm@11 && npm ci --workspace @sambhav/game-core --workspace @sambhav/api --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/game-core packages/game-core
COPY apps/api apps/api
RUN npm run build -w @sambhav/game-core && npm run build -w @sambhav/api \
 && npm prune --omit=dev --workspace @sambhav/game-core --workspace @sambhav/api

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /repo
# The app starts with plain `node`; drop the package managers bundled in the base image (they carry their
# own dependency CVEs and are an attack surface the runtime never needs).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
 && addgroup -S app && adduser -S app -G app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/game-core/package.json packages/game-core/
COPY --from=build /repo/packages/game-core/dist packages/game-core/dist
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/drizzle apps/api/drizzle
WORKDIR /repo/apps/api
USER app
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1
ENV HOME=/tmp
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/db/seed.js && exec node dist/server.js"]
