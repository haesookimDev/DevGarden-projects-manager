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
COPY packages/shared/package.json ./packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @devgarden/api... --prefer-offline
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm --filter @devgarden/api build
RUN pnpm --filter @devgarden/api deploy --prod /out && \
    rm -rf /out/dist && \
    cp -R apps/api/dist /out/dist

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /out ./
EXPOSE 3001
USER node
CMD ["node", "dist/main.js"]
