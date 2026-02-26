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
    settings,
    tenant_members,
    tenants,
    units,
    users,
    vendors,
    webhooks,
)
from fastapi import APIRouter

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(properties.router, prefix="/nekretnine", tags=["properties"])
api_router.include_router(tenants.router, prefix="/zakupnici", tags=["tenants"])
api_router.include_router(saas_tenants.router, prefix="/tenants", tags=["saas_tenants"])
api_router.include_router(
    tenant_members.router, prefix="/tenants", tags=["tenant-members"]
)
api_router.include_router(contracts.router, prefix="/ugovori", tags=["contracts"])
api_router.include_router(documents.router, prefix="/dokumenti", tags=["documents"])
api_router.include_router(
    maintenance.router, prefix="/maintenance", tags=["maintenance"]
)
api_router.include_router(parking.router, prefix="/parking", tags=["parking"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(search.router, prefix="/pretraga", tags=["search"])
api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
api_router.include_router(agent.router, prefix="/agent", tags=["agent"])
api_router.include_router(units.router, prefix="/units", tags=["units"])
api_router.include_router(
    handover_protocols.router, prefix="/handover-protocols", tags=["handover_protocols"]
)
api_router.include_router(projects.router, prefix="/projekti", tags=["projects"])
api_router.include_router(racuni.router, prefix="/racuni", tags=["racuni"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
api_router.include_router(export.router, prefix="/export", tags=["export"])
api_router.include_router(import_data.router, prefix="/import", tags=["import"])
api_router.include_router(listings.router, prefix="/oglasi", tags=["listings"])
api_router.include_router(
    notifications.router, prefix="/notifications", tags=["notifications"]
)
api_router.include_router(
    activity_log.router, prefix="/aktivnost", tags=["activity_log"]
)
api_router.include_router(vendors.router, prefix="/dobavljaci", tags=["vendors"])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
