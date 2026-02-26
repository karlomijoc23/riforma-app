"""AI Agent service — agentic loop with tool use for the RIFORMA chatbot.

Provides:
- System prompt describing the RIFORMA domain
- Tool definitions (READ + WRITE) in Anthropic tool_use format
- Tool executor functions using existing ORM repositories
- Agentic loop that iterates until text response or write confirmation
"""

import json
import logging
import re
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import get_settings
from app.db.repositories.instance import (
    dobavljaci,
    maintenance_tasks,
    nekretnine,
    projekti,
    property_units,
    racuni,
    ugovori,
    zakupnici,
)
from app.models.tables import RacuniRow

logger = logging.getLogger(__name__)

settings = get_settings()

MAX_CONTEXT_MESSAGES = 30
MAX_TOOL_ITERATIONS = 5

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """Ti si AI asistent za RIFORMA — platformu za upravljanje nekretninama i portfeljom najma.

Tvoja domena uključuje:
- Nekretnine (properties) — poslovni prostori, stanovi, zgrade
- Jedinice (property units) — pojedinačne jedinice unutar nekretnine
- Zakupnici (tenants) — fizičke/pravne osobe koje iznajmljuju prostor
- Ugovori (contracts) — ugovori o najmu s datumima, cijenama, statusima
- Održavanje (maintenance tasks) — nalozi za popravke i održavanje
- Računi (bills) — komunalni troškovi, režije, fakture
- Dobavljači (vendors) — izvođači radova, servisi
- Projekti (projects) — renovacije, investicije

Pravila:
1. Uvijek odgovaraj na HRVATSKOM jeziku.
2. Koristi alate za dohvaćanje podataka — nikad ne izmišljaj brojke.
3. Budi koncizan i informativan.
4. Kad korisnik traži kreiranje ili izmjenu podataka, koristi odgovarajući write alat.
5. Formatiran odgovor — koristi liste i naslove za preglednost kad je potrebno.
6. Kad korisnik pita nešto van domene upravljanja nekretninama, ljubazno objasni da si specijaliziran za RIFORMA platformu.
7. Možeš generirati mjesečne izvještaje za bilo koji mjesec/godinu koristeći generate_report alat. Iz dobivenih podataka formuliraj pregledni izvještaj.
8. Možeš generirati špranca (draft) ugovora o zakupu koristeći generate_ugovor_document alat. Dohvati ugovor po ID-u i iz podataka formuliraj formalni tekst ugovora. Korisnik može prvo koristiti list_ugovori da pronađe željeni ugovor.
"""

# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------

READ_TOOLS = [
    {
        "name": "list_nekretnine",
        "description": "Dohvati popis nekretnina. Opcionalni search filter za pretragu po nazivu/adresi.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {
                    "type": "string",
                    "description": "Pojam za pretragu po nazivu ili adresi",
                }
            },
        },
    },
    {
        "name": "get_nekretnina_details",
        "description": "Dohvati detalje nekretnine i njenih jedinica po ID-u.",
        "input_schema": {
            "type": "object",
            "properties": {
                "nekretnina_id": {
                    "type": "string",
                    "description": "ID nekretnine",
                }
            },
            "required": ["nekretnina_id"],
        },
    },
    {
        "name": "list_zakupnici",
        "description": "Dohvati popis zakupnika. Opcionalni search filter.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {
                    "type": "string",
                    "description": "Pojam za pretragu po imenu ili emailu",
                }
            },
        },
    },
    {
        "name": "list_ugovori",
        "description": "Dohvati popis ugovora. Filtriraj po statusu, nekretnini ili zakupniku.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Status ugovora (aktivno, na_isteku, istekao, raskinuto, arhivirano)",
                },
                "nekretnina_id": {
                    "type": "string",
                    "description": "ID nekretnine",
                },
                "zakupnik_id": {
                    "type": "string",
                    "description": "ID zakupnika",
                },
            },
        },
    },
    {
        "name": "list_maintenance_tasks",
        "description": "Dohvati popis naloga za održavanje. Filtriraj po statusu ili prioritetu.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Status naloga (novi, u_tijeku, zavrseno, otkazano)",
                },
                "prioritet": {
                    "type": "string",
                    "description": "Prioritet (nisko, srednje, visoko, hitno)",
                },
            },
        },
    },
    {
        "name": "list_racuni",
        "description": "Dohvati popis računa. Filtriraj po statusu plaćanja ili tipu.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status_placanja": {
                    "type": "string",
                    "description": "Status plaćanja (ceka_placanje, placeno, kasni, djelomicno_placeno)",
                },
                "tip_utroska": {
                    "type": "string",
                    "description": "Tip računa (struja, voda, plin, internet, pricuva, ostalo)",
                },
            },
        },
    },
    {
        "name": "list_dobavljaci",
        "description": "Dohvati popis dobavljača. Opcionalni search filter.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {
                    "type": "string",
                    "description": "Pojam za pretragu po nazivu",
                }
            },
        },
    },
    {
        "name": "list_projekti",
        "description": "Dohvati popis projekata. Opcionalni status filter.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Status projekta (planning, in_progress, completed, on_hold)",
                }
            },
        },
    },
    {
        "name": "get_portfolio_summary",
        "description": "Dohvati sumarni pregled portfelja — ukupan broj nekretnina, zakupnika, ugovora, naloga itd.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "generate_report",
        "description": "Generiraj mjesečni izvještaj za portfelj s detaljnim podacima o popunjenosti, prihodima, troškovima, ugovorima i održavanju.",
        "input_schema": {
            "type": "object",
            "properties": {
                "mjesec": {
                    "type": "integer",
                    "description": "Mjesec (1-12). Ako nije naveden, koristi se tekući mjesec.",
                },
                "godina": {
                    "type": "integer",
                    "description": "Godina (npr. 2026). Ako nije navedena, koristi se tekuća godina.",
                },
            },
        },
    },
    {
        "name": "generate_ugovor_document",
        "description": "Generiraj špranca (draft) ugovora o zakupu na temelju postojećeg ugovora iz baze. Dohvaća sve podatke o ugovoru, nekretnini, zakupniku i jedinici, te ih vraća za formuliranje formalnog teksta ugovora.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ugovor_id": {
                    "type": "string",
                    "description": "ID ugovora iz baze podataka",
                },
            },
            "required": ["ugovor_id"],
        },
    },
]

WRITE_TOOLS = [
    {
        "name": "create_zakupnik",
        "description": "Kreiraj novog zakupnika. Zahtijeva potvrdu korisnika.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ime_prezime": {"type": "string", "description": "Ime i prezime zakupnika"},
                "kontakt_email": {"type": "string", "description": "Email adresa"},
                "kontakt_telefon": {"type": "string", "description": "Telefon"},
                "oib": {"type": "string", "description": "OIB"},
            },
            "required": ["ime_prezime"],
        },
    },
    {
        "name": "update_zakupnik",
        "description": "Ažuriraj podatke zakupnika. Zahtijeva potvrdu korisnika.",
        "input_schema": {
            "type": "object",
            "properties": {
                "zakupnik_id": {"type": "string", "description": "ID zakupnika"},
                "ime_prezime": {"type": "string", "description": "Novo ime i prezime"},
                "kontakt_email": {"type": "string", "description": "Novi email"},
                "kontakt_telefon": {"type": "string", "description": "Novi telefon"},
            },
            "required": ["zakupnik_id"],
        },
    },
    {
        "name": "create_maintenance_task",
        "description": "Kreiraj novi nalog za održavanje. Zahtijeva potvrdu korisnika.",
        "input_schema": {
            "type": "object",
            "properties": {
                "naziv": {"type": "string", "description": "Naziv/opis naloga"},
                "opis": {"type": "string", "description": "Detaljni opis problema"},
                "nekretnina_id": {"type": "string", "description": "ID nekretnine"},
                "prioritet": {
                    "type": "string",
                    "description": "Prioritet (nisko, srednje, visoko, hitno)",
                },
                "status": {"type": "string", "description": "Status (novi, u_tijeku)"},
            },
            "required": ["naziv"],
        },
    },
    {
        "name": "update_maintenance_task",
        "description": "Ažuriraj nalog za održavanje. Zahtijeva potvrdu korisnika.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "ID naloga"},
                "status": {"type": "string", "description": "Novi status"},
                "prioritet": {"type": "string", "description": "Novi prioritet"},
                "opis": {"type": "string", "description": "Novi opis"},
                "napomena": {"type": "string", "description": "Napomena"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "update_ugovor_status",
        "description": "Promijeni status ugovora. Zahtijeva potvrdu korisnika.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ugovor_id": {"type": "string", "description": "ID ugovora"},
                "novi_status": {
                    "type": "string",
                    "description": "Novi status (aktivno, na_isteku, istekao, raskinuto, arhivirano)",
                },
            },
            "required": ["ugovor_id", "novi_status"],
        },
    },
]

ALL_TOOLS = READ_TOOLS + WRITE_TOOLS
WRITE_TOOL_NAMES = {t["name"] for t in WRITE_TOOLS}


# ---------------------------------------------------------------------------
# Tool executor — READ tools
# ---------------------------------------------------------------------------


def _serialize_rows(rows: list, repo) -> list:
    """Convert ORM rows to simple dicts for tool results."""
    return [repo.to_dict(r) for r in rows]


async def execute_tool(name: str, tool_input: Dict[str, Any]) -> str:
    """Execute a READ tool and return JSON string result."""
    try:
        result = await _execute_read(name, tool_input)
        return json.dumps(result, ensure_ascii=False, default=str)
    except Exception as e:
        logger.exception(f"Tool execution error: {name}")
        return json.dumps({"error": str(e)}, ensure_ascii=False)


async def _execute_read(name: str, inp: Dict[str, Any]) -> Any:
    if name == "list_nekretnine":
        filters = {}
        if inp.get("search"):
            filters["naziv__contains"] = inp["search"]
        rows, total = await nekretnine.find_many(filters=filters, limit=50)
        return {"items": _serialize_rows(rows, nekretnine), "total": total}

    elif name == "get_nekretnina_details":
        row = await nekretnine.get_by_id(inp["nekretnina_id"])
        if not row:
            return {"error": "Nekretnina nije pronađena"}
        units, _ = await property_units.find_many(
            filters={"nekretnina_id": inp["nekretnina_id"]}, limit=50
        )
        data = _serialize_rows([row], nekretnine)[0]
        data["jedinice"] = _serialize_rows(units, property_units)
        return data

    elif name == "list_zakupnici":
        filters = {}
        if inp.get("search"):
            filters["ime_prezime__contains"] = inp["search"]
        rows, total = await zakupnici.find_many(filters=filters, limit=50)
        return {"items": _serialize_rows(rows, zakupnici), "total": total}

    elif name == "list_ugovori":
        filters = {}
        if inp.get("status"):
            filters["status"] = inp["status"]
        if inp.get("nekretnina_id"):
            filters["nekretnina_id"] = inp["nekretnina_id"]
        if inp.get("zakupnik_id"):
            filters["zakupnik_id"] = inp["zakupnik_id"]
        rows, total = await ugovori.find_many(filters=filters, limit=50)
        return {"items": _serialize_rows(rows, ugovori), "total": total}

    elif name == "list_maintenance_tasks":
        filters = {}
        if inp.get("status"):
            filters["status"] = inp["status"]
        if inp.get("prioritet"):
            filters["prioritet"] = inp["prioritet"]
        rows, total = await maintenance_tasks.find_many(filters=filters, limit=50)
        return {"items": _serialize_rows(rows, maintenance_tasks), "total": total}

    elif name == "list_racuni":
        filters = {}
        if inp.get("status_placanja"):
            filters["status_placanja"] = inp["status_placanja"]
        if inp.get("tip_utroska"):
            filters["tip_utroska"] = inp["tip_utroska"]
        rows, total = await racuni.find_many(filters=filters, limit=50)
        return {"items": _serialize_rows(rows, racuni), "total": total}

    elif name == "list_dobavljaci":
        filters = {}
        if inp.get("search"):
            filters["naziv__contains"] = inp["search"]
        rows, total = await dobavljaci.find_many(filters=filters, limit=50)
        return {"items": _serialize_rows(rows, dobavljaci), "total": total}

    elif name == "list_projekti":
        filters = {}
        if inp.get("status"):
            filters["status"] = inp["status"]
        rows, total = await projekti.find_many(filters=filters, limit=50)
        return {"items": _serialize_rows(rows, projekti), "total": total}

    elif name == "get_portfolio_summary":
        n_count = await nekretnine.count()
        z_count = await zakupnici.count()
        u_count = await ugovori.count()
        m_count = await maintenance_tasks.count()
        r_count = await racuni.count()
        d_count = await dobavljaci.count()
        p_count = await projekti.count()
        u_active = await ugovori.count(filters={"status": "aktivno"})
        return {
            "nekretnine": n_count,
            "zakupnici": z_count,
            "ugovori_ukupno": u_count,
            "ugovori_aktivni": u_active,
            "nalozi_odrzavanja": m_count,
            "racuni": r_count,
            "dobavljaci": d_count,
            "projekti": p_count,
        }

    elif name == "generate_report":
        today = date.today()
        mjesec = inp.get("mjesec") or today.month
        godina = inp.get("godina") or today.year

        if not (1 <= mjesec <= 12):
            return {"error": "Mjesec mora biti 1-12"}
        if not (2020 <= godina <= 2099):
            return {"error": "Nevažeća godina"}

        # Fetch all data
        properties = await nekretnine.find_all()
        units = await property_units.find_all()
        contracts = await ugovori.find_all()
        tenants = await zakupnici.find_all()
        maintenance = await maintenance_tasks.find_all()

        # Bills for requested month
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

        # Compute metrics
        total_units = len(units)
        rented_units = len([u for u in units if u.status == "iznajmljeno"])
        occupancy_pct = round((rented_units / total_units * 100) if total_units else 0, 1)

        active_contracts = [c for c in contracts if c.status == "aktivno"]
        expiring_contracts = [c for c in contracts if c.status == "na_isteku"]

        monthly_revenue = sum(float(c.mjesecna_cijena or 0) for c in active_contracts)

        open_maintenance = [
            m for m in maintenance
            if m.status in ("novi", "planiran", "u_tijeku", "ceka_dobavljaca")
        ]

        total_bills = sum(float(r.iznos or 0) for r in racuni_list)
        unpaid_bills = sum(
            float(r.iznos or 0)
            for r in racuni_list
            if r.status_placanja in ("ceka_placanje", "prekoraceno")
        )

        bills_by_type = {}
        for r in racuni_list:
            tip = r.tip_utroska or "ostalo"
            bills_by_type[tip] = bills_by_type.get(tip, 0) + float(r.iznos or 0)

        # Contract details for active contracts
        ugovori_detalji = []
        for c in active_contracts:
            ugovori_detalji.append({
                "id": c.id,
                "interna_oznaka": c.interna_oznaka,
                "nekretnina_id": c.nekretnina_id,
                "zakupnik_id": c.zakupnik_id,
                "datum_pocetka": str(c.datum_pocetka) if c.datum_pocetka else None,
                "datum_zavrsetka": str(c.datum_zavrsetka) if c.datum_zavrsetka else None,
                "mjesecna_cijena": float(c.mjesecna_cijena or 0),
                "status": c.status,
            })

        # Open maintenance details
        maintenance_otvoreni = []
        for m in open_maintenance:
            maintenance_otvoreni.append({
                "id": m.id,
                "naziv": m.naziv,
                "status": m.status,
                "prioritet": getattr(m, "prioritet", None),
                "nekretnina_id": getattr(m, "nekretnina_id", None),
            })

        return {
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
            "ugovori_detalji": ugovori_detalji,
            "maintenance_otvoreni": maintenance_otvoreni,
        }

    elif name == "generate_ugovor_document":
        ugovor = await ugovori.get_by_id(inp["ugovor_id"])
        if not ugovor:
            return {"error": "Ugovor nije pronađen"}

        # Fetch related entities
        nekretnina = await nekretnine.get_by_id(ugovor.nekretnina_id) if ugovor.nekretnina_id else None
        zakupnik = await zakupnici.get_by_id(ugovor.zakupnik_id) if ugovor.zakupnik_id else None
        jedinica = await property_units.get_by_id(ugovor.property_unit_id) if ugovor.property_unit_id else None

        # Build comprehensive data for document generation
        data = {
            "ugovor": {
                "id": ugovor.id,
                "interna_oznaka": ugovor.interna_oznaka,
                "datum_potpisivanja": str(ugovor.datum_potpisivanja) if ugovor.datum_potpisivanja else None,
                "datum_pocetka": str(ugovor.datum_pocetka) if ugovor.datum_pocetka else None,
                "datum_zavrsetka": str(ugovor.datum_zavrsetka) if ugovor.datum_zavrsetka else None,
                "trajanje_mjeseci": ugovor.trajanje_mjeseci,
                "osnovna_zakupnina": float(ugovor.osnovna_zakupnina or 0),
                "zakupnina_po_m2": float(ugovor.zakupnina_po_m2) if ugovor.zakupnina_po_m2 else None,
                "cam_troskovi": float(ugovor.cam_troskovi) if ugovor.cam_troskovi else None,
                "polog_depozit": float(ugovor.polog_depozit) if ugovor.polog_depozit else None,
                "garancija": float(ugovor.garancija) if ugovor.garancija else None,
                "indeksacija": ugovor.indeksacija,
                "indeks": ugovor.indeks,
                "formula_indeksacije": ugovor.formula_indeksacije,
                "opcija_produljenja": ugovor.opcija_produljenja,
                "uvjeti_produljenja": ugovor.uvjeti_produljenja,
                "rok_otkaza_dani": ugovor.rok_otkaza_dani,
                "namjena_prostora": ugovor.namjena_prostora,
                "obveze_odrzavanja": ugovor.obveze_odrzavanja,
                "rezije_brojila": ugovor.rezije_brojila,
                "status": ugovor.status,
                "napomena": ugovor.napomena,
            },
            "zakupodavac": {
                "napomena": "Podaci zakupodavca (vlasnika) nisu pohranjeni u sustavu — unesite ručno u dokument.",
            },
        }

        if nekretnina:
            data["nekretnina"] = {
                "id": nekretnina.id,
                "naziv": nekretnina.naziv,
                "adresa": getattr(nekretnina, "adresa", None),
                "grad": getattr(nekretnina, "grad", None),
                "vrsta": getattr(nekretnina, "vrsta", None),
                "povrsina_m2": float(nekretnina.povrsina_m2) if getattr(nekretnina, "povrsina_m2", None) else None,
            }

        if zakupnik:
            data["zakupnik"] = {
                "id": zakupnik.id,
                "ime_prezime": zakupnik.ime_prezime,
                "oib": getattr(zakupnik, "oib", None),
                "kontakt_email": getattr(zakupnik, "kontakt_email", None),
                "kontakt_telefon": getattr(zakupnik, "kontakt_telefon", None),
                "adresa": getattr(zakupnik, "adresa", None),
                "grad": getattr(zakupnik, "grad", None),
                "postanski_broj": getattr(zakupnik, "postanski_broj", None),
                "tip_osobe": getattr(zakupnik, "tip_osobe", None),
                "naziv_tvrtke": getattr(zakupnik, "naziv_tvrtke", None),
            }

        if jedinica:
            data["jedinica"] = {
                "id": jedinica.id,
                "naziv": getattr(jedinica, "naziv", None),
                "oznaka": getattr(jedinica, "oznaka", None),
                "kat": getattr(jedinica, "kat", None),
                "povrsina_m2": float(jedinica.povrsina_m2) if getattr(jedinica, "povrsina_m2", None) else None,
                "tip": getattr(jedinica, "tip", None),
            }

        data["upute"] = (
            "Iz ovih podataka generiraj formalni tekst ugovora o zakupu na hrvatskom jeziku. "
            "Ugovor treba sadržavati: ugovorne strane, predmet najma, trajanje, "
            "cijenu i način plaćanja, depozit/jamstvo, indeksaciju, obveze stranaka, "
            "otkaz ugovora, i završne odredbe. Formatiran kao pravni dokument."
        )

        return data

    return {"error": f"Nepoznat alat: {name}"}


# ---------------------------------------------------------------------------
# Tool executor — WRITE tools (executed after user confirmation)
# ---------------------------------------------------------------------------


async def execute_write_tool(
    name: str, tool_input: Dict[str, Any], user_id: str
) -> str:
    """Execute a confirmed WRITE tool. Returns JSON result string."""
    try:
        result = await _execute_write(name, tool_input, user_id)
        return json.dumps(result, ensure_ascii=False, default=str)
    except Exception as e:
        logger.exception(f"Write tool execution error: {name}")
        return json.dumps({"error": str(e)}, ensure_ascii=False)


async def _execute_write(name: str, inp: Dict[str, Any], user_id: str) -> Any:
    if name == "create_zakupnik":
        row = await zakupnici.create(
            {
                "ime_prezime": inp["ime_prezime"],
                "kontakt_email": inp.get("kontakt_email", ""),
                "kontakt_telefon": inp.get("kontakt_telefon", ""),
                "oib": inp.get("oib"),
                "created_by": user_id,
            }
        )
        return {"success": True, "id": row.id, "message": f"Zakupnik '{inp['ime_prezime']}' kreiran."}

    elif name == "update_zakupnik":
        zid = inp.pop("zakupnik_id")
        update_data = {k: v for k, v in inp.items() if v is not None}
        row = await zakupnici.update_by_id(zid, update_data)
        if not row:
            return {"error": "Zakupnik nije pronađen"}
        return {"success": True, "id": zid, "message": "Zakupnik ažuriran."}

    elif name == "create_maintenance_task":
        data = {
            "naziv": inp["naziv"],
            "opis": inp.get("opis", ""),
            "nekretnina_id": inp.get("nekretnina_id"),
            "prioritet": inp.get("prioritet", "srednje"),
            "status": inp.get("status", "novi"),
            "created_by": user_id,
        }
        row = await maintenance_tasks.create(data)
        return {"success": True, "id": row.id, "message": f"Nalog '{inp['naziv']}' kreiran."}

    elif name == "update_maintenance_task":
        tid = inp.pop("task_id")
        update_data = {k: v for k, v in inp.items() if v is not None}
        row = await maintenance_tasks.update_by_id(tid, update_data)
        if not row:
            return {"error": "Nalog nije pronađen"}
        return {"success": True, "id": tid, "message": "Nalog ažuriran."}

    elif name == "update_ugovor_status":
        uid = inp["ugovor_id"]
        row = await ugovori.update_by_id(uid, {"status": inp["novi_status"]})
        if not row:
            return {"error": "Ugovor nije pronađen"}
        return {"success": True, "id": uid, "message": f"Status ugovora promijenjen u '{inp['novi_status']}'."}

    return {"error": f"Nepoznat write alat: {name}"}


# ---------------------------------------------------------------------------
# Agentic loop
# ---------------------------------------------------------------------------


def _get_async_client():
    """Create AsyncAnthropic client."""
    try:
        from anthropic import AsyncAnthropic
    except ImportError:
        raise RuntimeError("anthropic package is not installed")

    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    return AsyncAnthropic(api_key=api_key)


async def run_agent_turn(
    history: List[Dict[str, Any]],
    user_message: str,
) -> Tuple[str, Optional[Dict[str, Any]]]:
    """Run one agent turn.

    Returns:
        (assistant_text, pending_action)
        - If pending_action is None, assistant_text is the final response.
        - If pending_action is set, it contains {tool_name, tool_input} for
          write confirmation, and assistant_text is the confirmation prompt.
    """
    client = _get_async_client()

    # Build messages — keep last N for context window management
    messages = list(history[-MAX_CONTEXT_MESSAGES:])
    messages.append({"role": "user", "content": user_message})

    for iteration in range(MAX_TOOL_ITERATIONS):
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            tools=ALL_TOOLS,
            messages=messages,
        )

        # Process response content blocks
        assistant_text_parts = []
        tool_use_block = None

        for block in response.content:
            if block.type == "text":
                assistant_text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_use_block = block

        # No tool use — return final text
        if not tool_use_block:
            return "\n".join(assistant_text_parts), None

        tool_name = tool_use_block.name
        tool_input = tool_use_block.input

        # WRITE tool — stop, request confirmation
        if tool_name in WRITE_TOOL_NAMES:
            # Add the assistant message with tool_use to context
            messages.append({"role": "assistant", "content": response.content})

            # Return "confirmation_required" as tool result so Claude
            # knows the action hasn't executed yet
            messages.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_use_block.id,
                            "content": "SUSTAV: Ova akcija zahtijeva potvrdu korisnika. Objasni korisniku što ćeš napraviti i zamoli ga da potvrdi.",
                        }
                    ],
                }
            )

            # Make another call so Claude formulates the confirmation message
            confirm_response = await client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                tools=ALL_TOOLS,
                messages=messages,
            )

            confirm_text = ""
            for block in confirm_response.content:
                if block.type == "text":
                    confirm_text += block.text

            pending_action = {
                "tool_name": tool_name,
                "tool_input": tool_input,
            }

            return confirm_text, pending_action

        # READ tool — execute and continue loop
        tool_result = await execute_tool(tool_name, tool_input)

        # Add assistant message + tool result to messages for next iteration
        messages.append({"role": "assistant", "content": response.content})
        messages.append(
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_use_block.id,
                        "content": tool_result,
                    }
                ],
            }
        )

    # Max iterations reached — return whatever text we have
    return (
        "\n".join(assistant_text_parts) if assistant_text_parts
        else "Ispričavam se, nisam uspio obraditi vaš zahtjev. Molim pokušajte ponovo.",
        None,
    )
