# UXTweet — local k3s deployment

Kubernetes manifests for running UXTweet (and its monitoring) on a **local k3s
cluster**. This is a PoC: images are built locally, the ingress uses
`*.localhost` hosts, and replica counts are sized for a laptop.

## Architecture

```
Browser → Traefik ingress ──→ uxtweet-web (static SPA)        host: uxtweet.localhost
        (k3s default)      └─→ uxtweet-api (WebSocket API, /ws + /metrics)
                           └─→ pgweb (PostgreSQL UI)              host: db.localhost
                           └─→ Grafana                            host: grafana.localhost

kube-prometheus-stack (monitoring ns): Prometheus scrapes the cluster + the
server's /metrics via a ServiceMonitor; Grafana visualises it. The app server
talks to Redis Pub/Sub for fan-out and PostgreSQL for message history +
30-day retention.
```

The SPA derives its WebSocket URL from `window.location`, so it connects to
`ws://uxtweet.localhost/ws` automatically — no host baked into the image.

## Prerequisites

- A local **k3s** cluster (ships Traefik + metrics-server, which the ingress and
  HPA rely on).
- **kubectl** and **helm** pointing at it.
- Images built and imported into k3s: `./scripts/build.sh`.

`*.localhost` resolves to `127.0.0.1` in most browsers. If yours doesn't, add to
`/etc/hosts`: `127.0.0.1 uxtweet.localhost db.localhost grafana.localhost`.

## Files

| File                                 | Description                                         |
| ------------------------------------ | --------------------------------------------------- |
| `namespace.yaml`                     | Dedicated `uxtweet` namespace                       |
| `api-configmap.yaml`                 | Environment variables for the server                |
| `api-deployment.yaml`                | Server Deployment (1 replica locally)               |
| `api-service.yaml`                   | ClusterIP Service, port named `http` (for scraping) |
| `api-hpa.yaml`                       | HPA – scales the server 1–4 on CPU/memory           |
| `web-deployment.yaml`                | Static SPA served via nginx (1 replica)             |
| `web-service.yaml`                   | ClusterIP Service for the web app                   |
| `ingress.yaml`                       | Traefik ingress, host `uxtweet.localhost`           |
| `data-services.yaml`                 | Redis + PostgreSQL for shared history/retention     |
| `pgweb.yaml`                         | pgweb DB viewer, host `db.localhost`                |
| `monitoring/values.yaml`             | Helm values for kube-prometheus-stack (local-tuned) |
| `monitoring/api-servicemonitor.yaml` | Tells Prometheus to scrape the server's `/metrics`  |
| `monitoring/grafana-ingress.yaml`    | Traefik ingress, host `grafana.localhost`           |

## Deploying

```bash
# From the repository root
./scripts/build.sh    # build + import images into k3s
./scripts/deploy.sh   # apply manifests, install kube-prometheus-stack, roll out
```

`deploy.sh` applies the core manifests (including Redis + PostgreSQL), waits for
them to come up, `helm upgrade --install`s kube-prometheus-stack into the
`monitoring` namespace, then applies the ServiceMonitor and Grafana ingress.

## Monitoring

- **Grafana**: http://grafana.localhost (user `admin`, pass `admin`). Out of the
  box you get cluster/node/pod dashboards; the UXTweet pods and app metrics
  appear there too.
- **App metrics**: the server exposes Prometheus metrics at `/metrics`, including
  `uxtweet_ws_connections` (active sockets) and `uxtweet_messages_total`. Query
  them in Grafana's "Explore" against the Prometheus datasource, or build a panel.
- **Prometheus / Alertmanager**: Alertmanager is disabled for the PoC. Reach
  Prometheus via port-forward:
  `kubectl -n monitoring port-forward svc/uxtweet-monitoring-prometheus 9090:9090`.

## Inspecting the database

PostgreSQL is a ClusterIP service, so it isn't reachable from the host directly.
`pgweb.yaml` deploys a small web UI that runs inside the cluster and auto-connects
to it:

- **pgweb**: http://db.localhost — browse the `chat_messages` table and run
  ad-hoc SQL. It launches with `--lock-session`, so it's pinned to
  `uxtweet-postgres` and can't be pointed at another database.

Prefer a terminal? Port-forward and use `psql` (or any client):

```bash
kubectl -n uxtweet port-forward svc/uxtweet-postgres 5432:5432
psql postgresql://postgres@localhost:5432/uxtweet
```

## Scaling beyond local

Each server pod handles ~1 000–2 000 concurrent WebSocket connections. The local
deploy uses Redis Pub/Sub + PostgreSQL for shared history/broadcast with a
30-day retention window; if those env vars are absent the server falls back to
the in-memory store for dev/test. Production replica targets are higher than the
local 1–4 (see `wiki/Decisions.md`, ADR-0004).

## Images & registry

**PoC: local images, no registry.** `scripts/build.sh` tags images with the git
SHA and, when `k3s` is present, imports them into its containerd; the deployments
use local names with `imagePullPolicy: IfNotPresent`:

```
uxtweet/api:<sha>
uxtweet/web:<sha>
```

An **external registry such as Harbor or GHCR** is the natural next step for a
real environment — set `REGISTRY` for `build.sh`/`deploy.sh`, update the `image:`
fields here, and add registry auth (out of scope for this PoC).
