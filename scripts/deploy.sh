#!/usr/bin/env bash
# deploy.sh – Deploy UXTweet to a local k3s cluster.
# Prerequisites: kubectl and helm pointed at the target (local) k3s cluster.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
INFRA_DIR="${ROOT_DIR}/infra/k3s-local"
GIT_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
# PoC: images are built and imported locally (see build.sh). Override REGISTRY to
# deploy from an external registry (Harbor, GHCR, …) once one is set up.
REGISTRY="${REGISTRY:-uxtweet}"

MONITORING_RELEASE="uxtweet-monitoring"
MONITORING_NAMESPACE="monitoring"
MONITORING_REPO_NAME="prometheus-community"
MONITORING_REPO_URL="https://prometheus-community.github.io/helm-charts"
MONITORING_CHART="${MONITORING_REPO_NAME}/kube-prometheus-stack"
MONITORING_CHART_VERSION="86.1.0"
MONITORING_VALUES="${INFRA_DIR}/monitoring/values.yaml"

echo "==> Deploying UXTweet (git SHA: ${GIT_SHA})…"

# Namespace first so the rest of the manifests have somewhere to land.
kubectl apply -f "${INFRA_DIR}/namespace.yaml"

# Bring up Redis + PostgreSQL first so the chat server can connect cleanly.
kubectl apply -f "${INFRA_DIR}/data-services.yaml"
kubectl rollout status deployment/uxtweet-redis -n uxtweet --timeout=120s
kubectl rollout status statefulset/uxtweet-postgres -n uxtweet --timeout=120s

# Apply the app manifests. `-f <dir>` is non-recursive, so the helm values and
# Prometheus CRs under monitoring/ are intentionally skipped here.
kubectl apply -f "${INFRA_DIR}/api-configmap.yaml" \
  -f "${INFRA_DIR}/api-deployment.yaml" \
  -f "${INFRA_DIR}/api-service.yaml" \
  -f "${INFRA_DIR}/api-hpa.yaml" \
  -f "${INFRA_DIR}/web-deployment.yaml" \
  -f "${INFRA_DIR}/web-service.yaml" \
  -f "${INFRA_DIR}/ingress.yaml" \
  -f "${INFRA_DIR}/pgweb.yaml"

# ── App rollout ───────────────────────────────────────────────────────────────
# Pin to the freshly-built SHA and wait. This runs before monitoring so the core
# app is up regardless of whether optional monitoring is available.
kubectl set image deployment/uxtweet-api \
  api="${REGISTRY}/api:${GIT_SHA}" \
  -n uxtweet

kubectl set image deployment/uxtweet-web \
  web="${REGISTRY}/web:${GIT_SHA}" \
  -n uxtweet

echo "==> Waiting for rollout…"
kubectl rollout status deployment/uxtweet-api -n uxtweet --timeout=120s
kubectl rollout status deployment/uxtweet-web -n uxtweet --timeout=120s
kubectl rollout status deployment/uxtweet-pgweb -n uxtweet --timeout=120s

# ── Monitoring: kube-prometheus-stack (Prometheus + Grafana + exporters) ──────
# Optional: skip cleanly if helm is absent so a missing tool never blocks the app.
if command -v helm >/dev/null 2>&1; then
  echo "==> Installing kube-prometheus-stack (${MONITORING_CHART_VERSION})"
  if ! helm repo list 2>/dev/null | awk -v repo="${MONITORING_REPO_NAME}" '$1 == repo { found = 1 } END { exit found ? 0 : 1 }'; then
    helm repo add "${MONITORING_REPO_NAME}" "${MONITORING_REPO_URL}"
  fi
  helm repo update "${MONITORING_REPO_NAME}"

  # Grafana admin credentials live in a Secret, not the chart values. Default to
  # admin/admin for local convenience; override via env for anything shared.
  GRAFANA_ADMIN_USER="${GRAFANA_ADMIN_USER:-admin}"
  GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-admin}"
  kubectl create namespace "${MONITORING_NAMESPACE}" \
    --dry-run=client -o yaml | kubectl apply -f -
  kubectl create secret generic uxtweet-grafana-admin \
    --namespace "${MONITORING_NAMESPACE}" \
    --from-literal=admin-user="${GRAFANA_ADMIN_USER}" \
    --from-literal=admin-password="${GRAFANA_ADMIN_PASSWORD}" \
    --dry-run=client -o yaml | kubectl apply -f -

  helm upgrade --install "${MONITORING_RELEASE}" "${MONITORING_CHART}" \
    --namespace "${MONITORING_NAMESPACE}" \
    --create-namespace \
    --version "${MONITORING_CHART_VERSION}" \
    --values "${MONITORING_VALUES}" \
    --wait \
    --timeout 10m

  # The Prometheus Operator CRDs now exist (helm --wait blocked until ready), so
  # it is safe to register our ServiceMonitor and the Grafana ingress.
  kubectl apply -f "${INFRA_DIR}/monitoring/api-servicemonitor.yaml"
  kubectl apply -f "${INFRA_DIR}/monitoring/grafana-ingress.yaml"
else
  echo "==> helm not found; skipping monitoring (install helm to enable Prometheus/Grafana)."
fi

echo ""
echo "==> Deployment complete."
kubectl get pods -n uxtweet
echo ""
echo "    App:     http://uxtweet.localhost"
echo "    DB:      http://db.localhost  (pgweb — browse tables, run queries)"
if command -v helm >/dev/null 2>&1; then
  echo "    Grafana: http://grafana.localhost  (user: ${GRAFANA_ADMIN_USER}, pass: set via GRAFANA_ADMIN_PASSWORD; default admin)"
fi
echo "    Tip: if *.localhost doesn't resolve, add '127.0.0.1 uxtweet.localhost db.localhost grafana.localhost' to /etc/hosts,"
echo "         or port-forward, e.g. kubectl -n ${MONITORING_NAMESPACE} port-forward svc/${MONITORING_RELEASE}-grafana 3001:80"
