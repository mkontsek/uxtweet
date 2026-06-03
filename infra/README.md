# UXTweet Kubernetes (k3s) Deployment

This directory contains Kubernetes manifests for deploying UXTweet on a k3s cluster.

## Architecture

```
Internet → Ingress (nginx) → uxtweet-client (static SPA)
                           → uxtweet-server (WebSocket API)
```

### Scaling to 10 000 concurrent users

Each server pod can handle ~1 000–2 000 simultaneous WebSocket connections under typical load.
The HorizontalPodAutoscaler (`server-hpa.yaml`) scales from **3 → 20 replicas** based on CPU/memory
utilisation, providing headroom for ~20 000 connections.

WebSocket connections are stateless at the protocol level (the server holds connection state in
memory). For persistent message history across replicas, replace `InMemoryMessageStore` with a
shared data store (e.g., Redis Pub/Sub + PostgreSQL) in `apps/server/src/storage/`.

## Files

| File | Description |
|------|-------------|
| `namespace.yaml` | Dedicated `uxtweet` namespace |
| `server-configmap.yaml` | Environment variables for the server |
| `server-deployment.yaml` | Server Deployment (3 replicas by default) |
| `server-service.yaml` | ClusterIP Service for the server |
| `server-hpa.yaml` | HPA – scales server pods 3–20 based on CPU/memory |
| `client-deployment.yaml` | Static SPA served via nginx |
| `client-service.yaml` | ClusterIP Service for the client |
| `ingress.yaml` | Nginx Ingress with WebSocket upgrade headers |

## Before Deploying

> **Important**: The ingress manifest (`ingress.yaml`) uses the placeholder hostname
> `uxtweet.example.com`. Replace this with your actual domain before applying the manifests.
>
> ```bash
> # Example: replace the placeholder with your real domain
> sed -i 's/uxtweet.example.com/chat.yourdomain.com/g' infra/k3s/ingress.yaml
> ```

## Deploying

```bash
# From the repository root
./scripts/deploy.sh
```

Or manually:

```bash
kubectl apply -f infra/k3s/namespace.yaml
kubectl apply -f infra/k3s/
```

## Updating images

Images are tagged with the git SHA and built via CI:

```
ghcr.io/mkontsek/uxtweet/server:<sha>
ghcr.io/mkontsek/uxtweet/client:<sha>
```

Update the `image:` fields in the deployment manifests or use a GitOps tool such as Flux/ArgoCD.
