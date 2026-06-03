#!/usr/bin/env bash
# setup.sh – Install tooling prerequisites for local development.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Installing Node.js dependencies…"
cd "$ROOT_DIR"
pnpm install

echo ""
echo "==> Setup complete. Available commands:"
echo "    pnpm dev            – Start all apps in development mode"
echo "    pnpm build          – Build all apps"
echo "    pnpm test           – Run all tests"
echo "    pnpm lint           – Lint all packages"
echo "    pnpm format         – Format all files with Prettier"
