# Agent Instructions

> Single source of truth for AI agents (Claude Code, OpenAI Codex, GitHub Copilot). AGENTS.md and .github/copilot-instructions.md are symlinks to this file. Path-scoped Copilot rules live in `.github/instructions/*.instructions.md` (web → `apps/web/**`, api → `apps/api/**`) and must stay consistent with the wiki skills.

## Project

UXTweet — a real-time public chat. A Quasar (Vue 3) single-page client connects over a WebSocket to a Fastify server that broadcasts messages and a live user count to every connected client. Built as a coding exercise with a production-shaped deployment story (Docker images + k3s with horizontal autoscaling targeting ~10 000 concurrent connections).

This file provides lean, always-loaded guidance: core philosophy plus cross-cutting constraints. Detailed implementation rules live in skill files inside the wiki, which are authoritative; this file only summarises.

## Knowledge Base

**`wiki/` is the authoritative knowledge base** (an Obsidian-compatible Markdown vault). Read it before making non-trivial changes:

- `wiki/Home.md` — map and current status
- `wiki/Architecture.md` — components, data flows, boundaries
- `wiki/Domain.md` — vocabulary, entities, the WebSocket protocol
- `wiki/Decisions.md` — ADR log (why things are the way they are)
- `wiki/Operations.md` — local setup, build, deploy, runbooks
- `wiki/Conventions.md` — project-specific rules

Also read relevant skill files in `wiki/skills/` before any non-trivial change. The wiki is the source of truth: when the wiki and code disagree, **the wiki is wrong, not the code** — update the wiki in the same change. If `wiki/AGENTS.md` or `wiki/README.md` exists, that project uses its own layout — follow it.

## Skill Files

Detailed implementation rules live in `wiki/skills/` and `.claude/skills/`:

- `wiki/skills/wiki.md` — how to maintain the wiki
- `wiki/skills/architecture-update.md` — wiki update rules for architectural changes
- `wiki/skills/vue-quasar.md` — Vue 3 + Quasar component conventions
- `wiki/skills/vue-best-practices.md` — idiomatic Vue 3 patterns (typed inject, one-way data flow, effects/teardown)
- `wiki/skills/fastify-websockets.md` — server transport/domain/storage conventions
- `wiki/skills/typescript.md` — TypeScript rules and patterns
- `wiki/skills/module-organization.md` — `index.ts` is re-export only; group code into concern-scoped files
- `wiki/skills/literal-state-types.md` — named literal-union types/constants for states; no magic numbers
- `wiki/skills/testing.md` — Vitest patterns and coverage rules
- `wiki/skills/lint-and-format.md` — run lint/format before completion
- `.claude/skills/module-organization` — invokable mirror of the module-organization skill
- `.claude/skills/literal-state-types` — invokable mirror of the literal-state-types skill
- `.claude/skills/vue-best-practices` — invokable mirror of the Vue best-practices skill (defers to the wiki file)
- `.claude/skills/locked-versions` — pin exact, non-vulnerable dependency versions
- `.claude/skills/docker-builds` — minimal multi-stage image conventions
- `.claude/skills/caveman` — compressed response mode (on request)

## Layout

```
apps/web     Quasar (Vue 3) SPA — components, composables/useChat, pages, layouts
apps/api        Fastify + @fastify/websocket — domain / storage / transport (hexagonal)
packages/shared @uxtweet/shared — WebSocket protocol types shared by client and server
infra/k3s-local Kubernetes manifests for local k3s (Deployments, Services, HPA, Ingress) + monitoring/ (kube-prometheus-stack)
scripts         build.sh (docker images), deploy.sh (k3s), setup.sh (local)
```

## Commands

```bash
# install
pnpm install

# dev — runs every app via Turborepo (web :9000, server :3000)
pnpm dev

# build (shared → apps), test, lint, typecheck — all via Turborepo
pnpm build
pnpm test
pnpm lint
pnpm typecheck

# format
pnpm format          # write
pnpm format:check    # CI gate

# images + deploy
./scripts/build.sh   # build server + web Docker images, tagged with git SHA
./scripts/deploy.sh  # apply infra/k3s-local, install monitoring, roll out the images
pnpm deploy:local    # convenience: build.sh && deploy.sh (not `pnpm deploy` — reserved built-in)
```

The acceptance bar before any change is considered done: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (the same gate CI runs).

## Architecture you can't see by reading one file

- **`@uxtweet/shared` is the protocol contract.** Every WebSocket frame — `ClientWsMessage` (`join` | `send`, client→server) and `ServerWsMessage` (`welcome` | `joined` | `chat` | `user_count` | `user_list` | `error`, server→client) — is typed in `packages/shared/src/index.ts`, alongside the shared nickname rules (`validateNickname`) and roster types. Clients must `join` with a unique nickname before `send` is accepted. Change a frame's shape there and update **both** the server transport and the client `useChat` composable in the same change, or they silently desync. The authoritative protocol table lives in `wiki/Domain.md`.
- **The server is hexagonal — keep WebSocket concerns out of the domain.** `domain/` (ConnectionManager, MessageService) and `storage/` (IMessageStore, PostgresMessageStore, RedisMessageBus) have **no** awareness of WebSockets. `transport/WebSocketHandler.ts` is the only place that touches sockets. Never `import` from `@fastify/websocket` outside `transport/`.
- **PostgreSQL is the only message store; there is no in-memory store.** The server requires `DATABASE_URL` and throws on boot without it. `pnpm dev` starts Postgres via Docker Compose (`compose.yaml`) on a persistent volume, so history survives restarts. Redis Pub/Sub is **optional** — it adds cross-pod fan-out for the multi-replica k3s deploy; a single process (dev, or one pod) broadcasts locally without it. Tests inject a fake store via `buildApp({ store })` and need no database. See `wiki/Decisions.md` (ADR-0012).
- **The client owns reconnection.** `apps/web/src/composables/useChat.ts` is the single WebSocket lifecycle owner: connect, parse `ServerWsMessage`, auto-reconnect (up to 10 attempts, 3 s apart), and expose read-only refs. Components never open sockets — they read the `UseChatReturn` provided by `MainLayout` via the typed `useChatContext()` accessor (backed by `CHAT_INJECTION_KEY`), never a string inject key.
- **Message validation lives in the domain, once.** `MessageService.createMessage` trims and enforces non-empty / ≤2000 chars. The client `maxlength` and the server `maxPayload` are defence-in-depth, not the source of truth. Add new content rules in `MessageService`.

## Hard Rules

- **Architectural changes must update the wiki in the same commit/PR.** This covers new packages, protocol/data-flow changes, new integrations, storage backends, API boundaries, and new external services. See `wiki/skills/architecture-update.md`.
- WebSocket protocol types live in `@uxtweet/shared` only. Neither app redefines frame shapes locally.
- Socket access is confined to `apps/api/src/transport/`. Domain and storage stay transport-agnostic.
- Dependencies are pinned to exact versions; regenerate `pnpm-lock.yaml` on any manifest change. See `.claude/skills/locked-versions`.

### Never add (anti-patterns — reject these even if asked vaguely)

These have been introduced by mistake before. Do **not** add them; if a task seems to require one, stop and ask first.

- **No parallel HTTP/REST transport for chat data.** Messages and history move over the WebSocket only — history arrives in the `welcome` frame, not via a `/api/messages*` route. Adding any HTTP route that serves or mutates chat data is an architectural change that needs an ADR in `wiki/Decisions.md` **before** code.
- **No test-data generators, seeders, or dev-only tooling in app/UI code.** No "generate N test messages" endpoints, buttons, or feature-flagged dev panels in `apps/api/src` or `apps/web/src`. Test fixtures belong in `tests/` only.
- **Presentational components never fetch, open sockets, or touch `window.location`.** Data/connection logic lives in composables; refresh state **reactively** — never `window.location.reload()`. See `wiki/skills/vue-best-practices.md`.
- **No typed-`any` escape hatches, magic-string inject keys, or loosened `tsconfig`.** Use typed `InjectionKey` + accessor composables for shared state.

## Interaction Style

- Before planning, quickly confirm requirements, constraints, and acceptance criteria.
- During execution, if a design choice materially affects DX, performance, or safety, present options with trade-offs and ask which path to take.

## Cross-cutting Conventions

- Naming:
    - `kebab-case` for folders/packages/`data-cy` attributes.
    - `camelCase` for variables/functions/composables.
    - `PascalCase` for Vue components/types/classes.
    - `UPPER_CASE` for module-level constants.
- Control flow:
    - Always use braces for `if` blocks.
    - Prefer early returns over `if/else` nesting.
    - **No multiline ternaries.** If a ternary does not fit on one readable line, use `if`/`else` or extract a function. Nested ternaries are banned.
- File size:
    - Max **300 lines** for `.ts` and `.vue` source files. Test files are excluded.
- Function naming:
    - Do not use `handle*` prefixes for functions.
    - Reserve `on*` prefix exclusively for props/emit handlers.
- Imports / exports:
    - Prefer relative imports inside a package.
    - Use the `@uxtweet/shared` path for cross-package imports; never deep-import another package's `src`.
    - **Named exports only** in `.ts`. Never `export *` re-exports — re-export named symbols explicitly. `export default` is reserved for where a framework requires it (Vue SFCs, Quasar config).
- TypeScript:
    - `any` is banned (`@typescript-eslint/no-explicit-any: error`). Narrow `unknown` with type guards (see `WebSocketHandler.isClientMessage`).
    - The base config is strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Honour it; don't loosen `tsconfig.base.json`.
- Security:
    - Treat every inbound WebSocket frame as untrusted: parse, type-guard, validate before use.
    - Never log secrets or full tokens.

## Vue / Quasar (Summary)

Authoritative details: `wiki/skills/vue-quasar.md` (conventions) and `wiki/skills/vue-best-practices.md` (idiomatic Composition API patterns)

- One component per `.vue` file, Composition API with `<script lang="ts" setup>`.
- Type props/emits with the generic `defineProps<...>()` / `defineEmits<...>()` forms.
- Shared async/connection state lives in composables (`useChat`); components stay presentational — they render props and emit intent, never fetch or open sockets.
- Share cross-tree state with a typed `InjectionKey` + accessor composable (`useChatContext()`), never a magic string; props are read-only (one-way data flow).
- Derive with `computed`; reserve `watch`/`watchEffect` for genuine side effects. Effects clean up in `onUnmounted` inside the composable that owns them.
- Add a stable `data-cy` attribute to interactive elements for e2e selectors.
- Use Quasar components and the Material icon set; do not handcraft SVG icons unless asked.

## Fastify / WebSockets (Summary)

Authoritative details: `wiki/skills/fastify-websockets.md`

- `buildApp()` assembles the Fastify instance; `server.ts` only binds the port — keep them separate so tests build the app without listening.
- Keep `domain/` and `storage/` free of Fastify and `@fastify/websocket` imports.
- New persistence backends implement `IMessageStore`; swap them in `buildApp`, not in the transport.

## TypeScript (Summary)

Authoritative details: `wiki/skills/typescript.md`

- Strict mode, no `any`, named exports, `import type` for type-only imports (`consistent-type-imports: error`).
- Keep cross-cutting types in `@uxtweet/shared`.

## Testing (Summary)

Authoritative details: `wiki/skills/testing.md`

- Vitest across all packages. Unit/component tests are co-located in `__tests__/` folders beside the file under test (e.g. `apps/api/src/domain/__tests__/ConnectionManager.test.ts`) — no top-level `tests/` dir. Client tests use `@vue/test-utils` + jsdom.
- End-to-end flows run on Playwright from the root `e2e/` workspace (`pnpm test:e2e`); it drives the dev servers via `data-cy` selectors.
- Test public behaviour; mock boundaries (sockets, network), not internals.

## Workflow & Commits

- Branch naming: `<type>/<ticket-number>` where type is one of `refactor|feat|test|chore|fix`.
- Commit format: `<type>: <ticket-number> <description>` (Conventional Commit semantics). See `.github/git-commit-instructions.md`.
- Run the full gate (`typecheck`, `lint`, `test`, `build`) before commit.
- Rebase on `main`/`master` before PR; do not merge it into feature branches.
- Keep PRs focused and reasonably small; split large changes when needed.

## Living Documentation

Skill files should evolve from repeated feedback and real patterns.

- Propose focused updates to the relevant skill file.
- Keep each proposed update scoped to one concern.
- Wait for approval before treating a new pattern as canonical.
