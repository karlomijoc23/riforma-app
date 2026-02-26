#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════
# Riforma Deploy/Update Script — Debian 12 + Apache2
# Run on the server when deploying new code
# Usage: bash deploy.sh [--skip-frontend] [--skip-backend]
# ══════════════════════════════════════════════════════

INSTALL_DIR="/opt/riforma"
WEB_ROOT="/var/www/riforma"
SKIP_FRONTEND=false
SKIP_BACKEND=false

for arg in "$@"; do
    case "$arg" in
        --skip-frontend) SKIP_FRONTEND=true ;;
        --skip-backend) SKIP_BACKEND=true ;;
    esac
done

echo "═══════════════════════════════════════════"
echo "  Riforma Deploy"
echo "  $(date)"
echo "═══════════════════════════════════════════"

# Pull latest code
echo ""
echo "[1/5] Pulling latest code..."
cd "$INSTALL_DIR"
git pull origin main

# Backend
if [ "$SKIP_BACKEND" = false ]; then
    echo ""
    echo "[2/5] Updating backend..."
    "$INSTALL_DIR/backend/.venv/bin/pip" install -r "$INSTALL_DIR/backend/requirements.txt" --quiet

    echo "  Restarting backend..."
    sudo systemctl restart riforma-backend
    echo "  Backend restarted"
else
    echo ""
    echo "[2/5] Skipping backend (--skip-backend)"
fi

# Frontend
if [ "$SKIP_FRONTEND" = false ]; then
    echo ""
    echo "[3/5] Building frontend..."
    cd "$INSTALL_DIR/frontend"
    npm install --silent
    GENERATE_SOURCEMAP=false npx craco build

    echo "  Deploying to $WEB_ROOT..."
    rm -rf "$WEB_ROOT"/*
    cp -r build/* "$WEB_ROOT/"
    chown -R www-data:www-data "$WEB_ROOT"
    echo "  Frontend deployed"
else
    echo ""
    echo "[3/5] Skipping frontend (--skip-frontend)"
fi

# Reload Apache2
echo ""
echo "[4/5] Reloading Apache2..."
sudo apachectl configtest && sudo systemctl reload apache2

# Health check
echo ""
echo "[5/5] Health check..."
sleep 3
HEALTH=$(curl -s http://localhost:8000/health 2>/dev/null || echo '{"status":"error"}')
READY=$(curl -s http://localhost:8000/ready 2>/dev/null || echo '{"status":"error"}')

echo "  /health: $HEALTH"
echo "  /ready:  $READY"

echo ""
echo "═══════════════════════════════════════════"
echo "  Deploy complete!"
echo "═══════════════════════════════════════════"
