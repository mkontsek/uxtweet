#!/usr/bin/env bash
# build.sh – Build all apps and packages and produce Docker images.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
GIT_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
REGISTRY="${REGISTRY:-ghcr.io/mkontsek/uxtweet}"

echo "==> Building packages (git SHA: ${GIT_SHA})…"
cd "$ROOT_DIR"
pnpm build

echo "==> Building Docker image: server"
docker build \
  -f apps/server/Dockerfile \
  -t "${REGISTRY}/server:${GIT_SHA}" \
  -t "${REGISTRY}/server:latest" \
  .

echo "==> Building Docker image: client"
docker build \
  -f apps/client/Dockerfile \
  -t "${REGISTRY}/client:${GIT_SHA}" \
  -t "${REGISTRY}/client:latest" \
  .

echo ""
echo "==> Build complete."
echo "    ${REGISTRY}/server:${GIT_SHA}"
echo "    ${REGISTRY}/client:${GIT_SHA}"
