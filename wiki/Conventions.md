# Conventions

Project-specific rules. Cross-cutting summary lives in `CLAUDE.md`; the
authoritative detail lives in the [[wiki]]-linked skill files.

## Naming

- `kebab-case` — folders, packages, `data-cy` attributes.
- `camelCase` — variables, functions, composables (`useChat`).
- `PascalCase` — Vue components, TypeScript types, classes.
- `UPPER_CASE` — module-level constants (`HISTORY_LIMIT`, `RECONNECT_DELAY_MS`).

## Structure

- One component per `.vue` file; one class/concern per `.ts` file.
- Max **300 lines** per `.ts`/`.vue` source file (tests excluded).
- Server stays hexagonal: `transport/` ⟶ `domain/` ⟶ `storage/`, dependencies
  point inward only. See [[fastify-websockets]].
- Shared protocol types live only in `@uxtweet/shared`. See [[Domain]].

## Code style

- Always brace `if`; prefer early returns over nested `if/else`.
- **No multiline or nested ternaries** — use `if`/`else` or extract a function.
- Do not prefix functions with `handle*`; reserve `on*` for props/emit handlers.
- **Named exports only** in `.ts`; no `export *`. `export default` only where a
  framework requires it (Vue SFC, `quasar.config.ts`).
- Prefer relative imports within a package; cross-package only via
  `@uxtweet/shared` — never deep-import another package's `src`.
- `import type { … }` for type-only imports (`consistent-type-imports: error`).

## TypeScript

- Strict base config (`tsconfig.base.json`); don't loosen it.
- `any` is banned. Narrow `unknown` with explicit type guards (see
  `WebSocketHandler.isClientMessage`). See [[typescript]].

## Testing

- Vitest everywhere. Tests are **co-located** in a `__tests__/` folder beside the
  file under test (e.g. `src/domain/__tests__/ConnectionManager.test.ts`) — no
  top-level `tests/` dir. Client tests use `@vue/test-utils` + jsdom. End-to-end
  flows live in the root `e2e/` Playwright workspace. See [[testing]].

## Dependencies

- Exact pinned versions; regenerate and commit `pnpm-lock.yaml` on any manifest
  change. See [[locked-versions]].

## Security

- Treat every inbound WebSocket frame as untrusted: parse → type-guard → validate.
- Never log secrets or full tokens.

## Commits

- Branch `<type>/<ticket>`; commit `<type>: <ticket> <description>` (Conventional
  Commits). See `.github/git-commit-instructions.md`.
