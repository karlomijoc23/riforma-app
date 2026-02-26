from typing import Dict, List, Optional

from app.models.domain import TenantMembershipRole

DEFAULT_ROLE = "viewer"

ROLE_SCOPE_MAP: Dict[str, List[str]] = {
    "owner": ["*"],
    "admin": [
        "properties:*",
        "tenants:*",
        "leases:*",
        "maintenance:*",
        "documents:*",
        "financials:*",
        "reports:*",
        "users:*",
        "kpi:read",
        "projects:*",
        "settings:*",
        "listings:*",
    ],
    "property_manager": [
        "properties:*",
        "tenants:*",
        "leases:*",
        "maintenance:*",
        "documents:*",
        "vendors:read",
        "financials:read",
        "reports:read",
        "users:assign",
        "users:read",
        "kpi:read",
        "settings:read",
        "listings:*",
    ],
    "accountant": [
        "financials:*",
        "leases:read",
        "tenants:read",
        "properties:read",
        "vendors:*",
        "documents:read",
        "reports:*",
        "kpi:read",
        "settings:read",
    ],
    "unositelj": [
        "documents:read",
        "documents:create",
        "leases:read",
        "properties:read",
        "tenants:read",
        "maintenance:read",
        "maintenance:create",
        "settings:read",
    ],
    "vendor": ["maintenance:assigned", "documents:create", "documents:read"],
    "tenant": ["self:read", "self:maintenance", "self:documents"],
    "viewer": [
        "properties:read",
        "tenants:read",
        "leases:read",
        "documents:read",
        "maintenance:read",
        "kpi:read",
        "settings:read",
        "listings:read",
    ],
}

ROLE_TENANT_MEMBERSHIP_MAP: Dict[str, TenantMembershipRole] = {
    "admin": TenantMembershipRole.OWNER,
    "system": TenantMembershipRole.OWNER,
    "owner_exec": TenantMembershipRole.OWNER,
    "property_manager": TenantMembershipRole.ADMIN,
    "accountant": TenantMembershipRole.ADMIN,
    "unositelj": TenantMembershipRole.MEMBER,
    "vendor": TenantMembershipRole.VIEWER,
    "tenant": TenantMembershipRole.VIEWER,
}


def resolve_membership_role(user_role: Optional[str]) -> TenantMembershipRole:
    if isinstance(user_role, TenantMembershipRole):
        return user_role
    if not user_role:
        return TenantMembershipRole.MEMBER
    normalised = user_role.strip().lower()
    return ROLE_TENANT_MEMBERSHIP_MAP.get(normalised, TenantMembershipRole.MEMBER)


def resolve_role_scopes(
    role: str, explicit_scopes: Optional[List[str]] = None
) -> List[str]:
    base_scopes = ROLE_SCOPE_MAP.get(role, [])
    if explicit_scopes:
        combined = list(dict.fromkeys(base_scopes + explicit_scopes))
    else:
        combined = list(dict.fromkeys(base_scopes))
    if not combined:
        return []
    return combined


def scope_matches(granted: List[str], required: str) -> bool:
    if "*" in granted:
        return True
    if required in granted:
        return True
    if ":" not in required:
        return False
    resource, action = required.split(":", 1)
    wildcard = f"{resource}:*"
    if wildcard in granted:
        return True
    # allow hierarchical permission where write implies read
    if action == "read":
        for perm in granted:
            if perm.startswith(f"{resource}:") and perm != required:
                return True
    return False
