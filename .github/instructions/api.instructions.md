---
applyTo: 'apps/api/**'
---

# API (apps/api) — Copilot instructions

Fastify + `@fastify/websocket`, hexagonal. Authoritative detail lives in
`wiki/skills/fastify-websockets.md`. The repo-wide rules in `CLAUDE.md` also apply.

## Architecture (hold the boundaries)

- **Hexagonal layers.** `domain/` (ConnectionManager, MessageService,
  NicknameRegistry port) and `storage/` (IMessageStore + implementations,
  RedisMessageBus, RedisNicknameRegistry) have **no** awareness of WebSockets.
  `transport/WebSocketHandler.ts` is the only place that touches sockets. Never
  `import` from `@fastify/websocket` outside `transport/`.
- `buildApp()` assembles the Fastify instance; `server.ts` only binds the port —
  keep them separate so tests build the app without listening.
- New persistence backends implement `IMessageStore` and are swapped in
  `buildApp`, not in the transport. Same for the `NicknameRegistry` port
  (`LocalNicknameRegistry` / `RedisNicknameRegistry`).
- Content rules live in the shared `messageContentSchema` (Zod);
  `MessageService.createMessage` is the one domain gate that applies them.
  `maxPayload` is defence-in-depth, not the source of truth. Nickname uniqueness is
  claimed/released via the `NicknameRegistry` (per-pod or cross-pod with Redis —
  ADR-0015), not in `ConnectionManager`.

## Never

- **No parallel HTTP/REST transport for chat data.** Messages and history move
  over the WebSocket only — no `/api/messages*` (or similar) routes that serve or
  mutate chat data. Adding one is an architectural change needing an ADR in
  `wiki/Decisions.md` **before** code.
- **No test-data generators, seeders, or dev-only endpoints** (e.g.
  `/dev/generate-test-messages`) in `apps/api/src`. Unit tests are co-located in
  `__tests__/` folders beside the file under test (e.g.
  `src/domain/__tests__/ConnectionManager.test.ts`); fixtures belong there.
- Do not redefine WebSocket frame shapes — import `ClientWsMessage` /
  `ServerWsMessage` from `@uxtweet/shared`.
- No `any`; narrow `unknown` with type guards (`isClientMessage`). Treat every
  inbound frame as untrusted: parse → type-guard → validate. Never log secrets.

Files are max 300 lines (tests excluded). Named exports only. Dependencies pinned
to exact versions; regenerate `pnpm-lock.yaml` on any manifest change.
