#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/backend.pid"
UVICORN_CMD="uvicorn server:app --reload --port 8000"

if pgrep -f "$UVICORN_CMD" > /dev/null 2>&1; then
  pkill -f "$UVICORN_CMD" || true
fi

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    kill "$PID" || true
  fi
  rm -f "$PID_FILE"
fi

echo "Backend stopped"
