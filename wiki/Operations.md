# Operations

## Prerequisites

- Node ≥ 24, pnpm 9.15.0 (pinned via `packageManager`; let corepack/pnpm honour it).
- **Docker** (Compose v2) — `pnpm dev` runs a local Postgres container.
- For images/deploy: also `kubectl` and `helm` pointed at a local k3s cluster
  (k3s ships Traefik + metrics-server).

## Local development

```bash
pnpm install          # or ./scripts/setup.sh
pnpm dev              # starts Postgres (Docker), then web on :9000 + API on :3000 (/ws)
```

`pnpm dev` first runs `pnpm db:up` (`docker compose up -d --wait postgres`, see
`compose.yaml`) and then the apps via Turborepo. The API defaults `DATABASE_URL`
to `postgres://postgres@localhost:5432/uxtweet`; export your own to point
elsewhere. **Chat history persists** in the `uxtweet-pgdata` Docker volume across
restarts — there is no in-memory store (see [[Decisions]] ADR-0012). Redis is not
used in dev (a single process broadcasts locally); it is only added when
`REDIS_URL` is set, for cross-pod fan-out.

```bash
pnpm db:up            # start just Postgres (idempotent; waits for healthy)
pnpm db:down          # stop the container (the volume — and its data — persists)
docker compose down -v   # also drop the volume, wiping history
```

`WS_URL` defaults to `ws://localhost:3000/ws` (client derives `wss:` on HTTPS
pages). Override via the build env if the server is elsewhere.

## The gate (run before every commit)

```bash
pnpm typecheck        # vue-tsc (web) + tsc (api, shared)
pnpm lint             # eslint, type-aware
pnpm test             # vitest across packages
pnpm build            # shared → api (tsup) + web (quasar build)
pnpm format:check     # prettier
```

CI (`.github/workflows/ci.yml`) runs typecheck → lint → test → build on push/PR to
`main`/`master`. Keep all five green.

## End-to-end tests (Playwright)

Browser-level tests live in the root `e2e/` workspace (`@uxtweet/e2e`) and are
**not** part of the commit gate — they need browser binaries and the running
stack, so they run on demand:

```bash
pnpm --filter @uxtweet/e2e exec playwright install chromium  # one-time
pnpm test:e2e         # starts `pnpm dev` (web + API + Postgres) and runs the specs
```

`e2e/playwright.config.ts` boots the stack via its `webServer` block, which runs
`pnpm dev` — so **Docker must be running** (it brings up Postgres; no Redis
needed). Tests resolve `getByTestId()` against the app's `data-cy` attributes and
cover the join → send → broadcast flow across two browser contexts. Because the DB
now persists, run `docker compose down -v` if a clean history is needed between
runs. Reports: `pnpm --filter @uxtweet/e2e run e2e:report`.

## Build & inspect

```bash
pnpm build                       # turbo build, respecting ^build order
pnpm --filter @uxtweet/api build   # tsup → apps/api/dist
pnpm --filter @uxtweet/web build   # quasar build → apps/web/dist/spa
```

Smoke-check the server: `curl localhost:3000/health` → `{"status":"ok"}`.

## Docker images

```bash
./scripts/build.sh    # builds api + web images, tags :<git-sha> and :latest
                      # REGISTRY defaults to "uxtweet" (local, no registry host)
```

Images are multi-stage (see the [[docker-builds]] skill). Build context is the
repo root, trimmed by `.dockerignore`.

**PoC: local images, no registry.** Images are built locally and, when `k3s` is
on the host, imported straight into its containerd (`docker save … | k3s ctr
images import -`); the deployments use `imagePullPolicy: IfNotPresent`. Pushing
to an external registry (Harbor, GHCR, …) is a later step — set `REGISTRY` to it
for both `build.sh` and `deploy.sh`.

## Deploy to local k3s

```bash
pnpm deploy:local     # convenience: build.sh && deploy.sh in one go
# or run the stages separately:
./scripts/deploy.sh   # apply infra/k3s-local/*, helm-install monitoring,
                      # set image to :<git-sha>, wait for rollout
```

`pnpm deploy:local` chains `scripts/build.sh` then `scripts/deploy.sh` (build
images → import into k3s → roll out). The name is `deploy:local`, not `deploy`,
because bare `pnpm deploy` is a reserved pnpm built-in.

Prereqs: a local **k3s** cluster (ships Traefik + metrics-server) with `kubectl`
and `helm` pointed at it. On macOS this is **k3d** (k3s-in-Docker); create a
dedicated cluster that maps the Traefik ingress to host port 80:

```bash
k3d cluster create uxtweet --agents 1 -p "80:80@loadbalancer"
```

The active kube context must be set (`k3d cluster create` does this; otherwise
`kubectl config use-context k3d-uxtweet`). With **no current context**, kubectl
falls back to `localhost:8080` and every `apply` fails with `failed to download
openapi: ... could not find the requested resource` — that error means "wrong/no
context," not a bad manifest. `build.sh` loads images via `k3d image import` when
the context is `k3d-*` (cluster derived from the context name, override
`K3D_CLUSTER`), or `k3s ctr` on native Linux k3s. With the `-p 80:80` mapping the
app is at `http://uxtweet.localhost`. `helm` is required for monitoring;
`deploy.sh` skips it with a warning if helm is absent. Manifests live in
`infra/k3s-local/`: `namespace`,
`server-{configmap,deployment,service,hpa}`, `web-{deployment,service}`,
`ingress` (Traefik, host `uxtweet.localhost`), `data-services`, and `monitoring/`.
The HPA scales the server 1→4 locally (production targets are higher — ADR-0004).

The app is served at **http://uxtweet.localhost**; the SPA derives its WebSocket
URL from `window.location` (prod `WS_URL` is empty), so it connects to
`ws://uxtweet.localhost/ws` with no host baked into the image. If `*.localhost`
doesn't resolve, add `127.0.0.1 uxtweet.localhost db.localhost grafana.localhost`
to `/etc/hosts`.

## Inspecting the database

PostgreSQL is a ClusterIP service — not reachable from the host directly.
`deploy.sh` applies `infra/k3s-local/pgweb.yaml`, a small in-cluster web UI
([pgweb](https://github.com/sosedoff/pgweb)) that auto-connects to it:

- **pgweb**: http://db.localhost — browse the `chat_messages` table and run
  ad-hoc SQL. It runs with `--lock-session`, so it's pinned to `uxtweet-postgres`.

For a terminal client, port-forward instead:

```bash
kubectl -n uxtweet port-forward svc/uxtweet-postgres 5432:5432
psql postgresql://postgres@localhost:5432/uxtweet   # trust auth, no password
```

## Monitoring

`deploy.sh` installs **kube-prometheus-stack** via `helm upgrade --install` into
the `monitoring` namespace (`infra/k3s-local/monitoring/values.yaml`, local-tuned
— Alertmanager and the k3s-absent control-plane scrape jobs are disabled).

- **Grafana**: http://grafana.localhost — cluster + pod dashboards out of the
  box. Credentials come from the `uxtweet-grafana-admin` Secret that `deploy.sh`
  creates; default `admin`/`admin`, override with `GRAFANA_ADMIN_USER` /
  `GRAFANA_ADMIN_PASSWORD` (see ADR-0013).
- **App metrics**: the server exposes `/metrics` (Prometheus). Custom metrics:
  `uxtweet_ws_connections` (gauge, self-collected from `ConnectionManager`) and
  `uxtweet_messages_total` (counter). A `ServiceMonitor` (in the `uxtweet` ns,
  scraping the service port named `http`) tells Prometheus to scrape them.
- **Prometheus**: `kubectl -n monitoring port-forward svc/uxtweet-monitoring-prometheus 9090:9090`.

## Runbooks

- **Server won't start / port in use** — `PORT`/`HOST` come from env (defaults
  `3000`/`0.0.0.0`); check the configmap in k3s. If the distributed store is
  enabled, `REDIS_URL`, `DATABASE_URL`, and `MESSAGE_HISTORY_RETENTION_DAYS`
  must also be present.
- **Client connects then drops** — Traefik proxies WS upgrades automatically;
  check the SPA reaches `ws://<host>/ws` (the `/ws` ingress path routes to the
  server, not the client) and that the host resolves.
- **History "missing" after deploy or under load** — the local k3s deploy uses
  Redis Pub/Sub + PostgreSQL for shared history and a 30-day retention window.
  Check those pods first. If `REDIS_URL`/`DATABASE_URL` are absent, the server
  falls back to the in-memory store (ADR-0002/0009 in [[Decisions]]).
- **Frozen-lockfile failure in CI/Docker** — a manifest changed without
  regenerating `pnpm-lock.yaml`; run `pnpm install --lockfile-only` and commit it
  (see [[locked-versions]]).
