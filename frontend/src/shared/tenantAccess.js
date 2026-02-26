const normalizeRole = (role) =>
  typeof role === "string" ? role.trim().toLowerCase() : "";

const MANAGE_TENANT_ROLES = new Set(["owner", "admin"]);

export const canManageTenants = (role) =>
  MANAGE_TENANT_ROLES.has(normalizeRole(role));

export { normalizeRole };
