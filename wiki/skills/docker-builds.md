# Docker Builds Skill

Authoritative, invokable copy: `.claude/skills/docker-builds/SKILL.md`. This page
is the wiki-linked summary.

UXTweet ships **two** multi-stage images, both built from the repo root:

## api (`apps/api/Dockerfile`)

- Build stage: `node:24.22.1-alpine`, pnpm pinned via `corepack prepare pnpm@9.15.0`.
  Copy manifests + lockfile first, `pnpm install --frozen-lockfile`, then source;
  build `@uxtweet/shared` then the server (`tsup`).
- Runtime stage: fresh `node:24.22.1-alpine`, `pnpm install --frozen-lockfile --prod --ignore-scripts`
  (dev deps pruned), copy only `packages/shared/dist` + `apps/api/dist`. Run as
  the non-root `node` user: `node apps/api/dist/server.js`.

## web (`apps/web/Dockerfile`)

- Build stage as above; `quasar build` emits `apps/web/dist/spa`.
- Runtime stage: `nginxinc/nginx-unprivileged:1.27-alpine` serving the static SPA
  — **no Node, no `node_modules`**, runs non-root and listens on **8080** (so the
  pod can run with `readOnlyRootFilesystem`; see ADR-0013). `nginx.conf` does SPA
  fallback + long-cache for hashed assets.

## Rules

1. Build toolchain never reaches the runtime image.
2. Copy only runtime artifacts.
3. Server prunes to prod deps; web carries none.
4. Pin base images by minor and pnpm to `packageManager`.
5. Copy manifests before source so the install layer caches on lockfile changes.
6. Keep `.dockerignore` tight (excludes `node_modules`, `dist`, `.turbo`,
   `.quasar`, `coverage`, `infra/`, `wiki/`, `scripts/`, `.git`, env/logs).
7. Both images install `--frozen-lockfile` — a dependency change must land with a
   regenerated `pnpm-lock.yaml` (see `locked-versions.md`) or the build fails.

Images are tagged with the git SHA by `scripts/build.sh`; see `Operations.md`.
