FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/game-core/package.json packages/game-core/
COPY apps/web/package.json apps/web/
RUN npm i -g npm@11 && npm ci --workspace @sambhav/game-core --workspace @sambhav/web --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/game-core packages/game-core
COPY apps/web apps/web
RUN npm run build -w @sambhav/game-core && npm run build -w @sambhav/web

FROM nginx:1.27-alpine
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
