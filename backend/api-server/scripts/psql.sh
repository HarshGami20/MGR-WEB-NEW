#!/usr/bin/env bash
# Run psql against the same database as Prisma. Prisma URLs often include
# ?schema=public which libpq accepts but psql rejects ("invalid URI query parameter: schema").
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

PSQL_URL="${DATABASE_URL%%\?*}"
exec psql "$PSQL_URL" "$@"
