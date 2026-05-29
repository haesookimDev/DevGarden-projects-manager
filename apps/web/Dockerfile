# syntax=docker/dockerfile:1.7
# Build context = monorepo root

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS builder
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
COPY packages/harness-core/package.json ./packages/harness-core/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @devgarden/web... --prefer-offline
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
COPY packages/harness-core ./packages/harness-core
COPY apps/web ./apps/web
# The harness editor dynamically imports @devgarden/harness-core, which now
# ships built dist/ — build it before next build so webpack can resolve it.
RUN pnpm --filter @devgarden/harness-core build
RUN pnpm --filter @devgarden/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
EXPOSE 3000
USER node
CMD ["node", "apps/web/server.js"]
