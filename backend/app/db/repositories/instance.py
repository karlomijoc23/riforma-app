"""Pre-initialised repository instances -- drop-in replacement for db.collection syntax.

Usage::

    from app.db.repositories.instance import nekretnine, zakupnici

    items, total = await nekretnine.find_many(
        filters={"status": "active"},
        order_by="created_at",
        skip=0,
        limit=20,
    )
"""

from app.db.session import get_async_session_factory
from app.db.repositories.repos import (
    ActivityLogRepository,
    AiConversationRepository,
    AiMessageRepository,
    DobavljaciRepository,
    DokumentiRepository,
    HandoverProtocolRepository,
    MaintenanceTaskRepository,
    NekretnineRepository,
    NotificationRepository,
    OglasiRepository,
    ParkingSpaceRepository,
    ProjektiRepository,
    ProjectDocumentRepository,
    ProjectPhaseRepository,
    ProjectStakeholderRepository,
    ProjectTransactionRepository,
    PropertyUnitRepository,
    RacuniRepository,
    SaasTenantRepository,
    TenantMembershipRepository,
    TenantSettingsRepository,
    UgovoriRepository,
    UserRepository,
    WebhookEventRepository,
    ZakupniciRepository,
)

_sf = get_async_session_factory()

# ---- Global repos --------------------------------------------------------

users = UserRepository(_sf)
saas_tenants = SaasTenantRepository(_sf)
tenant_memberships = TenantMembershipRepository(_sf)

# ---- Tenant-scoped repos ------------------------------------------------

nekretnine = NekretnineRepository(_sf)
property_units = PropertyUnitRepository(_sf)
zakupnici = ZakupniciRepository(_sf)
ugovori = UgovoriRepository(_sf)
dokumenti = DokumentiRepository(_sf)
maintenance_tasks = MaintenanceTaskRepository(_sf)
activity_logs = ActivityLogRepository(_sf)
parking_spaces = ParkingSpaceRepository(_sf)
handover_protocols = HandoverProtocolRepository(_sf)
projekti = ProjektiRepository(_sf)
project_phases = ProjectPhaseRepository(_sf)
project_stakeholders = ProjectStakeholderRepository(_sf)
project_transactions = ProjectTransactionRepository(_sf)
project_documents = ProjectDocumentRepository(_sf)
tenant_settings = TenantSettingsRepository(_sf)
racuni = RacuniRepository(_sf)
oglasi = OglasiRepository(_sf)
notifications = NotificationRepository(_sf)
dobavljaci = DobavljaciRepository(_sf)
webhook_events = WebhookEventRepository(_sf)
ai_conversations = AiConversationRepository(_sf)
ai_messages = AiMessageRepository(_sf)
