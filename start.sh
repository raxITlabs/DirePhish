#!/bin/bash
# Start DirePhish
#
# Usage:
#   ./start.sh           — bare metal (local dev with portless)
#   ./start.sh docker     — Docker dev (hot reload)
#   ./start.sh prod       — Docker prod (Gunicorn + next start)
#   ./start.sh stop       — stop Docker containers + remove portless aliases
#
# Prerequisites: npm install -g portless
# One-time setup: portless proxy start --https

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

MODE="${1:-dev}"

# Ensure portless proxy is running and clear stale aliases
ensure_portless() {
  if ! portless list &>/dev/null; then
    echo "Starting portless proxy..."
    portless proxy start --https
  fi
  # Remove stale aliases from previous runs
  portless alias --remove direphish 2>/dev/null || true
  portless alias --remove api.direphish 2>/dev/null || true
}

register_aliases() {
  portless alias direphish 3000 --force
  portless alias api.direphish 5001 --force
}

print_urls() {
  echo ""
  echo "==================================="
  echo "  DirePhish is running ($1)"
  echo "  Frontend: https://direphish.localhost:1355"
  echo "  Backend:  https://api.direphish.localhost:1355"
  echo "  Press Ctrl+C to stop"
  echo "==================================="
  echo ""
}

case "$MODE" in
  dev)
    ensure_portless

    cleanup() {
      echo ""
      echo "Shutting down..."
      kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
      wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
      echo "Done."
    }
    trap cleanup EXIT INT TERM

    echo "Starting Flask backend..."
    cd "$PROJECT_DIR/backend"
    portless api.direphish --app-port 5001 --force -- uv run python run.py &
    BACKEND_PID=$!

    for i in $(seq 1 15); do
      if curl -s http://localhost:5001/health > /dev/null 2>&1; then
        echo "Backend ready."
        break
      fi
      sleep 1
    done

    echo "Starting Next.js frontend..."
    cd "$PROJECT_DIR/frontend"
    mkdir -p "$PROJECT_DIR/frontend/.next"
    portless direphish --force -- pnpm dev > "$PROJECT_DIR/frontend/.next/dev.log" 2>&1 &
    FRONTEND_PID=$!
    for i in $(seq 1 15); do
      if [ -f "$PROJECT_DIR/frontend/.next/dev.log" ] && grep -q "Ready in" "$PROJECT_DIR/frontend/.next/dev.log" 2>/dev/null; then
        echo "Frontend ready. (logs: frontend/.next/dev.log)"
        break
      fi
      sleep 1
    done

    # Tail the backend log file so MissionControl output is visible
    echo ""
    echo "Tailing backend logs (Ctrl+C to stop)..."
    echo ""
    tail -f "$PROJECT_DIR/backend/logs/$(date +%Y-%m-%d).log" | grep --line-buffered "console._out\|ERROR\|WARNING" | sed 's/.*console._out:[0-9]*] //' &
    TAIL_PID=$!

    print_urls "bare metal"
    wait
    ;;

  docker)
    ensure_portless
    docker compose up --build -d
    echo "Waiting for containers..."
    sleep 10
    register_aliases
    print_urls "Docker dev"
    echo "Logs: docker compose logs -f"
    ;;

  prod)
    ensure_portless
    docker compose -f docker-compose.prod.yml up --build -d
    echo "Waiting for containers..."
    sleep 15
    register_aliases
    print_urls "Docker prod"
    echo "Logs: docker compose -f docker-compose.prod.yml logs -f"
    ;;

  stop)
    echo "Stopping containers..."
    docker compose down 2>/dev/null || true
    docker compose -f docker-compose.prod.yml down 2>/dev/null || true
    portless alias --remove direphish 2>/dev/null || true
    portless alias --remove api.direphish 2>/dev/null || true
    echo "Stopped."
    ;;

  *)
    echo "Usage: ./start.sh [dev|docker|prod|stop]"
    exit 1
    ;;
esac
