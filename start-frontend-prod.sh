#!/bin/bash
# Start DirePhish with a production-built Next.js frontend (pnpm build + next start).
# Backend runs the same as ./start.sh dev (Flask on 5001).
#
# Usage:
#   ./start-frontend-prod.sh
#
# Prerequisites: npm install -g portless; pnpm install in frontend/
# One-time setup: portless proxy start --https

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

ensure_portless() {
  if ! portless list &>/dev/null; then
    echo "Starting portless proxy..."
    portless proxy start --https
  fi
  portless alias --remove direphish 2>/dev/null || true
  portless alias --remove api.direphish 2>/dev/null || true
}

print_urls() {
  echo ""
  echo "==================================="
  echo "  DirePhish — frontend prod build"
  echo "  Frontend: https://direphish.localhost:1355"
  echo "  Backend:  https://api.direphish.localhost:1355"
  echo "  Press Ctrl+C to stop"
  echo "==================================="
  echo ""
}

ensure_portless

pkill -f "tail -f.*backend/logs.*\\.log" 2>/dev/null || true

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID $TAIL_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID $TAIL_PID 2>/dev/null
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

echo "Building Next.js frontend..."
cd "$PROJECT_DIR/frontend"
pnpm build

mkdir -p "$PROJECT_DIR/frontend/.next"
echo "Starting Next.js (production)..."
portless direphish --force -- pnpm exec next start --hostname 0.0.0.0 > "$PROJECT_DIR/frontend/.next/start.log" 2>&1 &
FRONTEND_PID=$!

for i in $(seq 1 30); do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "Frontend ready. (logs: frontend/.next/start.log)"
    break
  fi
  sleep 1
done

echo ""
echo "Tailing backend logs (Ctrl+C to stop)..."
echo ""
tail -f "$PROJECT_DIR/backend/logs/$(date +%Y-%m-%d).log" | grep --line-buffered "console._out\|ERROR\|WARNING" | sed 's/.*console._out:[0-9]*] //' &
TAIL_PID=$!

print_urls
wait
