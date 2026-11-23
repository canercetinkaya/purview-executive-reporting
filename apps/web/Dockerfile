FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/
COPY apps/web/package.json apps/web/

RUN npm install --workspace=packages/domain --workspace=apps/web --include-workspace-root

COPY packages/domain packages/domain
COPY apps/web apps/web

ENV API_INTERNAL_URL=http://api:4010
RUN npm run build --workspace=packages/domain && npm run build --workspace=apps/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3010
ENV API_INTERNAL_URL=http://api:4010

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/domain ./packages/domain
COPY --from=builder /app/apps/web ./apps/web

USER appuser
EXPOSE 3010
CMD ["npm", "run", "start", "--workspace=apps/web"]
