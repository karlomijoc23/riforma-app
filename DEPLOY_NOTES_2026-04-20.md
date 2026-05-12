# Deploy notes — 2026-04-20

Sve promjene iz ove sesije spremne za jedan deployment. 61/61 backend test prolazi lokalno. Frontend provjeren babel parserom (syntax OK) — treba rebuild na serveru.

## 1. Što treba napraviti na serveru (redoslijed)

```bash
# 0. Pull latest code
cd /opt/riforma
sudo -u riforma git pull origin main

# 1. Native biblioteke za WeasyPrint (PDF generiranje ugovora/aneksa)
sudo apt install -y libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libcairo2 libgdk-pixbuf-2.0-0

# 2. Python dependencies (weasyprint je dodan u requirements.txt)
sudo -u riforma /opt/riforma/backend/.venv/bin/pip install -r /opt/riforma/backend/requirements.txt

# 3. Rebuild frontend
cd /opt/riforma/frontend
sudo -u riforma npm ci
sudo -u riforma npx craco build
sudo cp -r build/* /var/www/riforma/

# 4. Restart backend
sudo systemctl restart riforma-backend

# 5. Health check
curl https://riforma.com/health
curl https://riforma.com/ready
```

**Environment:**
- **`UPLOAD_DIR=/opt/riforma/uploads`** — OBAVEZNO dodati u `.env`. Bez ovoga kod default-a na `/opt/riforma/backend/uploads`, ali setup-server.sh i systemd očekuju `/opt/riforma/uploads`. Nesklad je bio uzrok "upload ne radi" incidenta koji smo upravo riješili.
- `APP_TIMEZONE=Europe/Zagreb` (neobavezno — to je default)
- `UPLOAD_MIN_FREE_MB=500` (neobavezno)

**Sanity check nakon startupa:**
```bash
journalctl -u riforma-backend -n 50 | grep -iE "UPLOAD_DIR|writable"
```
Ne smije se pojaviti `UPLOAD_DIR ... is not writable by the service user` — to znači da direktorij ne pripada `riforma` useru ili `ReadWritePaths` ne odgovara.

**Migracije:**
```bash
cd /opt/riforma/backend
sudo -u riforma .venv/bin/alembic upgrade head
```
Primjenjuje: `010_maintenance_recurring_uniqueness` — unique index na `maintenance_tasks(parent_task_id, rok)` protiv duplikata recurring taskova.

---

## 2. Što se promijenilo (grupe promjena)

### A) Kritični bugfix — upload PDF ugovora
**Simptom:** Korisnik kreira ugovor + priloži PDF → ugovor se kreira s podacima, ali badge za dokument se ne prikaže u tablici → korisnik misli da dokument nije spremljen.

**Uzrok:** `UgovoriPage.jsx` je dohvaćao listu dokumenata samo jednom pri mountu; nakon forme nije refresh-ao. (Dokument JE u bazi, samo UI nije znao za njega.)

**Fix:**
- `frontend/src/features/contracts/UgovoriPage.jsx` — `fetchAllDocs` sad callback, poziva se nakon svakog `handleSuccess`
- `frontend/src/features/contracts/UgovorDetailPage.jsx` — isti fix za edit flow
- `backend/app/api/v1/endpoints/documents.py` — dodan `property_unit_id` Form parametar (frontend je slao, backend tiho drop-ao)

**Test:** kreiraj novi ugovor + priloži PDF → odmah se vidi document badge.

### B) Business logic fixevi (ugovori)
| Šifra | Datoteka | Što se mijenja |
|---|---|---|
| B1 | `contracts.py:approve_contract` | Kreator ugovora **više ne može sam odobriti** svoj ugovor (422 "Ne možete odobriti ugovor koji ste sami kreirali"). |
| B2 | `contracts.py:check_contract_overlap` | Back-to-back ugovori istog dana sada **rade** (stari do 31.3., novi od 31.3.). Prije se overlap tretirao kao kolizija. |
| B3 | `contracts.py:VALID_STATUS_TRANSITIONS` | Terminal statusi (ISTEKAO, RASKINUTO, ARHIVIRANO) **više se ne mogu vratiti** u AKTIVNO. Za reaktivaciju koristiti "Obnovi ugovor" (renewal). |
| B4 | `core/time.py` + 3 mjesta | Status i notifikacije koriste **Europe/Zagreb** timezone umjesto server UTC. Sprečava da ugovori prelaze u NA_ISTEKU/ISTEKAO 1-2h prije nego bi trebalo. |
| B5 | `contracts.py:ContractCreate.validate_rent_fields` | **Nije dozvoljeno postaviti i `osnovna_zakupnina` i `zakupnina_po_m2`** istovremeno. Biraj jedno (fiksni iznos ili izračun po m²). Sprečava "tihe" greške u računu. |

### C) PDF generiranje — backend WeasyPrint
- **Novi endpoint:** `GET /api/ugovori/{id}/export-pdf` — branded PDF ugovora (koristi `brand/ugovor-template.html`)
- **Novi endpoint:** `POST /api/ugovori/{id}/export-aneks-pdf` — branded PDF aneksa (koristi `brand/aneks-template.html`). Body: `{nova_zakupnina, novi_datum_zavrsetka, dodatne_promjene, body_text}`
- **Frontend:** `UgovorDetailPage` "Ispis PDF" gumb sad prvo zove backend; ako WeasyPrint nije instaliran, vraća 503 i pada na stari html2canvas fallback.
- **Dodano u requirements.txt:** `weasyprint>=62.3`. **System deps:** libpango + libcairo (vidi korak 1.).

### D) Sigurnost / infra
- **Rate limiting na upload:** `/api/dokumenti` — 30 req/min po IP-u (prije bilo bez limita = DoS vektor).
- **Disk quota check:** upload vraća 507 ako je slobodnog prostora <500MB (`UPLOAD_MIN_FREE_MB`).
- **DB pool monitoring:** `/ready` endpoint sad vraća `{"pool": {"size", "checked_out", "overflow"}}`. Warning log na 80% popunjenosti, error na exhaustion.
- **Advisory lock fallback:** `contracts.advisory_lock_for_unit` sad ima asyncio fallback za SQLite (prije bio no-op u testovima).

### E) UI/UX poboljšanja
- **Breadcrumbs** na detail stranicama: `/ugovori/{id}`, `/nekretnine/{id}`, `/zakupnici/{id}`, `/projekti/{id}` — korisnik na mobitelu sada vidi gdje je.
- **Submit loading states:** forme (Zakupnik, Maintenance) sad imaju spinner + disabled tokom submit-a → sprečava double-submit.
- **Veći touch targeti:** gumbi su sad 44px visoki na mobilu (WCAG compliance), 36px na desktopu.
- **Searchable Combobox:** dropdown za nekretnine/zakupnike u UgovorForm zamijenjen pretraživim izbornikom — brži odabir iz dugačkih lista.

### F) Cleanup
- Obrisano 14 nekorištenih shadcn UI komponenti (aspect-ratio, carousel, context-menu, drawer, hover-card, input-otp, menubar, navigation-menu, pagination, resizable, slider, toggle-group, toast, toaster).
- Obrisan `OPENAI_API_KEY` iz configa (nigdje korišten — AI koristi Anthropic).
- Obrisan `DOCUMENT_REQUIREMENTS_PATH` (dead config).
- Obrisan debug skript `backend/scripts/check_key.py`.

### G') Permissions / upload dir nesklad (retroactively fixed)
- `config.py` je gledao `/opt/riforma/backend/uploads`; `setup-server.sh` + DEPLOY.md kreirali `/opt/riforma/uploads`; `systemd.ReadWritePaths` koristio `/opt/riforma/backend/uploads`. Kombinacija je dala sporadic 500 na upload.
- Fix: `UPLOAD_DIR` sad env var s defaultom (`<repo>/backend/uploads` za dev, set `/opt/riforma/uploads` u prod `.env`).
- `setup-server.sh` + `riforma-backend.service` usklađeni na `/opt/riforma/uploads`.
- Startup sad radi write-probe — ako direktorij nije pisiv, u logu je jasna poruka umjesto tihe 500 kasnije.

### G) Bug-hunt sprint (pre-deploy)
- **Maintenance recurring** — DB unique constraint `uq_maintenance_recurrence_slot(parent_task_id, rok)` + `IntegrityError` handler u scheduleru → nemogući duplikati ako worker ide dvostruko. Migracija 010.
- **AI Agent scope gating** — write toolovi (create_zakupnik, update_ugovor_status itd.) prije ovoga nisu imali scope check. Viewer-user mogao je kroz AI chat kreirati/ažurirati entitete koje API sam blokira. Sad: `tools_for_user(scopes)` filtrira tool listu prije slanja Claudeu + druga provjera u `execute_write_tool` pri izvršenju.
- **AI Agent input validation** — write toolovi sada primjenjuju iste validatore (OIB, IBAN, email, status transitions) kao REST endpointi. AI više ne može `update_ugovor_status(id, "aktivno")` na arhiviranom ugovoru.
- **Stale-state audit** provjeren na svim list/detail stranicama → nema novih bugova osim već popravljenih (UgovoriPage + UgovorDetailPage).

---

## 3. Checklist nakon deploya (test u produkciji)

Pogledaj **`SMOKE_TEST.md`** u korijenu repoa — 20 numeriranih koraka s očekivanim rezultatom za svaki. Prođi redom.

---

## 4. Rollback ako nešto ne radi

Ako WeasyPrint padne u produkciji:
- Endpoint `/api/ugovori/{id}/export-pdf` vraća **503** — frontend **automatski pada na html2canvas fallback**, pa korisnik i dalje dobiva PDF (samo lošijeg izgleda). Nije blokirajuće.
- Aneks PDF endpoint **nema fallback** — ako WeasyPrint ne radi, aneks PDF jednostavno neće raditi dok se ne popravi.

Ako bilo koji backend fix razbije nešto neočekivano:
```bash
sudo -u riforma git log --oneline -10      # vidi hash prethodne verzije
sudo -u riforma git checkout <prev-hash>
sudo systemctl restart riforma-backend
```

---

## 5. Brojke

- **Datoteka promijenjeno:** ~25 backend + ~12 frontend
- **Novih testova:** +42 (19 → 61, svi prolaze)
- **Novi dependency:** `weasyprint` (+ system libs)
- **Obrisano nekorištenih datoteka:** 14 UI komponenti + 1 skript
- **Migracija baze:** **0** (nema schema promjena)

---

## 6. Poznata otvorena pitanja (za kasnije)

- Aneks PDF endpoint još nema frontend integraciju u UI (samo API postoji). Ako korisnik često generira anekse, idući korak je dodati "Generiraj aneks PDF" gumb u contract detail.
- Projekti modul (Gantt chart) — velik feature, nije u ovoj sesiji dirnut. Evaluirati korištenje prije proširivanja.
- Html2canvas + jsPDF još su u frontend bundle-u za non-ugovor reporte (property, maintenance, project). Može se postupno zamijeniti backend renderingom kad bude vremena.
