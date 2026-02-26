import csv
import io
import logging
import uuid
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

        item = {
            "id": str(uuid.uuid4()),
            "interna_oznaka": interna_oznaka,
            "status": (row.get("Status") or "").strip() or "aktivno",
            "datum_pocetka": (row.get("Datum početka") or "").strip() or None,
            "datum_zavrsetka": (row.get("Datum završetka") or "").strip() or None,
            "namjena_prostora": (row.get("Namjena prostora") or "").strip() or None,
            "created_by": current_user["id"],
        }

        # Parse numeric fields
        try:
            val = (row.get("Osnovna zakupnina €") or "").strip()
            item["osnovna_zakupnina"] = float(val) if val else None
        except ValueError:
            item["osnovna_zakupnina"] = None
        try:
            val = (row.get("CAM troškovi €") or "").strip()
            item["cam_troskovi"] = float(val) if val else None
        except ValueError:
            item["cam_troskovi"] = None
        try:
            val = (row.get("Polog/depozit €") or "").strip()
            item["polog_depozit"] = float(val) if val else None
        except ValueError:
            item["polog_depozit"] = None

        indeksacija_raw = (row.get("Indeksacija") or "").strip().lower()
        item["indeksacija"] = indeksacija_raw in ("da", "yes", "true", "1")

        await ugovori.create(item)
        imported += 1

    return {
        "message": f"Uvezeno {imported} ugovora",
        "imported": imported,
        "errors": errors,
    }
