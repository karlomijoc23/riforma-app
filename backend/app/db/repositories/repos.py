"""Concrete repository classes for each domain entity."""

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
