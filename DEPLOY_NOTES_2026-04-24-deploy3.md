# Deploy notes #3 — 2026-04-24 — Renewal, unit delete, notification spam

**Predispozicije:**
- Deploy #1 (`DEPLOY_NOTES_2026-04-20.md`) na produkciji ✓
- Deploy #2 (`DEPLOY_NOTES_2026-04-24.md` — multi-unit) na produkciji ✓

Ovaj deploy popravlja 5 latentnih bugova koji su izašli na površinu nakon multi-unit feature-a + jednu staru UX boljku (notification spam).

89/89 backend testova prolazi.

## 1. Server koraci

```bash
# 1. Pull
cd /opt/riforma
sudo -u riforma git pull origin main

# 2. Migracija 012 (dodaje 2 nullable kolone — last_*_notified_at)
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic \
    -c /opt/riforma/backend/alembic.ini upgrade head

# 3. Restart backend (samo backend promijenjen, frontend ne)
sudo systemctl restart riforma-backend

# 4. Provjera
curl https://riforma.com/health
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic \
    -c /opt/riforma/backend/alembic.ini current
# Mora pokazati: 012_notif_idempotent (head)
```

**Bez frontend rebuilda** — samo backend kod.
**Bez novih env varijabli.**
**Bez novih dependencies.**

## 2. Što se promijenilo

### A) Renewal refactor (4 bugfix-a u 1 endpoint-u)
**`POST /api/ugovori/{id}/renew`** sada:
- **Kopira sve jedinice** iz junction tablice u novi ugovor (multi-unit ugovori se sad ispravno obnavljaju — prije bi izgubili sve osim primary)
- **Prolazi kroz Pydantic validaciju** (`ContractCreate`) — B5 rent rule (osnovna_zakupnina XOR zakupnina_po_m2) primjenjuje se i na obnove. Legacy data sa oba polja popunjena se sigurno migrira: `osnovna_zakupnina` skalira po eskalaciji, `zakupnina_po_m2` se postavlja na NULL
- **Koristi `local_today()`** umjesto `date.today()` (Europe/Zagreb timezone, nastavak B4 fix-a iz Deploy #1)
- **Generira novu `interna_oznaka`** sa sufiksom `-OBN-{4hex}` da ne pukne na unique constraint
- **Oslobađa jedinice** kad stari ugovor postane ISTEKAO i novi je `pending_approval` — više ne postoji prozor "jedinica je IZNAJMLJENO ali nijedan odobreni ugovor je ne drži". Approve novog ugovora vraća jedinice na `iznajmljeno`.

### B) Unit delete ne respekta junction
**`DELETE /api/units/{id}`** je provjeravao samo `property_unit_id` (legacy primary FK). Nakon multi-unit feature-a, jedinica može biti vezana za ugovor SAMO preko junction-a. Brisanje takve jedinice je tiho prolazilo (CASCADE) i orphana ugovor.

Sad provjera gleda OBJE strane. Vraća **HTTP 409** s porukom "Podprostor ima aktivan ugovor" ako jedinica je u bilo kojem aktivnom ugovoru. Status promjena (`PUT /api/units/{id}` sa novim `status`) isto pokriveno.

### C) Notification spam fix
Prije: scheduler je svakih 24h re-slao iste mailove "ugovor pred istekom" / "račun dospio" sve dok god je uvjet aktivan. Ugovor 30 dana prije isteka = ~30 mailova.

Sad: dvije nove kolone (`ugovori.last_expiry_notified_at`, `racuni.last_overdue_notified_at`) prate kad je notifikacija poslana. Service preskače redove notificirane u zadnjih **7 dana** (`NOTIFICATION_COOLDOWN_DAYS`). Stamp se ažurira nakon uspješnog send-a.

Posljedica: admin dobiva mail jednom tjedno za isti ugovor/račun, ne svakog dana. Kad se status promijeni (npr. račun se plati), mail prestane.

## 3. Migracija detalji

`012_notification_idempotency.py`:
- `ALTER TABLE ugovori ADD COLUMN last_expiry_notified_at DATETIME NULL`
- `ALTER TABLE racuni ADD COLUMN last_overdue_notified_at DATETIME NULL`

**Idempotentno** (nullable kolone, bez backfill-a). **Reverzibilno** (downgrade dropa kolone).

**Side effect prvi tick scheduler-a nakon migracije:** sve postojeće aktivne notifikacije se ponovno šalju (kolone NULL = nikad nije notificirano = include in batch). Nakon prvog send-a, cooldown krene normalno raditi.

**Ako želiš to izbjeći** (da ne dobiješ rafal 30 mailova odmah nakon deploya):
```sql
-- Ručno postavi sve postojeće na "notificirano sad" pre nego što se scheduler trigne
UPDATE ugovori SET last_expiry_notified_at = NOW() WHERE status IN ('aktivno','na_isteku');
UPDATE racuni SET last_overdue_notified_at = NOW() WHERE status_placanja IN ('ceka_placanje','djelomicno_placeno');
```
Pokreni nakon `alembic upgrade head` i prije `systemctl restart riforma-backend`.

## 4. Smoke test (ovaj deploy)

Pored standardnog `SMOKE_TEST.md`:

### Renewal multi-unit
1. Otvori multi-unit ugovor (iz Deploy #2 testa). Klik "Obnovi" / pošalji POST `/renew`.
2. Novi ugovor mora imati ISTI set jedinica + suffix `-OBN-XXXX` u oznaci.
3. Stare jedinice u multi-unit-u (npr. A1, A2) trenutno su `dostupno` — ne `iznajmljeno`. Approve renewal → vraćaju se na `iznajmljeno`.

### Unit delete protection
4. Pokušaj obrisati jedinicu koja je SAMO u junction-u (ne primary) aktivnog ugovora → mora vratiti **409** s porukom o aktivnom ugovoru.

### Notification spam
5. Provjeri `/opt/riforma/logs/backend.log` sutradan nakon deploya. Trebao bi se pojaviti najviše 1 batch "Riforma: X ugovor(a) pred istekom" mailova, NE 30+.
6. Tek za 7+ dana sljedeći mail za isti ugovor.

## 5. Rollback

Ako migracija prođe ali nešto pukne:
```bash
sudo -u riforma git checkout <prev-commit>
sudo -u riforma /opt/riforma/backend/.venv/bin/alembic \
    -c /opt/riforma/backend/alembic.ini downgrade -1
sudo systemctl restart riforma-backend
```

Downgrade dropa 2 kolone — bez gubitka podataka jer su pomoćne (notifikacijski tracking, ne business state).

## 6. Brojke

- **Datoteka promijenjeno:** 4 backend (contracts.py, units.py, notification_service.py, models/tables.py + migracija)
- **Novih testova:** +8 (test_contract_renewal +4, test_contracts_multi_unit +1, test_notification_idempotency +3) — 81 → 89 ukupno
- **Novi dependency:** nema
- **Migracija baze:** 1 (`012_notif_idempotent`)
- **Frontend rebuild:** **NIJE potreban**

## 7. Što ostaje

Iz prošle dijagnoze (po tvom izboru):
- **Optimistic locking** (concurrent edits → silent overwrite) — ostaje za sad
- **Activity log diff** (audit trail za "tko je promijenio cijenu") — ostaje za sad
- Aneks PDF UI gumb
- Računi (bills) bug-hunt sprint
- Migracija ostalih reporta s html2canvas na WeasyPrint
- Dashboard KPI review
