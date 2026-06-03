# Fastify + WebSockets Skill

Conventions for the `apps/api` Fastify + `@fastify/websocket` service. The
server is **hexagonal** — guard the layer boundaries.

## Layers (dependencies point inward only)

```
transport/  ──▶  domain/  ──▶  storage/ (IMessageStore port)
  (sockets)      (logic)        (adapters)
```

- **`transport/WebSocketHandler.ts`** — the **only** file that imports
  `@fastify/websocket` or touches a raw socket. It registers `/ws`, assigns each
  connection a UUID `clientId`, sends `welcome`, parses + type-guards inbound
  frames, and removes the client on `close`/`error`.
- **`domain/`** — `ConnectionManager` (connection registry + `send`/`broadcast`/
  `count`) and `MessageService` (validation, persistence, in-process event bus).
  **No Fastify, no `@fastify/websocket`, no socket types beyond the handle.**
- **`storage/`** — `IMessageStore` is the port. `PostgresMessageStore` is the only
  store (durable history with 30-day retention; `DATABASE_URL` is required) and
  `RedisMessageBus` optionally fans messages out across pods. They are wired in
  `buildApp`, never referenced from `transport/`. Tests inject a `FakeMessageStore`
  via `buildApp({ store })` so they need no database (see [[Decisions]] ADR-0012).

If you find yourself importing a transport type into `domain/` or `storage/`, the
boundary is wrong — pass a plain value or a domain type instead.

## App assembly

- **`app.ts:buildApp()`** constructs and wires everything and returns the Fastify
  instance **without listening**. **`server.ts`** reads `PORT`/`HOST`, calls
  `listen`, and traps SIGTERM/SIGINT to `app.close()` so k8s rollouts flush
  Postgres/Redis via the `onClose` hook. Keep them split so tests build the app
  in-process.
- Register the WS plugin with explicit limits (`maxPayload` 64 KiB, `backlog` 10000) — these are defence-in-depth around the domain's 2000-char rule, not the
  source of truth.
- Keep a `/health` route returning `{ status: 'ok' }` for k8s probes.

## Protocol & validation

- All frame shapes come from `@uxtweet/shared` (`ClientWsMessage` /
  `ServerWsMessage`). Never define a frame inline in the server.
- **Every inbound frame is untrusted.** Parse JSON in a `try/catch`, then narrow
  with an explicit type guard (`isClientMessage`) before use. Reply to bad input
  with an `error` frame; never throw across the socket boundary.
- Message content rules (non-empty, ≤2000 chars) live in
  `MessageService.createMessage` — one place. Add new rules there, not in the
  transport or the client.

## Broadcasting

- `ConnectionManager.broadcast` skips non-OPEN sockets and serializes once.
- On every membership change (connect/close) re-broadcast `user_count`. On a new
  message, broadcast the `chat` frame then `user_count`.

## Caveats

- History is always persisted in PostgreSQL (dev included — `pnpm dev` starts it
  via Docker Compose). Live broadcast is per-process unless `REDIS_URL` is set:
  cross-pod fan-out comes from the optional Redis bus wired in `buildApp` (see
  `Decisions.md` ADR-0009 and ADR-0012). Do not assume one pod's connections see
  another's without the bus.
- The server is ESM (`"type": "module"`), built with `tsup`. Keep imports
  ESM-clean.
