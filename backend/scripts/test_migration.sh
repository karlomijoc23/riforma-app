#!/usr/bin/env bash
#
# Test the Alembic migration against a fresh MariaDB instance.
#
# Usage:
#   cd backend
#   bash scripts/test_migration.sh
#
# Prerequisites:
#   - Docker installed and running
#   - Python venv with project deps (alembic, asyncmy, sqlalchemy, etc.)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_DIR="$(dirname "$BACKEND_DIR")"

DB_CONTAINER="riforma-migration-test"
DB_PORT=3399
DB_NAME="riforma_test"
DB_USER="riforma"
DB_PASS="riforma"

echo "=== Riforma Migration Test ==="

# ── 1. Start a fresh MariaDB container ───────────────────────────────
echo ""
echo "[1/5] Starting fresh MariaDB container on port $DB_PORT ..."

# Remove any previous test container
docker rm -f "$DB_CONTAINER" 2>/dev/null || true

docker run -d \
  --name "$DB_CONTAINER" \
  -e MARIADB_ROOT_PASSWORD=root \
  -e MARIADB_DATABASE="$DB_NAME" \
  -e MARIADB_USER="$DB_USER" \
  -e MARIADB_PASSWORD="$DB_PASS" \
  -p "$DB_PORT:3306" \
  --health-cmd="mysqladmin ping -h127.0.0.1 -p$DB_PASS" \
  --health-interval=3s \
  --health-retries=20 \
  --health-start-period=10s \
  mariadb:11.4 \
  --character-set-server=utf8mb4 \
  --collation-server=utf8mb4_unicode_ci \
  --lower_case_table_names=1

# Wait for healthy
echo "   Waiting for MariaDB to be ready ..."
for i in $(seq 1 30); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    echo "   MariaDB is ready."
    break
  fi
  sleep 2
done

STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null || echo "unknown")
if [ "$STATUS" != "healthy" ]; then
  echo "ERROR: MariaDB did not become healthy in time."
  docker logs "$DB_CONTAINER" 2>&1 | tail -20
  exit 1
fi

# ── 2. Run Alembic migration ─────────────────────────────────────────
echo ""
echo "[2/5] Running Alembic migration ..."

cd "$BACKEND_DIR"

export DATABASE_URL="mariadb+asyncmy://$DB_USER:$DB_PASS@127.0.0.1:$DB_PORT/$DB_NAME"

python -m alembic upgrade head
echo "   Migration completed successfully."

# ── 3. Verify tables ─────────────────────────────────────────────────
echo ""
echo "[3/5] Verifying tables ..."

EXPECTED_TABLES=(
  users saas_tenants tenant_memberships
  nekretnine property_units zakupnici ugovori
  dokumenti maintenance_tasks activity_logs
  parking_spaces handover_protocols
  projekti project_phases project_stakeholders
  project_transactions project_documents
  tenant_settings racuni oglasi
  notifications dobavljaci webhook_events
)

TABLES_OUTPUT=$(docker exec "$DB_CONTAINER" mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SHOW TABLES;" 2>/dev/null)

MISSING=0
for TABLE in "${EXPECTED_TABLES[@]}"; do
  if echo "$TABLES_OUTPUT" | grep -q "^${TABLE}$"; then
    echo "   OK  $TABLE"
  else
    echo "   MISSING  $TABLE"
    MISSING=$((MISSING + 1))
  fi
done

# Also check alembic_version table
if echo "$TABLES_OUTPUT" | grep -q "^alembic_version$"; then
  echo "   OK  alembic_version"
else
  echo "   MISSING  alembic_version"
  MISSING=$((MISSING + 1))
fi

if [ "$MISSING" -gt 0 ]; then
  echo ""
  echo "ERROR: $MISSING table(s) missing!"
  echo ""
  echo "All tables in DB:"
  echo "$TABLES_OUTPUT"
  exit 1
fi

echo "   All ${#EXPECTED_TABLES[@]} tables + alembic_version present."

# ── 4. Run seed script (optional) ────────────────────────────────────
echo ""
echo "[4/5] Running seed script ..."

export DB_HOST="127.0.0.1"
export DB_PORT="$DB_PORT"
export DB_USER="$DB_USER"
export DB_PASSWORD="$DB_PASS"
export DB_NAME="$DB_NAME"

python seed_demo.py && echo "   Seed completed." || echo "   Seed failed (non-critical)."

# ── 5. Verify seed data ──────────────────────────────────────────────
echo ""
echo "[5/5] Checking seed data ..."

COUNTS=$(docker exec "$DB_CONTAINER" mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "
  SELECT 'saas_tenants' AS t, COUNT(*) AS n FROM saas_tenants
  UNION ALL SELECT 'nekretnine', COUNT(*) FROM nekretnine
  UNION ALL SELECT 'property_units', COUNT(*) FROM property_units
  UNION ALL SELECT 'zakupnici', COUNT(*) FROM zakupnici
  UNION ALL SELECT 'ugovori', COUNT(*) FROM ugovori
  UNION ALL SELECT 'maintenance_tasks', COUNT(*) FROM maintenance_tasks;
" 2>/dev/null)

echo "$COUNTS"

# ── Cleanup ───────────────────────────────────────────────────────────
echo ""
read -p "Remove test container? [Y/n] " CLEANUP
CLEANUP=${CLEANUP:-Y}
if [[ "$CLEANUP" =~ ^[Yy]$ ]]; then
  docker rm -f "$DB_CONTAINER" >/dev/null
  echo "Container removed."
else
  echo "Container '$DB_CONTAINER' kept running on port $DB_PORT."
fi

echo ""
echo "=== Migration test complete ==="
