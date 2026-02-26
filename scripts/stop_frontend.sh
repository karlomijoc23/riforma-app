#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/frontend.pid"
START_SIGNATURE="craco start"

if pgrep -f "$START_SIGNATURE" > /dev/null 2>&1; then
  pkill -f "$START_SIGNATURE" || true
fi

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    kill "$PID" || true
  fi
  rm -f "$PID_FILE"
fi

echo "Frontend stopped"
