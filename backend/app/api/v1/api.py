from app.api import deps
from app.api.v1.endpoints import (
    activity_log,
    agent,
    ai,
    auth,
    contracts,
    dashboard,
    documents,
    export,
    handover_protocols,
    import_data,
    listings,
    maintenance,
    notifications,
    parking,
    projects,
    properties,
    racuni,
    saas_tenants,
    search,
    self_service,
    settings,
    tenant_members,
    tenants,
    units,
    users,
    vendors,
    webhooks,
)
from fastapi import APIRouter, Depends

api_router = APIRouter()

# Routes koji NE traže aktivni tenant (auth flow, SaaS-tenant management,
# webhook prijem, self-service portal za zakupnike koji ima vlastiti auth):
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(
    saas_tenants.router, prefix="/tenants", tags=["saas_tenants"]
)
api_router.include_router(
    tenant_members.router, prefix="/tenants", tags=["tenant-members"]
)
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
api_router.include_router(self_service.router, prefix="/self", tags=["self-service"])

# Sve ostalo radi s tenant-scoped podacima. `require_tenant` se primjenjuje
# na cijeli router umjesto pojedinačnih endpointa — guard mora biti
# default, ne opt-in (audit nalaz #7: ranije je par read endpointa
# slučajno propustilo dodati guard).
TENANT_REQUIRED = [Depends(deps.require_tenant())]

api_router.include_router(
    properties.router,
    prefix="/nekretnine",
    tags=["properties"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    tenants.router,
    prefix="/zakupnici",
    tags=["tenants"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    contracts.router,
    prefix="/ugovori",
    tags=["contracts"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    documents.router,
    prefix="/dokumenti",
    tags=["documents"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    maintenance.router,
    prefix="/maintenance",
    tags=["maintenance"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    parking.router,
    prefix="/parking",
    tags=["parking"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    dashboard.router,
    prefix="/dashboard",
    tags=["dashboard"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    search.router,
    prefix="/pretraga",
    tags=["search"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    ai.router, prefix="/ai", tags=["ai"], dependencies=TENANT_REQUIRED
)
api_router.include_router(
    agent.router, prefix="/agent", tags=["agent"], dependencies=TENANT_REQUIRED
)
api_router.include_router(
    units.router, prefix="/units", tags=["units"], dependencies=TENANT_REQUIRED
)
api_router.include_router(
    handover_protocols.router,
    prefix="/handover-protocols",
    tags=["handover_protocols"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    projects.router,
    prefix="/projekti",
    tags=["projects"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    racuni.router,
    prefix="/racuni",
    tags=["racuni"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    settings.router,
    prefix="/settings",
    tags=["settings"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    export.router,
    prefix="/export",
    tags=["export"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    import_data.router,
    prefix="/import",
    tags=["import"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    listings.router,
    prefix="/oglasi",
    tags=["listings"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    notifications.router,
    prefix="/notifications",
    tags=["notifications"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    activity_log.router,
    prefix="/aktivnost",
    tags=["activity_log"],
    dependencies=TENANT_REQUIRED,
)
api_router.include_router(
    vendors.router,
    prefix="/dobavljaci",
    tags=["vendors"],
    dependencies=TENANT_REQUIRED,
)
