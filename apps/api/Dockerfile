# syntax=docker/dockerfile:1.7
# Build context = monorepo root

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS builder
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
# Prisma schema must be present before `pnpm install` runs the api's
# `postinstall: prisma generate` hook. Schema changes already invalidate the
# generated client, so it's fine for them to bust the install layer too.
COPY apps/api/prisma ./apps/api/prisma
# api depends on these workspace packages — their manifests must be present
# for the frozen install to resolve the workspace graph.
COPY packages/shared/package.json ./packages/shared/
COPY packages/harness-core/package.json ./packages/harness-core/
COPY packages/harness-templates/package.json ./packages/harness-templates/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @devgarden/api... --prefer-offline
COPY packages/shared ./packages/shared
COPY packages/harness-core ./packages/harness-core
COPY packages/harness-templates ./packages/harness-templates
COPY apps/api ./apps/api
# These workspace packages ship built dist/, not raw .ts — the api's compiled
# output does `require('@devgarden/...')` at runtime and Node 22 won't strip
# types under node_modules. Build each (in dependency order) before the api so
# its dist is in place. harness-templates' build also copies its yaml catalog
# into dist/.
RUN pnpm --filter @devgarden/shared build
RUN pnpm --filter @devgarden/harness-core build
RUN pnpm --filter @devgarden/harness-templates build
RUN pnpm --filter @devgarden/api build
RUN pnpm --filter @devgarden/api deploy --prod /out && \
    rm -rf /out/dist && \
    cp -R apps/api/dist /out/dist && \
    # `pnpm deploy` rebuilds /out/node_modules from scratch and drops the
    # generated `.prisma/client/` from the builder's hoisted store. Re-run
    # generate inside /out so the runtime image's @prisma/client is wired up.
    cd /out && ./node_modules/.bin/prisma generate

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /out ./
EXPOSE 3001
USER node
# `migrate deploy` is idempotent on already-applied migrations, so running it
# on every boot is safe and keeps the schema in sync after upgrades.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
