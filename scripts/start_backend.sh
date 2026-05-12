#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PID_FILE="$ROOT_DIR/backend.pid"
LOG_FILE="$ROOT_DIR/uvicorn.log"
# Prefer the Homebrew-Python venv if present. Apple's CommandLineTools
# Python is SIP-protected and strips DYLD_* env vars from spawned
# processes, which breaks WeasyPrint's native library lookup. The brew
# venv (.venv-brew) doesn't have that problem.
if [ -d "$BACKEND_DIR/.venv-brew" ]; then
  VENV_DIR="$BACKEND_DIR/.venv-brew"
else
  VENV_DIR="$BACKEND_DIR/.venv"
fi
UVICORN_RELOAD="${UVICORN_RELOAD:-true}"
RELOAD_FLAG=""
if [ "$UVICORN_RELOAD" = "true" ]; then
  RELOAD_FLAG="--reload"
fi
UVICORN_CMD="uvicorn app.main:app $RELOAD_FLAG --host 0.0.0.0 --port 8000"

if pgrep -f "$UVICORN_CMD" > /dev/null; then
  echo "Backend already running"
  exit 0
fi

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

# WeasyPrint needs Homebrew's pango / cairo / gdk-pixbuf on macOS. Python's
# ctypes loader doesn't search /opt/homebrew/lib by default, so PDF
# generation fails with "cannot load library 'libgobject-2.0-0'" unless
# we point DYLD_FALLBACK_LIBRARY_PATH at the Homebrew prefix.
if [ -d "/opt/homebrew/lib" ]; then
  export DYLD_FALLBACK_LIBRARY_PATH="/opt/homebrew/lib:${DYLD_FALLBACK_LIBRARY_PATH:-}"
fi

cd "$BACKEND_DIR"
nohup $UVICORN_CMD > "$LOG_FILE" 2>&1 &
PID=$!
echo $PID > "$PID_FILE"
echo "Backend started with PID $PID (logs: $LOG_FILE)"
