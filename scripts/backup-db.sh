#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# Riforma MariaDB Backup Script
# Runs daily via systemd timer or cron
# ──────────────────────────────────────────────

# Configuration (override via environment or .env)
BACKUP_DIR="${BACKUP_DIR:-/opt/riforma/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
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

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup of ${DB_NAME}..."

# Perform backup with compression
mariadb-dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --user="$DB_USER" \
    --password="$DB_PASSWORD" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    --databases "$DB_NAME" \
    | gzip > "$BACKUP_FILE"

# Verify backup was created and has content
if [ -s "$BACKUP_FILE" ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] Backup successful: $BACKUP_FILE ($SIZE)"
else
    echo "[$(date)] ERROR: Backup file is empty!" >&2
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Clean up old backups
echo "[$(date)] Removing backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete

# List remaining backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -type f | wc -l)
echo "[$(date)] Done. ${BACKUP_COUNT} backups on disk."
