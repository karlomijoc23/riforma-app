import logging
from typing import Any, Dict

from app.api import deps
from app.db.repositories.instance import notifications
from fastapi import APIRouter, Depends

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", dependencies=[Depends(deps.require_scopes("reports:read"))])
async def get_notifications(
    skip: int = 0,
    limit: int = 20,
    unread_only: bool = False,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Get notifications for current user."""
    filters = {"user_id": current_user["id"]}
    if unread_only:
        filters["read"] = False

    items, total = await notifications.find_many(
        filters=filters,
        order_by="created_at",
        order_dir="desc",
        skip=skip,
        limit=limit,
    )

    unread_count = await notifications.count(
        filters={"user_id": current_user["id"], "read": False}
    )

    return {
        "items": [notifications.to_dict(item) for item in items],
        "unread_count": unread_count,
    }


@router.post("/{id}/read")
async def mark_as_read(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Mark a single notification as read."""
    await notifications.update_many(
        filters={"user_id": current_user["id"]},
        data={"read": True},
        extra_conditions=[notifications.model.id == id],
    )
    return {"message": "Oznaceno kao procitano"}


@router.post("/read-all")
async def mark_all_read(
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Mark all notifications as read for the current user."""
    await notifications.update_many(
        filters={"user_id": current_user["id"], "read": False},
        data={"read": True},
    )
    return {"message": "Sve obavijesti oznacene kao procitane"}


async def create_notification(
    user_id: str,
    title: str,
    message: str,
    link: str = None,
    tip: str = "info",
):
    """Helper to create a notification for a user.

    Args:
        user_id: Target user ID
        title: Notification title
        message: Notification body
        link: Optional in-app link (e.g. /ugovori)
        tip: One of info, warning, success, error
    """
    await notifications.create(
        {
            "user_id": user_id,
            "title": title,
            "message": message,
            "link": link,
            "tip": tip,
            "read": False,
        }
    )
