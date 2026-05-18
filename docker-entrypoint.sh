#!/usr/bin/env bash
set -euo pipefail

# Run pending migrations against the database before starting the app.
# Set SKIP_MIGRATIONS=1 to bypass (e.g. when running a worker-only container
# alongside another instance that owns the schema).
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "[entrypoint] running prisma migrate deploy"
  pnpm db:deploy
fi

exec "$@"
