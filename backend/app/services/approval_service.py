import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from sqlalchemy import or_

from app.core.roles import resolve_role_scopes, scope_matches
from app.db.repositories.instance import users
from app.models.domain import ApprovalStatus
from app.models.tables import UgovoriRow

logger = logging.getLogger(__name__)


def user_can_approve_leases(user: Dict[str, Any]) -> bool:
    """Check if user has leases:approve scope."""
    scopes = user.get("scopes", [])
    return scope_matches(scopes, "leases:approve")


def user_can_approve_financials(user: Dict[str, Any]) -> bool:
    """Check if user has financials:approve scope."""
    scopes = user.get("scopes", [])
    return scope_matches(scopes, "financials:approve")


def build_approval_fields_for_create(
    user: Dict[str, Any], entity_type: str
) -> Dict[str, Any]:
    """
    Return approval metadata fields for a newly created entity.
    All new entities start as pending_approval regardless of who creates them.
    entity_type: "leases" or "financials"
    """
    now = datetime.now(timezone.utc).isoformat()

    return {
        "approval_status": ApprovalStatus.PENDING_APPROVAL.value,
        "approved_by": None,
        "approved_at": None,
        "approval_comment": None,
        "submitted_for_approval_at": now,
        "submitted_by": user.get("id"),
    }


def approved_or_legacy_condition():
    """SQLAlchemy condition for approved contracts/bills (including legacy rows without field)."""
    return or_(
        UgovoriRow.approval_status == ApprovalStatus.APPROVED.value,
        UgovoriRow.approval_status.is_(None),
    )


async def get_approvers_for_scope(scope: str) -> List[Dict[str, Any]]:
    """
    Find all active users who have the given approval scope.
    Used for sending notification emails to approvers.
    """
    all_users = await users.find_all()

    approvers = []
    for user in all_users:
        role = user.role or "viewer"
        user_scopes = resolve_role_scopes(role, user.scopes or [])
        if scope_matches(user_scopes, scope):
            approvers.append(users.to_dict(user))
    return approvers
