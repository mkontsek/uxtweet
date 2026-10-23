---
name: docker-builds
description: Use when changing any Dockerfile, image build, or container runtime entrypoint in UXTweet. Keep images minimal with multi-stage builds, prod-only pruning for the server, and only the runtime files each role needs.
---

# Docker Builds

**Smallest viable image is the goal.** Every change should keep — or make — the
final image smaller. Ship only what the process needs to run; the build toolchain,
dev dependencies, caches, source, and tests never reach the runtime stage.

UXTweet ships two images, both built from the repo root with multi-stage builds:

- **api** (`apps/api/Dockerfile`) — Node 24.22.1 Alpine running `node apps/api/dist/server.js`.
- **web** (`apps/web/Dockerfile`) — static Quasar SPA served by `nginx:1.27-alpine`.

## Rules

1. Build in one stage; run in a slim runtime stage. Never ship the build toolchain.
2. Copy only runtime artifacts into the final image — for the server that is `packages/shared/dist` and `apps/api/dist`; for the web app it is `apps/web/dist/spa` into `/usr/share/nginx/html`.
3. Prune dev dependencies before assembling the server runtime: install with `pnpm install --frozen-lockfile --prod --ignore-scripts` in the runtime stage (the build stage installs the full tree). `--ignore-scripts` is required — the root `prepare` hook runs `husky`, a dev-only tool absent from the prod tree.
4. The web runtime carries **no** Node and **no** `node_modules` — nginx serves pre-built static files only.
5. Pin base images by minor (Node images `node:24.22.1-alpine` — the project floor is Node 24.22.1, which also satisfies `@quasar/app-vite`'s Node 22.22+; `nginx:1.27-alpine`) and pin pnpm via `corepack prepare pnpm@9.15.0` to match `packageManager`.
6. Keep `.dockerignore` tight so the build context excludes `node_modules`, `dist`, `.turbo`, `.quasar`, `coverage`, `infra/`, `wiki/`, `scripts/`, `.git`, and env/log files.
7. Always `COPY` the workspace manifests (`pnpm-workspace.yaml`, root `package.json`, `pnpm-lock.yaml`, and each touched package's `package.json`) **before** source so `pnpm install` layers cache on lockfile changes only.
8. Build `@uxtweet/shared` before the app that consumes it (`pnpm --filter @uxtweet/shared build`).
9. Run the server as the non-root `node` user. Don't add a USER to the nginx image (it drops privileges itself).

## Minimise image size

These are the levers for keeping the images as small as possible; apply all that fit:

- **Alpine bases, pinned by minor** (`node:24.22.1-alpine`, `nginx:1.27-alpine`) — never the full Debian variants.
- **Prod-only deps** in the server runtime (`--prod`), and drop the pnpm store cache after installing so its tarballs don't bake into the layer: `pnpm install --frozen-lockfile --prod && pnpm store prune`.
- **One install layer.** Chain install + cache cleanup in a single `RUN` so the cache never lands in a committed layer.
- **No source or tests in runtime** — copy only built `dist` artifacts, never `src/`, test files, or config the process doesn't read at runtime.
- **Web runtime is nginx + static files only** — no Node, no `node_modules`, no pnpm.
- **Tight `.dockerignore`** keeps the build context (and thus cache-busting and copied bytes) small — see rule 6 below.
- Check the result with `docker image ls` after a build; a regression in size is a signal something leaked into the runtime stage.

## Frozen lockfile contract

Both images install with `--frozen-lockfile`. Any dependency change must land with a regenerated `pnpm-lock.yaml` (see the `locked-versions` skill) or the image build fails.
