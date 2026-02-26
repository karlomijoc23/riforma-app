# Riforma - Upute za instalaciju na Debian Linux

Datum ažuriranja: 17.12.2025.

Ovaj dokument opisuje korak-po-korak proceduru za instalaciju i pokretanje Riforma aplikacije na svježem Debian sustavu.

## 1. Priprema Sustava

Otvorite terminal i pokrenite sljedeće naredbe za instalaciju potrebnih sistemskih paketa.

### Ažuriranje i osnovni alati

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential pkg-config
```

### Python 3.9+ (Backend)

Debian obično dolazi s Pythonom, ali trebamo `pip` i `venv`.

```bash
sudo apt install -y python3 python3-venv python3-pip python3-dev
```

### MariaDB Platforma (Baza podataka)

Instaliramo server i razvojne biblioteke (potrebne za Python driver).

```bash
sudo apt install -y mariadb-server libmariadb-dev
```

### Node.js 20 (Frontend)

Debian repozitoriji često imaju stari node. Koristit ćemo službeni NodeSource repozitorij.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable  # Omogućuje Yarn
```

---

## 2. Konfiguracija Baze Podataka

1. **Pokrenite servis i osigurajte da se pali s računalom:**

   ```bash
   sudo systemctl start mariadb
   sudo systemctl enable mariadb
   ```

   _Napomena: Ako servis ne starta, provjerite status sa `sudo systemctl status mariadb`._

2. **Kreiranje baze i korisnika:**
   Prijavite se u MySQL konzolu:

   ```bash
   sudo mysql -u root
   ```

   Unesite sljedeće SQL naredbe (zamijenite `vasa_lozinka` sa željenom lozinkom):

   ```sql
   CREATE DATABASE riforma CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'riforma'@'localhost' IDENTIFIED BY 'vasa_lozinka';
   GRANT ALL PRIVILEGES ON riforma.* TO 'riforma'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```

---

## 3. Postavljanje Aplikacije

Pretpostavljamo da ste klonirali kod u `/opt/riforma` ili svoj home direktorij.

### Backend Setup

1. **Idite u backend direktorij:**

   ```bash
   cd backend
   ```

2. **Kreirajte virtualno okruženje i instalirajte pakete:**

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. **Konfiguracija okoline (.env):**
   Kreirajte datoteku `.env` unutar `backend/` mape sa sadržajem:

   ```env
   # Baza podataka
   DATABASE_URL=mariadb+asyncmy://riforma:vasa_lozinka@localhost/riforma
   USE_IN_MEMORY_DB=false

   # Sigurnost (promijenite u produkciji)
   AUTH_SECRET=neka_duga_nasumicna_sifra

   # Inicijalni admin
   INITIAL_ADMIN_EMAIL=admin@riforma.hr
   INITIAL_ADMIN_PASSWORD=admin123
   SEED_ADMIN_ON_STARTUP=true
   ```

4. **Inicijalizacija baze (Migracije):**
   ```bash
   alembic upgrade head
   ```

### Frontend Setup

1. **Idite u frontend direktorij:**

   ```bash
   cd ../frontend
   ```

2. **Instalacija paketa:**

   ```bash
   yarn install
   ```

3. **Konfiguracija (.env):**
   Provjerite ili kreirajte `.env` (ili `.env.local`):
   ```env
   # IP adresa Debian servera (bitno za pristup s drugih računala)
   # Zamijenite 192.168.x.x sa stvarnom IP adresom servera (naredba `ip a`)
   REACT_APP_BACKEND_URL=http://192.168.x.x:8000
   ```

---

## 4. Pokretanje

Vratite se u glavni direktorij projekta.

**Pokretanje Backenda:**

```bash
./scripts/start_backend.sh
```

**Pokretanje Frontenda:**

```bash
./scripts/start_frontend.sh
```

Aplikacija je sada dostupna na: **http://IP-ADRESA-SERVERA:3000** (npr. `http://192.168.1.10:3000`).

---

## 5. Rješavanje Problema (Troubleshooting)

- **Greška "Can't connect to MySQL server"**:
  - Provjerite radi li baza: `sudo systemctl status mariadb`
  - Provjerite je li korisničko ime i lozinka u `.env` točna.

- **Greška "Permission denied" kod pokretanja skripti**:
  - Dodajte prava izvršavanja: `chmod +x scripts/*.sh`

- **Nije moguće pristupiti s drugog računala**:
  - Provjerite firewall: `sudo ufw allow 3000 && sudo ufw allow 8000`
  - Provjerite da li frontend `.env` pokazuje na točan IP servera, a ne na `localhost`.
