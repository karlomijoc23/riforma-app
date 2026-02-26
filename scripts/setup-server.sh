#!/usr/bin/env bash
set -euo pipefail

# ══════════════════════════════════════════════════════
# Riforma Server Setup Script — Debian 12 + Apache2
# Run as root on fresh Debian 12 server
# Usage: sudo bash setup-server.sh
# ══════════════════════════════════════════════════════

INSTALL_DIR="/opt/riforma"
RIFORMA_USER="riforma"
WEB_ROOT="/var/www/riforma"
NODE_MAJOR=20

echo "═══════════════════════════════════════════"
echo "  Riforma Production Server Setup"
echo "  Debian 12 + Apache2 + MariaDB"
echo "═══════════════════════════════════════════"

# 1. System packages
echo ""
echo "[1/9] Installing system packages..."
apt-get update
apt-get install -y \
    python3 python3-venv python3-pip \
    apache2 \
    mariadb-server mariadb-client \
    git curl wget unzip \
    logrotate \
    ufw \
    ca-certificates gnupg

# 2. Install Node.js 20 (for building frontend)
echo ""
echo "[2/9] Installing Node.js ${NODE_MAJOR}..."
if ! command -v node &>/dev/null; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update
    apt-get install -y nodejs
    corepack enable
    echo "  Node.js $(node --version) installed"
else
    echo "  Node.js $(node --version) already installed"
fi

# 3. Create riforma user
echo ""
echo "[3/9] Creating riforma user..."
if ! id "$RIFORMA_USER" &>/dev/null; then
    useradd -r -m -d "$INSTALL_DIR" -s /bin/bash "$RIFORMA_USER"
    echo "  Created user: $RIFORMA_USER"
else
    echo "  User $RIFORMA_USER already exists"
fi

# 4. Create directory structure
echo ""
echo "[4/9] Creating directories..."
mkdir -p "$INSTALL_DIR"/{backend,frontend,logs,backups,uploads}
mkdir -p "$WEB_ROOT"
chown -R "$RIFORMA_USER":"$RIFORMA_USER" "$INSTALL_DIR"
chown -R www-data:www-data "$WEB_ROOT"

# 5. Setup MariaDB
echo ""
echo "[5/9] Configuring MariaDB..."
systemctl enable mariadb
systemctl start mariadb

echo ""
echo "  Run 'mariadb-secure-installation' manually after setup."
echo "  Then create database:"
echo "    CREATE DATABASE riforma CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
echo "    CREATE USER 'riforma'@'localhost' IDENTIFIED BY 'YOUR_STRONG_PASSWORD';"
echo "    GRANT ALL PRIVILEGES ON riforma.* TO 'riforma'@'localhost';"
echo "    FLUSH PRIVILEGES;"

# 6. Setup Python venv
echo ""
echo "[6/9] Setting up Python virtual environment..."
sudo -u "$RIFORMA_USER" python3 -m venv "$INSTALL_DIR/backend/.venv"
sudo -u "$RIFORMA_USER" "$INSTALL_DIR/backend/.venv/bin/pip" install --upgrade pip

# 7. Configure Apache2
echo ""
echo "[7/9] Configuring Apache2..."

# Enable required modules
a2enmod proxy proxy_http rewrite headers deflate ssl
a2dissite 000-default 2>/dev/null || true

# Install riforma VirtualHost
if [ -f "$INSTALL_DIR/apache/riforma.conf" ]; then
    cp "$INSTALL_DIR/apache/riforma.conf" /etc/apache2/sites-available/riforma.conf
    a2ensite riforma
    apachectl configtest && systemctl restart apache2
    echo "  Apache2 configured with riforma VirtualHost"
else
    echo "  SKIP: apache/riforma.conf not found (copy it to $INSTALL_DIR/apache/ first)"
fi

# 8. Setup firewall
echo ""
echo "[8/9] Configuring firewall (UFW)..."
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
echo "  Run 'ufw enable' manually to activate firewall"
echo "  If using VPN, also allow VPN port: ufw allow 51820/udp (WireGuard)"

# 9. Install systemd services
echo ""
echo "[9/9] Installing systemd services..."
if [ -d "$INSTALL_DIR/deploy" ]; then
    cp "$INSTALL_DIR/deploy/riforma-backend.service" /etc/systemd/system/
    cp "$INSTALL_DIR/deploy/riforma-backup.service" /etc/systemd/system/
    cp "$INSTALL_DIR/deploy/riforma-backup.timer" /etc/systemd/system/
    cp "$INSTALL_DIR/deploy/logrotate-riforma" /etc/logrotate.d/riforma
    systemctl daemon-reload
    systemctl enable riforma-backend
    systemctl enable riforma-backup.timer
    systemctl enable apache2
    echo "  Systemd services installed"
else
    echo "  SKIP: deploy/ directory not found (copy it to $INSTALL_DIR/deploy/ first)"
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  Setup complete!"
echo "═══════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo "  1. Copy your code to $INSTALL_DIR/"
echo "  2. Copy .env.production.example to $INSTALL_DIR/.env and fill values"
echo "  3. Generate AUTH_SECRET:"
echo "     python3 -c \"import secrets; print(secrets.token_urlsafe(64))\""
echo "  4. Run: mariadb-secure-installation"
echo "  5. Create database (see step 5 above)"
echo "  6. Install backend deps:"
echo "     sudo -u $RIFORMA_USER $INSTALL_DIR/backend/.venv/bin/pip install -r $INSTALL_DIR/backend/requirements.txt"
echo "  7. Build frontend:"
echo "     cd $INSTALL_DIR/frontend && npm install && GENERATE_SOURCEMAP=false npx craco build"
echo "     cp -r build/* $WEB_ROOT/"
echo "     chown -R www-data:www-data $WEB_ROOT"
echo "  8. Start services:"
echo "     systemctl start riforma-backend"
echo "     systemctl restart apache2"
echo "     systemctl start riforma-backup.timer"
echo "  9. Enable firewall: ufw enable"
echo " 10. (Optional) SSL with certbot:"
echo "     apt install certbot python3-certbot-apache"
echo "     certbot --apache -d riforma.hr"
echo ""
