"""
Listings (Oglasi) — interni modul za upravljanje oglasima nekretnina.

Faza 1: CRUD za nacrte oglasa + XML export kompatibilan s Njuškalo/Index formatom.
Faza 2: Automatska objava na portalima putem XML feeda (zahtijeva partnerski ugovor).

Podržani statusi:
  nacrt        → oglas se priprema, nije vidljiv
  aktivan      → spreman za objavu / objavljen
  pauziran     → privremeno ugašen
  arhiviran    → nekretnina više nije dostupna

XML export: GET /oglasi/xml-export
  Kompatibilan s Njuškalo XML specifikacijom (verzija 2.x)
  https://partner.njuskalo.hr/xml-specifikacija
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.api import deps
from app.db.repositories.instance import nekretnine, oglasi, property_units
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Pydantic modeli
# ---------------------------------------------------------------------------

VALID_STATUSES = {"nacrt", "aktivan", "pauziran", "arhiviran"}
VALID_TIP_PONUDE = {"iznajmljivanje", "prodaja"}
VALID_VRSTA = {
    "stan",
    "kuca",
    "poslovni_prostor",
    "garaža",
    "parking",
    "zemljiste",
    "ostalo",
}


class ListingCreate(BaseModel):
    nekretnina_id: str = Field(max_length=100)
    property_unit_id: Optional[str] = Field(default=None, max_length=100)

    # Ponuda
    tip_ponude: str = Field(
        default="iznajmljivanje", max_length=100
    )  # iznajmljivanje | prodaja
    vrsta: str = Field(default="stan", max_length=100)
    naslov: str = Field(max_length=200)
    opis: Optional[str] = Field(default=None, max_length=5000)

    # Cijene
    cijena: float
    cijena_valuta: str = Field(default="EUR", max_length=10)
    cijena_po_m2: Optional[float] = None

    # Površine i lokacija
    povrsina_m2: Optional[float] = None
    broj_soba: Optional[float] = None
    kat: Optional[str] = Field(default=None, max_length=100)
    adresa: Optional[str] = Field(default=None, max_length=500)
    grad: Optional[str] = Field(default=None, max_length=200)
    opcina: Optional[str] = Field(default=None, max_length=200)
    zip_code: Optional[str] = Field(default=None, max_length=20)
    drzava: str = Field(default="HR", max_length=10)

    # Dodatne informacije
    namjesteno: Optional[bool] = None
    parking_ukljucen: Optional[bool] = None
    dostupno_od: Optional[str] = Field(default=None, max_length=100)  # ISO date string
    kontakt_ime: Optional[str] = Field(default=None, max_length=200)
    kontakt_telefon: Optional[str] = Field(default=None, max_length=100)
    kontakt_email: Optional[str] = Field(default=None, max_length=200)

    # Slike (lista URL-ova unutar /uploads/)
    slike: Optional[List[str]] = Field(default=None, max_length=30)

    # Portali za objavu
    objavi_na: Optional[List[str]] = Field(
        default=None, max_length=10
    )  # ["njuskalo", "index"]

    status: str = Field(default="nacrt", max_length=100)

    @field_validator("tip_ponude")
    @classmethod
    def validate_tip(cls, v: str) -> str:
        if v not in VALID_TIP_PONUDE:
            raise ValueError(f"tip_ponude mora biti jedan od: {VALID_TIP_PONUDE}")
        return v

    @field_validator("vrsta")
    @classmethod
    def validate_vrsta(cls, v: str) -> str:
        if v not in VALID_VRSTA:
            raise ValueError(f"vrsta mora biti jedna od: {VALID_VRSTA}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in VALID_STATUSES:
            raise ValueError(f"status mora biti jedan od: {VALID_STATUSES}")
        return v

    @field_validator("cijena")
    @classmethod
    def validate_cijena(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Cijena ne može biti negativna")
        return v


class ListingUpdate(BaseModel):
    property_unit_id: Optional[str] = Field(default=None, max_length=100)
    tip_ponude: Optional[str] = Field(default=None, max_length=100)
    vrsta: Optional[str] = Field(default=None, max_length=100)
    naslov: Optional[str] = Field(default=None, max_length=200)
    opis: Optional[str] = Field(default=None, max_length=5000)
    cijena: Optional[float] = None
    cijena_valuta: Optional[str] = Field(default=None, max_length=10)
    cijena_po_m2: Optional[float] = None
    povrsina_m2: Optional[float] = None
    broj_soba: Optional[float] = None
    kat: Optional[str] = Field(default=None, max_length=100)
    adresa: Optional[str] = Field(default=None, max_length=500)
    grad: Optional[str] = Field(default=None, max_length=200)
    opcina: Optional[str] = Field(default=None, max_length=200)
    zip_code: Optional[str] = Field(default=None, max_length=20)
    drzava: Optional[str] = Field(default=None, max_length=10)
    namjesteno: Optional[bool] = None
    parking_ukljucen: Optional[bool] = None
    dostupno_od: Optional[str] = Field(default=None, max_length=100)
    kontakt_ime: Optional[str] = Field(default=None, max_length=200)
    kontakt_telefon: Optional[str] = Field(default=None, max_length=100)
    kontakt_email: Optional[str] = Field(default=None, max_length=200)
    slike: Optional[List[str]] = Field(default=None, max_length=30)
    objavi_na: Optional[List[str]] = Field(default=None, max_length=10)
    status: Optional[str] = Field(default=None, max_length=100)

    @field_validator("tip_ponude")
    @classmethod
    def validate_tip(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_TIP_PONUDE:
            raise ValueError(f"tip_ponude mora biti jedan od: {VALID_TIP_PONUDE}")
        return v

    @field_validator("vrsta")
    @classmethod
    def validate_vrsta(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_VRSTA:
            raise ValueError(f"vrsta mora biti jedna od: {VALID_VRSTA}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"status mora biti jedan od: {VALID_STATUSES}")
        return v


# ---------------------------------------------------------------------------
# Pomoćne funkcije
# ---------------------------------------------------------------------------


def _xml_escape(text: str) -> str:
    """Escape XML special characters."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _vrsta_to_njuskalo(vrsta: str) -> str:
    """Mapiranje interne vrste na Njuškalo kategoriju."""
    mapping = {
        "stan": "Stanovi",
        "kuca": "Kuće",
        "poslovni_prostor": "Poslovni prostori",
        "garaža": "Garaže i parkirna mjesta",
        "parking": "Garaže i parkirna mjesta",
        "zemljiste": "Zemljišta",
        "ostalo": "Ostalo",
    }
    return mapping.get(vrsta, "Ostalo")


def _build_njuskalo_xml(listings: List[Dict[str, Any]]) -> str:
    """
    Generira Njuškalo-kompatibilan XML feed.

    Format je usklađen s Njuškalo Partner XML specifikacijom v2.
    https://partner.njuskalo.hr/xml-specifikacija
    """
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<njuskalo_feed version="2.0" generated="{now_iso}">',
        "  <listings>",
    ]

    for item in listings:
        eid = _xml_escape(item.get("id", ""))
        naslov = _xml_escape(item.get("naslov", ""))
        cijena = item.get("cijena", 0)
        valuta = _xml_escape(item.get("cijena_valuta", "EUR"))
        tip = _xml_escape(item.get("tip_ponude", "iznajmljivanje"))
        kategorija = _xml_escape(_vrsta_to_njuskalo(item.get("vrsta", "ostalo")))
        povrsina = item.get("povrsina_m2") or ""
        sobe = item.get("broj_soba") or ""
        kat = _xml_escape(item.get("kat") or "")
        adresa = _xml_escape(item.get("adresa") or "")
        grad = _xml_escape(item.get("grad") or "")
        opcina = _xml_escape(item.get("opcina") or "")
        drzava = _xml_escape(item.get("drzava", "HR"))
        namjesteno = item.get("namjesteno")
        parking = item.get("parking_ukljucen")
        kontakt_ime = _xml_escape(item.get("kontakt_ime") or "")
        kontakt_tel = _xml_escape(item.get("kontakt_telefon") or "")
        kontakt_email = _xml_escape(item.get("kontakt_email") or "")
        slike: List[str] = item.get("slike") or []

        lines.append(f'    <listing id="{eid}">')
        lines.append(f"      <naslov>{naslov}</naslov>")
        lines.append(f"      <opis><![CDATA[{item.get('opis') or ''}]]></opis>")
        lines.append(f"      <kategorija>{kategorija}</kategorija>")
        lines.append(f"      <tip_ponude>{tip}</tip_ponude>")
        lines.append(f"      <cijena valuta='{valuta}'>{cijena}</cijena>")
        if povrsina:
            lines.append(f"      <povrsina_m2>{povrsina}</povrsina_m2>")
        if sobe:
            lines.append(f"      <broj_soba>{sobe}</broj_soba>")
        if kat:
            lines.append(f"      <kat>{kat}</kat>")

        lines.append("      <lokacija>")
        if adresa:
            lines.append(f"        <adresa>{adresa}</adresa>")
        if grad:
            lines.append(f"        <grad>{grad}</grad>")
        if opcina:
            lines.append(f"        <opcina>{opcina}</opcina>")
        lines.append(f"        <drzava>{drzava}</drzava>")
        lines.append("      </lokacija>")

        if namjesteno is not None:
            lines.append(
                f"      <namjesteno>{'da' if namjesteno else 'ne'}</namjesteno>"
            )
        if parking is not None:
            lines.append(
                f"      <parking_ukljucen>{'da' if parking else 'ne'}</parking_ukljucen>"
            )

        if kontakt_ime or kontakt_tel or kontakt_email:
            lines.append("      <kontakt>")
            if kontakt_ime:
                lines.append(f"        <ime>{kontakt_ime}</ime>")
            if kontakt_tel:
                lines.append(f"        <telefon>{kontakt_tel}</telefon>")
            if kontakt_email:
                lines.append(f"        <email>{kontakt_email}</email>")
            lines.append("      </kontakt>")

        if slike:
            lines.append("      <slike>")
            for url in slike[:20]:  # Njuškalo limit: 20 slika
                lines.append(f"        <slika><![CDATA[{url}]]></slika>")
            lines.append("      </slike>")

        lines.append("    </listing>")

    lines.append("  </listings>")
    lines.append("</njuskalo_feed>")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Endpointi
# ---------------------------------------------------------------------------


@router.get(
    "/",
    dependencies=[Depends(deps.require_scopes("listings:read"))],
)
async def get_listings(
    status_filter: Optional[str] = Query(None, alias="status"),
    tip_ponude: Optional[str] = Query(None),
    nekretnina_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Dohvati popis oglasa uz opcionalno filtriranje."""
    filters: Dict[str, Any] = {}

    if status_filter:
        if status_filter not in VALID_STATUSES:
            raise HTTPException(
                status_code=422,
                detail=f"Neispravan status. Dopušteni: {sorted(VALID_STATUSES)}",
            )
        filters["status"] = status_filter

    if tip_ponude:
        if tip_ponude not in VALID_TIP_PONUDE:
            raise HTTPException(
                status_code=422,
                detail=f"Neispravan tip_ponude. Dopušteni: {sorted(VALID_TIP_PONUDE)}",
            )
        filters["tip_ponude"] = tip_ponude

    if nekretnina_id:
        filters["nekretnina_id"] = nekretnina_id

    items, total = await oglasi.find_many(
        filters=filters,
        order_by="created_at",
        order_dir="desc",
        skip=skip,
        limit=limit,
    )

    return {
        "items": [oglasi.to_dict(i) for i in items],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(deps.require_scopes("listings:create")),
        Depends(deps.require_tenant()),
    ],
)
async def create_listing(
    item_in: ListingCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Kreiraj novi oglas."""
    # Provjeri da nekretnina postoji
    nekretnina = await nekretnine.get_by_id(item_in.nekretnina_id)
    if not nekretnina:
        raise HTTPException(status_code=404, detail="Nekretnina nije pronađena")

    if item_in.property_unit_id:
        unit = await property_units.get_by_id(item_in.property_unit_id)
        if not unit:
            raise HTTPException(status_code=404, detail="Jedinica nije pronađena")

    data = item_in.model_dump()
    data["created_by"] = current_user["id"]

    instance = await oglasi.create(data)
    logger.info(f"Kreiran oglas '{instance.naslov}' (id={instance.id})")
    return oglasi.to_dict(instance)


@router.get(
    "/{id}",
    dependencies=[Depends(deps.require_scopes("listings:read"))],
)
async def get_listing(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Dohvati oglas po ID-u."""
    item = await oglasi.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Oglas nije pronađen")
    return oglasi.to_dict(item)


@router.put(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("listings:update")),
        Depends(deps.require_tenant()),
    ],
)
async def update_listing(
    id: str,
    item_in: ListingUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Ažuriraj oglas."""
    existing = await oglasi.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Oglas nije pronađen")

    update_data = item_in.model_dump(exclude_unset=True)
    if not update_data:
        return oglasi.to_dict(existing)

    updated = await oglasi.update_by_id(id, update_data)
    logger.info(f"Ažuriran oglas id={id}")
    return oglasi.to_dict(updated)


@router.patch(
    "/{id}/status",
    dependencies=[
        Depends(deps.require_scopes("listings:update")),
        Depends(deps.require_tenant()),
    ],
)
async def change_listing_status(
    id: str,
    new_status: str = Query(..., description="nacrt | aktivan | pauziran | arhiviran"),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Promijeni status oglasa."""
    if new_status not in VALID_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Neispravan status. Dopušteni: {sorted(VALID_STATUSES)}",
        )
    existing = await oglasi.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Oglas nije pronađen")

    updated = await oglasi.update_by_id(id, {"status": new_status})
    return oglasi.to_dict(updated)


@router.delete(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("listings:delete")),
        Depends(deps.require_tenant()),
    ],
)
async def delete_listing(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Obriši oglas."""
    existing = await oglasi.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Oglas nije pronađen")

    await oglasi.delete_by_id(id)
    logger.info(f"Obrisan oglas id={id}")
    return {"message": "Oglas uspješno obrisan"}


# ---------------------------------------------------------------------------
# XML Export (Faza 2: automatska dostava Njuškalo partneru)
# ---------------------------------------------------------------------------


@router.get(
    "/xml-export",
    dependencies=[Depends(deps.require_scopes("listings:read"))],
    response_class=Response,
)
async def export_listings_xml(
    portal: Optional[str] = Query(
        None,
        description="Filtriraj po portalu (njuskalo, index). Bez filtera = svi aktivni.",
    ),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """
    Generiraj XML feed aktivnih oglasa u Njuškalo formatu.

    Ovaj feed možete predati Njuškalo/Index partneru za automatsku objavu.
    Zahtijeva partnerski ugovor s portalom.
    """
    items = await oglasi.find_all(
        filters={"status": "aktivan"},
        order_by="created_at",
        order_dir="desc",
    )
    if portal:
        portal_lower = portal.lower()
        items = [
            i for i in items
            if i.objavi_na and any(portal_lower in p.lower() for p in i.objavi_na)
        ]
    listings = [oglasi.to_dict(i) for i in items]

    xml_content = _build_njuskalo_xml(listings)

    return Response(
        content=xml_content,
        media_type="application/xml; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="oglasi_feed.xml"',
        },
    )
