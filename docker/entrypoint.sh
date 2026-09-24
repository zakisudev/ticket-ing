#!/bin/sh
set -eu

if [ "${MIGRATE_ON_START:-true}" = "true" ]; then
  attempt=1
  max_attempts="${MIGRATION_MAX_ATTEMPTS:-30}"
  retry_seconds="${MIGRATION_RETRY_SECONDS:-2}"

  echo "Applying database migrations before startup..."
  until npm run db:migrate:prod; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "Database migrations failed after ${max_attempts} attempts." >&2
      exit 1
    fi

    echo "Database is not ready; retrying migration in ${retry_seconds}s (${attempt}/${max_attempts})..." >&2
    attempt=$((attempt + 1))
    sleep "$retry_seconds"
  done
fi

exec "$@"

