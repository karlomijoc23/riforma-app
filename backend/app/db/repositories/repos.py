"""Concrete repository classes for each domain entity."""

import asyncio
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import and_, case, func, select

from app.db.repositories.base import BaseRepository
from app.models.tables import (
    ActivityLogRow,
    AiConversationRow,
    AiMessageRow,
    DobavljaciRow,
    DokumentiRow,
    HandoverProtocolRow,
    MaintenanceTaskRow,
    NekretnineRow,
    NotificationRow,
    OglasiRow,
    ParkingSpaceRow,
    ProjektiRow,
    ProjectDocumentRow,
    ProjectPhaseRow,
    ProjectStakeholderRow,
    ProjectTransactionRow,
    PropertyUnitRow,
    RacuniRow,
    RevokedTokenRow,
    SaasTenantRow,
    TenantMembershipRow,
    TenantSettingsRow,
    UgovoriRow,
    UserRow,
    WebhookEventRow,
    ZakupniciRow,
)


# =========================================================================
# Global repositories (not tenant-scoped)
# =========================================================================


class UserRepository(BaseRepository[UserRow]):
    model = UserRow
    tenant_scoped = False


class RevokedTokenRepository(BaseRepository[RevokedTokenRow]):
    model = RevokedTokenRow
    tenant_scoped = False


class SaasTenantRepository(BaseRepository[SaasTenantRow]):
    model = SaasTenantRow
    tenant_scoped = False


class TenantMembershipRepository(BaseRepository[TenantMembershipRow]):
    model = TenantMembershipRow
    tenant_scoped = False


# =========================================================================
# Tenant-scoped repositories
# =========================================================================


class NekretnineRepository(BaseRepository[NekretnineRow]):
    model = NekretnineRow
    tenant_scoped = True

    async def portfolio_value(self) -> float:
        """Return SUM(trzisna_vrijednost) via SQL."""
        async with self._session_factory() as session:
            stmt = select(
                func.coalesce(func.sum(NekretnineRow.trzisna_vrijednost), 0)
            )
            stmt = self._apply_tenant_filter(stmt)
            result = await session.execute(stmt)
            return float(result.scalar() or 0)

    async def id_naziv_map(self) -> Dict[str, str]:
        """Return {id: naziv} dict — lightweight alternative to find_all()."""
        async with self._session_factory() as session:
            stmt = select(NekretnineRow.id, NekretnineRow.naziv)
            stmt = self._apply_tenant_filter(stmt)
            result = await session.execute(stmt)
            return {row[0]: row[1] for row in result.all()}


class PropertyUnitRepository(BaseRepository[PropertyUnitRow]):
    model = PropertyUnitRow
    tenant_scoped = True

    async def occupancy_stats(
        self, active_unit_ids: set
    ) -> Tuple[int, int, List[Dict[str, Any]]]:
        """Return (total_units, occupied_units, by_property) using SQL.

        A unit is occupied if its status is in the occupied set OR its id is
        in *active_unit_ids* (units with an active contract).
        """
        async with self._session_factory() as session:
            stmt = select(PropertyUnitRow)
            stmt = self._apply_tenant_filter(stmt)
            result = await session.execute(stmt)
            all_units = list(result.scalars().all())

        occupied_statuses = {"zauzeto", "occupied", "iznajmljeno"}
        total = len(all_units)
        occupied = sum(
            1 for u in all_units
            if (u.status or "") in occupied_statuses or u.id in active_unit_ids
        )

        # Group by property
        by_prop: Dict[str, List] = {}
        for u in all_units:
            pid = u.nekretnina_id
            if pid:
                by_prop.setdefault(pid, []).append(u)

        by_property = []
        for prop_id, units in by_prop.items():
            t = len(units)
            o = sum(
                1 for u in units
                if (u.status or "") in occupied_statuses or u.id in active_unit_ids
            )
            rate = round((o / t * 100), 1) if t > 0 else 0.0
            by_property.append({
                "id": prop_id,
                "total_units": t,
                "occupied_units": o,
                "occupancy_rate": rate,
            })
        by_property.sort(key=lambda x: x["total_units"], reverse=True)

        return total, occupied, by_property


class ZakupniciRepository(BaseRepository[ZakupniciRow]):
    model = ZakupniciRow
    tenant_scoped = True


class UgovoriRepository(BaseRepository[UgovoriRow]):
    model = UgovoriRow
    tenant_scoped = True

    async def status_breakdown(self) -> Dict[str, int]:
        """Return {status: count} using SQL GROUP BY instead of Python loops."""
        async with self._session_factory() as session:
            stmt = (
                select(
                    UgovoriRow.status,
                    func.count().label("cnt"),
                )
                .group_by(UgovoriRow.status)
            )
            stmt = self._apply_tenant_filter(stmt)
            result = await session.execute(stmt)
            return {row[0] or "nepoznato": row[1] for row in result.all()}

    async def active_monthly_income(self) -> Tuple[float, Dict[str, float]]:
        """Return (total_monthly_income, {nekretnina_id: income}) via SQL."""
        async with self._session_factory() as session:
            stmt = (
                select(
                    UgovoriRow.nekretnina_id,
                    func.coalesce(func.sum(UgovoriRow.osnovna_zakupnina), 0).label("income"),
                )
                .where(UgovoriRow.status == "aktivno")
                .group_by(UgovoriRow.nekretnina_id)
            )
            stmt = self._apply_tenant_filter(stmt)
            result = await session.execute(stmt)
            rows = result.all()
            total = sum(float(r[1]) for r in rows)
            by_property = {r[0]: float(r[1]) for r in rows if r[0]}
            return total, by_property

    async def tax_income_for_year(self, year: int) -> float:
        """Return annualised contract income for contracts active in *year*."""
        year_start = date(year, 1, 1)
        year_end = date(year, 12, 31)
        async with self._session_factory() as session:
            stmt = select(
                func.coalesce(
                    func.sum(
                        (
                            func.coalesce(UgovoriRow.osnovna_zakupnina, 0)
                            + func.coalesce(UgovoriRow.cam_troskovi, 0)
                        )
                        * 12
                    ),
                    0,
                )
            ).where(
                UgovoriRow.datum_pocetka <= year_end,
                or_(
                    UgovoriRow.datum_zavrsetka.is_(None),
                    UgovoriRow.datum_zavrsetka >= year_start,
                ),
            )
            stmt = self._apply_tenant_filter(stmt)
            result = await session.execute(stmt)
            return float(result.scalar() or 0)

    async def expiring_soon(self, days: int = 90) -> List[Dict[str, Any]]:
        """Return contracts expiring within *days* via SQL WHERE."""
        today = date.today()
        cutoff = today + timedelta(days=days)
        async with self._session_factory() as session:
            stmt = (
                select(UgovoriRow)
                .where(
                    UgovoriRow.status.in_(["aktivno", "na_isteku"]),
                    UgovoriRow.datum_zavrsetka.isnot(None),
                    UgovoriRow.datum_zavrsetka >= today,
                    UgovoriRow.datum_zavrsetka <= cutoff,
                )
                .order_by(UgovoriRow.datum_zavrsetka.asc())
            )
            stmt = self._apply_tenant_filter(stmt)
            result = await session.execute(stmt)
            rows = list(result.scalars().all())
            out: List[Dict[str, Any]] = []
            for c in rows:
                end = c.datum_zavrsetka
                days_left = (end - today).days
                out.append({
                    "id": c.id,
                    "interna_oznaka": c.interna_oznaka or "\u2014",
                    "zakupnik_id": c.zakupnik_id,
                    "nekretnina_id": c.nekretnina_id,
                    "datum_zavrsetka": str(end),
                    "osnovna_zakupnina": c.osnovna_zakupnina or 0,
                    "days_left": days_left,
                    "status": c.status,
                })
            return out

    async def active_unit_ids(self) -> set:
        """Return set of property_unit_id values from active contracts."""
        async with self._session_factory() as session:
            stmt = (
                select(UgovoriRow.property_unit_id)
                .where(
                    UgovoriRow.status == "aktivno",
                    UgovoriRow.property_unit_id.isnot(None),
                )
            )
            stmt = self._apply_tenant_filter(stmt)
            result = await session.execute(stmt)
            return {row[0] for row in result.all()}


class DokumentiRepository(BaseRepository[DokumentiRow]):
    model = DokumentiRow
    tenant_scoped = True


class MaintenanceTaskRepository(BaseRepository[MaintenanceTaskRow]):
    model = MaintenanceTaskRow
    tenant_scoped = True


class ActivityLogRepository(BaseRepository[ActivityLogRow]):
    model = ActivityLogRow
    tenant_scoped = True


class ParkingSpaceRepository(BaseRepository[ParkingSpaceRow]):
    model = ParkingSpaceRow
    tenant_scoped = True


class HandoverProtocolRepository(BaseRepository[HandoverProtocolRow]):
    model = HandoverProtocolRow
    tenant_scoped = True


class ProjektiRepository(BaseRepository[ProjektiRow]):
    model = ProjektiRow
    tenant_scoped = True


class ProjectPhaseRepository(BaseRepository[ProjectPhaseRow]):
    model = ProjectPhaseRow
    tenant_scoped = False  # Scoped via project FK, not directly


class ProjectStakeholderRepository(BaseRepository[ProjectStakeholderRow]):
    model = ProjectStakeholderRow
    tenant_scoped = False  # Scoped via project FK, not directly


class ProjectTransactionRepository(BaseRepository[ProjectTransactionRow]):
    model = ProjectTransactionRow
    tenant_scoped = False  # Scoped via project FK, not directly


class ProjectDocumentRepository(BaseRepository[ProjectDocumentRow]):
    model = ProjectDocumentRow
    tenant_scoped = False  # Scoped via project FK, not directly


class TenantSettingsRepository(BaseRepository[TenantSettingsRow]):
    model = TenantSettingsRow
    tenant_scoped = True


class RacuniRepository(BaseRepository[RacuniRow]):
    model = RacuniRow
    tenant_scoped = True

    async def analytics_summary(
        self,
        nekretnina_id: Optional[str] = None,
        period_od: Optional[date] = None,
        period_do: Optional[date] = None,
    ) -> Dict[str, Any]:
        """Return aggregated analytics via SQL GROUP BY."""
        async with self._session_factory() as session:
            conditions = []
            if nekretnina_id:
                conditions.append(RacuniRow.nekretnina_id == nekretnina_id)
            if period_od:
                conditions.append(RacuniRow.datum_racuna >= period_od)
            if period_do:
                conditions.append(RacuniRow.datum_racuna <= period_do)

            base = select(RacuniRow)
            if conditions:
                base = base.where(and_(*conditions))
            base = self._apply_tenant_filter(base)

            # po_tipu: SUM(iznos) GROUP BY tip_utroska
            stmt_tip = (
                select(
                    RacuniRow.tip_utroska,
                    func.coalesce(func.sum(RacuniRow.iznos), 0),
                )
                .group_by(RacuniRow.tip_utroska)
            )
            if conditions:
                stmt_tip = stmt_tip.where(and_(*conditions))
            stmt_tip = self._apply_tenant_filter(stmt_tip)

            # po_nekretnini: SUM(iznos) GROUP BY nekretnina_id
            stmt_nek = (
                select(
                    RacuniRow.nekretnina_id,
                    func.coalesce(func.sum(RacuniRow.iznos), 0),
                )
                .group_by(RacuniRow.nekretnina_id)
            )
            if conditions:
                stmt_nek = stmt_nek.where(and_(*conditions))
            stmt_nek = self._apply_tenant_filter(stmt_nek)

            # po_statusu: COUNT(*) GROUP BY status_placanja
            stmt_st = (
                select(
                    RacuniRow.status_placanja,
                    func.count(),
                )
                .group_by(RacuniRow.status_placanja)
            )
            if conditions:
                stmt_st = stmt_st.where(and_(*conditions))
            stmt_st = self._apply_tenant_filter(stmt_st)

            # totals
            stmt_totals = select(
                func.count().label("cnt"),
                func.coalesce(func.sum(RacuniRow.iznos), 0).label("ukupno"),
                func.coalesce(
                    func.sum(
                        case(
                            (
                                RacuniRow.status_placanja.in_(
                                    ["ceka_placanje", "djelomicno_placeno", "prekoraceno"]
                                ),
                                RacuniRow.iznos,
                            ),
                            else_=0,
                        )
                    ),
                    0,
                ).label("neplaceno"),
                func.sum(
                    case(
                        (RacuniRow.preknjizavanje_status == "ceka", 1),
                        else_=0,
                    )
                ).label("za_preknjizavanje"),
            )
            if conditions:
                stmt_totals = stmt_totals.where(and_(*conditions))
            stmt_totals = self._apply_tenant_filter(
                stmt_totals.select_from(RacuniRow)
            )

            r_tip, r_nek, r_st, r_tot = await asyncio.gather(
                session.execute(stmt_tip),
                session.execute(stmt_nek),
                session.execute(stmt_st),
                session.execute(stmt_totals),
            )

            po_tipu = {row[0] or "ostalo": float(row[1]) for row in r_tip.all()}
            po_nekretnini = {
                row[0] or "nepoznato": float(row[1]) for row in r_nek.all()
            }
            po_statusu = {
                row[0] or "ceka_placanje": row[1] for row in r_st.all()
            }
            totals = r_tot.one()

            return {
                "ukupno_iznos": round(float(totals.ukupno), 2),
                "neplaceno_iznos": round(float(totals.neplaceno), 2),
                "za_preknjizavanje": int(totals.za_preknjizavanje or 0),
                "ukupno_racuna": int(totals.cnt),
                "po_tipu": po_tipu,
                "po_nekretnini": po_nekretnini,
                "po_statusu": po_statusu,
            }

    async def ledger_totals(self, zakupnik_id: str) -> Tuple[float, float]:
        """Return (total_billed, total_paid) for a zakupnik via SQL."""
        async with self._session_factory() as session:
            stmt = select(
                func.coalesce(func.sum(RacuniRow.iznos), 0),
                func.coalesce(func.sum(RacuniRow.total_paid), 0),
            ).where(RacuniRow.zakupnik_id == zakupnik_id)
            stmt = self._apply_tenant_filter(stmt)
            result = await session.execute(stmt)
            row = result.one()
            return float(row[0]), float(row[1])

    async def expense_by_year(self, year: int) -> Tuple[float, Dict[str, float]]:
        """Return (total_expenses, {tip: amount}) for a year via SQL."""
        async with self._session_factory() as session:
            stmt = (
                select(
                    RacuniRow.tip_utroska,
                    func.coalesce(func.sum(RacuniRow.iznos), 0),
                )
                .where(func.year(RacuniRow.datum_racuna) == year)
                .group_by(RacuniRow.tip_utroska)
            )
            stmt = self._apply_tenant_filter(stmt)
            result = await session.execute(stmt)
            rows = result.all()
            by_type = {row[0] or "ostalo": float(row[1]) for row in rows}
            total = sum(by_type.values())
            return total, by_type


class OglasiRepository(BaseRepository[OglasiRow]):
    model = OglasiRow
    tenant_scoped = True


class NotificationRepository(BaseRepository[NotificationRow]):
    model = NotificationRow
    tenant_scoped = True


class WebhookEventRepository(BaseRepository[WebhookEventRow]):
    model = WebhookEventRow
    tenant_scoped = True


class AiConversationRepository(BaseRepository[AiConversationRow]):
    model = AiConversationRow
    tenant_scoped = True


class AiMessageRepository(BaseRepository[AiMessageRow]):
    model = AiMessageRow
    tenant_scoped = False  # Scoped via conversation FK, not directly


class DobavljaciRepository(BaseRepository[DobavljaciRow]):
    model = DobavljaciRow
    tenant_scoped = True
