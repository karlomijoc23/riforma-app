"""
Seed script: creates a demo tenant profile and realistic property data
so the dashboard and pricing analytics (Analiza cijena) are populated.

Usage:
    cd backend
    source .venv/bin/activate
    python seed_demo.py
"""

import asyncio
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, ".")

from dotenv import load_dotenv  # noqa: E402

load_dotenv(".env")

from app.db.repositories.instance import (  # noqa: E402
    maintenance_tasks,
    nekretnine,
    property_units,
    saas_tenants,
    tenant_memberships,
    ugovori,
    zakupnici,
)
from app.db.tenant import CURRENT_TENANT_ID  # noqa: E402


def uid():
    return str(uuid.uuid4())


def now_iso():
    return datetime.now(timezone.utc).isoformat()


USER_ID = "26aab491-2da9-4c2e-a027-29b2964db115"  # karlo.mijoc@pm.me


async def seed():
    # ── 1. Tenant (profil) ────────────────────────────────────────────
    tenant_id = uid()
    tenant = {
        "id": tenant_id,
        "naziv": "Demo Nekretnine d.o.o.",
        "tip": "company",
        "status": "active",
        "oib": "12345678901",
        "iban": "HR1234567890123456789",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await saas_tenants.create(tenant)
    print(f"  Tenant created: {tenant['naziv']} ({tenant_id})")

    # ── 2. Membership ────────────────────────────────────────────────
    membership = {
        "id": uid(),
        "user_id": USER_ID,
        "tenant_id": tenant_id,
        "role": "owner",
        "status": "active",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await tenant_memberships.create(membership)
    print("  Membership created (owner)")

    # Set tenant context so tenant-scoped repos work
    CURRENT_TENANT_ID.set(tenant_id)

    # ── 3. Properties (nekretnine) ───────────────────────────────────
    prop1_id = uid()
    prop2_id = uid()
    prop3_id = uid()

    properties = [
        {
            "id": prop1_id,
            "tenant_id": tenant_id,
            "naziv": "Poslovni centar Aurora",
            "adresa": "Ilica 42, 10000 Zagreb",
            "katastarska_opcina": "Zagreb - Centar",
            "broj_kat_cestice": "1234/5",
            "vrsta": "poslovna_zgrada",
            "povrsina": 2800.0,
            "godina_izgradnje": 2005,
            "vlasnik": "Demo Nekretnine d.o.o.",
            "udio_vlasnistva": "100%",
            "nabavna_cijena": 4200000.0,
            "trzisna_vrijednost": 5100000.0,
            "neto_prihod": 0.0,
            "napomene": "Poslovni centar u centru Zagreba, 4 kata",
            "slika": None,
            "has_parking": True,
            "created_by": USER_ID,
        },
        {
            "id": prop2_id,
            "tenant_id": tenant_id,
            "naziv": "Stambena zgrada Maksimir",
            "adresa": "Bukovačka 78, 10000 Zagreb",
            "katastarska_opcina": "Zagreb - Maksimir",
            "broj_kat_cestice": "567/2",
            "vrsta": "stan",
            "povrsina": 1200.0,
            "godina_izgradnje": 1998,
            "vlasnik": "Demo Nekretnine d.o.o.",
            "udio_vlasnistva": "100%",
            "nabavna_cijena": 1800000.0,
            "trzisna_vrijednost": 2400000.0,
            "neto_prihod": 0.0,
            "napomene": "Stambena zgrada, 3 kata, 8 stanova",
            "slika": None,
            "has_parking": False,
            "created_by": USER_ID,
        },
        {
            "id": prop3_id,
            "tenant_id": tenant_id,
            "naziv": "Trgovački prostor Dubrava",
            "adresa": "Avenija Dubrava 160, 10040 Zagreb",
            "katastarska_opcina": "Zagreb - Dubrava",
            "broj_kat_cestice": "890/1",
            "vrsta": "poslovna_zgrada",
            "povrsina": 600.0,
            "godina_izgradnje": 2012,
            "vlasnik": "Demo Nekretnine d.o.o.",
            "udio_vlasnistva": "100%",
            "nabavna_cijena": 750000.0,
            "trzisna_vrijednost": 900000.0,
            "neto_prihod": 0.0,
            "napomene": "Prizemni trgovački prostor, 3 lokala",
            "slika": None,
            "has_parking": True,
            "created_by": USER_ID,
        },
    ]

    for p in properties:
        await nekretnine.create(p)
    print(f"  {len(properties)} properties created")

    # ── 4. Property units (jedinice) ─────────────────────────────────
    units = []

    # Aurora - 4 floors, multiple offices per floor
    aurora_units = [
        {"oznaka": "A-P1", "kat": 0, "povrsina_m2": 120.0, "namjena": "ured", "status": "iznajmljeno"},
        {"oznaka": "A-P2", "kat": 0, "povrsina_m2": 85.0, "namjena": "ured", "status": "iznajmljeno"},
        {"oznaka": "A-P3", "kat": 0, "povrsina_m2": 95.0, "namjena": "ured", "status": "dostupno"},
        {"oznaka": "A-1.1", "kat": 1, "povrsina_m2": 150.0, "namjena": "ured", "status": "iznajmljeno"},
        {"oznaka": "A-1.2", "kat": 1, "povrsina_m2": 110.0, "namjena": "ured", "status": "iznajmljeno"},
        {"oznaka": "A-1.3", "kat": 1, "povrsina_m2": 65.0, "namjena": "ured", "status": "dostupno"},
        {"oznaka": "A-2.1", "kat": 2, "povrsina_m2": 200.0, "namjena": "ured", "status": "iznajmljeno"},
        {"oznaka": "A-2.2", "kat": 2, "povrsina_m2": 130.0, "namjena": "ured", "status": "iznajmljeno"},
        {"oznaka": "A-3.1", "kat": 3, "povrsina_m2": 180.0, "namjena": "ured", "status": "iznajmljeno"},
        {"oznaka": "A-3.2", "kat": 3, "povrsina_m2": 140.0, "namjena": "ured", "status": "dostupno"},
    ]
    for u in aurora_units:
        u["id"] = uid()
        u["nekretnina_id"] = prop1_id
        u["tenant_id"] = tenant_id
        units.append(u)

    # Maksimir - 3 floors, residential
    maksimir_units = [
        {"oznaka": "M-P1", "kat": 0, "povrsina_m2": 55.0, "namjena": "stan", "status": "iznajmljeno"},
        {"oznaka": "M-P2", "kat": 0, "povrsina_m2": 48.0, "namjena": "stan", "status": "iznajmljeno"},
        {"oznaka": "M-1.1", "kat": 1, "povrsina_m2": 72.0, "namjena": "stan", "status": "iznajmljeno"},
        {"oznaka": "M-1.2", "kat": 1, "povrsina_m2": 65.0, "namjena": "stan", "status": "iznajmljeno"},
        {"oznaka": "M-2.1", "kat": 2, "povrsina_m2": 72.0, "namjena": "stan", "status": "dostupno"},
        {"oznaka": "M-2.2", "kat": 2, "povrsina_m2": 65.0, "namjena": "stan", "status": "iznajmljeno"},
        {"oznaka": "M-3.1", "kat": 3, "povrsina_m2": 80.0, "namjena": "stan", "status": "iznajmljeno"},
        {"oznaka": "M-3.2", "kat": 3, "povrsina_m2": 45.0, "namjena": "garsonijera", "status": "dostupno"},
    ]
    for u in maksimir_units:
        u["id"] = uid()
        u["nekretnina_id"] = prop2_id
        u["tenant_id"] = tenant_id
        units.append(u)

    # Dubrava - ground floor, 3 retail units
    dubrava_units = [
        {"oznaka": "D-1", "kat": 0, "povrsina_m2": 220.0, "namjena": "trgovina", "status": "iznajmljeno"},
        {"oznaka": "D-2", "kat": 0, "povrsina_m2": 180.0, "namjena": "trgovina", "status": "iznajmljeno"},
        {"oznaka": "D-3", "kat": 0, "povrsina_m2": 150.0, "namjena": "trgovina", "status": "dostupno"},
    ]
    for u in dubrava_units:
        u["id"] = uid()
        u["nekretnina_id"] = prop3_id
        u["tenant_id"] = tenant_id
        units.append(u)

    for u in units:
        await property_units.create(u)
    print(f"  {len(units)} property units created")

    # ── 5. Zakupnici (commercial tenants / lessees) ──────────────────
    zakupnici_list = []
    zakupnik_names = [
        ("Digitalna Agencija Pixel d.o.o.", "pixel@example.com", "091 111 2222"),
        ("Odvjetničko Društvo Kovač", "kovac@example.com", "091 222 3333"),
        ("TechStart d.o.o.", "info@techstart.hr", "091 333 4444"),
        ("Financijski Savjetnik Grupa", "kontakt@fsg.hr", "091 444 5555"),
        ("Marko Horvat", "marko.horvat@example.com", "098 555 6666"),
        ("Ana Novak", "ana.novak@example.com", "098 666 7777"),
        ("Ivan Babić", "ivan.babic@example.com", "098 777 8888"),
        ("Petra Jurić", "petra.juric@example.com", "098 888 9999"),
        ("Konzum d.d.", "nekretnine@konzum.hr", "01 234 5678"),
        ("Ljekarne Prima Pharme", "kontakt@primapharme.hr", "01 345 6789"),
        ("Frizerski salon Stil", "salon.stil@example.com", "098 999 0000"),
    ]

    for naziv, email, tel in zakupnik_names:
        is_company = "d.o.o." in naziv or "d.d." in naziv
        z = {
            "id": uid(),
            "tenant_id": tenant_id,
            "naziv_firme": naziv if is_company else None,
            "ime_prezime": naziv if not is_company else None,
            "oib": "00000000000",  # placeholder — required column
            "kontakt_email": email,
            "kontakt_telefon": tel,
            "tip": "pravna_osoba" if is_company else "fizicka_osoba",
            "status": "aktivan",
            "created_by": USER_ID,
        }
        zakupnici_list.append(z)
        await zakupnici.create(z)
    print(f"  {len(zakupnici_list)} tenants (zakupnici) created")

    # ── 6. Contracts (ugovori) — active, with pricing ───────────────
    unit_map = {u["oznaka"]: u for u in units}

    contracts = [
        {"unit": "A-P1", "zakupnik_idx": 0, "zakupnina_po_m2": 12.0, "datum_pocetka": "2024-01-01", "datum_zavrsetka": "2027-01-01"},
        {"unit": "A-P2", "zakupnik_idx": 1, "zakupnina_po_m2": 11.5, "datum_pocetka": "2024-03-01", "datum_zavrsetka": "2026-09-01"},
        {"unit": "A-1.1", "zakupnik_idx": 2, "zakupnina_po_m2": 13.0, "datum_pocetka": "2023-06-01", "datum_zavrsetka": "2026-06-01"},
        {"unit": "A-1.2", "zakupnik_idx": 3, "zakupnina_po_m2": 12.5, "datum_pocetka": "2024-01-01", "datum_zavrsetka": "2027-01-01"},
        {"unit": "A-2.1", "zakupnik_idx": 2, "zakupnina_po_m2": 14.0, "datum_pocetka": "2024-06-01", "datum_zavrsetka": "2027-06-01"},
        {"unit": "A-2.2", "zakupnik_idx": 0, "zakupnina_po_m2": 13.5, "datum_pocetka": "2025-01-01", "datum_zavrsetka": "2028-01-01"},
        {"unit": "A-3.1", "zakupnik_idx": 3, "zakupnina_po_m2": 18.0, "datum_pocetka": "2025-01-01", "datum_zavrsetka": "2028-01-01"},
        {"unit": "M-P1", "zakupnik_idx": 4, "zakupnina_po_m2": 9.0, "datum_pocetka": "2024-09-01", "datum_zavrsetka": "2025-09-01"},
        {"unit": "M-P2", "zakupnik_idx": 5, "zakupnina_po_m2": 8.5, "datum_pocetka": "2024-06-01", "datum_zavrsetka": "2025-06-01"},
        {"unit": "M-1.1", "zakupnik_idx": 6, "zakupnina_po_m2": 10.0, "datum_pocetka": "2024-01-01", "datum_zavrsetka": "2026-01-01"},
        {"unit": "M-1.2", "zakupnik_idx": 7, "zakupnina_po_m2": 9.5, "datum_pocetka": "2024-04-01", "datum_zavrsetka": "2026-04-01"},
        {"unit": "M-2.2", "zakupnik_idx": 4, "zakupnina_po_m2": 10.5, "datum_pocetka": "2025-01-01", "datum_zavrsetka": "2027-01-01"},
        {"unit": "M-3.1", "zakupnik_idx": 5, "zakupnina_po_m2": 11.0, "datum_pocetka": "2025-02-01", "datum_zavrsetka": "2027-02-01"},
        {"unit": "D-1", "zakupnik_idx": 8, "zakupnina_po_m2": 8.0, "datum_pocetka": "2023-01-01", "datum_zavrsetka": "2028-01-01"},
        {"unit": "D-2", "zakupnik_idx": 9, "zakupnina_po_m2": 7.5, "datum_pocetka": "2024-01-01", "datum_zavrsetka": "2029-01-01"},
    ]

    contract_count = 0
    for i, c in enumerate(contracts):
        unit = unit_map[c["unit"]]
        z = zakupnici_list[c["zakupnik_idx"]]
        povrsina = unit["povrsina_m2"]
        cijena_m2 = c["zakupnina_po_m2"]
        osnovna = round(povrsina * cijena_m2, 2)

        contract = {
            "id": uid(),
            "tenant_id": tenant_id,
            "interna_oznaka": f"U-{2024 + i // 5}-{(i % 5) + 1:03d}",
            "nekretnina_id": unit["nekretnina_id"],
            "property_unit_id": unit["id"],
            "zakupnik_id": z["id"],
            "status": "aktivno",
            "datum_pocetka": c["datum_pocetka"],
            "datum_zavrsetka": c["datum_zavrsetka"],
            "osnovna_zakupnina": osnovna,
            "zakupnina_po_m2": cijena_m2,
            "created_by": USER_ID,
        }
        await ugovori.create(contract)
        contract_count += 1

    print(f"  {contract_count} contracts created")

    # ── 7. A few maintenance tasks ───────────────────────────────────
    tasks = [
        {
            "id": uid(),
            "tenant_id": tenant_id,
            "naziv": "Zamjena rasvjete u hodniku",
            "opis": "LED rasvjeta na 2. katu prestala raditi",
            "nekretnina_id": prop1_id,
            "prioritet": "srednji",
            "status": "otvoreno",
            "created_by": USER_ID,
        },
        {
            "id": uid(),
            "tenant_id": tenant_id,
            "naziv": "Popravak curenja u kupaonici M-1.1",
            "opis": "Zakupnik prijavio curenje ispod umivaonika",
            "nekretnina_id": prop2_id,
            "prioritet": "visoki",
            "status": "u_tijeku",
            "created_by": USER_ID,
        },
        {
            "id": uid(),
            "tenant_id": tenant_id,
            "naziv": "Godišnji servis klima uređaja",
            "opis": "Zakazati servis za sve klima uređaje u Aurori",
            "nekretnina_id": prop1_id,
            "prioritet": "niski",
            "status": "zavrseno",
            "created_by": USER_ID,
        },
    ]
    for t in tasks:
        await maintenance_tasks.create(t)
    print(f"  {len(tasks)} maintenance tasks created")

    print("\nDone! Log out and log back in to see the new profile.")
    print(f"Tenant ID: {tenant_id}")


if __name__ == "__main__":
    asyncio.run(seed())
