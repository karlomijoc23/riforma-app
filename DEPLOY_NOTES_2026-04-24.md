# Deploy notes #2 — 2026-04-24 — Multi-unit per contract

**Predispozicija:** Deploy #1 (`DEPLOY_NOTES_2026-04-20.md`) MORA biti na produkciji + smoke test prošao prije ovoga. Ovaj deploy proširuje contract layer koji je upravo stabiliziran.

90/90 backend testova prolazi (81 ranijih + 9 novih multi-unit). Frontend syntax provjeren.

## 1. Korake na serveru

```bash
# 1. Pull
cd /opt/riforma
sudo -u riforma git pull origin main

# 2. Migracija (kreira ugovor_units junction + backfilla iz postojećih ugovora)
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic -c /opt/riforma/backend/alembic.ini upgrade head

# 3. Rebuild frontend (UgovorForm + UgovorDetailPage promijenjeni)
cd /opt/riforma/frontend
sudo -u riforma npm ci
sudo -u riforma npx craco build
sudo cp -r build/* /var/www/riforma/

# 4. Restart backend
sudo systemctl restart riforma-backend

# 5. Provjera migracije
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic -c /opt/riforma/backend/alembic.ini current
# Mora pokazati: 011_ugovor_units (head)
```

**Migracija je idempotentna** za backfill — koristi `INSERT ... SELECT` koji ne stvara duplikate jer junction ima composite PK.

**Bez novih env varijabli.** Bez novih dependencies.

## 2. Što se promijenilo

### Schema
- Nova tablica `ugovor_units(ugovor_id, property_unit_id, created_at)` — composite PK, oba FK-a `ON DELETE CASCADE`
- Index `ix_ugovor_units_unit` na `property_unit_id` (za reverse lookups)
- Backfill: svaki postojeći `ugovori.property_unit_id != NULL` automatski dobiva red u junction-u

### Backend logika
- `ContractCreate` / `ContractUpdate` Pydantic prima novo polje `property_unit_ids: List[str]` uz postojeći `property_unit_id`
- `check_contract_overlap` sada gleda OBJE strane (legacy primary FK + M2M junction) — preklapanje se javlja ako bilo koja strana drži jedinicu u istom periodu
- `create_contract` lock-a SVE odabrane jedinice prije insert-a (sortirano da izbjegne deadlock)
- `update_contract` može proširiti / smanjiti unit set kroz `property_unit_ids`
- `approve_contract`, `update_contract_status`, `delete_contract` propagiraju status promjene na SVE povezane jedinice (ne samo primary)
- `get_contract` API response uvijek vraća `property_unit_ids: [...]` — frontend čita to kao izvor istine

### Backward compat
- `UgovoriRow.property_unit_id` ostaje (legacy primary unit pointer)
- Stari klijenti koji šalju samo `property_unit_id` rade — backend automatski populariše junction s tom jednom jedinicom
- Stari API consumeri koji čitaju samo `property_unit_id` dobivaju primarni unit (prvi iz set-a)

### Frontend
- `UgovorForm` — pretvoreno iz single Select u **checkbox listu jedinica** (max-height scroll, prikaz "(zauzeto)" za jedinice s drugim aktivnim ugovorom)
- Subtitle na vrhu: "Odabrano: 3 jedinica. Prva u redu je primarna i pojavljuje se na ispisu ugovora kao referenca."
- `UgovorDetailPage` — prikazuje sve jedinice kao listu ("Jedinice (3): A1, A2, A3"), ako je samo jedna prikaz ostaje "Jedinica: A1"
- PDF (WeasyPrint): sažetak nekretnine sad lista sve jedinice + ukupnu površinu (`Ukupna površina: 240 m²`)

## 3. Smoke test za Deploy #2

Pored standardnog `SMOKE_TEST.md`, prođi i ovo:

### Multi-unit kreiranje
1. Otvori postojeću nekretninu, dodaj 3 nove jedinice (A1, A2, A3) — ako ih već nema.
2. `/ugovori` → "Novi ugovor" → odaberi tu nekretninu → u sekciji **Jedinice** vidiš checkbox listu, štikliraš A1 i A2 → spremi.
3. Otvori taj ugovor → header pokazuje "Zgrada / 2 jedinica", detail tab pokazuje "Jedinice (2): A1, A2".
4. Approve ugovor (kao drugi user). Otvori `/nekretnine/{id}` → A1 i A2 su `iznajmljeno`, A3 ostaje `dostupno`.

### Overlap propagacija
5. Pokušaj novi ugovor na ISTOJ nekretnini, isti period, štikliraš A2 i A3 → **mora pasti s 400 "preklapanje"** (jer A2 je već zauzet).
6. Ukloni A2, ostavi samo A3 → prolazi.

### Edit set
7. Na prvom ugovoru: Edit → ukloni A2, dodaj A3 → spremi. Status A2 vraća se na `dostupno`, A3 postaje `iznajmljeno`.

### Backward compat — postojeći ugovori
8. Otvori bilo koji ugovor kreiran PRIJE ovog deploya. Mora prikazati svoju jednu jedinicu kao i prije. Edit → save bez promjena → mora i dalje raditi.

### PDF
9. "Ispis PDF" na multi-unit ugovoru. PDF mora imati liniju "Jedinice (3): A1, A2, A3" + "Ukupna površina: ..." u sekciji Nekretnina.

## 4. Rollback

Ako migracija prođe ali nešto pukne u kodu:
```bash
sudo -u riforma git checkout <prev-commit>
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic -c /opt/riforma/backend/alembic.ini downgrade -1
sudo systemctl restart riforma-backend
```

Downgrade migracije briše `ugovor_units` tablicu — ali postojeći `ugovori.property_unit_id` ostaje netaknut, pa nemate gubitka podataka. Zabilježeni multi-unit ugovori GUBE dodatne jedinice (ostaje samo primary). Za sigurnost, napravi backup baze prije ovog deploya:

```bash
sudo /opt/riforma/scripts/backup-db.sh
```

## 5. Brojke

- **Datoteka promijenjeno:** 6 backend (models, contracts endpoint, contract_pdf_service, migracija) + 2 frontend (UgovorForm, UgovorDetailPage)
- **Novih testova:** +9 (`test_contracts_multi_unit.py`) — 81 → 90 ukupno
- **Novi dependency:** nema
- **Migracija baze:** 1 (`011_ugovor_units` — kreira tablicu + backfill)

## 6. Što ostaje za sljedeći deploy

- Aneks PDF UI (gumb u contract detailu) — endpoint postoji, nedostaje vizualno sučelje
- Računi (bills) bug-hunt sprint sličan onome za ugovore (zatraženo skip u prošloj sesiji)
- Migracija ostalih reporta s html2canvas na WeasyPrint
- Dashboard KPI review
