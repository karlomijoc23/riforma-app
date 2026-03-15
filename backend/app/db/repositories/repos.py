"""Concrete repository classes for each domain entity."""

from datetime import date, timedelta
from typing import Any, Dict, List, Tuple

from sqlalchemy import and_, case, func, literal_column, or_, select

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
