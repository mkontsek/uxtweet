#!/usr/bin/env bash
# build.sh – Build all apps and packages and produce Docker images.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
GIT_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
# PoC: build images locally, no external registry. Set REGISTRY (e.g.
# harbor.example.com/uxtweet or ghcr.io/<org>/uxtweet) to push to a real one later.
REGISTRY="${REGISTRY:-uxtweet}"

echo "==> Building packages (git SHA: ${GIT_SHA})…"
cd "$ROOT_DIR"
pnpm build

echo "==> Building Docker image: api"
docker build \
  -f apps/api/Dockerfile \
  -t "${REGISTRY}/api:${GIT_SHA}" \
  -t "${REGISTRY}/api:latest" \
  .

echo "==> Building Docker image: web"
docker build \
  -f apps/web/Dockerfile \
  -t "${REGISTRY}/web:${GIT_SHA}" \
  -t "${REGISTRY}/web:latest" \
  .

# Local PoC: load images into the cluster's containerd so pods can run them
# without a registry (deployments use imagePullPolicy: IfNotPresent). The local
# cluster is k3d (k3s-in-Docker) on macOS, or native k3s on Linux.
KUBE_CONTEXT="$(kubectl config current-context 2>/dev/null || true)"
if command -v k3d >/dev/null 2>&1 && [[ "$KUBE_CONTEXT" == k3d-* ]]; then
  # Derive the cluster from the active k3d-<name> context (override with K3D_CLUSTER).
  K3D_CLUSTER="${K3D_CLUSTER:-${KUBE_CONTEXT#k3d-}}"
  echo "==> Importing images into k3d cluster '${K3D_CLUSTER}'"
  k3d image import \
    "${REGISTRY}/api:${GIT_SHA}" \
    "${REGISTRY}/web:${GIT_SHA}" \
    -c "${K3D_CLUSTER}"
elif command -v k3s >/dev/null 2>&1; then
  echo "==> Importing images into k3s containerd"
  for role in api web; do
    docker save "${REGISTRY}/${role}:${GIT_SHA}" "${REGISTRY}/${role}:latest" \
      | sudo k3s ctr images import -
  done
else
  echo "==> No k3d/k3s runtime detected; skipping image import."
  echo "    (Set up a registry and push if deploying to a remote cluster.)"
fi

echo ""
echo "==> Build complete."
echo "    ${REGISTRY}/api:${GIT_SHA}"
echo "    ${REGISTRY}/web:${GIT_SHA}"
