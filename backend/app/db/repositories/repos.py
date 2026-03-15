"""Concrete repository classes for each domain entity."""

from typing import Dict, Tuple

from sqlalchemy import func, select

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


class PropertyUnitRepository(BaseRepository[PropertyUnitRow]):
    model = PropertyUnitRow
    tenant_scoped = True


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
