import base64
import io
import json
import logging
import re
from typing import Any, Dict, Optional

from sqlalchemy import or_

from app.api import deps
from app.core.config import get_settings
from app.core.limiter import limiter
from app.db.repositories.instance import (
    ugovori,
    zakupnici,
    nekretnine,
    property_units,
    maintenance_tasks,
    racuni,
)
from app.models.tables import (
    ZakupniciRow,
    NekretnineRow,
    PropertyUnitRow,
    RacuniRow,
)
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from PIL import Image
from pydantic import BaseModel
from pypdf import PdfReader

try:
    import anthropic
except ImportError:
    anthropic = None

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

# Claude model configuration (from settings, overridable via CLAUDE_MODEL env var)
CLAUDE_TEXT_MODEL = settings.CLAUDE_MODEL
CLAUDE_VISION_MODEL = settings.CLAUDE_MODEL


class AnnexRequest(BaseModel):
    ugovor_id: str
    nova_zakupnina: Optional[float] = None
    novi_datum_zavrsetka: Optional[str] = None
    dodatne_promjene: Optional[str] = None


def _get_anthropic_client() -> "anthropic.Anthropic":
    """Create and return an Anthropic client, raising clear errors if unavailable."""
    if anthropic is None:
        raise HTTPException(
            status_code=500,
            detail="Anthropic SDK nije instaliran. Pokrenite: pip install anthropic",
        )

    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        return None

    return anthropic.Anthropic(api_key=api_key)


@router.post(
    "/generate-contract-annex",
    dependencies=[Depends(deps.require_scopes("leases:update"))],
)
@limiter.limit("10/minute")
async def generate_contract_annex(
    request: Request,
    body: AnnexRequest,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    # Verify contract exists
    contract = await ugovori.get_by_id(body.ugovor_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    client = _get_anthropic_client()

    if client is None:
        return {
            "success": True,
            "title": "Aneks ugovora",
            "content": (
                "ANEKS UGOVORA\n\n1. Predmet izmjene ...\n"
                "2. Nova zakupnina ...\n"
                "3. Ostale odredbe ostaju na snazi."
            ),
            "metadata": {
                "source": "fallback",
                "nova_zakupnina": body.nova_zakupnina,
                "novi_datum_zavrsetka": body.novi_datum_zavrsetka,
            },
        }

    try:
        prompt = (
            f"Sastavi aneks ugovora za ugovor {body.ugovor_id}. "
            f"Nova zakupnina: {body.nova_zakupnina}. "
            f"Novi datum završetka: {body.novi_datum_zavrsetka}. "
            f"Dodatne promjene: {body.dodatne_promjene}."
        )

        response = client.messages.create(
            model=CLAUDE_TEXT_MODEL,
            max_tokens=2048,
            system=(
                "Ti si pravni asistent specijaliziran za"
                " hrvatski pravni sustav i ugovore o"
                " zakupu poslovnog prostora."
            ),
            messages=[
                {"role": "user", "content": prompt},
            ],
        )

        content = response.content[0].text

        return {
            "success": True,
            "title": "Aneks ugovora",
            "content": content,
            "metadata": {
                "source": "anthropic",
                "model": CLAUDE_TEXT_MODEL,
                "nova_zakupnina": body.nova_zakupnina,
                "novi_datum_zavrsetka": body.novi_datum_zavrsetka,
            },
        }
    except anthropic.APIError as e:
        logger.error(f"Anthropic API error generating annex: {e}")
        raise HTTPException(status_code=500, detail="Greška pri generiranju aneksa")
    except Exception as e:
        logger.error(f"Error generating annex: {e}")
        raise HTTPException(status_code=500, detail="Greška pri generiranju aneksa")


@router.post(
    "/parse-pdf-contract",
    dependencies=[Depends(deps.require_scopes("leases:create"))],
)
@limiter.limit("5/minute")
async def parse_pdf_contract(
    request: Request,
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    logger.info(f"Starting PDF analysis for file: {file.filename}")

    # 1. Read file content (max 20MB for AI processing)
    MAX_PDF_SIZE = 20 * 1024 * 1024
    try:
        contents = await file.read()
        if len(contents) > MAX_PDF_SIZE:
            raise HTTPException(
                status_code=422,
                detail="PDF je prevelik. Maksimalna veličina: 20MB",
            )
        pdf_file = io.BytesIO(contents)
        reader = PdfReader(pdf_file)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to read PDF: {e}")
        raise HTTPException(status_code=400, detail="Neuspješno čitanje PDF-a")

    # 2. Extract text and images
    text = ""
    images = []

    try:
        # Limit to first 5 pages
        for i, page in enumerate(reader.pages[:5]):
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"

            # If text is sparse, look for images (scans)
            if len(text) < 200:
                try:
                    for img in page.images:
                        images.append(img)
                except Exception as img_err:
                    logger.warning(f"Failed to extract images from page {i}: {img_err}")

    except Exception as e:
        logger.error(f"Error extracting content from PDF: {e}")
        # Continue if we have at least some content, otherwise raise
        if not text and not images:
            raise HTTPException(
                status_code=400,
                detail="Greška pri analizi sadržaja PDF-a",
            )

    # 3. Determine mode
    use_vision = False
    if len(text.strip()) < 50 and images:
        use_vision = True
        logger.info("Using Vision mode (scanned document detected)")
    elif len(text.strip()) < 50 and not images:
        raise HTTPException(
            status_code=400, detail="Nije pronađen tekst niti slike u PDF-u."
        )
    else:
        logger.info("Using Text mode")

    # 4. Prepare Anthropic Client
    client = _get_anthropic_client()

    # MOCK RESPONSE if no key
    if client is None:
        logger.warning("No Anthropic API key found. Returning mock response.")
        return {
            "success": True,
            "data": {
                "ugovor": {
                    "interna_oznaka": "MOCK-UGOVOR-001",
                    "datum_sklapanja": "2024-01-01",
                    "datum_pocetka": "2024-02-01",
                    "datum_zavrsetka": "2025-02-01",
                    "sazetak": "Ovo je mock sažetak jer nema API ključa.",
                },
                "financije": {"iznos": 1000.00, "valuta": "EUR"},
                "zakupnik": {
                    "naziv_firme": "Mock Tvrtka d.o.o.",
                    "oib": "12345678901",
                    "adresa": "Ilica 1, Zagreb",
                },
                "nekretnina": {"naziv": "Poslovni Centar", "adresa": "Vukovarska 10"},
            },
        }

    try:
        model = CLAUDE_TEXT_MODEL

        system_prompt = (
            "Ti si asistent za analizu pravnih dokumenata"
            " (ugovora o zakupu). "
            "Vraćaš isključivo validan JSON bez ikakvih"
            " dodatnih objašnjenja ili markdown formatiranja."
        )

        json_structure = """
        {
            "ugovor": {
                "interna_oznaka": "string ili null (broj ugovora)",
                "datum_sklapanja": "YYYY-MM-DD ili null (pretvori iz teksta)",
                "datum_pocetka": "YYYY-MM-DD ili null (pretvori iz teksta)",
                "datum_zavrsetka": "YYYY-MM-DD ili null (dodaj trajanje na pocetak)",
                "trajanje_mjeseci": "number ili null (izracunaj iz datuma ako treba)",
                "opcija_produljenja": "boolean (true ako ugovor ima opciju produljenja)",
                "uvjeti_produljenja": "string ili null (opis uvjeta produljenja)",
                "rok_otkaza_dani": "number ili null (otkazni rok u danima)",
                "namjena_prostora": "string ili null (namjena - ured, trgovina, ugostiteljstvo...)",
                "obveze_odrzavanja": "string ili null (tko odrzava sto)",
                "sazetak": "string (kratki opis bitnih stavki)"
            },
            "financije": {
                "osnovna_zakupnina": "number (mjesecni iznos zakupnine) ili null",
                "valuta": "string (EUR, USD...)",
                "polog_depozit": "number (iznos depozita/pologa) ili null",
                "cam_troskovi": "number (zajednicki troskovi odrzavanja) ili null",
                "garancija": "number (iznos garancije) ili null",
                "indeksacija": "boolean (true ako ugovor predvida indeksaciju/uskladivanje cijena)",
                "indeks": "string ili null (vrsta indeksa - CPI, HICP, inflacija...)",
                "formula_indeksacije": "string ili null (formula ili opis nacina indeksacije)"
            },
            "zakupnik": {
                "naziv_firme": "string ili null",
                "oib": "string ili null",
                "adresa": "string ili null"
            },
            "nekretnina": {
                "naziv": "string ili null",
                "adresa": "string ili null"
            },
            "property_unit": {
                "naziv": "string ili null (oznaka podprostora)"
            }
        }
        """

        messages = []

        if use_vision:
            model = CLAUDE_VISION_MODEL
            # Process first image
            img_obj = images[0]
            image_data = img_obj.data

            # Convert to base64 using PIL for normalization
            try:
                pil_img = Image.open(io.BytesIO(image_data))
                if pil_img.mode not in ("RGB", "L"):
                    pil_img = pil_img.convert("RGB")

                # Resize to avoid token limits
                pil_img.thumbnail((2000, 2000))

                buff = io.BytesIO()
                pil_img.save(buff, format="JPEG")
                base64_image = base64.b64encode(buff.getvalue()).decode("utf-8")
                media_type = "image/jpeg"
            except Exception as e:
                logger.warning(f"Image conversion failed, trying raw bytes: {e}")
                base64_image = base64.b64encode(image_data).decode("utf-8")
                media_type = "image/jpeg"

            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": base64_image,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "Analiziraj ovu sliku ugovora i"
                                " izvuci podatke u JSON formatu:\n"
                                f"{json_structure}"
                            ),
                        },
                    ],
                },
            ]
        else:
            # Text mode
            messages = [
                {
                    "role": "user",
                    "content": (
                        "Analiziraj tekst ugovora i izvuci"
                        " podatke u JSON formatu:\n"
                        f"{json_structure}\n\n"
                        f"Tekst ugovora:\n{text[:8000]}"
                    ),
                },
            ]

        response = client.messages.create(
            model=model,
            max_tokens=2048,
            system=system_prompt,
            messages=messages,
            temperature=0,
        )

        content = response.content[0].text

        # Claude might wrap JSON in markdown code blocks - strip them
        content = content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        data = json.loads(content)

        # Post-processing / Enrichment
        # Try to match (or auto-create) Tenant and match Property from DB

        # 1. Match or auto-create Zakupnik
        if data.get("zakupnik"):
            zakupnik_data = data["zakupnik"]
            conditions = []
            if zakupnik_data.get("oib"):
                conditions.append(ZakupniciRow.oib == zakupnik_data["oib"])
            if zakupnik_data.get("naziv_firme"):
                conditions.append(
                    ZakupniciRow.naziv_firme.ilike(
                        f"%{zakupnik_data['naziv_firme']}%"
                    )
                )

            found_tenant = None
            if conditions:
                found_tenant = await zakupnici.find_one(
                    extra_conditions=[or_(*conditions)]
                )

            if found_tenant:
                # Existing zakupnik — attach ID
                data["zakupnik"]["id"] = found_tenant.id
                data["zakupnik"]["_auto_created"] = False
            elif zakupnik_data.get("naziv_firme") or zakupnik_data.get("oib"):
                # Auto-create zakupnik from AI-extracted data
                import uuid as _uuid
                from datetime import datetime as _dt
                from datetime import timezone as _tz

                new_id = str(_uuid.uuid4())
                now = _dt.now(_tz.utc)
                new_zakupnik = {
                    "id": new_id,
                    "naziv_firme": zakupnik_data.get("naziv_firme") or "",
                    "oib": zakupnik_data.get("oib") or "",
                    "adresa": zakupnik_data.get("adresa") or "",
                    "kontakt_email": "",
                    "kontakt_telefon": "",
                    "tip": "zakupnik",
                    "created_at": now,
                    "updated_at": now,
                }
                await zakupnici.create(new_zakupnik)
                data["zakupnik"]["id"] = new_id
                data["zakupnik"]["_auto_created"] = True
                logger.info(
                    f"Auto-created zakupnik '{new_zakupnik['naziv_firme']}' "
                    f"(id={new_id}) from AI contract parse"
                )

        # 2. Match Property
        if data.get("nekretnina"):
            prop_data = data["nekretnina"]
            conditions = []
            if prop_data.get("naziv"):
                conditions.append(
                    NekretnineRow.naziv.ilike(
                        f"%{prop_data['naziv']}%"
                    )
                )
            if prop_data.get("adresa"):
                addr_part = prop_data["adresa"].split(",")[0].strip()
                if len(addr_part) > 3:
                    conditions.append(
                        NekretnineRow.adresa.ilike(f"%{addr_part}%")
                    )

            if conditions:
                found_prop = await nekretnine.find_one(
                    extra_conditions=[or_(*conditions)]
                )
                if found_prop:
                    data["nekretnina"]["id"] = found_prop.id

                    # 3. Match Unit if Property found
                    if data.get("property_unit") and data["property_unit"].get("naziv"):
                        unit_name = data["property_unit"]["naziv"]
                        found_unit = await property_units.find_one(
                            extra_conditions=[
                                PropertyUnitRow.nekretnina_id == found_prop.id,
                                PropertyUnitRow.oznaka.ilike(f"%{unit_name}%"),
                            ]
                        )
                        if found_unit:
                            data["property_unit"]["id"] = found_unit.id

        return {"success": True, "data": data}

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Claude response as JSON: {e}")
        raise HTTPException(
            status_code=500,
            detail="AI je vratio neispravan JSON. Pokušajte ponovo.",
        )
    except anthropic.RateLimitError:
        raise HTTPException(
            status_code=429,
            detail=(
                "AI servis je trenutno preopterećen." " Pokušajte ponovo za par minuta."
            ),
        )
    except anthropic.APIError as e:
        logger.error(f"Anthropic API error: {e}")
        raise HTTPException(status_code=500, detail="Greška pri AI analizi")
    except Exception as e:
        logger.error(f"AI analysis failed: {e}")
        raise HTTPException(status_code=500, detail="Greška pri AI analizi")


# --------------- Monthly AI Report ---------------


class MonthlyReportRequest(BaseModel):
    mjesec: int  # 1-12
    godina: int  # e.g. 2026


@router.post(
    "/monthly-report",
    dependencies=[Depends(deps.require_scopes("reports:read"))],
)
@limiter.limit("3/minute")
async def generate_monthly_report(
    request: Request,
    body: MonthlyReportRequest,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Generate AI-powered monthly portfolio report."""
    mjesec = body.mjesec
    godina = body.godina

    if not (1 <= mjesec <= 12):
        raise HTTPException(status_code=422, detail="Mjesec mora biti 1-12")
    if not (2020 <= godina <= 2099):
        raise HTTPException(status_code=422, detail="Nevažeća godina")

    # --- Collect portfolio data ---

    # Properties
    properties = await nekretnine.find_all()

    # Units
    units = await property_units.find_all()

    # Contracts
    contracts = await ugovori.find_all()

    # Tenants
    tenants = await zakupnici.find_all()

    # Maintenance
    maintenance = await maintenance_tasks.find_all()

    # Bills (racuni) for this month
    period_start = f"{godina}-{mjesec:02d}-01"
    if mjesec == 12:
        period_end = f"{godina + 1}-01-01"
    else:
        period_end = f"{godina}-{mjesec + 1:02d}-01"

    racuni_list = await racuni.find_all(
        extra_conditions=[
            RacuniRow.datum_racuna >= period_start,
            RacuniRow.datum_racuna < period_end,
        ]
    )

    # --- Build summary stats ---
    total_units = len(units)
    rented_units = len([u for u in units if u.status == "iznajmljeno"])
    occupancy_pct = round((rented_units / total_units * 100) if total_units else 0, 1)

    active_contracts = [c for c in contracts if c.status == "aktivno"]
    expiring_contracts = [c for c in contracts if c.status == "na_isteku"]

    monthly_revenue = sum(
        float(c.osnovna_zakupnina or 0) for c in active_contracts
    )

    open_maintenance = [
        m
        for m in maintenance
        if m.status in ("novi", "planiran", "u_tijeku", "ceka_dobavljaca")
    ]

    total_bills = sum(float(r.iznos or 0) for r in racuni_list)
    unpaid_bills = sum(
        float(r.iznos or 0)
        for r in racuni_list
        if r.status_placanja in ("ceka_placanje", "prekoraceno")
    )

    # Bills by type
    bills_by_type = {}
    for r in racuni_list:
        tip = r.tip_utroska or "ostalo"
        bills_by_type[tip] = bills_by_type.get(tip, 0) + float(r.iznos or 0)

    portfolio_summary = {
        "period": f"{mjesec:02d}/{godina}",
        "nekretnine": len(properties),
        "jedinice_ukupno": total_units,
        "jedinice_iznajmljene": rented_units,
        "popunjenost_pct": occupancy_pct,
        "aktivni_ugovori": len(active_contracts),
        "ugovori_na_isteku": len(expiring_contracts),
        "mjesecni_prihod_eur": round(monthly_revenue, 2),
        "godisnji_prihod_eur": round(monthly_revenue * 12, 2),
        "otvoreni_nalozi_odrzavanja": len(open_maintenance),
        "racuni_mjesec_ukupno": round(total_bills, 2),
        "racuni_neplaceno": round(unpaid_bills, 2),
        "racuni_po_tipu": {k: round(v, 2) for k, v in bills_by_type.items()},
        "zakupnici_ukupno": len(tenants),
    }

    # --- AI Analysis ---
    client = _get_anthropic_client()

    if client is None:
        # Return structured mock when no API key
        return {
            "success": True,
            "data": {
                "sazetak": (
                    f"Izvještaj za {mjesec:02d}/{godina}. "
                    f"Portfelj sadrži {len(properties)} nekretnina "
                    f"s ukupno {total_units} jedinica. "
                    f"Popunjenost iznosi {occupancy_pct}%. "
                    f"Mjesečni prihod: {monthly_revenue:.2f} EUR."
                ),
                "financijski_pregled": {
                    "mjesecni_prihod": round(monthly_revenue, 2),
                    "godisnji_prihod": round(monthly_revenue * 12, 2),
                    "ukupni_troskovi": round(total_bills, 2),
                    "neto_prihod": round(monthly_revenue - total_bills, 2),
                    "neplaceni_racuni": round(unpaid_bills, 2),
                },
                "popunjenost": {
                    "postotak": occupancy_pct,
                    "iznajmljeno": rented_units,
                    "ukupno": total_units,
                    "trend": "stabilan",
                },
                "odrzavanje": {
                    "otvoreni_nalozi": len(open_maintenance),
                    "preporuka": "Redovito pratite naloge održavanja.",
                },
                "ugovorni_rizici": [
                    {
                        "tip": "istek_ugovora",
                        "opis": f"{len(expiring_contracts)} ugovor(a) na isteku",
                        "prioritet": "visoko" if expiring_contracts else "nisko",
                    }
                ],
                "preporuke": [
                    "Kontaktirajte zakupnike s ugovorima na isteku za obnovu.",
                    "Pregledajte neplaćene račune i pokrenite opomene.",
                    "Ažurirajte status otvorenih naloga održavanja.",
                ],
                "tech_prijedlozi": [
                    {
                        "naziv": "Automatske obavijesti o isteku ugovora",
                        "opis": "Implementirajte email/push obavijesti 30/60/90 dana prije isteka.",
                        "prioritet": "visoko",
                    },
                    {
                        "naziv": "Integracija s e-Račun sustavom",
                        "opis": (
                            "Automatizirajte zaprimanje i knjiženje"
                            " računa putem e-Račun API-ja."
                        ),
                        "prioritet": "srednje",
                    },
                    {
                        "naziv": "Dashboard za energetsku učinkovitost",
                        "opis": "Vizualizacija potrošnje energije po nekretnini s trendovima.",
                        "prioritet": "srednje",
                    },
                ],
            },
            "portfolio_summary": portfolio_summary,
            "metadata": {"source": "fallback"},
        }

    # Build lookup dicts for denormalized names
    zakupnik_names = {t.id: t.naziv_firme for t in tenants}
    nekretnina_names = {p.id: p.naziv for p in properties}

    # Build prompt data
    expiring_summary = [
        {
            "zakupnik": zakupnik_names.get(c.zakupnik_id, "N/A"),
            "nekretnina": nekretnina_names.get(c.nekretnina_id, "N/A"),
            "datum_zavrsetka": c.datum_zavrsetka or "N/A",
            "osnovna_zakupnina": c.osnovna_zakupnina or 0,
        }
        for c in expiring_contracts[:10]
    ]
    maint_summary = [
        {
            "opis": m.opis or "N/A",
            "prioritet": m.prioritet or "N/A",
            "status": m.status or "N/A",
            "nekretnina": nekretnina_names.get(m.nekretnina_id, "N/A"),
        }
        for m in open_maintenance[:10]
    ]

    portfolio_json = json.dumps(portfolio_summary, ensure_ascii=False, indent=2)
    expiring_json = json.dumps(expiring_summary, ensure_ascii=False, indent=2)
    maint_json = json.dumps(maint_summary, ensure_ascii=False, indent=2)

    prompt = f"""Analiziraj mjesečno stanje portfelja nekretnina za {mjesec:02d}/{godina}.

PODACI PORTFELJA:
{portfolio_json}

DETALJI UGOVORA NA ISTEKU:
{expiring_json}

OTVORENI NALOZI ODRŽAVANJA:
{maint_json}

Vrati JSON s ovom strukturom (bez markdown formatiranja):
{{
    "sazetak": "string (2-3 rečenice executive summary)",
    "financijski_pregled": {{
        "mjesecni_prihod": number,
        "godisnji_prihod": number,
        "ukupni_troskovi": number,
        "neto_prihod": number,
        "neplaceni_racuni": number,
        "komentar": "string (kratka analiza financija)"
    }},
    "popunjenost": {{
        "postotak": number,
        "iznajmljeno": number,
        "ukupno": number,
        "trend": "string (rastući/padajući/stabilan)",
        "komentar": "string"
    }},
    "odrzavanje": {{
        "otvoreni_nalozi": number,
        "kriticni_nalozi": number,
        "preporuka": "string"
    }},
    "ugovorni_rizici": [
        {{"tip": "string", "opis": "string", "prioritet": "visoko|srednje|nisko"}}
    ],
    "preporuke": ["string (konkretne preporuke za upravljanje)"],
    "tech_prijedlozi": [
        {{"naziv": "string", "opis": "string", "prioritet": "visoko|srednje|nisko"}}
    ]
}}"""

    try:
        response = client.messages.create(
            model=CLAUDE_TEXT_MODEL,
            max_tokens=4096,
            system=(
                "Ti si AI asistent za upravljanje portfeljem nekretnina u Hrvatskoj. "
                "Analiziraš podatke i daješ konkretne, actionable preporuke na hrvatskom jeziku. "
                "Vraćaš isključivo validan JSON bez markdown formatiranja."
            ),
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )

        content = response.content[0].text.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        data = json.loads(content)

        return {
            "success": True,
            "data": data,
            "portfolio_summary": portfolio_summary,
            "metadata": {"source": "anthropic", "model": CLAUDE_TEXT_MODEL},
        }

    except json.JSONDecodeError:
        logger.error("AI returned invalid JSON for monthly report")
        raise HTTPException(
            status_code=500,
            detail="AI je vratio neispravan JSON. Pokušajte ponovo.",
        )
    except Exception as e:
        logger.error(f"Monthly report AI analysis failed: {e}")
        raise HTTPException(
            status_code=500, detail="Greška pri generiranju mjesečnog izvještaja"
        )
