#!/usr/bin/env bash
# deploy.sh – Deploy UXTweet to a k3s cluster.
# Prerequisites: kubectl configured to point at the target cluster.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
INFRA_DIR="${ROOT_DIR}/infra/k3s"
GIT_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
REGISTRY="${REGISTRY:-ghcr.io/mkontsek/uxtweet}"

echo "==> Deploying UXTweet (git SHA: ${GIT_SHA})…"

# Apply namespace first to ensure it exists
kubectl apply -f "${INFRA_DIR}/namespace.yaml"

# Apply all remaining manifests
kubectl apply -f "${INFRA_DIR}/"

# Update image tags to the current git SHA
kubectl set image deployment/uxtweet-server \
  server="${REGISTRY}/server:${GIT_SHA}" \
  -n uxtweet

kubectl set image deployment/uxtweet-client \
  client="${REGISTRY}/client:${GIT_SHA}" \
  -n uxtweet

echo "==> Waiting for rollout…"
kubectl rollout status deployment/uxtweet-server -n uxtweet --timeout=120s
kubectl rollout status deployment/uxtweet-client -n uxtweet --timeout=120s

echo ""
echo "==> Deployment complete."
kubectl get pods -n uxtweet
