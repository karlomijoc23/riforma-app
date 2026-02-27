#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# Riforma Backup/Restore Verification
# Takes a fresh backup, restores it into a temporary database,
# and compares row counts to verify integrity.
# ──────────────────────────────────────────────────────────────

# ─── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
BOLD='\033[1m'

# ─── Configuration (same pattern as backup-db.sh) ───────────
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_NAME:-riforma}"
DB_USER="${DB_USER:-riforma}"
DB_PASSWORD="${DB_PASSWORD:-}"

# Load .env if exists
ENV_FILE="/opt/riforma/.env"
for arg in "$@"; do
    case "$arg" in
        --env-file=*) ENV_FILE="${arg#*=}" ;;
        --help|-h)
            echo "Usage: $0 [--env-file=/path/to/.env]"
            echo "  Tests backup/restore by dumping production DB,"
            echo "  restoring into a temp DB, and comparing row counts."
            exit 0
            ;;
    esac
done

if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

# ─── Derived names ───────────────────────────────────────────
TEST_DB="riforma_backup_test_$$"
DUMP_FILE="/tmp/riforma_backup_test_$$.sql"

MYSQL_OPTS="--host=$DB_HOST --port=$DB_PORT --user=$DB_USER --password=$DB_PASSWORD"

# ─── Cleanup on exit ────────────────────────────────────────
cleanup() {
    echo ""
    echo -e "${BOLD}Cleaning up...${NC}"
    mariadb $MYSQL_OPTS -e "DROP DATABASE IF EXISTS \`$TEST_DB\`;" 2>/dev/null || true
    rm -f "$DUMP_FILE"
    echo "  Dropped test database: $TEST_DB"
    echo "  Removed temp dump: $DUMP_FILE"
}
trap cleanup EXIT

# ─── Step 1: Take a fresh backup ────────────────────────────
echo -e "${BOLD}Step 1: Taking fresh backup of '$DB_NAME'...${NC}"
mariadb-dump \
    $MYSQL_OPTS \
    --single-transaction \
    --routines \
    --triggers \
    "$DB_NAME" \
    > "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "  Dump created: $DUMP_FILE ($DUMP_SIZE)"

if [ ! -s "$DUMP_FILE" ]; then
    echo -e "${RED}FAIL: Dump file is empty!${NC}"
    exit 1
fi

# ─── Step 2: Create temporary test database ──────────────────
echo -e "\n${BOLD}Step 2: Creating test database '$TEST_DB'...${NC}"
mariadb $MYSQL_OPTS -e "CREATE DATABASE \`$TEST_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "  Created: $TEST_DB"

# ─── Step 3: Restore into test database ─────────────────────
echo -e "\n${BOLD}Step 3: Restoring backup into test database...${NC}"
# Replace the USE statement and database references in the dump
sed "s/\`$DB_NAME\`/\`$TEST_DB\`/g" "$DUMP_FILE" | mariadb $MYSQL_OPTS "$TEST_DB"
echo "  Restore complete."

# ─── Step 4: Compare row counts ─────────────────────────────
echo -e "\n${BOLD}Step 4: Comparing row counts...${NC}"
echo ""

MISMATCH=0

# Get all tables from production
TABLES=$(mariadb $MYSQL_OPTS -N -e "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;")

printf "  %-40s %10s %10s %s\n" "TABLE" "PROD" "RESTORED" "STATUS"
printf "  %-40s %10s %10s %s\n" "────────────────────────────────────────" "──────────" "──────────" "──────"

for TABLE in $TABLES; do
    PROD_COUNT=$(mariadb $MYSQL_OPTS -N -e "SELECT COUNT(*) FROM \`$DB_NAME\`.\`$TABLE\`;" 2>/dev/null || echo "ERR")
    TEST_COUNT=$(mariadb $MYSQL_OPTS -N -e "SELECT COUNT(*) FROM \`$TEST_DB\`.\`$TABLE\`;" 2>/dev/null || echo "ERR")

    if [ "$PROD_COUNT" = "$TEST_COUNT" ]; then
        STATUS="${GREEN}OK${NC}"
    else
        STATUS="${RED}MISMATCH${NC}"
        ((MISMATCH++))
    fi

    printf "  %-40s %10s %10s " "$TABLE" "$PROD_COUNT" "$TEST_COUNT"
    echo -e "$STATUS"
done

# ─── Result ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}────────────────────────────────────────${NC}"

if [ "$MISMATCH" -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}PASS${NC} — All table row counts match."
    echo -e "${BOLD}────────────────────────────────────────${NC}"
    exit 0
else
    echo -e "  ${RED}${BOLD}FAIL${NC} — $MISMATCH table(s) have mismatched row counts."
    echo -e "${BOLD}────────────────────────────────────────${NC}"
    exit 1
fi
