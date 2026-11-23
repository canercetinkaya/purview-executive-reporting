FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/api/package.json apps/api/

RUN npm install --workspace=packages/domain --workspace=apps/api --include-workspace-root

COPY packages/domain packages/domain
COPY apps/api apps/api

RUN npm run build --workspace=packages/domain && npm run build --workspace=apps/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json ./
COPY packages/domain/package.json packages/domain/
COPY packages/domain/dist packages/domain/dist
COPY apps/api/package.json apps/api/
COPY apps/api/dist apps/api/dist

RUN npm install --omit=dev --workspace=packages/domain --workspace=apps/api --include-workspace-root && npm cache clean --force

USER appuser
EXPOSE 4010
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:4010/health || exit 1
CMD ["node", "apps/api/dist/server.js"]
