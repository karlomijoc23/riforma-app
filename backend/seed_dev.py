"""Dev-only seed script.

Wipes the dummy data on `tenant-default` and reseeds 4 properties with
units, parking, tenants, contracts, bills, and maintenance tasks. Picks up
whichever user already exists with role=admin (auto-seeded on startup) so
no IDs have to be edited by hand.

Usage:
    cd backend
    source .venv/bin/activate
    python seed_dev.py
"""

from __future__ import annotations

import asyncio
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, ".")

from dotenv import load_dotenv  # noqa: E402

load_dotenv(".env")

from sqlalchemy import select  # noqa: E402

from app.db.repositories.instance import (  # noqa: E402
    maintenance_tasks,
    nekretnine,
    parking_spaces,
    property_units,
    racuni,
    ugovori,
    users as users_repo,
    zakupnici,
)
from app.db.session import get_async_session_factory  # noqa: E402
from app.db.tenant import CURRENT_TENANT_ID  # noqa: E402
from app.models.tables import (  # noqa: E402
    MaintenanceTaskRow,
    NekretnineRow,
    ParkingSpaceRow,
    PropertyUnitRow,
    RacuniRow,
    UgovoriRow,
    ZakupniciRow,
)

TENANT_ID = "tenant-default"


def uid() -> str:
    return str(uuid.uuid4())


def today() -> date:
    return datetime.now(timezone.utc).date()


async def _wipe_tenant_data() -> None:
    """Delete every row this script will reseed, in FK-safe order."""
    factory = get_async_session_factory()
    async with factory() as s:
        # Children first
        for model in (
            RacuniRow,
            MaintenanceTaskRow,
            UgovoriRow,
            ParkingSpaceRow,
            PropertyUnitRow,
        ):
            rows = (
                await s.execute(select(model).where(model.tenant_id == TENANT_ID))
            ).scalars().all()
            for r in rows:
                await s.delete(r)
            await s.commit()
        # Then zakupnici (referenced by ugovori — already deleted above)
        rows = (
            await s.execute(
                select(ZakupniciRow).where(ZakupniciRow.tenant_id == TENANT_ID)
            )
        ).scalars().all()
        for r in rows:
            await s.delete(r)
        await s.commit()
        # Finally nekretnine
        rows = (
            await s.execute(
                select(NekretnineRow).where(NekretnineRow.tenant_id == TENANT_ID)
            )
        ).scalars().all()
        for r in rows:
            await s.delete(r)
        await s.commit()


async def _resolve_admin_user_id() -> str:
    user = await users_repo.find_one(role="admin")
    if not user:
        raise SystemExit("No admin user found. Start the backend once first.")
    return user.id


async def seed() -> None:
    user_id = await _resolve_admin_user_id()
    CURRENT_TENANT_ID.set(TENANT_ID)
    await _wipe_tenant_data()

    # ── Properties ────────────────────────────────────────────────────
    p1, p2, p3, p4 = uid(), uid(), uid(), uid()
    properties = [
        dict(
            id=p1,
            tenant_id=TENANT_ID,
            naziv="Poslovni centar Aurora",
            adresa="Ilica 42",
            grad="Zagreb",
            vrsta="poslovna_zgrada",
            povrsina=2800.0,
            godina_izgradnje=2005,
            has_parking=True,
            created_by=user_id,
        ),
        dict(
            id=p2,
            tenant_id=TENANT_ID,
            naziv="Stambena zgrada Maksimir",
            adresa="Bukovačka 78",
            grad="Zagreb",
            vrsta="stan",
            povrsina=1200.0,
            godina_izgradnje=1998,
            has_parking=False,
            created_by=user_id,
        ),
        dict(
            id=p3,
            tenant_id=TENANT_ID,
            naziv="Trgovački prostor Dubrava",
            adresa="Avenija Dubrava 160",
            grad="Zagreb",
            vrsta="poslovna_zgrada",
            povrsina=600.0,
            godina_izgradnje=2012,
            has_parking=True,
            created_by=user_id,
        ),
        dict(
            id=p4,
            tenant_id=TENANT_ID,
            naziv="Apartmani Split – Bačvice",
            adresa="Šetalište Bačvice 12",
            grad="Split",
            vrsta="stan",
            povrsina=950.0,
            godina_izgradnje=2018,
            has_parking=True,
            created_by=user_id,
        ),
    ]
    for p in properties:
        await nekretnine.create(p)

    # ── Units ────────────────────────────────────────────────────────
    unit_defs = [
        # Aurora — offices
        (p1, "A-P1", "Prizemlje", 120.0, "iznajmljeno", 1450.0),
        (p1, "A-P2", "Prizemlje", 85.0, "iznajmljeno", 1020.0),
        (p1, "A-P3", "Prizemlje", 95.0, "dostupno", 1100.0),
        (p1, "A-1.1", "1. kat", 150.0, "iznajmljeno", 1950.0),
        (p1, "A-1.2", "1. kat", 110.0, "iznajmljeno", 1350.0),
        (p1, "A-2.1", "2. kat", 200.0, "iznajmljeno", 2800.0),
        (p1, "A-2.2", "2. kat", 130.0, "iznajmljeno", 1750.0),
        (p1, "A-3.1", "3. kat", 180.0, "iznajmljeno", 3200.0),
        (p1, "A-3.2", "3. kat", 140.0, "dostupno", 2100.0),
        # Maksimir — flats
        (p2, "M-P1", "Prizemlje", 55.0, "iznajmljeno", 500.0),
        (p2, "M-P2", "Prizemlje", 48.0, "iznajmljeno", 420.0),
        (p2, "M-1.1", "1. kat", 72.0, "iznajmljeno", 720.0),
        (p2, "M-1.2", "1. kat", 65.0, "iznajmljeno", 620.0),
        (p2, "M-2.1", "2. kat", 72.0, "dostupno", 720.0),
        (p2, "M-2.2", "2. kat", 65.0, "iznajmljeno", 685.0),
        (p2, "M-3.1", "3. kat", 80.0, "iznajmljeno", 880.0),
        # Dubrava — retail
        (p3, "D-1", "Prizemlje", 220.0, "iznajmljeno", 1760.0),
        (p3, "D-2", "Prizemlje", 180.0, "iznajmljeno", 1350.0),
        (p3, "D-3", "Prizemlje", 150.0, "dostupno", 1200.0),
        # Split — apartments
        (p4, "S-A1", "1. kat", 60.0, "iznajmljeno", 950.0),
        (p4, "S-A2", "1. kat", 60.0, "iznajmljeno", 950.0),
        (p4, "S-A3", "2. kat", 80.0, "dostupno", 1250.0),
        (p4, "S-A4", "2. kat", 80.0, "iznajmljeno", 1250.0),
    ]
    units: list[dict] = []
    for prop_id, oznaka, kat, povrsina, status, najam in unit_defs:
        u = dict(
            id=uid(),
            tenant_id=TENANT_ID,
            nekretnina_id=prop_id,
            oznaka=oznaka,
            naziv=oznaka,
            kat=kat,
            povrsina_m2=povrsina,
            status=status,
            osnovna_zakupnina=najam,
            created_by=user_id,
        )
        units.append(u)
        await property_units.create(u)

    # ── Parking ──────────────────────────────────────────────────────
    parking_defs = [
        (p1, "Garaža -1", "PM-01", "iznajmljeno"),
        (p1, "Garaža -1", "PM-02", "iznajmljeno"),
        (p1, "Garaža -1", "PM-03", "dostupno"),
        (p3, "Vanjsko", "PM-V1", "iznajmljeno"),
        (p3, "Vanjsko", "PM-V2", "dostupno"),
        (p4, "Vanjsko", "PM-S1", "iznajmljeno"),
        (p4, "Vanjsko", "PM-S2", "iznajmljeno"),
    ]
    for prop_id, floor, internal_id, status in parking_defs:
        await parking_spaces.create(dict(
            id=uid(),
            tenant_id=TENANT_ID,
            nekretnina_id=prop_id,
            floor=floor,
            internal_id=internal_id,
            naziv=internal_id,
            status=status,
            vehicle_plates=[],
            osnovna_zakupnina=85.0,
            created_by=user_id,
        ))

    # ── Zakupnici ────────────────────────────────────────────────────
    z_defs = [
        ("Digitalna Agencija Pixel d.o.o.", "pixel@example.com", "+385 91 111 2222", True),
        ("Odvjetničko Društvo Kovač", "kovac@example.com", "+385 91 222 3333", True),
        ("TechStart d.o.o.", "info@techstart.hr", "+385 91 333 4444", True),
        ("Financijski Savjetnik Grupa d.o.o.", "kontakt@fsg.hr", "+385 91 444 5555", True),
        ("Konzum d.d.", "nekretnine@konzum.hr", "+385 1 234 5678", True),
        ("Ljekarne Prima Pharme", "kontakt@primapharme.hr", "+385 1 345 6789", True),
        ("Marko Horvat", "marko.horvat@example.com", "+385 98 555 6666", False),
        ("Ana Novak", "ana.novak@example.com", "+385 98 666 7777", False),
        ("Ivan Babić", "ivan.babic@example.com", "+385 98 777 8888", False),
        ("Petra Jurić", "petra.juric@example.com", "+385 98 888 9999", False),
        ("Tomislav Perić", "tomislav.peric@example.com", "+385 98 111 2222", False),
        ("Marija Knežević", "marija.knezevic@example.com", "+385 98 222 3333", False),
    ]
    zk_rows: list[dict] = []
    for naziv, email, tel, is_company in z_defs:
        z = dict(
            id=uid(),
            tenant_id=TENANT_ID,
            naziv_firme=naziv if is_company else None,
            ime_prezime=naziv if not is_company else None,
            oib=None,
            kontakt_email=email,
            kontakt_telefon=tel,
            adresa_grad="Zagreb" if is_company else "Zagreb",
            pdv_obveznik=is_company,
        )
        zk_rows.append(z)
        await zakupnici.create(z)

    # ── Contracts ────────────────────────────────────────────────────
    # Map oznaka → unit dict for easy lookup
    by_oznaka = {u["oznaka"]: u for u in units}
    rented_pairs = [
        # (unit_oznaka, zakupnik_idx, months_remaining)
        ("A-P1", 0, 14), ("A-P2", 1, 8), ("A-1.1", 2, 22), ("A-1.2", 3, 12),
        ("A-2.1", 4, 30), ("A-2.2", 0, 26), ("A-3.1", 3, 18),
        ("M-P1", 6, 2), ("M-P2", 7, 4), ("M-1.1", 8, 11), ("M-1.2", 9, 7),
        ("M-2.2", 10, 16), ("M-3.1", 11, 19),
        ("D-1", 4, 36), ("D-2", 5, 42),
        ("S-A1", 7, 9), ("S-A2", 9, 13), ("S-A4", 10, 21),
    ]
    for idx, (oznaka, z_idx, months_left) in enumerate(rented_pairs):
        u = by_oznaka[oznaka]
        z = zk_rows[z_idx]
        end_date = today() + timedelta(days=30 * months_left)
        start_date = end_date - timedelta(days=30 * 24)
        status = "na_isteku" if months_left <= 3 else "aktivno"
        await ugovori.create(dict(
            id=uid(),
            tenant_id=TENANT_ID,
            nekretnina_id=u["nekretnina_id"],
            zakupnik_id=z["id"],
            property_unit_id=u["id"],
            interna_oznaka=f"UG-{2024 + idx // 6}-{(idx % 6) + 1:03d}",
            datum_pocetka=start_date,
            datum_zavrsetka=end_date,
            trajanje_mjeseci=24,
            opcija_produljenja=True,
            rok_otkaza_dani=90,
            osnovna_zakupnina=u["osnovna_zakupnina"],
            zakupnina_po_m2=round(u["osnovna_zakupnina"] / u["povrsina_m2"], 2),
            indeksacija=False,
            status=status,
            created_by=user_id,
        ))

    # ── Bills (racuni) ───────────────────────────────────────────────
    bill_defs = [
        ("struja", "HEP Elektra", 412.50, -5, "placeno"),
        ("voda", "Vodovod Zagreb", 89.30, -12, "placeno"),
        ("plin", "GPZ", 267.80, 4, "ceka_placanje"),
        ("komunalna_naknada", "Grad Zagreb", 184.00, -8, "djelomicno_placeno"),
        ("struja", "HEP Elektra", 521.00, -2, "ceka_placanje"),
        ("interneti", "A1 Hrvatska", 56.90, 8, "ceka_placanje"),
        ("voda", "Vodovod Zagreb", 102.40, -25, "ceka_placanje"),  # overdue
        ("plin", "GPZ", 189.10, -18, "ceka_placanje"),  # overdue
        ("upravljanje", "Stanouprava d.o.o.", 320.00, 12, "ceka_placanje"),
        ("struja", "HEP Elektra", 388.20, -1, "placeno"),
    ]
    nekretnina_ids = [p1, p2, p3, p4]
    for i, (tip, dob, iznos, days_offset, status) in enumerate(bill_defs):
        prop_id = nekretnina_ids[i % len(nekretnina_ids)]
        due = today() + timedelta(days=days_offset)
        issued = due - timedelta(days=15)
        await racuni.create(dict(
            id=uid(),
            tenant_id=TENANT_ID,
            tip_utroska=tip,
            dobavljac=dob,
            broj_racuna=f"R-2026-{1000 + i}",
            datum_racuna=issued,
            datum_dospijeca=due,
            iznos=iznos,
            valuta="EUR",
            nekretnina_id=prop_id,
            status_placanja=status,
            preknjizavanje_status="nije_potrebno",
            total_paid=iznos if status == "placeno" else (iznos / 2 if status == "djelomicno_placeno" else 0.0),
            payments=[],
            is_master_bill=False,
        ))

    # ── Maintenance ──────────────────────────────────────────────────
    m_defs = [
        ("Zamjena rasvjete u hodniku 2. kat", "novi", "srednji", p1, 7),
        ("Curenje ispod umivaonika M-1.1", "u_tijeku", "visoki", p2, 2),
        ("Godišnji servis klima uređaja Aurora", "zavrseno", "niski", p1, -30),
        ("Bojanje pročelja Dubrava", "ceka_dobavljaca", "srednji", p3, 21),
        ("Zamjena bojlera S-A2", "novi", "visoki", p4, 5),
        ("Pregled protupožarnog sustava", "u_tijeku", "visoki", p1, 14),
    ]
    for naziv, status, prio, prop_id, days in m_defs:
        await maintenance_tasks.create(dict(
            id=uid(),
            tenant_id=TENANT_ID,
            naziv=naziv,
            nekretnina_id=prop_id,
            status=status,
            prioritet=prio,
            datum_prijave=today() - timedelta(days=max(0, -days) + 1),
            rok=today() + timedelta(days=days),
            oznake=[],
            aktivnosti=[],
            prijavio_user_id=user_id,
        ))

    print("Seed complete.")
    print(f"  Properties: {len(properties)}")
    print(f"  Units:      {len(unit_defs)}")
    print(f"  Parking:    {len(parking_defs)}")
    print(f"  Zakupnici:  {len(z_defs)}")
    print(f"  Contracts:  {len(rented_pairs)}")
    print(f"  Bills:      {len(bill_defs)}")
    print(f"  Maintenance:{len(m_defs)}")
    print("Login: admin@riforma.dev / admin1234")


if __name__ == "__main__":
    asyncio.run(seed())
