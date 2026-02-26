#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
PID_FILE="$ROOT_DIR/frontend.pid"
LOG_FILE="$ROOT_DIR/frontend.log"
START_SIGNATURE="craco start"
YARN_CMD=(corepack yarn)

if pgrep -f "$START_SIGNATURE" > /dev/null 2>&1; then
  echo "Frontend already running"
  exit 0
fi

cd "$FRONTEND_DIR"

if [ ! -f "yarn.lock" ]; then
  echo "yarn.lock not found. Run 'corepack yarn install' first." >&2
  exit 1
fi

"${YARN_CMD[@]}" install --silent --frozen-lockfile --check-files
export REACT_APP_DEV_AUTH_TOKEN="${REACT_APP_DEV_AUTH_TOKEN:-token123}"
HOST=0.0.0.0 BROWSER=none nohup "${YARN_CMD[@]}" start > "$LOG_FILE" 2>&1 &
PID=$!
echo $PID > "$PID_FILE"
echo "Frontend started with PID $PID (logs: $LOG_FILE)"
