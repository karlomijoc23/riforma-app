import csv
import io
import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any, Dict

from app.api import deps
from app.db.repositories.instance import nekretnine, zakupnici, ugovori
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_IMPORT_ROWS = 1000


@router.post(
    "/nekretnine",
    dependencies=[
        Depends(deps.require_scopes("properties:create")),
        Depends(deps.require_tenant()),
    ],
)
async def import_nekretnine(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Import properties from CSV.
    Columns: Naziv, Vrsta, Adresa, Katastarska opcina, Broj kat. cestice,
             Povrsina m2, Vlasnik, Udio vlasnistva, Godina izgradnje
    """
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=422, detail="Samo CSV datoteke su dozvoljene")

    contents = await file.read()
    text = contents.decode("utf-8-sig")  # Handle BOM
    reader = csv.DictReader(io.StringIO(text))

    imported = 0
    errors = []
    for i, row in enumerate(reader):
        if i >= MAX_IMPORT_ROWS:
            errors.append(f"Dosegnut limit od {MAX_IMPORT_ROWS} redova")
            break
        naziv = (row.get("Naziv") or "").strip()
        if not naziv:
            errors.append(f"Red {i + 2}: Naziv je obavezan")
            continue

        item = {
            "id": str(uuid.uuid4()),
            "naziv": naziv,
            "vrsta": (row.get("Vrsta") or "").strip() or None,
            "adresa": (row.get("Adresa") or "").strip() or None,
            "katastarska_opcina": (row.get("Katastarska općina") or "").strip() or None,
            "broj_kat_cestice": (row.get("Broj kat. čestice") or "").strip() or None,
            "vlasnik": (row.get("Vlasnik") or "").strip() or None,
            "udio_vlasnistva": (row.get("Udio vlasništva") or "").strip() or None,
            "created_by": current_user["id"],
        }
        # Parse numeric fields
        try:
            pov = (row.get("Površina m²") or "").strip()
            item["povrsina"] = float(pov) if pov else None
        except ValueError:
            item["povrsina"] = None
        try:
            god = (row.get("Godina izgradnje") or "").strip()
            item["godina_izgradnje"] = int(god) if god else None
        except ValueError:
            item["godina_izgradnje"] = None

        await nekretnine.create(item)
        imported += 1

    return {
        "message": f"Uvezeno {imported} nekretnina",
        "imported": imported,
        "errors": errors,
    }


@router.post(
    "/zakupnici",
    dependencies=[
        Depends(deps.require_scopes("tenants:create")),
        Depends(deps.require_tenant()),
    ],
)
async def import_zakupnici(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Import tenants from CSV.
    Columns: Tip, Naziv firme, Ime i prezime, OIB, IBAN,
             Kontakt ime, Kontakt email, Kontakt telefon, Adresa, Grad
    """
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=422, detail="Samo CSV datoteke su dozvoljene")

    contents = await file.read()
    text = contents.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    imported = 0
    errors = []
    for i, row in enumerate(reader):
        if i >= MAX_IMPORT_ROWS:
            errors.append(f"Dosegnut limit od {MAX_IMPORT_ROWS} redova")
            break

        naziv_firme = (row.get("Naziv firme") or "").strip()
        ime_prezime = (row.get("Ime i prezime") or "").strip()
        if not naziv_firme and not ime_prezime:
            errors.append(f"Red {i + 2}: Naziv firme ili Ime i prezime je obavezno")
            continue

        item = {
            "id": str(uuid.uuid4()),
            "tip": (row.get("Tip") or "").strip() or None,
            "status": (row.get("Status") or "").strip() or "aktivan",
            "naziv_firme": naziv_firme or None,
            "ime_prezime": ime_prezime or None,
            "oib": (row.get("OIB") or "").strip() or None,
            "iban": (row.get("IBAN") or "").strip() or None,
            "kontakt_ime": (row.get("Kontakt ime") or "").strip() or None,
            "kontakt_email": (row.get("Kontakt email") or "").strip() or None,
            "kontakt_telefon": (row.get("Kontakt telefon") or "").strip() or None,
            "adresa_ulica": (row.get("Adresa") or "").strip() or None,
            "adresa_grad": (row.get("Grad") or "").strip() or None,
            "created_by": current_user["id"],
        }

        await zakupnici.create(item)
        imported += 1

    return {
        "message": f"Uvezeno {imported} zakupnika",
        "imported": imported,
        "errors": errors,
    }


@router.post(
    "/ugovori",
    dependencies=[
        Depends(deps.require_scopes("leases:create")),
        Depends(deps.require_tenant()),
    ],
)
async def import_ugovori(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Import contracts from CSV.
    Columns: Interna oznaka, Status, Datum pocetka, Datum zavrsetka,
             Osnovna zakupnina EUR, CAM troskovi EUR, Polog/depozit EUR,
             Namjena prostora, Indeksacija
    """
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=422, detail="Samo CSV datoteke su dozvoljene")

    contents = await file.read()
    text = contents.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    imported = 0
    errors = []
    for i, row in enumerate(reader):
        if i >= MAX_IMPORT_ROWS:
            errors.append(f"Dosegnut limit od {MAX_IMPORT_ROWS} redova")
            break

        interna_oznaka = (row.get("Interna oznaka") or "").strip()
        if not interna_oznaka:
            errors.append(f"Red {i + 2}: Interna oznaka je obavezna")
            continue

        # Parse dates (required NOT NULL fields)
        datum_pocetka_str = (row.get("Datum početka") or row.get("Datum pocetka") or "").strip()
        datum_zavrsetka_str = (row.get("Datum završetka") or row.get("Datum zavrsetka") or "").strip()
        try:
            datum_pocetka = date.fromisoformat(datum_pocetka_str) if datum_pocetka_str else date.today()
        except ValueError:
            errors.append(f"Red {i + 2}: Neispravan format datuma početka: {datum_pocetka_str}")
            continue
        try:
            datum_zavrsetka = date.fromisoformat(datum_zavrsetka_str) if datum_zavrsetka_str else None
        except ValueError:
            errors.append(f"Red {i + 2}: Neispravan format datuma završetka: {datum_zavrsetka_str}")
            continue
        if not datum_zavrsetka:
            errors.append(f"Red {i + 2}: Datum završetka je obavezan")
            continue

        # Resolve nekretnina by ID or name
        nekretnina_id = (row.get("Nekretnina ID") or "").strip() or None
        if not nekretnina_id:
            nek_naziv = (row.get("Nekretnina") or "").strip()
            if nek_naziv:
                found = await nekretnine.find_one(naziv=nek_naziv)
                nekretnina_id = found.id if found else None
        if not nekretnina_id:
            all_props = await nekretnine.find_all()
            nekretnina_id = all_props[0].id if all_props else None
        if not nekretnina_id:
            errors.append(f"Red {i + 2}: Nekretnina nije pronađena")
            continue

        # Resolve zakupnik by ID or name
        zakupnik_id = (row.get("Zakupnik ID") or "").strip() or None
        if not zakupnik_id:
            zak_naziv = (row.get("Zakupnik") or "").strip()
            if zak_naziv:
                found = await zakupnici.find_one(naziv_firme=zak_naziv)
                zakupnik_id = found.id if found else None
        if not zakupnik_id:
            errors.append(f"Red {i + 2}: Zakupnik nije pronađen")
            continue

        # Calculate trajanje
        months = (datum_zavrsetka.year - datum_pocetka.year) * 12 + (datum_zavrsetka.month - datum_pocetka.month)

        now = datetime.now(timezone.utc)
        item = {
            "id": str(uuid.uuid4()),
            "interna_oznaka": interna_oznaka,
            "nekretnina_id": nekretnina_id,
            "zakupnik_id": zakupnik_id,
            "status": (row.get("Status") or "").strip() or "aktivno",
            "datum_pocetka": datum_pocetka,
            "datum_zavrsetka": datum_zavrsetka,
            "trajanje_mjeseci": max(months, 1),
            "namjena_prostora": (row.get("Namjena prostora") or "").strip() or None,
            "created_by": current_user["id"],
            "created_at": now,
            "updated_at": now,
        }

        # Parse numeric fields
        try:
            val = (row.get("Osnovna zakupnina €") or row.get("Osnovna zakupnina EUR") or "").strip()
            item["osnovna_zakupnina"] = float(val) if val else None
        except ValueError:
            item["osnovna_zakupnina"] = None
        try:
            val = (row.get("CAM troškovi €") or row.get("CAM troskovi EUR") or "").strip()
            item["cam_troskovi"] = float(val) if val else None
        except ValueError:
            item["cam_troskovi"] = None
        try:
            val = (row.get("Polog/depozit €") or row.get("Polog/depozit EUR") or "").strip()
            item["polog_depozit"] = float(val) if val else None
        except ValueError:
            item["polog_depozit"] = None

        indeksacija_raw = (row.get("Indeksacija") or "").strip().lower()
        item["indeksacija"] = indeksacija_raw in ("da", "yes", "true", "1")

        try:
            await ugovori.create(item)
            imported += 1
        except Exception as e:
            errors.append(f"Red {i + 2}: Greška pri uvozu: {str(e)}")
            logger.error(f"Import contract row {i + 2} failed: {e}")

    return {
        "message": f"Uvezeno {imported} ugovora",
        "imported": imported,
        "errors": errors,
    }
