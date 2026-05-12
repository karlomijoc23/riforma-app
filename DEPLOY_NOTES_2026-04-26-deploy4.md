# Deploy notes #4 — 2026-04-26 — Računi za režije

**Predispozicije:**
- Deploy #1 (`DEPLOY_NOTES_2026-04-20.md`) na produkciji ✓
- Deploy #2 (`DEPLOY_NOTES_2026-04-24.md` — multi-unit) na produkciji ✓
- Deploy #3 (`DEPLOY_NOTES_2026-04-24-deploy3.md` — renewal + notif) na produkciji ✓

Ovaj deploy donosi cijeli **utility billing modul**: podjela master-računa na zakupnike, AI auto-save uploadanih PDF-ova, statement PDF za zakupnika, CAM reconciliation (godina vs godina), anomaly alerts.

98/98 backend testova prolazi (89 prethodnih + 9 novih za bill splitting).

## 1. Server koraci

```bash
cd /opt/riforma
sudo -u riforma git pull origin main

# Migracija 013 (dodaje is_master_bill + master_bill_id na racuni)
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic \
    -c /opt/riforma/backend/alembic.ini upgrade head

# Frontend rebuild (RacuniPage + SplitBillDialog)
cd /opt/riforma/frontend
sudo -u riforma npm ci
sudo -u riforma npx craco build
sudo cp -r build/* /var/www/riforma/

sudo systemctl restart riforma-backend

# Provjera
curl https://riforma.com/health
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic \
    -c /opt/riforma/backend/alembic.ini current
# Mora pokazati: 013_bill_split (head)
```

**Bez novih env varijabli.** **Bez novih dependencies.**

## 2. Što se promijenilo

### A) Bill split engine (RUBS-style) — najveći feature
**Problem koji rješava:** primiš račun struje za cijelu zgradu od 5.000€ → automatski se dijeli na zakupnike po jedinici. Prije se to radilo ručno.

**4 metode podjele:**
- **Po m²** — pro-rata po površini jedinica
- **Po jedinici** — jednako među odabranim jedinicama
- **Po postocima** — ručno dodijeli % svakoj jedinici (mora biti zbroj 100%)
- **Po iznosu** — ručno dodijeli € svakoj jedinici (mora biti zbroj master iznosa)

**Endpoint-i:**
- `POST /api/racuni/{id}/split-preview` — izračunaj raspodjelu bez upisa
- `POST /api/racuni/{id}/split` — napravi child račune
- `GET /api/racuni/{id}/children` — popis child računa
- `DELETE /api/racuni/{id}/split` — poništi podjelu (samo ako nijedan child nema uplate)

**Logika:**
- Child račun automatski povezan s aktivnim ugovorom + zakupnikom za tu jedinicu
- Child se automatski označava kao "approved" (nasljeđuje od master-a)
- Master ne može postati child i obratno
- Overlap check radi i za multi-unit i klasične ugovore (junction iz Deploy #2)

**Frontend:**
- Novi `SplitBillDialog` — odabir metode + jedinica, live preview, potvrda
- Gumb "Podijeli na jedinice" u dropdown-u svakog računa s nekretninom
- Badge "podijeljen" / "dio podjele" u tablici da vidiš odmah

### B) AI auto-save (`POST /api/racuni/parse-and-create`)
**Prije:** uploadaj PDF → ručno popuni 10 polja → spremi
**Sad:** uploadaj PDF → AI parsira → draft račun se kreira automatski → samo provjeriš i odobriš

Štedi ~5 minuta po računu. Mock fallback ako Anthropic API nije konfiguriran.

### C) Tenant statement PDF (`GET /api/zakupnici/{id}/statement`)
WeasyPrint-renderirana "Specifikacija zaduženja zakupnika" za bilo koji period:
- Sva zaduženja (rent + režije + ostalo)
- Po datumu, vrsti, dobavljaču, broju računa
- Ukupno zaduženo / plaćeno / **saldo**
- Profesionalan branded izgled (Riforma)
- HR znakovi i format cijena

Query: `?period_od=2026-01-01&period_do=2026-03-31`

### D) CAM reconciliation (`GET /api/racuni/analytics/cam-reconciliation`)
Godišnja usporedba režija po nekretnini:
- Po vrsti utility-a (struja/voda/plin/...): ova godina vs prošla godina + delta
- Ukupni iznos + postotna razlika
- Master računi se ne broje 2x (fokus na child-e ako je split)

Query: `?nekretnina_id=...&godina=2026`

### E) Anomaly alerts (`GET /api/racuni/analytics/anomalies`)
Detektira račune koji su X% iznad 12-mjesečnog rolling average-a za istu nekretninu + tip:
- Npr. struja u travnju 2026 = 35% iznad inače → flag
- Sortirano po pct_over_average DESC (najveće odstupanje prvo)
- Zahtijeva ≥2 historijska računa po (nekretnina, tip) da se izračuna baseline

Query: `?threshold_pct=30` (default 30%)

### F) Sitni bugfix-i
- `POST /api/racuni` (create) sad ispravno parsira datume — prije pucao na SQLite (radio samo na MariaDB), sad jedna code-path radi svuda
- ORM model: `is_master_bill` (bool, default false), `master_bill_id` (FK self-referential)

## 3. Migracija 013 detalji

```sql
ALTER TABLE racuni ADD COLUMN is_master_bill BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE racuni ADD COLUMN master_bill_id VARCHAR(36) NULL
    REFERENCES racuni(id) ON DELETE SET NULL;
CREATE INDEX ix_racuni_master_bill_id ON racuni(master_bill_id);
```

**Idempotentno**, **reverzibilno**, bez utjecaja na postojeće račune (svi su `is_master_bill=false` po defaultu).

## 4. Smoke test

Pored `SMOKE_TEST.md`:

### Bill split
1. `/racuni` → "Novi račun" → kreiraj račun struje 6.000€ za zgradu A (koja ima 3 jedinice).
2. Otvori dropdown na tom retku → "Podijeli na jedinice".
3. Dialog se otvori, sve 3 jedinice pred-čekirane, metoda "Po m²".
4. Klik "Izračunaj" → vidiš breakdown po jedinici + ukupno = 6.000€ (zelena boja).
5. Klik "Potvrdi podjelu" → 3 child računa kreirana, master dobiva badge "podijeljen", child-i imaju badge "dio podjele".
6. Otvori child račun → vidiš da je auto-povezan sa zakupnikom + ugovorom (ako jedinica ima aktivni ugovor).

### AI auto-save
7. Upload PDF računa preko endpoint-a `POST /api/racuni/parse-and-create` (preko UI ako je integriran, ili direkt API call).
8. Vraća kreiran draft račun s popunjenim poljima.

### Tenant statement
9. `GET /api/zakupnici/{id}/statement?period_od=2026-01-01&period_do=2026-03-31` — preuzima PDF "specifikacija zaduženja". HR znakovi rade, brending Riforma.

### CAM
10. `GET /api/racuni/analytics/cam-reconciliation?nekretnina_id=X&godina=2026` — JSON breakdown po vrsti + delta vs 2025.

### Anomalies
11. `GET /api/racuni/analytics/anomalies?threshold_pct=30` — JSON lista anomalnih računa s "pct_over_average".

## 5. Rollback

```bash
sudo -u riforma git checkout <prev-commit>
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic \
    -c /opt/riforma/backend/alembic.ini downgrade -1
sudo systemctl restart riforma-backend
```

Downgrade dropa 2 kolone — child računi gube vezu na master (postaju samostalni). Master računi se vraćaju u stanje prije podjele (ali split-ovi koji su već kreirali child-e ostaju u DB-u kao normalni računi).

**Backup baze prije deploya** preporučen:
```bash
sudo /opt/riforma/scripts/backup-db.sh
```

## 6. Brojke

- **Backend datoteka:** 4 izmijenjene (`tables.py`, `racuni.py`, `tenants.py`) + 2 nove (`bill_split_service.py`, `tenant_statement_service.py`) + migracija 013
- **Frontend datoteka:** 1 nova (`SplitBillDialog.jsx`) + 1 izmijenjena (`RacuniPage.jsx`) + `api.js`
- **Novih testova:** +9 (`test_bill_splitting.py`)
- **Endpoint-ova:** +7 (`split-preview`, `split`, `children`, `DELETE split`, `parse-and-create`, `statement`, `cam-reconciliation`, `anomalies`)
- **Novih env varijabli:** 0
- **Novih dependencies:** 0

## 7. Što ostaje za sljedeći deploy

- Frontend UI za AI auto-save (gumb "Upload + AI parse" na RacuniPage)
- Frontend UI za tenant statement (gumb "Specifikacija PDF" na ZakupnikDetailPage)
- Frontend dashboard widget za anomaly alerts ("3 sumnjivih računa")
- CAM reconciliation prikaz na NekretninaDetailPage
- Optimistic locking (concurrent edit silent overwrite)
- Activity log diff za audit trail
