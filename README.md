# uxtweet

A real-time public chat. A Quasar (Vue 3) SPA connects over a WebSocket to a
Fastify server that broadcasts messages and a live user count to every client.

Built as a coding exercise, with a local k3s deployment story (Redis +
PostgreSQL + kube-prometheus-stack) and horizontal autoscaling. See the `wiki/`
for architecture, decisions, and operations.

## Quick start

```bash
pnpm install
pnpm dev          # web on :9000, server on :3000 (/ws)
```

## Build & deploy

```bash
./scripts/build.sh    # build server + web Docker images, tagged :<git-sha> + :latest
./scripts/deploy.sh   # apply infra/k3s-local/*, install monitoring, roll out the images
```

Targets a **local k3s** cluster (Traefik + helm + kubectl). After deploy:
the app is at http://uxtweet.localhost, Grafana at http://grafana.localhost
(`admin`/`admin`), and the server persists history via Redis Pub/Sub +
PostgreSQL. See [`infra/k3s-local/README.md`](infra/k3s-local/README.md).

### Monitoring

`deploy.sh` installs **kube-prometheus-stack** (Prometheus + Grafana +
exporters) for cluster monitoring, and the server exposes Prometheus metrics at
`/metrics` (`uxtweet_ws_connections`, `uxtweet_messages_total`) scraped via a
ServiceMonitor.

### Container images

This is a **proof of concept**: images are built **locally** and imported
straight into the k3s containerd (`build.sh` does this when `k3s` is present),
and the deployments use `imagePullPolicy: IfNotPresent`. No external registry is
required.

For a real environment, pushing to an **external registry such as Harbor or
GHCR** is the natural next step — point `REGISTRY` at it and the same scripts
build and deploy from there:

```bash
REGISTRY=harbor.example.com/uxtweet ./scripts/build.sh
REGISTRY=harbor.example.com/uxtweet ./scripts/deploy.sh
```

(You'd also update the `image:` fields in `infra/k3s-local/*-deployment.yaml` and
add registry auth — out of scope for this PoC.)
