#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PID_FILE="$ROOT_DIR/backend.pid"
LOG_FILE="$ROOT_DIR/uvicorn.log"
VENV_DIR="$BACKEND_DIR/.venv"
UVICORN_CMD="uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

if pgrep -f "$UVICORN_CMD" > /dev/null; then
  echo "Backend already running"
  exit 0
fi

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

cd "$BACKEND_DIR"
nohup $UVICORN_CMD > "$LOG_FILE" 2>&1 &
PID=$!
echo $PID > "$PID_FILE"
echo "Backend started with PID $PID (logs: $LOG_FILE)"
