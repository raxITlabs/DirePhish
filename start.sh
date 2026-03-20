#!/bin/bash
# Start Crucible — Flask backend + Next.js frontend
# Usage: ./start.sh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT TERM

# Start Flask backend
echo "Starting Flask backend on port 5001..."
cd "$BACKEND_DIR"
uv run python -m flask --app app run --port 5001 &
BACKEND_PID=$!

# Wait for backend to be ready
for i in $(seq 1 15); do
  if curl -s http://localhost:5001/health > /dev/null 2>&1; then
    echo "Backend ready."
    break
  fi
  sleep 1
done

# Start Next.js frontend
echo "Starting Next.js frontend on port 3000..."
cd "$FRONTEND_DIR"
pnpm dev &
FRONTEND_PID=$!

echo ""
echo "==================================="
echo "  Crucible is running"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5001"
echo "  Press Ctrl+C to stop"
echo "==================================="
echo ""

wait
