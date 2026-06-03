# Architecture

## Topology

```
Browser (Quasar SPA)  ──WebSocket──▶  Fastify server  ──▶  MessageService
   useChat composable   /ws frames      transport layer        │
        ▲                                    │                 ├─▶ PostgresMessageStore (always; dev via Docker Compose)
        └──── broadcast (chat, user_count, user_list, welcome) ◀────┘                 └─▶ RedisMessageBus (optional: cross-pod fan-out)
```

In local deployment both tiers run behind k3s Traefik:

```
Browser → Traefik ingress → uxtweet-web (static SPA)
                          └→ uxtweet-api (WebSocket API + /metrics)
                          └→ Grafana (kube-prometheus-stack)
```

## Monorepo layout

- **`packages/shared`** (`@uxtweet/shared`) — the protocol contract. All
  WebSocket frame types live here and are imported by both apps. This is the only
  shared code; it has no runtime dependencies.
- **`apps/api`** — Fastify + `@fastify/websocket`, organised hexagonally: - `transport/WebSocketHandler.ts` — the **only** layer that touches sockets.
  Registers `/ws`, assigns each connection a UUID `clientId`, sends `welcome`
  (history + user count), routes inbound frames, and cleans up on close/error. -
  `domain/ConnectionManager.ts` — tracks live connections (`Map<ClientId,
ConnectedClient>`), `send`/`broadcast` with an optional filter, exposes
  `count`. WebSocket-agnostic beyond holding the socket handle. -
  `domain/MessageService.ts` — message creation/validation, an in-process
  listener bus (`onMessageCreated`), history retrieval. No socket awareness. -
  `storage/IMessageStore.ts` — the persistence port.
  `storage/PostgresMessageStore.ts` is the **only** store (durable history,
  30-day retention; `getHistory` defaults to last 100) — its queries are built
  with the **Kysely** query builder (typed columns, no codegen/engine binary)
  over the injected `pg` Pool; see ADR-0010 — and `storage/RedisMessageBus.ts`
  optionally fans messages out across pods. Tests inject a `FakeMessageStore`
  (under `storage/__tests__/`) so they need no database (ADR-0012). - `app.ts` — `buildApp()` assembles Fastify,
  registers the WS plugin (`maxPayload` 64 KiB, `backlog` 10000), the `/health`
  and `/metrics` routes, and wires the store from `DATABASE_URL` (**required** —
  throws if absent) plus an optional Redis bus from `REDIS_URL`. An injected
  `store` option short-circuits this for tests. `server.ts` binds the port and
  handles SIGTERM/SIGINT by closing the app (flushing Postgres/Redis via the
  `onClose` hook) — tests build the app without listening.
- **`apps/web`** — Quasar (Vue 3) SPA:
    - `composables/useChat.ts` — owns the WebSocket lifecycle: connect, parse
      `ServerWsMessage`, maintain reactive `messages`/`status`/`clientId`/
      `userCount`/`nickname`/`hasJoined`/`joinError`, `join(nickname)`,
      auto-reconnect (≤10 attempts, 3 s apart) **and auto re-`join`** of the
      remembered nickname on reconnect, expose read-only refs.
    - `layouts/MainLayout.vue` — calls `useChat(WS_URL)`, `connect()`s, and
      `provide('chat', …)` so pages `inject` it. Shows the current nickname chip +
      `ConnectionStatus`. Derives `wss:`/`ws:` from page protocol; `WS_URL`
      overridable via build env.
    - `components/` — `MessageList` (animated scrollback via `<transition-group>`,
      nickname author labels, own-vs-other alignment), `MessageInput` (send,
      disabled when closed/empty), `ConnectionStatus` (live state chip + user
      count), `UserListPanel` (right-drawer roster: online/idle dot + login time,
      `motion-v` enter/exit, client-derived status on a ticking clock). All
      presentational. `MainLayout` mounts `UserListPanel` in a hide-able
      `q-drawer side="right"` (header `people` toggle), shown once joined.
    - `pages/LandingPage.vue` — route `/` (`landing`). Nickname form; validates with
      `validateNickname`, calls `chat.join`, surfaces `joinError`, and navigates to
      `chat` once `hasJoined`. Animated entrance.
    - `pages/ChatPage.vue` — route `/chat` (`chat`). Injects `chat`, composes list +
      input inside a width-capped centered shell. Redirects to `landing` if the
      session has not `hasJoined`.

## Data flow: sending a message

1. `MessageInput` emits `@send`; `ChatPage` calls `chat.sendMessage(content)`.
2. `useChat` sends `{ type: 'send', content }` over the socket (no-op if not open).
3. Server `routeClientMessage` parses, type-guards (`isClientMessage`), confirms
   the client has a nickname (`ConnectionManager.nicknameOf`, else `error`
   `not_joined`), and calls `MessageService.createMessage(clientId, nickname,
content)`.
4. `MessageService` trims, validates (non-empty, ≤2000), stamps the nickname,
   persists via the store, and emits `MessageCreatedEvent`.
5. `buildApp()` either publishes the message to Redis (distributed mode) or
   broadcasts it locally (dev fallback). The Redis subscriber on each pod then
   broadcasts `{ type: 'chat', message }` and `{ type: 'user_count', count }`
   to all open sockets.
6. Each client's `useChat` appends the message reactively; `MessageList` renders.

## Data flow: claiming a nickname

1. `LandingPage` validates input with `validateNickname` and calls `chat.join(name)`.
2. `useChat` sends `{ type: 'join', nickname }` (remembering it for reconnects).
3. Server `handleJoin` re-validates, then `ConnectionManager.claimNickname`
   atomically checks case-insensitive uniqueness across live clients.
4. Success → `{ type: 'joined', nickname }`; clash → `error` `nickname_taken`;
   bad name → `error` `invalid_nickname`.
5. `useChat` sets `hasJoined`/`nickname` (or `joinError`); `LandingPage` routes to
   `chat` on success or shows the error in place.

## Connection lifecycle

- **Connect** → server adds to `ConnectionManager`, sends `welcome` (history +
  count + roster), broadcasts updated `user_count`. The welcome history comes from
  the PostgreSQL store. The connection has **no nickname**
  yet (so it is absent from the roster) and cannot post until it `join`s.
- **Join** → after a successful claim the server broadcasts `user_list` (a named
  user appeared). Status is not sent — clients derive online/idle from
  `lastActivityAt`.
- **Close/error** → server removes the client (freeing its nickname) and
  re-broadcasts `user_count`; if the leaver was **named**, it also broadcasts the
  updated `user_list`.
- **Client side** → on unintentional close, `useChat` schedules reconnect (3 s,
  capped at 10 attempts) and re-sends `join` for the remembered nickname once the
  new socket opens; on `onUnmounted` it disconnects intentionally.

## Boundaries (do not cross)

- Socket APIs (`@fastify/websocket`, browser `WebSocket`) appear only in
  `apps/api/src/transport/` and `apps/web/src/composables/useChat.ts`.
- Frame shapes are defined once in `@uxtweet/shared`; neither app redefines them.
- `domain/` and `storage/` never import transport or Fastify.
- The LogRocket SDK is imported only in `apps/web/src/analytics.ts`; the rest
  of the client calls its named helpers (`initAnalytics`, `identifyUser`,
  `trackEvent`). It is a client-only external service — the server is unaware of
  it. See ADR-0008.
- Prometheus metrics are a transport concern: `prom-client` is imported only in
  `apps/api/src/transport/metrics.ts`, which owns the `/metrics` route and a
  per-app registry. `domain/`/`storage/` stay metrics-unaware — the connection
  gauge reads `ConnectionManager.count` at scrape time and the message counter is
  driven from `MessageService.onMessageCreated` in `buildApp`. See ADR-0009.

See [[Decisions]] for the rationale behind these boundaries and the
PostgreSQL-only storage (ADR-0012), and [[Domain]] for the protocol details.
