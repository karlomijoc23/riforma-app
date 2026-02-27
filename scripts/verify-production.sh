#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# Riforma Production Pre-flight Verification
# Runs 13 checks to confirm server is correctly configured.
# Exit 1 on any FAIL, 0 otherwise (WARNs are non-blocking).
# ──────────────────────────────────────────────────────────────

# ─── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

pass() { ((PASS_COUNT++)); echo -e "  ${GREEN}PASS${NC}  $1"; }
warn() { ((WARN_COUNT++)); echo -e "  ${YELLOW}WARN${NC}  $1"; }
fail() { ((FAIL_COUNT++)); echo -e "  ${RED}FAIL${NC}  $1"; }

# ─── Parse args ──────────────────────────────────────────────
ENV_FILE="/opt/riforma/.env"
for arg in "$@"; do
    case "$arg" in
        --env-file=*) ENV_FILE="${arg#*=}" ;;
        --help|-h)
            echo "Usage: $0 [--env-file=/path/to/.env]"
            echo "  Defaults to /opt/riforma/.env"
            exit 0
            ;;
    esac
done

# ─── Load .env ───────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
    echo -e "${CYAN}Loaded env from:${NC} $ENV_FILE"
else
    echo -e "${YELLOW}Warning: $ENV_FILE not found, using current environment${NC}"
fi

echo ""
echo -e "${BOLD}Running production checks...${NC}"
echo ""

# ─── 1. ENVIRONMENT=production ───────────────────────────────
if [ "${ENVIRONMENT:-}" = "production" ]; then
    pass "ENVIRONMENT=production"
else
    fail "ENVIRONMENT is '${ENVIRONMENT:-unset}', expected 'production'"
fi

# ─── 2. AUTH_SECRET ──────────────────────────────────────────
if [ -z "${AUTH_SECRET:-}" ]; then
    fail "AUTH_SECRET is not set"
elif [ "$AUTH_SECRET" = "dev-only-insecure-secret-do-not-use-in-prod" ]; then
    fail "AUTH_SECRET is the dev default — generate a real secret"
elif [ ${#AUTH_SECRET} -lt 32 ]; then
    fail "AUTH_SECRET is too short (${#AUTH_SECRET} chars, need >= 32)"
else
    pass "AUTH_SECRET is set (${#AUTH_SECRET} chars)"
fi

# ─── 3. SEED_ADMIN_ON_STARTUP ───────────────────────────────
if [ "${SEED_ADMIN_ON_STARTUP:-false}" = "true" ]; then
    warn "SEED_ADMIN_ON_STARTUP is true — disable after initial deploy"
else
    pass "SEED_ADMIN_ON_STARTUP is false"
fi

# ─── 4. DATABASE_URL uses MariaDB ───────────────────────────
DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
    # Check individual components
    if [ -n "${DB_HOST:-}" ]; then
        pass "Database configured via DB_HOST/DB_USER/etc."
    else
        fail "Neither DATABASE_URL nor DB_HOST is set"
    fi
elif echo "$DB_URL" | grep -qi "sqlite"; then
    fail "DATABASE_URL uses SQLite — must use MariaDB in production"
else
    pass "DATABASE_URL uses MariaDB"
fi

# ─── 5. SENTRY_DSN_BACKEND ──────────────────────────────────
if [ -z "${SENTRY_DSN_BACKEND:-}" ]; then
    warn "SENTRY_DSN_BACKEND is not set — no error tracking"
else
    pass "SENTRY_DSN_BACKEND is configured"
fi

# ─── 6. CORS has no localhost ────────────────────────────────
CORS="${BACKEND_CORS_ORIGINS:-}"
if [ -z "$CORS" ]; then
    fail "BACKEND_CORS_ORIGINS is not set"
elif echo "$CORS" | grep -qiE "localhost|127\.0\.0\.1"; then
    fail "BACKEND_CORS_ORIGINS contains localhost: $CORS"
else
    pass "BACKEND_CORS_ORIGINS has no localhost"
fi

# ─── 7. SSL cert exists ─────────────────────────────────────
# Try to extract domain from Apache config or CORS
DOMAIN=""
if [ -n "$CORS" ]; then
    DOMAIN=$(echo "$CORS" | tr ',' '\n' | head -1 | sed 's|https\?://||' | sed 's|/.*||')
fi
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
if [ -n "$DOMAIN" ] && [ -f "$CERT_PATH" ]; then
    pass "SSL cert exists for $DOMAIN"
elif [ -n "$DOMAIN" ]; then
    warn "SSL cert not found at $CERT_PATH"
else
    warn "Could not determine domain for SSL check"
fi

# ─── 8. Backup timer active ─────────────────────────────────
if command -v systemctl &>/dev/null; then
    if systemctl is-active --quiet riforma-backup.timer 2>/dev/null; then
        pass "Backup timer is active"
    elif systemctl is-enabled --quiet riforma-backup.timer 2>/dev/null; then
        warn "Backup timer is enabled but not active"
    else
        warn "Backup timer (riforma-backup.timer) not found or not enabled"
    fi
else
    warn "systemctl not available — cannot check backup timer"
fi

# ─── 9. /health returns 200 ─────────────────────────────────
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/health 2>/dev/null || echo "000")
if [ "$HEALTH_STATUS" = "200" ]; then
    pass "/health returns 200"
else
    fail "/health returned $HEALTH_STATUS (expected 200)"
fi

# ─── 10. /ready returns 200 ─────────────────────────────────
READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/ready 2>/dev/null || echo "000")
if [ "$READY_STATUS" = "200" ]; then
    pass "/ready returns 200"
else
    fail "/ready returned $READY_STATUS (expected 200)"
fi

# ─── 11. Uploads directory writable ─────────────────────────
UPLOAD_DIR="${UPLOAD_DIR:-/opt/riforma/backend/uploads}"
if [ -d "$UPLOAD_DIR" ] && [ -w "$UPLOAD_DIR" ]; then
    pass "Uploads directory is writable: $UPLOAD_DIR"
elif [ -d "$UPLOAD_DIR" ]; then
    fail "Uploads directory exists but is not writable: $UPLOAD_DIR"
else
    fail "Uploads directory does not exist: $UPLOAD_DIR"
fi

# ─── 12. Log directory writable ─────────────────────────────
LOG_DIR="${APACHE_LOG_DIR:-/var/log/apache2}"
if [ -d "$LOG_DIR" ] && [ -w "$LOG_DIR" ]; then
    pass "Log directory is writable: $LOG_DIR"
elif [ -d "$LOG_DIR" ]; then
    fail "Log directory exists but is not writable: $LOG_DIR"
else
    fail "Log directory does not exist: $LOG_DIR"
fi

# ─── 13. Apache config test ─────────────────────────────────
if command -v apachectl &>/dev/null; then
    if apachectl configtest 2>/dev/null; then
        pass "Apache config test passed"
    else
        fail "Apache config test failed"
    fi
elif command -v apache2ctl &>/dev/null; then
    if apache2ctl configtest 2>/dev/null; then
        pass "Apache config test passed"
    else
        fail "Apache config test failed"
    fi
else
    warn "apachectl not found — cannot test Apache config"
fi

# ─── Summary ─────────────────────────────────────────────────
echo ""
echo -e "${BOLD}────────────────────────────────────────${NC}"
echo -e "  ${GREEN}PASS: $PASS_COUNT${NC}  ${YELLOW}WARN: $WARN_COUNT${NC}  ${RED}FAIL: $FAIL_COUNT${NC}"
echo -e "${BOLD}────────────────────────────────────────${NC}"

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "\n${RED}${BOLD}Production check FAILED — fix the issues above before deploying.${NC}"
    exit 1
else
    if [ "$WARN_COUNT" -gt 0 ]; then
        echo -e "\n${YELLOW}All critical checks passed, but review warnings above.${NC}"
    else
        echo -e "\n${GREEN}${BOLD}All checks passed — ready for production.${NC}"
    fi
    exit 0
fi
