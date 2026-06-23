#!/usr/bin/env bash
# Seed all product and variant stock to a fixed quantity (default 1000).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set (add it to .env in api-server)" >&2
  exit 1
fi

exec node "$ROOT/scripts/seed-stock.mjs" "$@"
