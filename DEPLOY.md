# Riforma — Production Deployment Guide

## Debian 12 + Apache2 + MariaDB (bare-metal)

### Preduvjeti

- Debian 12 server
- Pristup preko VPN-a ili javni IP s firewall-om
- Najmanje 2GB RAM, 20GB disk
- Root pristup za inicijalni setup

---

## 1. Inicijalni setup servera

```bash
# Kloniraj repo
sudo mkdir -p /opt/riforma
sudo chown $USER:$USER /opt/riforma
cd /opt/riforma
git clone <REPO_URL> .

# Pokreni setup skriptu (instaliraj pakete, Apache2, MariaDB, Node.js)
sudo bash scripts/setup-server.sh
```

Setup skripta instalira:

- Python 3, venv, pip
- Apache2 s modulima: proxy, rewrite, headers, deflate, ssl
- MariaDB server + client
- Node.js 20 (za build frontenda)
- UFW firewall
- Systemd servise za backend, backup timer

---

## 2. Konfiguriraj bazu

```bash
# Pokreni sigurnosnu konfiguraciju MariaDB
sudo mariadb-secure-installation

# Kreiraj bazu i korisnika
sudo mariadb -e "
CREATE DATABASE riforma CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'riforma'@'localhost' IDENTIFIED BY 'TVOJA_JAKA_LOZINKA';
GRANT ALL PRIVILEGES ON riforma.* TO 'riforma'@'localhost';
FLUSH PRIVILEGES;
"
```

---

## 3. Konfiguriraj environment

```bash
cp .env.production.example .env
nano .env
```

| Varijabla                 | Opis                      | Primjer                                                         |
| ------------------------- | ------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`            | Connection string         | `mariadb+asyncmy://riforma:LOZINKA@127.0.0.1:3306/riforma`      |
| `DB_HOST`                 | Baza host                 | `127.0.0.1`                                                     |
| `DB_PORT`                 | Baza port                 | `3306`                                                          |
| `DB_USER`                 | Baza user                 | `riforma`                                                       |
| `DB_PASSWORD`             | Baza lozinka              | `TVOJA_JAKA_LOZINKA`                                            |
| `DB_NAME`                 | Baza ime                  | `riforma`                                                       |
| `AUTH_SECRET`             | JWT secret (generiraj)    | `python3 -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `ENVIRONMENT`             | Okruzenje                 | `production`                                                    |
| `INITIAL_ADMIN_EMAIL`     | Email prvog admina        | `admin@firma.hr`                                                |
| `INITIAL_ADMIN_PASSWORD`  | Lozinka prvog admina      | `JakaLozinka123!`                                               |
| `INITIAL_ADMIN_FULL_NAME` | Ime admina                | `Admin`                                                         |
| `SEED_ADMIN_ON_STARTUP`   | Kreiraj admina pri startu | `true` (postavi `false` nakon)                                  |
| `BACKEND_CORS_ORIGINS`    | Frontend URL-ovi          | `http://IP_SERVERA,https://riforma.com`                         |
| `ANTHROPIC_API_KEY`       | Claude AI kljuc           | `sk-ant-api03-...`                                              |

---

## 4. Instaliraj backend

```bash
# Instaliraj Python dependencies
sudo -u riforma /opt/riforma/backend/.venv/bin/pip install -r /opt/riforma/backend/requirements.txt

# Pokreni backend
sudo systemctl start riforma-backend
sudo systemctl status riforma-backend

# Provjeri health
curl http://localhost:8000/health
# {"status":"ok"}

curl http://localhost:8000/ready
# {"status":"ready","database":"connected"}
```

---

## 5. Build i deploy frontend

```bash
cd /opt/riforma/frontend
npm install
GENERATE_SOURCEMAP=false npx craco build

# Kopiraj build u Apache web root
sudo rm -rf /var/www/riforma/*
sudo cp -r build/* /var/www/riforma/
sudo chown -R www-data:www-data /var/www/riforma

# Reload Apache
sudo apachectl configtest
sudo systemctl reload apache2
```

---

## 6. Provjeri da sve radi

```bash
# Backend health
curl http://localhost:8000/health
# {"status":"ok"}

# Full stack through Apache
curl http://localhost/health
# {"status":"ok"}

# Frontend (vraca HTML)
curl -s http://localhost/ | head -5
```

Otvori u browseru: `http://IP_SERVERA` i prijavi se.

---

## 7. SSL (opcionalno, preporuceno)

```bash
# Instaliraj certbot za Apache
sudo apt install certbot python3-certbot-apache

# Generiraj certifikat
sudo certbot --apache -d riforma.com

# Auto-renewal (certbot vec postavi timer)
sudo systemctl status certbot.timer
```

---

## Svakodnevne operacije

### Deploy nove verzije

```bash
cd /opt/riforma
bash scripts/deploy.sh

# Samo backend:
bash scripts/deploy.sh --skip-frontend

# Samo frontend:
bash scripts/deploy.sh --skip-backend
```

### Logovi

```bash
# Backend logovi
tail -f /opt/riforma/logs/backend.log
tail -f /opt/riforma/logs/backend-error.log

# Apache logovi
tail -f /var/log/apache2/riforma-access.log
tail -f /var/log/apache2/riforma-error.log

# Systemd journal
journalctl -u riforma-backend -f
```

### Restart servisa

```bash
# Restart backend
sudo systemctl restart riforma-backend

# Reload Apache (graceful, no downtime)
sudo systemctl reload apache2

# Restart sve
sudo systemctl restart riforma-backend apache2
```

---

## Backup baze

### Automatski backup (vec konfigurirano)

```bash
# Backup timer radi svaki dan u 2:00
sudo systemctl status riforma-backup.timer

# Rucni backup
sudo -u riforma bash /opt/riforma/scripts/backup-db.sh
```

### Rucni backup

```bash
mariadb-dump -u riforma -p'LOZINKA' \
  --single-transaction riforma \
  | gzip > /opt/riforma/backups/riforma_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Restore iz backupa

```bash
bash /opt/riforma/scripts/restore-db.sh /opt/riforma/backups/riforma_20240101_020000.sql.gz
```

---

## Struktura na serveru

```
/opt/riforma/
├── .env                    # Konfiguracija (NIKAD u git!)
├── backend/
│   ├── .venv/              # Python virtual environment
│   ├── app/                # FastAPI backend kod
│   └── requirements.txt
├── frontend/
│   └── src/                # React frontend kod
├── apache/
│   └── riforma.conf        # Apache VirtualHost config
├── deploy/
│   ├── riforma-backend.service
│   ├── riforma-backup.service
│   ├── riforma-backup.timer
│   └── logrotate-riforma
├── scripts/
│   ├── setup-server.sh     # Inicijalni setup
│   ├── deploy.sh           # Deploy/update
│   ├── backup-db.sh        # Backup baze
│   └── restore-db.sh       # Restore baze
├── backups/                # Backupi baze (.sql.gz)
├── uploads/                # Uploadane datoteke
└── logs/                   # Backend logovi

/var/www/riforma/           # Frontend build (servira Apache)
/etc/apache2/sites-available/riforma.conf  # Apache VirtualHost
```

---

## Sigurnosni checklist

- [ ] `.env` ima jake, unikatne lozinke
- [ ] `AUTH_SECRET` je generiran random (ne default!)
- [ ] `ENVIRONMENT=production` u .env
- [ ] `SEED_ADMIN_ON_STARTUP=false` nakon kreiranog admina
- [ ] VPN ili firewall limitira pristup
- [ ] UFW aktivan: `sudo ufw status`
- [ ] Backup radi automatski: `systemctl status riforma-backup.timer`
- [ ] Testirano da restore radi
- [ ] SSL certifikat aktivan (ako javni pristup)
- [ ] Apache `ServerName` postavljeno na pravi domain

---

## Troubleshooting

### Backend ne starta

```bash
journalctl -u riforma-backend -n 50
# Najcesci problemi:
# 1. AUTH_SECRET nije postavljen -> postavi u .env
# 2. MariaDB nije pokrenut -> systemctl start mariadb
# 3. Kriva lozinka za bazu -> provjeri DB_PASSWORD u .env
```

### Apache vraca 503

```bash
# Backend nije pokrenut
sudo systemctl status riforma-backend
sudo systemctl start riforma-backend

# Provjeri da backend slusa na 8000
curl http://localhost:8000/health
```

### Frontend ne prikazuje stranicu

```bash
# Provjeri da su buildani fileovi na mjestu
ls -la /var/www/riforma/index.html

# Provjeri Apache config
sudo apachectl configtest

# Provjeri Apache module
apache2ctl -M | grep -E "proxy|rewrite|headers"
```

### AI ne radi

```bash
# Provjeri API kljuc
grep ANTHROPIC_API_KEY /opt/riforma/.env

# Testiraj kljuc
curl -H "x-api-key: TVOJ_KLJUC" \
  -H "content-type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  https://api.anthropic.com/v1/messages \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"test"}]}'
```
