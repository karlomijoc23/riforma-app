# Ažuriranje Riforma aplikacije na serveru

Ovo je procedura za **deploy nove verzije koda** na već postavljen
production server (Debian 12 + Apache2 + MariaDB). Inicijalni setup je
opisan u `DEPLOY.md` — ovaj dokument pretpostavlja da je server već
operativan i da app radi.

> **Glavno pravilo:** uvijek napraviti backup baze **prije** migracije.
> Sve ostalo se može vratiti iz git-a; baza ne može.

---

## TL;DR — za žurni deploy

Ako znaš što radiš i nije velika promjena (sitan bugfix, bez migracije):

```bash
ssh root@SERVER
cd /opt/riforma
bash scripts/backup-db.sh                 # 1) backup
sudo -u riforma bash scripts/deploy.sh    # 2) deploy (pull + pip + build + reload)
curl -s http://localhost:8000/health      # 3) sanity check
```

Ako migracija (`backend/migrations/versions/*.py`) je dodana u ovoj
verziji ili nisi siguran — **slijedi cijelu proceduru ispod.**

---

## Preduvjeti (jednom prije prvog deploya)

Provjeri da server ima:

- [ ] `git` konfiguriran sa SSH ključem za GitHub repo
- [ ] Systemd servis `riforma-backend.service` postoji i radi
- [ ] Apache2 konfiguracija učitava `/etc/apache2/sites-enabled/riforma*.conf`
- [ ] WeasyPrint native deps instalirani:
      `libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libcairo2 libgdk-pixbuf-2.0-0`
- [ ] Backup timer aktivan: `systemctl status riforma-backup.timer`
- [ ] Tvoj korisnik može `sudo systemctl restart riforma-backend` bez
      lozinke (NOPASSWD u sudoers)

Provjera u jednoj liniji:

```bash
systemctl is-active riforma-backend apache2 mariadb riforma-backup.timer
```

Svi moraju biti `active`.

---

## 0. Priprema (na lokalnom računalu)

Prije nego se uopće logiraš na server:

```bash
# Push commitove na main (ili release branch — dogovoriš s timom)
cd "/Users/karlomijoc/Desktop/VIBE CODE/RIFORMA/RIFORMA-APP-CODEBASE"
git status              # ne smije imati uncommitted promjena
git push origin main
```

Ako imaš handoff dokument (`HANDOFF_*.md`), pročitaj ga — tu su nove
ovisnosti, migracije, breaking promjene.

---

## 1. SSH na server

```bash
ssh root@SERVER_IP
# ili tvoj user-account ako root SSH nije dopušten
```

Otvori novu **tmux** ili **screen** sesiju ako deploy može potrajati >5
min — tako te SSH disconnect ne ostavi u pola posla:

```bash
tmux new -s deploy
```

> Ako te netko izbaci: `tmux attach -t deploy` da se vratiš u sesiju.

---

## 2. Backup baze (OBAVEZNO)

Ovo je **najvažniji korak**. Sve ostalo je reverzibilno preko git-a.

```bash
sudo -u riforma bash /opt/riforma/scripts/backup-db.sh
ls -lah /opt/riforma/backups/ | tail -5
```

Trebaš vidjeti novu `.sql.gz` datoteku timestampiranu s trenutnim
vremenom. Ako fajl ne postoji ili je < 1 KB — **STANI**, ne nastavljaj
deploy dok backup ne uspije.

Lokacija backupa: `/opt/riforma/backups/riforma-YYYYMMDD-HHMMSS.sql.gz`

Veličinu provjeri:

```bash
du -h /opt/riforma/backups/$(ls -t /opt/riforma/backups/ | head -1)
```

Tipično 1–50 MB ovisno o broju ugovora/dokumenata.

---

## 3. Provjeri pre-deploy stanje (za rollback)

Zapiši trenutnu reviziju koda i baze. Ako nešto pukne, znat ćeš na što
vratiti:

```bash
cd /opt/riforma
git log -1 --oneline                          # zapisuj negdje
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic -c backend/alembic.ini current
```

Output izgleda ovako:
```
018_password_change_tracking (head)
```

Otvori **drugi terminal** i drži ga otvorenim — ako trebaš rollback,
imat ćeš logove i revizije pri ruci.

---

## 4. Pull novog koda

```bash
cd /opt/riforma
git fetch --all --tags
git log HEAD..origin/main --oneline           # pregled što povlačiš
git pull origin main
```

Pažljivo pročitaj commit listu. Ako vidiš novu `backend/migrations/`
datoteku — slijedi **5a (migracija)** korak. Ako ne — preskoči ga.

---

## 5a. Python ovisnosti i migracija (samo ako je backend mijenjan)

```bash
sudo -u riforma /opt/riforma/backend/.venv/bin/pip install \
    -r /opt/riforma/backend/requirements.txt
```

Bilo bi dobro da preživi bez `--upgrade` flaga osim ako handoff piše
drukčije — to drži lock-down verzije.

**Migracije:**

```bash
cd /opt/riforma
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic -c backend/alembic.ini upgrade head
```

Output mora završiti s nečim sličnim:
```
INFO  [alembic.runtime.migration] Running upgrade 018_password_change_tracking -> 019_property_area_split
```

**Ako migracija pukne:** NE restartaj backend. Idi na korak **9
(Rollback)**.

**Ako migracija prođe:** provjeri da je shema OK:

```bash
sudo -u riforma mariadb -u riforma -p'$DB_PASSWORD' riforma -e "
DESCRIBE nekretnine;
" | grep -E 'povrsina'
```

(samo za migraciju 019; za druge migracije provjeri odgovarajuće tablice)

---

## 5b. Frontend build (samo ako je frontend mijenjan)

```bash
cd /opt/riforma/frontend
npm install --silent
GENERATE_SOURCEMAP=false npx craco build
```

Build mora završiti s:
```
The project was built assuming it is hosted at /.
The build folder is ready to be deployed.
```

Bez warninga o krivim `process.env.REACT_APP_*` varijablama. Ako vidiš
crveni `ERROR` umjesto "compiled successfully" — STANI, rollback.

---

## 6. Deploy

Imaš dva načina:

### Opcija A — kombinirana skripta (preferirano)

```bash
cd /opt/riforma
sudo -u riforma bash scripts/deploy.sh
```

Skripta:
1. `git pull origin main` (ponavlja, idempotentno)
2. `pip install -r requirements.txt`
3. Restart `riforma-backend`
4. `npm install && craco build`
5. `cp build/* /var/www/riforma/`
6. Reload Apache
7. Health check

### Opcija B — ručno (ako želiš kontrolu po koraku)

```bash
# Restart backend (povlači novi kod, primjenjuje migraciju ako još nije)
sudo systemctl restart riforma-backend
sudo systemctl status riforma-backend --no-pager

# Deploy build u Apache root
sudo rm -rf /var/www/riforma/*
sudo cp -r /opt/riforma/frontend/build/* /var/www/riforma/
sudo chown -R www-data:www-data /var/www/riforma

# Reload Apache (graceful, bez downtime-a)
sudo apachectl configtest
sudo systemctl reload apache2
```

---

## 7. Smoke test (OBAVEZNO)

```bash
# 1) Backend zdrav
curl -s http://localhost:8000/health
# → {"status":"ok"}

curl -s http://localhost:8000/ready
# → {"status":"ready","database":"connected"}

# 2) Apache prosljeđuje
curl -s http://localhost/health
# → {"status":"ok"}

# 3) Frontend se servira
curl -s http://localhost/ | head -3
# → <!DOCTYPE html>...

# 4) Backend log nema novih ERROR-a
journalctl -u riforma-backend --since "2 minutes ago" | grep -i error
# → trebao bi biti prazan
```

Otvori app u browseru kao admin i provjeri:

- [ ] Login radi
- [ ] Dashboard prikazuje KPI brojeve
- [ ] Otvori jednu nekretninu → vidiš "Površina objekta / Zemljišta"
      ako je migracija 019 prošla
- [ ] Preuzmi portfolio PDF (Izvještaji → Portfelj nekretnina → Izvezi)
- [ ] Kreiraj test ugovor / nekretninu / zakupnika → spremaš, vidiš u
      listi (dashboard se osvježi <1 s zbog cache invalidacije iz HIGH#5)
- [ ] Brisi taj test entry (cleanup)

Cijeli `SMOKE_TEST.md` ima dulji checklist — koristi ga za veće release-e.

---

## 8. Verifikacija u sljedećih 15 min

Drži journalctl tail otvoren još 10–15 min poslije deploya:

```bash
journalctl -u riforma-backend -f
```

Što tražiš:
- **OK znakovi:** "Application startup complete", redoviti requesti,
  health probe-ovi (200 OK).
- **Loši znakovi:** Stack traceovi, "Internal Server Error" odgovori,
  bilo što s `CRITICAL` ili `ERROR` razinom.

Ako uoči problem koji nije bio prije deploya — idi na **rollback**.

---

## 9. Rollback (ako bilo što pukne)

### Najsigurnije: vrati kod i bazu na pre-deploy stanje

```bash
# 1) Vrati kod
cd /opt/riforma
git log -5 --oneline           # nadji prethodni commit (prije deploya)
git reset --hard <STARI_COMMIT_HASH>

# 2) Vrati Python deps na stara verzija
sudo -u riforma /opt/riforma/backend/.venv/bin/pip install \
    -r /opt/riforma/backend/requirements.txt --force-reinstall

# 3) Vrati shemu baze (ako je migracija primijenjena)
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic -c backend/alembic.ini \
    downgrade <PRETHODNA_REVIZIJA>     # npr. 018_password_change_tracking

# 4) Rebuilduj frontend ako je promijenjen
cd /opt/riforma/frontend
GENERATE_SOURCEMAP=false npx craco build
sudo rm -rf /var/www/riforma/*
sudo cp -r build/* /var/www/riforma/
sudo chown -R www-data:www-data /var/www/riforma

# 5) Restart
sudo systemctl restart riforma-backend
sudo systemctl reload apache2
```

### Nuklearni rollback — vrati cijelu bazu iz backupa

Koristi se samo ako su podaci stvarno korumpirani (rijetko —
migracije su test-ane prije deploya).

```bash
# Zaustavi backend da ne piše u bazu
sudo systemctl stop riforma-backend

# Vrati iz najnovijeg backupa
LATEST=$(ls -t /opt/riforma/backups/*.sql.gz | head -1)
echo "Restoring from: $LATEST"

zcat "$LATEST" | sudo -u riforma mariadb -u riforma -p'LOZINKA' riforma

# Pokreni backend
sudo systemctl start riforma-backend
```

> **Upozorenje:** ovo briše SVE podatke unesene nakon backupa. Koristi
> samo kao zadnju opciju. Backup je iz koraka 2 — vremenska oznaka je u
> imenu datoteke.

---

## 10. Najčešći problemi i fix

### "ModuleNotFoundError" nakon restart-a

Backend traži paket koji nije instaliran. `pip install` nije pokriven
sve. Pokreni:

```bash
sudo -u riforma /opt/riforma/backend/.venv/bin/pip install \
    -r /opt/riforma/backend/requirements.txt
sudo systemctl restart riforma-backend
```

### "WeasyPrint not installed" ili "cannot load library libgobject-2.0"

Fali native deps. Instaliraj:

```bash
sudo apt install -y libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b \
    libcairo2 libgdk-pixbuf-2.0-0
sudo systemctl restart riforma-backend
```

### Migracija "Target database is not up to date"

Baza je u nepoznatom stanju. Provjeri trenutnu reviziju:

```bash
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic -c backend/alembic.ini current
```

Ako stamping nije sinkroniziran s onim što je u `versions/` direktoriju,
javi back-end deva — ne pokušavaj "upgrade head" naslijepo.

### "Address already in use" na portu 8000

Stari backend proces visi. Provjeri PID i ubij:

```bash
sudo lsof -i :8000
sudo systemctl restart riforma-backend
```

### Frontend pokazuje staru verziju

Apache je cache-ao stare fajlove. Prisilna invalidacija:

```bash
sudo systemctl reload apache2
# i u browseru: Ctrl+Shift+R / Cmd+Shift+R (hard refresh)
```

### Korisnici se odjavili automatski

Backend restart invalidira sve JWT cookies (po default-u). To je
normalno — korisnici se moraju ponovno prijaviti. Komuniciraj im
deploy unaprijed ako je ozbiljnije app-wide.

---

## 11. Što NE radi automatski (moraš ti)

- **Migracije**: `deploy.sh` ih ne pokreće. Mora se ručno
  `alembic upgrade head` PRIJE `systemctl restart`-a backend-a (inače
  app crashuje zbog mismatch shemu).
- **Backup baze**: skripta `backup-db.sh` se pokreće svaki dan u 2:00
  (timer), ali za **pre-deploy backup mora ručno**.
- **SSL certifikat**: certbot ga renewa automatski preko svojeg timer-a.
  Provjeri jednom mjesečno: `sudo certbot certificates`.
- **Brisanje starih backupa**: čišćenje > 30 dana starih backupa nije
  automatizirano. Periodički provjeri `du -sh /opt/riforma/backups/`.

---

## 12. Brzi reference (cheat sheet)

```bash
# Status sviju usluga
systemctl status riforma-backend apache2 mariadb riforma-backup.timer

# Backend log live
journalctl -u riforma-backend -f

# Apache error log live
sudo tail -f /var/log/apache2/riforma-error.log

# Sve verzije migracija
ls /opt/riforma/backend/migrations/versions/

# Trenutna revizija
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic -c backend/alembic.ini current

# Restart sve
sudo systemctl restart riforma-backend
sudo systemctl reload apache2

# Hot-reload templates / knowledge bez restarta
# (ne radi za riforma — sve mora kroz `systemctl restart`)
```

---

## 13. Kontakt / eskalacija

Ako deploy pukne i ne možeš ga rollback-ati u 10 min:

1. Backend ostavi **u rollback-anom stanju** (vraćen na prethodni
   commit). Stari kod radi s starom shemom — app može biti operativan
   čak i ako nova verzija ne deploya.
2. Otvori dva log tail-a (`journalctl -u riforma-backend -f` i Apache
   error log).
3. Pošalji handoff dev-u s:
   - Outputom `git log -5 --oneline`
   - Output `alembic current`
   - Posljednjih 50 linija oba loga
   - Što si radio (koja skripta, koji korak)

---

## Dodatni resursi

- `DEPLOY.md` — inicijalni setup servera (jednom)
- `SMOKE_TEST.md` — proširen post-deploy QA checklist
- `HANDOFF_*.md` — bilješke specifične za svaku verziju
- `scripts/deploy.sh` — automatizirani deploy
- `scripts/backup-db.sh` / `restore-db.sh` — DB backup tooling
