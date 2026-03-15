#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/backend.pid"
UVICORN_PATTERN="uvicorn app.main:app"

if pgrep -f "$UVICORN_PATTERN" > /dev/null 2>&1; then
  pkill -f "$UVICORN_PATTERN" || true
fi

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    kill "$PID" || true
  fi
  rm -f "$PID_FILE"
fi

echo "Backend stopped"
