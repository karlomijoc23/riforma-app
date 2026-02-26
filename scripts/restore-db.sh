#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════
# Riforma MariaDB Restore Script
# Usage: bash restore-db.sh <backup-file.sql.gz>
# ══════════════════════════════════════════════════════

if [ $# -eq 0 ]; then
    echo "Usage: $0 <backup-file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lh /opt/riforma/backups/*.sql.gz 2>/dev/null || echo "  No backups found"
    exit 1
fi

BACKUP_FILE="$1"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-riforma}"
DB_USER="${DB_USER:-riforma}"
DB_PASSWORD="${DB_PASSWORD:-}"

# Load .env if exists
ENV_FILE="/opt/riforma/.env"
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: File not found: $BACKUP_FILE"
    exit 1
fi

echo "═══════════════════════════════════════════"
echo "  WARNING: This will OVERWRITE the database!"
echo "  Database: $DB_NAME"
echo "  Backup:   $BACKUP_FILE"
echo "═══════════════════════════════════════════"
echo ""
read -p "Are you sure? (type 'yes' to continue): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi

# Create pre-restore backup
echo ""
echo "[1/3] Creating pre-restore backup..."
PRE_RESTORE="/opt/riforma/backups/${DB_NAME}_pre_restore_$(date +%Y%m%d_%H%M%S).sql.gz"
mariadb-dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --password="$DB_PASSWORD" \
    --single-transaction \
    --databases "$DB_NAME" \
    | gzip > "$PRE_RESTORE"
echo "  Pre-restore backup: $PRE_RESTORE"

# Stop backend
echo ""
echo "[2/3] Stopping backend..."
sudo systemctl stop riforma-backend 2>/dev/null || echo "  Backend not running via systemd"

# Restore
echo ""
echo "[3/3] Restoring from backup..."
gunzip -c "$BACKUP_FILE" | mariadb \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --password="$DB_PASSWORD"

echo ""
echo "Restore complete! Starting backend..."
sudo systemctl start riforma-backend 2>/dev/null || echo "  Start backend manually"

echo ""
echo "Done. Verify at: http://localhost/health"
