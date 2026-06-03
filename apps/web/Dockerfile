# ── Build stage ──────────────────────────────────────────────────────────────
# Node 24 (satisfies @quasar/app-vite's Node 22.22+ floor). Runtime stage below is nginx-only.
FROM node:24-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

RUN pnpm --filter @uxtweet/shared build
RUN pnpm --filter @uxtweet/web build

# ── Runtime stage (nginx) ────────────────────────────────────────────────────
# Unprivileged variant: runs as uid 101, listens on 8080, and keeps its pid +
# temp paths under /tmp — so the pod can run non-root with a read-only root FS.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runner

COPY --from=builder /app/apps/web/dist/spa /usr/share/nginx/html

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
