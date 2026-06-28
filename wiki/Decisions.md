# Decisions (ADR log)

Newest first. Each entry: context → decision → consequences. Update this file in
the same change that alters a decision (see [[architecture-update]]).

## ADR-0016 — Pinia for shared client state; nickname persisted across reloads

**Context.** Cross-tree chat state was shared via a typed `provide/inject`
(`CHAT_INJECTION_KEY` + `useChatContext()`), with `MainLayout` owning the single
`useChat` instance. It worked, but Pinia is the de-facto Vue 3 state standard and
lowers the ramp for new contributors (the client already listed Pinia as available
for stores). Separately, a page reload dropped the session — the user had to
retype their nickname even though the server re-associates messages by name.
**Decision.** Move the WebSocket lifecycle + chat state into a Pinia **setup
store** (`apps/web/src/stores/chat.ts`, `useChatStore`), installed via a boot file
(`boot/pinia.ts`). Components read state with `storeToRefs(useChatStore())` and
call actions directly; `provide/inject`, `CHAT_INJECTION_KEY`, and
`useChatContext()` are removed. Because a Pinia store has no component lifecycle,
`MainLayout` now owns connect/disconnect from its own `onMounted`/`onUnmounted`.
The store also **remembers the chosen nickname in `localStorage`** (key
`uxtweet:nickname`): written on a confirmed `joined`, re-sent automatically when
the socket (re)opens after a reload, and cleared if the server rejects it. An
`isRestoringSession` flag lets `ChatPage` wait for the auto-rejoin instead of
bouncing to the landing screen.
**Consequences.** One idiomatic state mechanism, no bespoke inject plumbing. A
refresh transparently re-joins the same name (uniqueness is still freed/reclaimed
on the socket cycle). Identity is still ephemeral (a new `clientId` per socket, no
auth) — only the display name persists, client-side. Tests install a real Pinia
and patch store state / spy on actions; the web suite gains an in-memory
`localStorage` polyfill (`apps/web/test/setup.ts`) because jsdom ships none here.
Supersedes the typed-provide/inject guidance in [[vue-best-practices]] for the
chat instance — the typed-key rule still applies to any _other_ provide/inject.

## ADR-0015 — Nickname uniqueness via a registry port (cross-pod with Redis)

**Context.** `ConnectionManager.claimNickname` enforced uniqueness only across the
connections on **one pod** (ADR-0007), so two replicas could each host an "alice".
With Redis already present for cross-pod message fan-out, nickname coordination can
be made global.
**Decision.** Introduce a `NicknameRegistry` **port** (`domain/NicknameRegistry.ts`)
with async `claim`/`release`. `LocalNicknameRegistry` keeps the per-process
behaviour (dev, single replica); `RedisNicknameRegistry`
(`storage/RedisNicknameRegistry.ts`) makes a name globally unique via
`SET uxtweet:nick:<lower> <clientId> NX EX <ttl>`, a compare-and-delete (Lua)
release, idempotent re-claim by the same client, and a TTL heartbeat so a live
pod's names don't expire mid-session while a crashed pod's free automatically.
`buildApp` wires the Redis registry when `REDIS_URL` is set, else the local one —
the same seam as the message store/bus. `ConnectionManager` drops its uniqueness
check and only records the granted name (`setNickname`) for display/roster; the
transport claims via the registry before assigning and **releases on disconnect**.
`joinClient` is now async and releases the reservation if the socket dropped
mid-claim.
**Consequences.** Nicknames are unique across every pod when Redis is on, per-pod
otherwise — uniqueness no longer relies on all of a name's holders sharing one
process. Extends and resolves the "not global" caveat of **ADR-0007**. The live
roster / `user_count` remain per-pod by design (ADR-0011); a global roster is still
future work. Adds a small Redis keyspace (`uxtweet:nick:*`) and a refresh timer.

## ADR-0014 — Zod schemas as the shared validation source of truth

**Context.** Nickname and message-content rules were hand-written `if` checks —
`validateNickname` in `@uxtweet/shared` and inline length/empty checks in
`MessageService`. Functional, but the rules were expressed twice in different
styles and harder to share/extend.
**Decision.** Adopt **Zod** (pinned `4.4.3`) in `@uxtweet/shared` as the single
definition of input rules: `nicknameSchema` and `messageContentSchema`, each
carrying the project's exact messages. `validateNickname` and a new
`validateMessageContent` wrap `safeParse` and return the existing discriminated
`{ ok, value } | { ok, reason }` result, so call sites (client landing form,
server transport, `MessageService`) are unchanged in shape. `MessageService`
delegates content validation to `validateMessageContent` rather than inlining the
checks; it remains the single domain gate that throws `MessageValidationError`.
**Consequences.** One schema per rule, shared by client and server, ready to reuse
(e.g. client-side message validation) and to extend without rewriting predicates.
`zod` becomes the first runtime dependency of `@uxtweet/shared` (and thus of both
apps); bundle cost is small and the schemas are tree-shakeable.

## ADR-0013 — Production-shaped hardening: graceful WS drain, non-root pods, secret-backed Grafana

**Context.** A review pass found the deploy claimed "graceful WebSocket draining"
(`terminationGracePeriodSeconds: 30`) but the server closed its listener
immediately on SIGTERM, hard-dropping every socket on a rollout; pods ran with no
`securityContext`; the web tier ran as root on `nginx:1.27-alpine`; and the
Grafana admin password sat in plaintext in `monitoring/values.yaml`.
**Decision.** (1) **Graceful drain.** `/health` doubles as the readiness probe and
flips to `503` once draining; on SIGTERM `server.ts` calls `app.markDraining()`,
waits `SHUTDOWN_DRAIN_MS` (default 15 s) so in-flight clients finish and the
endpoint removal propagates, then closes. A `preStop` `sleep 5` lets kube-proxy
drop the pod from endpoints before the process gets the signal;
`terminationGracePeriodSeconds` raised to 45 to bound it. Clients already
auto-reconnect (`useChat`), so a drained pod's clients reconnect to a live one.
(2) **Non-root, locked-down pods.** API runs `runAsNonRoot` (uid 1000) with
`readOnlyRootFilesystem`, dropped capabilities, `RuntimeDefault` seccomp and a
`/tmp` emptyDir. The web image switches to **`nginxinc/nginx-unprivileged`**
listening on **8080** (uid 101, read-only rootfs + `/tmp` & `/var/cache/nginx`
scratch volumes); its Service maps `:80 → :8080`. The data tier (Postgres/Redis/
pgweb) gets the startup-safe subset (`allowPrivilegeEscalation: false`, default
seccomp; Redis/pgweb also drop all caps) — full non-root/read-only hardening of the
stateful tier is deferred (PoC). (3) **Grafana secret.** Credentials move to a
`uxtweet-grafana-admin` Secret created by `deploy.sh` (override via
`GRAFANA_ADMIN_USER`/`GRAFANA_ADMIN_PASSWORD`), referenced through
`grafana.admin.existingSecret`. (4) A `PodDisruptionBudget` (`minAvailable: 1`)
protects the API across voluntary disruptions, and CI gains a `kubeconform`
manifest-validation job.
**Consequences.** Rollouts and scale-downs no longer mass-disconnect clients;
pods meet a baseline pod-security posture; no credential is committed. The web
container port changed (80 → 8080) — the Dockerfile, `nginx.conf`, Deployment, and
Service moved together; the ingress is unchanged (still targets Service port 80).
HPA still scales on CPU/memory; connection-based scaling toward the 10k target
needs the Prometheus adapter on the existing `uxtweet_ws_connections` gauge
(documented inline in `api-hpa.yaml`). Cross-pod `user_count`/roster remain
per-pod by design (ADR-0007/0011).

## ADR-0012 — PostgreSQL is the only message store; dev runs it via Docker Compose

**Context.** `pnpm dev` used `InMemoryMessageStore`, so every server restart wiped
all chat history — surprising and unlike the deployed behaviour. The in-memory
store also meant dev and production exercised different storage code paths.
**Decision.** Remove `InMemoryMessageStore` entirely. The server now **requires
`DATABASE_URL`** and persists to `PostgresMessageStore` in every runtime; it throws
on boot if the variable is missing (no silent fallback). A root `compose.yaml`
defines a `postgres` service backed by a **named volume** (`uxtweet-pgdata`), so
data survives container and host restarts; `pnpm dev` runs `pnpm db:up`
(`docker compose up -d --wait postgres`) before starting the apps, and the API dev
script defaults `DATABASE_URL` to `postgres://postgres@localhost:5432/uxtweet`.
**Redis is now optional**, decoupled from Postgres: when `REDIS_URL` is set the
server adds cross-pod Pub/Sub fan-out (the multi-replica k3s deploy), otherwise a
single process broadcasts locally — dev needs no Redis. Tests stay
database-free by injecting a store through `buildApp({ store })`; a
`FakeMessageStore` test fixture (under `storage/__tests__/`) replaces the old
in-memory class for `MessageService` and the transport integration tests.
**Consequences.** Dev history is durable and dev/prod share one storage path. Docker
is now a prerequisite for `pnpm dev` (and for the Playwright e2e run, which boots
`pnpm dev`). The k3s Postgres `StatefulSet` was already persistent via a
`volumeClaimTemplates` PVC (ADR-0009), so deploy is unchanged. This supersedes
**ADR-0002** (the in-memory store).

## ADR-0011 — Live roster: per-pod, status derived client-side from activity

**Context.** The UI showed a `user_count` number but not _who_ is connected. We
wanted a hide-able right-panel roster of named users with an online/idle status and
their login time. The server already tracks `nickname` + `connectedAt` per
connection in `ConnectionManager`; two questions remained: how to fan the roster
out at ~10k connections, and how to represent a _passive_ "idle" transition (one
that happens when nothing happens) without server-side timers.
**Decision.** Add a `RosterEntry` (`nickname`, `connectedAt`, `lastActivityAt`) and
a `user_list` server→client frame to `@uxtweet/shared`; `welcome` carries the
initial snapshot (mirroring `userCount`). `ConnectionManager.roster()` returns one
entry per **named** client only; `touchActivity` stamps `lastActivityAt` on every
inbound frame. The roster is **per-pod**, exactly like `user_count` — only `chat`
frames cross pods via Redis (ADR-0009). A `user_list` is broadcast **only** on
membership changes (a successful `join`, and the disconnect of a _named_ user) —
**never** on the per-message path, so chat fan-out is unchanged. **Status is
derived on the client**: `deriveUserStatus(entry, now)` compares `lastActivityAt`
against the shared `USER_IDLE_THRESHOLD_MS` on a ticking clock, and the client also
freshens an entry's `lastActivityAt` from incoming `chat` frames — so a chatting
user stays "online" with zero extra socket traffic.
**Consequences.** No new server timers, no extra fan-out, and statuses/login times
age live in the UI. The roster reflects only users on the **same pod** (consistent
with the per-pod `user_count` and history limitations of ADR-0002/0004); a global
roster would need the same shared registry as cross-pod nicknames (ADR-0007). The
right drawer (`q-drawer side="right"`, the `R` slot already reserved in the layout)
is hide-able and only mounts once the client has joined.

## ADR-0010 — Kysely query builder for the Postgres store (over raw `pg` and Prisma)

**Context.** `PostgresMessageStore` started on raw `pg` with a hand-written
`StoredMessageRow` interface and an untyped `query<Row>` cast. We wanted typed
query results and to drop the manual row mapping, without paying the cost of a
heavyweight ORM. Prisma was considered and rejected: its query-engine binary and
`prisma generate` codegen step inflate the minimal server image (see
[[docker-builds]]), and its query API can't express the Postgres-native retention
`interval` query — we'd fall back to raw SQL for the interesting parts anyway.
**Decision.** Use **Kysely** (pinned `0.29.2`) — a pure-TypeScript query builder
with no codegen and no runtime engine binary. It wraps the same injected `pg`
Pool via `PostgresDialect`, so the constructor signature, `buildApp` wiring, and
the hexagonal `IMessageStore` boundary are unchanged. Typed DML (insert / select /
delete) goes through the builder; DDL (`CREATE TABLE`, the descending index) and
`TRUNCATE` use `sql` template fragments. Retention uses a parameterised
`make_interval(days => $1)` fragment. `close()` calls `db.destroy()`, which ends
the pool (lazily — only after the driver has run at least one query).
**Consequences.** Type-safe columns and no hand-rolled row interface, image stays
minimal. Tests now mock `pool.connect()` → `client.query` (Kysely's connection
model) and assert on the compiled SQL rather than raw strings. The MySQL-dialect
`sql.lit` advisory (GHSA-8cpq-38p9-67gx) does not apply — Postgres dialect,
parameterised values only.

## ADR-0009 — kube-prometheus-stack + shared local storage; k3s manifests made local-first

**Context.** We want to monitor the stack while iterating locally and keep message
history across pods for the local deployment. The original manifests targeted a
generic cluster with an nginx ingress and a placeholder domain, which didn't run
as-is on a default k3s.
**Decision.** Rename `infra/k3s` → `infra/k3s-local` and make it run on a local
k3s out of the box: **Traefik** ingress (k3s default; proxies WebSockets natively)
on host `uxtweet.localhost`, `imagePullPolicy: IfNotPresent` with locally-imported
images, and laptop-sized replicas (server 1, HPA 1→4; client 1). The SPA derives
its WebSocket URL from `window.location` (prod `WS_URL` is empty) so no host is
baked into the image. The local stack also brings up **Redis Pub/Sub** plus
**PostgreSQL**: the server publishes new chat messages into Redis for cross-pod
fan-out and persists history in Postgres with a 30-day retention window, while
falling back to `InMemoryMessageStore` when `DATABASE_URL` / `REDIS_URL` are
absent. For monitoring, `deploy.sh` `helm upgrade --install`s
**kube-prometheus-stack** into a `monitoring` namespace (local-tuned values:
Alertmanager off, k3s-absent control-plane jobs off, trimmed resources), exposed
via Grafana at `grafana.localhost`. The Fastify server keeps a Prometheus
`/metrics` endpoint (transport-layer `registerMetrics`, isolated behind a fresh
`prom-client` Registry per `buildApp`) with `uxtweet_ws_connections` and
`uxtweet_messages_total`; a `ServiceMonitor` makes Prometheus scrape it.
**Consequences.** One-command local deploy with real cluster + app observability
and shared history. Helm becomes a deploy prerequisite. The manifests are
explicitly local (separate prod manifests/overlays would be a later step).
Metrics are per-pod — aggregate across replicas in Prometheus, not in-process.

## ADR-0008 — LogRocket for client-side analytics & session replay

**Context.** The PoC needs product analytics — session replay, event tracking,
and error capture — to understand how the chat is used. We want it client-only,
with no backend changes and no new server dependency.
**Decision.** Integrate the LogRocket JS SDK in the client. A Quasar boot file
(`src/boot/logrocket.ts`) calls `initAnalytics` from `src/analytics.ts`, which
isolates the SDK behind named helpers (`initAnalytics`, `identifyUser`,
`trackEvent`) so no other module imports `logrocket` directly. The public app ID
is `c36yqy/uxtweet`, baked in at build time via `LOGROCKET_APP_ID` in
`quasar.config` `build.env` (override per environment). Init runs **only in
production builds**; `identifyUser` labels the anonymous session with the chosen
nickname and `trackEvent('message_sent')` fires on send. Uncaught Vue component
errors are forwarded via `app.config.errorHandler` → `LogRocket.captureException`.
**Consequences.** Cheap, client-only observability with no server coupling. But
session replay **captures DOM content** — on a public chat that means message
text and nicknames are sent to a third party (LogRocket). There is **no PII
redaction configured**; before any real launch, configure DOM/network
sanitization (https://docs.logrocket.com/reference/dom). Local `pnpm dev`
sessions are excluded by the production gate.

## ADR-0007 — Nicknames: claimed per-connection, unique per-pod

> **Cross-pod uniqueness added by [ADR-0015](#adr-0015--nickname-uniqueness-via-a-registry-port-cross-pod-with-redis).**
> The per-pod claim moved behind a `NicknameRegistry` port; with Redis it is now
> globally unique. The per-connection, free-on-disconnect model below still holds.

**Context.** Messages showed a truncated `clientId`, which is opaque and changes on
every reconnect. Users want to choose a display name, and names should not collide.
**Decision.** A client must `join` with a nickname before it can post. Uniqueness
is enforced **case-insensitively across live connections on the pod** by
`ConnectionManager.claimNickname` (validation rules shared via
`validateNickname` in `@uxtweet/shared`). Names are not reserved or persisted —
they free on disconnect. The client remembers the chosen name and re-`join`s on
reconnect.
**Consequences.** Cheap, no storage, fits the in-memory/per-pod model (ADR-0002).
But uniqueness is **not global**: two pods can each host an "alice", and a name is
not held across a restart. Global, durable nicknames would need the same shared
store/registry as cross-pod history.

## ADR-0006 — Exact, pinned dependency versions

**Context.** A reproducible build across CI, Docker (`--frozen-lockfile`), and
local dev requires that manifests and lockfile agree exactly.
**Decision.** All `package.json` dependencies are pinned to exact versions (no
`^`/`~`/ranges); `pnpm-lock.yaml` is regenerated and committed with every manifest
change. Supply-chain soak is enforced at the package manager via
`minimumReleaseAge: 10080` (7 days) in `pnpm-workspace.yaml` rather than a Renovate
config — `renovate.json` was removed (requires pnpm ≥ 10.16 to take effect).
**Consequences.** No surprise transitive drift; freshly-published (possibly
compromised) versions are refused for a week regardless of how the install is
triggered. Note the current `packageManager` is pnpm 9.15.0, so the soak only
activates once the toolchain is bumped to ≥ 10.16. See the [[locked-versions]] skill.

## ADR-0005 — Two images: Node server + nginx-served static client

**Context.** The client is a static SPA; the server is a long-lived Node process.
**Decision.** Build separate multi-stage images — server runs on `node:24-alpine`
(prod-pruned deps, non-root), client is built then served by
`nginxinc/nginx-unprivileged:1.27-alpine` (non-root, listens on 8080) with an SPA
fallback and long-cache for hashed assets. A tight `.dockerignore` keeps the build
context lean. (Web non-root/port-8080 rationale: ADR-0013.)
**Consequences.** Client image carries no Node/`node_modules`; tiers scale and
deploy independently. See the [[docker-builds]] skill.

## ADR-0004 — k3s + HorizontalPodAutoscaler for the connection tier

**Context.** Target is ~10 000 concurrent WebSocket connections; each pod handles
~1 000–2 000.
**Decision.** Deploy to k3s; HPA scales the server 3→20 replicas on CPU/memory.
Ingress carries WebSocket upgrade headers.
**Consequences.** Horizontal headroom for connections. But with in-memory,
per-pod state (ADR-0002) a client only sees messages from peers on the **same**
pod — acceptable for the exercise, not for real multi-replica chat. Resolving it
needs ADR-0002's future store.

## ADR-0003 — Hexagonal server (transport / domain / storage)

**Context.** WebSocket plumbing tends to bleed into business logic, making it
hard to test or swap transports/stores.
**Decision.** Isolate three layers: `transport/` owns all socket concerns,
`domain/` holds connection + message logic, `storage/` is a port (`IMessageStore`)
with adapters. `buildApp()` wires them; `server.ts` only listens.
**Consequences.** Domain/storage unit-test without a socket; a new store or
transport drops in at the seam. Discipline required: no Fastify/WS imports below
`transport/`. See the [[fastify-websockets]] skill.

## ADR-0002 — In-memory message store (last 200), behind `IMessageStore` — SUPERSEDED

> **Superseded by [ADR-0012](#adr-0012--postgresql-is-the-only-message-store-dev-runs-it-via-docker-compose).**
> The in-memory store was removed; PostgreSQL is now the only store and `pnpm dev`
> runs it via Docker Compose. Kept for historical context.

**Context.** The exercise needs message history without standing up a database.
**Decision.** `InMemoryMessageStore` keeps the newest 200 messages in process
memory, hidden behind the `IMessageStore` port.
**Consequences.** Zero infra, fast. History is per-pod and lost on restart, and
does not fan out across replicas. The port is the upgrade seam: a Redis pub/sub +
PostgreSQL adapter gives shared, durable history and cross-pod broadcast. The
`IMessageStore` port itself survives the supersession — it is still the seam tests
inject a fake through, and where a new backend would drop in.

## ADR-0001 — Shared protocol package (`@uxtweet/shared`)

**Context.** Client and server must agree on every WebSocket frame.
**Decision.** Define all frame and entity types once in `@uxtweet/shared`; both
apps import them. No app-local duplication.
**Consequences.** A protocol change is a single typed edit that the compiler
propagates to both sides; drift becomes a type error rather than a runtime bug.
