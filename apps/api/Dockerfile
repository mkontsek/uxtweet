# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:24.22.1-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace manifests
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Build shared package first, then api
RUN pnpm --filter @uxtweet/shared build
RUN pnpm --filter @uxtweet/api build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:24.22.1-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Prod deps only. --ignore-scripts skips the root `prepare` (husky) hook, which is
# a dev-only tool absent from the runtime tree. Drop the pnpm store cache after so
# its tarballs don't bake into the layer.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts && pnpm store prune

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

EXPOSE 3000

USER node

CMD ["node", "apps/api/dist/server.js"]
