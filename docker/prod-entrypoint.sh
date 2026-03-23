#!/usr/bin/env bash
# Run Gunicorn (Flask) and Next.js production server. If either exits, stop the other.
set -euo pipefail

FLASK_PORT="${FLASK_PORT:-5001}"
NEXT_PORT="${NEXT_PORT:-3000}"
GUNICORN_WORKERS="${GUNICORN_WORKERS:-2}"
GUNICORN_THREADS="${GUNICORN_THREADS:-2}"
GUNICORN_TIMEOUT="${GUNICORN_TIMEOUT:-120}"

(
  cd /app/backend
  exec uv run gunicorn \
    --bind "0.0.0.0:${FLASK_PORT}" \
    --workers "${GUNICORN_WORKERS}" \
    --threads "${GUNICORN_THREADS}" \
    --timeout "${GUNICORN_TIMEOUT}" \
    --access-logfile - \
    --error-logfile - \
    wsgi:app
) &
(
  cd /app/frontend
  exec pnpm exec next start -H 0.0.0.0 -p "${NEXT_PORT}"
) &

wait -n
status=$?
kill $(jobs -p) 2>/dev/null || true
wait || true
exit "${status}"
