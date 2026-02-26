import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.api import deps
from app.db.repositories.instance import webhook_events, racuni
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()


class WebhookEvent(BaseModel):
    event_type: str = Field(max_length=100)  # payment_received, invoice_created, etc.
    source: str = Field(max_length=100)  # e.g. "accounting_system"
    reference_id: Optional[str] = Field(default=None, max_length=200)
    data: Optional[Dict[str, Any]] = None


@router.post(
    "/incoming",
    dependencies=[
        Depends(deps.require_scopes("financials:create")),
        Depends(deps.require_tenant()),
    ],
)
async def receive_webhook(
    event: WebhookEvent,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    doc = {
        "id": str(uuid.uuid4()),
        "event_type": event.event_type,
        "source": event.source,
        "reference_id": event.reference_id,
        "data": event.data or {},
        "status": "received",
        "processed": False,
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user["id"],
    }
    created = await webhook_events.create(doc)

    # Auto-process payment events
    if event.event_type == "payment_received" and event.data:
        racun_id = event.data.get("racun_id")
        if racun_id:
            await racuni.update_by_id(
                racun_id,
                {
                    "status_placanja": "placeno",
                    "updated_at": datetime.now(timezone.utc),
                },
            )
            await webhook_events.update_by_id(
                created.id,
                {"processed": True, "status": "processed"},
            )

    return {"message": "Webhook primljen", "id": created.id}


@router.get(
    "/events",
    dependencies=[Depends(deps.require_scopes("financials:read"))],
)
async def list_webhook_events(
    skip: int = 0,
    limit: int = 50,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    items, total = await webhook_events.find_many(
        order_by="created_at", order_dir="desc", skip=skip, limit=limit
    )
    return [webhook_events.to_dict(item) for item in items]
