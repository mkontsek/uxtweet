# Testing Skill

Vitest across every package. Test **public behaviour**; mock **boundaries**
(sockets, network, timers), not internals.

## Where tests live

Unit/component tests are **co-located** with the file under test, in a
`__tests__/` directory beside it, named `<Subject>.test.ts`. Example:
`src/domain/ConnectionManager.ts` → `src/domain/__tests__/ConnectionManager.test.ts`.
There is no top-level `tests/` directory. End-to-end (Playwright) tests are the
exception — they span both apps and live in the root `e2e/` workspace (see
[[../Operations|Operations]]).

- **Server** (`apps/api/src/**/__tests__/`) — unit tests on the domain in
  isolation: `ConnectionManager`, `MessageService`. These need **no** socket and
  **no** database — that is the payoff of the hexagonal split. Drive
  `MessageService` against `FakeMessageStore` (the in-memory `IMessageStore` test
  fixture in `storage/__tests__/`); assert emitted events and stored state.
  Integration tests build the app with an injected store —
  `buildApp({ store: new FakeMessageStore() })` — so they never touch Postgres.
- **Client** (`apps/web/src/**/__tests__/`) — composables and components with
  `@vue/test-utils` + jsdom. `useChat` is tested against a mocked/faked
  `WebSocket`; assert reactive state transitions (`status`, `messages`,
  `userCount`) and reconnect scheduling.
- **Shared** — types only; no runtime tests needed.

## Conventions

- Co-locate each test in a `__tests__/` folder next to the file it covers; the
  source `tsconfig.json` excludes `**/__tests__/**` from the **build**, while
  `tsconfig.eslint.json` includes them. Each package's `typecheck` script runs
  against `tsconfig.eslint.json` (`tsc`/`vue-tsc --noEmit -p tsconfig.eslint.json`),
  so **tests are type-checked too** — a test that compiles only at runtime but
  not under `tsc` fails the gate. Import the subject by its relative path
  (`../ConnectionManager`), not via a package alias.
- One behaviour per `it`; name by behaviour ("evicts oldest beyond capacity"),
  not by method.
- Prefer the real collaborator when it is pure and in-memory (`FakeMessageStore`);
  fake only true boundaries (the socket, `setTimeout`, the network, the database).
- Use Vitest fake timers for reconnect/backoff logic rather than real waits.
- Assert the **contract**: stored messages, emitted `MessageCreatedEvent`,
  broadcast payloads, exposed refs — not private fields.
- Keep tests deterministic: no real network, no real ports, no sleeps.

## Running

```bash
pnpm test                              # all packages via Turborepo
pnpm test:coverage                     # all packages, with coverage, via Turborepo
pnpm --filter @uxtweet/api test        # one package
pnpm --filter @uxtweet/web test:coverage
```

Tests are part of the commit gate and CI (`typecheck → lint → test → build`).
A behavioural change without a matching test is incomplete; a new validation rule
or protocol frame must come with coverage.

## Coverage

`@vitest/coverage-v8` is wired in both apps (`test:coverage`), and `pnpm
test:coverage` at the root fans out across the workspace via Turborepo (output
goes to each package's gitignored `coverage/`). Prioritise the domain
(validation, eviction, broadcast selection) and the client composable (parse,
dispatch, reconnect) — the logic most likely to regress.

Each config scopes the report with `include: ['src/**']` so untested files
still surface (rather than v8's default of only reporting touched files), and
extends `coverageConfigDefaults.exclude` to drop things with no runtime logic of
our own: the `server.ts` entrypoint and the `IMessageStore` type contract
(api); `App.vue`, `boot/**`, and `router/**` framework wiring (web). Test files
and `*.d.ts` are already excluded by the vitest defaults. Coverage is reported,
not gated — there are no enforced thresholds.
