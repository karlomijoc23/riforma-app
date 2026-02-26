from typing import Any, Dict

from app.api import deps
from app.db.repositories.instance import activity_logs
from fastapi import APIRouter, Depends, Query

router = APIRouter()


@router.get(
    "/",
    dependencies=[
        Depends(deps.require_scopes("reports:read")),
        Depends(deps.require_tenant()),
    ],
)
async def list_activity_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """List activity logs for the current tenant, sorted by created_at descending."""
    items, total = await activity_logs.find_many(
        order_by="created_at",
        order_dir="desc",
        skip=skip,
        limit=limit,
    )
    return {"items": [activity_logs.to_dict(item) for item in items], "total": total}
