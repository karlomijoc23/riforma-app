import axios from "axios";

export const getBackendUrl = () => {
  // Use environment variable if explicitly set and non-empty
  const envUrl = process.env.REACT_APP_BACKEND_URL;
  if (envUrl && envUrl.trim() !== "") {
    return envUrl.replace(/\/+$/, "");
  }
  // Both dev (CRA proxy via setupProxy.js) and production (nginx) proxy
  // /api to the backend, so same-origin requests work everywhere.
  if (typeof window !== "undefined") {
    return "";
  }
  return "http://127.0.0.1:8000";
};

export const BACKEND_URL = getBackendUrl();
const API_ROOT = `${BACKEND_URL}/api`;

/**
 * Extract error message from backend response.
 * Backend returns { detail: { message, code } } or { detail: "string" }
 */
export const getErrorMessage = (error) => {
  const data = error?.response?.data;
  if (data?.detail?.message) return data.detail.message;
  if (typeof data?.detail === "string") return data.detail;
  if (data?.message) return data.message;
  if (error?.message) return error.message;
  return "Neočekivana greška";
};

export const getErrorCode = (error) => {
  return error?.response?.data?.detail?.code || "UNKNOWN";
};

export const apiClient = axios.create({
  timeout: 120000, // 2 minutes timeout for AI operations
  withCredentials: true, // Send httpOnly cookies with every request
});

const TENANT_STORAGE_KEY = "riforma:currentTenantId";
const DEFAULT_TENANT_ID =
  process.env.REACT_APP_DEFAULT_TENANT_ID?.trim() || "tenant-default";

let activeTenantId = DEFAULT_TENANT_ID;
const tenantListeners = new Set();

const readTenantFromStorage = () => {
  if (typeof window === "undefined") {
    return DEFAULT_TENANT_ID;
  }

  // One-time migration from old key
  const OLD_KEY = "proptech:currentTenantId";
  const oldValue = localStorage.getItem(OLD_KEY);
  if (oldValue && !localStorage.getItem(TENANT_STORAGE_KEY)) {
    localStorage.setItem(TENANT_STORAGE_KEY, oldValue);
    localStorage.removeItem(OLD_KEY);
  }

  const stored = localStorage.getItem(TENANT_STORAGE_KEY);
  if (!stored || stored === "undefined" || stored === "null") {
    return DEFAULT_TENANT_ID;
  }
  return stored;
};

export const getActiveTenantId = () => {
  if (!activeTenantId) {
    activeTenantId = readTenantFromStorage();
  }
  return activeTenantId || DEFAULT_TENANT_ID;
};

export const setActiveTenantId = (tenantId, { persist = true } = {}) => {
  const nextTenant = tenantId?.trim() || DEFAULT_TENANT_ID;
  activeTenantId = nextTenant;
  if (typeof window !== "undefined" && persist) {
    localStorage.setItem(TENANT_STORAGE_KEY, nextTenant);
  }
  tenantListeners.forEach((listener) => {
    try {
      listener(nextTenant);
    } catch (error) {
      console.error("Tenant listener failed", error);
    }
  });
  return nextTenant;
};

export const subscribeToTenantChanges = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }
  tenantListeners.add(listener);
  return () => tenantListeners.delete(listener);
};

// Initialise tenant id from storage eagerly in browser environments
if (typeof window !== "undefined") {
  activeTenantId = readTenantFromStorage();
}

// Helper: read a cookie value by name
const getCookie = (name) => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const MUTATING_METHODS = ["post", "put", "patch", "delete"];

apiClient.interceptors.request.use((config) => {
  config.headers = config.headers || {};

  // CSRF: attach the csrf_token cookie value as a header on mutating requests
  if (MUTATING_METHODS.includes(config.method?.toLowerCase())) {
    const csrfToken = getCookie("csrf_token");
    if (csrfToken) {
      config.headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const tenantId = getActiveTenantId();
  if (tenantId) {
    config.headers["X-Tenant-Id"] = tenantId;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    // Automatic UI Update Trigger
    // Detect mutation methods and dispatch global event
    const { method, url } = response.config;
    if (MUTATING_METHODS.includes(method?.toLowerCase())) {
      let resource = "";
      if (
        url.includes("/nekretnine") ||
        url.includes("/units") ||
        url.includes("/parking")
      ) {
        resource = "nekretnine";
      } else if (url.includes("/zakupnici")) {
        resource = "zakupnici";
      } else if (url.includes("/ugovori")) {
        resource = "ugovori";
      } else if (url.includes("/dokumenti")) {
        resource = "dokumenti";
      } else if (url.includes("/maintenance")) {
        resource = "maintenance";
      } else if (url.includes("/racuni")) {
        resource = "racuni";
      } else if (url.includes("/tenants")) {
        resource = "tenants";
      } else if (url.includes("/oglasi")) {
        resource = "oglasi";
      } else if (url.includes("/projekti")) {
        resource = "projekti";
      } else if (url.includes("/dobavljaci")) {
        resource = "dobavljaci";
      }

      if (resource) {
        window.dispatchEvent(
          new CustomEvent("entity:mutation", { detail: { resource } }),
        );
      }
    }
    return response;
  },
  async (error) => {
    // On 401, signal logout (cookie expired or invalid)
    if (error?.response?.status === 401) {
      const url = error.config?.url || "";
      if (
        !url.includes("/auth/login") &&
        !url.includes("/auth/register") &&
        window.location.pathname !== "/login"
      ) {
        window.dispatchEvent(new Event("auth:unauthorized"));
      }
    }
    // On 403 with NO_TENANT code, redirect to create a profile
    if (error?.response?.status === 403) {
      const detail = error.response?.data?.detail;
      if (detail?.code === "NO_TENANT") {
        window.dispatchEvent(
          new CustomEvent("tenant:required", {
            detail: { message: detail.message },
          }),
        );
      }
    }
    return Promise.reject(error);
  },
);

export const api = {
  login: (payload) => apiClient.post(`${API_ROOT}/auth/login`, payload),
  logout: () => apiClient.post(`${API_ROOT}/auth/logout`),
  forgotPassword: (payload) =>
    apiClient.post(`${API_ROOT}/auth/forgot-password`, payload),
  resetPassword: (payload) =>
    apiClient.post(`${API_ROOT}/auth/reset-password`, payload),
  getCurrentUser: () => apiClient.get(`${API_ROOT}/users/me`),
  registerUser: (payload) =>
    apiClient.post(`${API_ROOT}/auth/register`, payload),
  getUsers: () => apiClient.get(`${API_ROOT}/users`),
  deleteUser: (id) => apiClient.delete(`${API_ROOT}/users/${id}`),
  getProjects: () => apiClient.get(`${API_ROOT}/projekti`),
  getProject: (id) => apiClient.get(`${API_ROOT}/projekti/${id}`),
  createProject: (data) => apiClient.post(`${API_ROOT}/projekti/`, data),
  updateProject: (id, data) =>
    apiClient.put(`${API_ROOT}/projekti/${id}`, data),
  addProjectPhase: (id, data) =>
    apiClient.post(`${API_ROOT}/projekti/${id}/phases`, data),
  addProjectTransaction: (id, data) =>
    apiClient.post(`${API_ROOT}/projekti/${id}/transactions`, data),
  addProjectStakeholder: (id, data) =>
    apiClient.post(`${API_ROOT}/projekti/${id}/stakeholders`, data),
  addProjectDocument: (id, data) =>
    apiClient.post(`${API_ROOT}/projekti/${id}/documents`, data),
  getTenants: () => apiClient.get(`${API_ROOT}/tenants`),
  createTenant: (data) => apiClient.post(`${API_ROOT}/tenants`, data),
  getCurrentTenant: () => apiClient.get(`${API_ROOT}/tenants/current`),
  getTenant: (id) => apiClient.get(`${API_ROOT}/tenants/${id}`),
  updateTenant: (id, data) => apiClient.put(`${API_ROOT}/tenants/${id}`, data),
  deleteTenant: (id) => apiClient.delete(`${API_ROOT}/tenants/${id}`),

  getNekretnine: () => apiClient.get(`${API_ROOT}/nekretnine`),
  getNekretnina: (id) => apiClient.get(`${API_ROOT}/nekretnine/${id}`),
  createNekretnina: (data) => apiClient.post(`${API_ROOT}/nekretnine`, data),
  updateNekretnina: (id, data) =>
    apiClient.put(`${API_ROOT}/nekretnine/${id}`, data),
  deleteNekretnina: (id) => apiClient.delete(`${API_ROOT}/nekretnine/${id}`),

  getZakupnici: (params = {}) =>
    apiClient.get(`${API_ROOT}/zakupnici`, { params }),
  createZakupnik: (data) => apiClient.post(`${API_ROOT}/zakupnici`, data),
  updateZakupnik: (id, data) =>
    apiClient.put(`${API_ROOT}/zakupnici/${id}`, data),
  deleteZakupnik: (id) => apiClient.delete(`${API_ROOT}/zakupnici/${id}`),
  getZakupnikOverview: (id) =>
    apiClient.get(`${API_ROOT}/zakupnici/${id}/overview`),

  getUgovori: (params = {}) => apiClient.get(`${API_ROOT}/ugovori`, { params }),
  createUgovor: (data) => apiClient.post(`${API_ROOT}/ugovori`, data),
  updateUgovor: (id, data) => apiClient.put(`${API_ROOT}/ugovori/${id}`, data),
  updateStatusUgovora: (id, status) =>
    apiClient.put(`${API_ROOT}/ugovori/${id}/status`, { novi_status: status }),
  deleteUgovor: (id) => apiClient.delete(`${API_ROOT}/ugovori/${id}`),

  getDokumenti: () => apiClient.get(`${API_ROOT}/dokumenti`),
  getDokumentiNekretnine: (id) =>
    apiClient.get(`${API_ROOT}/dokumenti/nekretnina/${id}`),
  getDokumentiZakupnika: (id) =>
    apiClient.get(`${API_ROOT}/dokumenti/zakupnik/${id}`),
  getDokumentiUgovora: (id) =>
    apiClient.get(`${API_ROOT}/dokumenti/ugovor/${id}`),
  getDokumentiPropertyUnit: (id) =>
    apiClient.get(`${API_ROOT}/dokumenti/property-unit/${id}`),
  createDokument: (data) => {
    const formData = new FormData();
    formData.append("naziv", data.naziv);
    formData.append("tip", data.tip);
    if (data.opis) {
      formData.append("opis", data.opis);
    }

    if (data.nekretnina_id) {
      formData.append("nekretnina_id", data.nekretnina_id);
    }
    if (data.zakupnik_id) {
      formData.append("zakupnik_id", data.zakupnik_id);
    }
    if (data.ugovor_id) {
      formData.append("ugovor_id", data.ugovor_id);
    }
    if (data.property_unit_id) {
      formData.append("property_unit_id", data.property_unit_id);
    }
    if (data.datum_isteka) {
      formData.append("datum_isteka", data.datum_isteka);
    }
    if (data.metadata) {
      try {
        formData.append("metadata", JSON.stringify(data.metadata));
      } catch (error) {
        console.error("Neuspješno serijaliziranje metadata polja", error);
      }
    }
    if (data.file) {
      formData.append("file", data.file);
    }

    return apiClient.post(`${API_ROOT}/dokumenti`, formData);
  },
  getExpiringDokumenti: (days = 30) =>
    apiClient.get(`${API_ROOT}/dokumenti/expiring`, { params: { days } }),
  updateDokument: (id, data) =>
    apiClient.put(`${API_ROOT}/dokumenti/${id}`, data),
  deleteDokument: (id) => apiClient.delete(`${API_ROOT}/dokumenti/${id}`),

  getUnits: (params = {}) => apiClient.get(`${API_ROOT}/units`, { params }),
  getUnitsForProperty: (propertyId) =>
    apiClient.get(`${API_ROOT}/nekretnine/${propertyId}/units`),
  getUnit: (unitId) => apiClient.get(`${API_ROOT}/units/${unitId}`),
  createUnit: (propertyId, payload) =>
    apiClient.post(`${API_ROOT}/nekretnine/${propertyId}/units`, payload),
  updateUnit: (unitId, payload) =>
    apiClient.put(`${API_ROOT}/units/${unitId}`, payload),
  deleteUnit: (unitId) => apiClient.delete(`${API_ROOT}/units/${unitId}`),
  bulkUpdateUnits: (payload) =>
    apiClient.post(`${API_ROOT}/units/bulk-update`, payload),

  getDashboard: () => apiClient.get(`${API_ROOT}/dashboard`),

  parsePdfContract: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post(`${API_ROOT}/ai/parse-pdf-contract`, formData);
  },

  getMaintenanceTasks: (params = {}) =>
    apiClient.get(`${API_ROOT}/maintenance`, { params }),
  getMaintenanceTask: (id) => apiClient.get(`${API_ROOT}/maintenance/${id}`),
  createMaintenanceTask: (payload) =>
    apiClient.post(`${API_ROOT}/maintenance`, payload),
  updateMaintenanceTask: (id, payload) =>
    apiClient.patch(`${API_ROOT}/maintenance/${id}`, payload),
  deleteMaintenanceTask: (id) =>
    apiClient.delete(`${API_ROOT}/maintenance/${id}`),

  // Parking
  getParking: (propertyId) =>
    apiClient.get(`${API_ROOT}/parking?nekretnina_id=${propertyId}`),
  createParking: (data) => apiClient.post(`${API_ROOT}/parking`, data),
  updateParking: (id, data) => apiClient.put(`${API_ROOT}/parking/${id}`, data),
  deleteParking: (id) => apiClient.delete(`${API_ROOT}/parking/${id}`),

  getMaintenanceAnalytics: (params = {}) =>
    apiClient.get(`${API_ROOT}/maintenance/analytics`, { params }),
  addMaintenanceComment: (id, payload) =>
    apiClient.post(`${API_ROOT}/maintenance/${id}/comments`, payload),

  getAuditLogs: (params = {}) =>
    apiClient.get(`${API_ROOT}/audit/logs`, { params }),

  getActivityLogs: (params = {}) =>
    apiClient.get(`${API_ROOT}/aktivnost`, { params }),

  globalSearch: (q) => apiClient.get(`${API_ROOT}/pretraga`, { params: { q } }),

  getHandoverProtocols: (contractId) =>
    apiClient.get(`${API_ROOT}/handover-protocols/contract/${contractId}`),
  createHandoverProtocol: (data) =>
    apiClient.post(`${API_ROOT}/handover-protocols`, data),
  updateHandoverProtocol: (id, data) =>
    apiClient.put(`${API_ROOT}/handover-protocols/${id}`, data),
  deleteHandoverProtocol: (id) =>
    apiClient.delete(`${API_ROOT}/handover-protocols/${id}`),

  // Računi (Bills)
  getRacuni: (params = {}) => apiClient.get(`${API_ROOT}/racuni`, { params }),
  getRacun: (id) => apiClient.get(`${API_ROOT}/racuni/${id}`),
  createRacun: (data) => {
    const formData = new FormData();
    formData.append("tip_utroska", data.tip_utroska);
    if (data.dobavljac) formData.append("dobavljac", data.dobavljac);
    if (data.broj_racuna) formData.append("broj_racuna", data.broj_racuna);
    if (data.datum_racuna) formData.append("datum_racuna", data.datum_racuna);
    if (data.datum_dospijeca)
      formData.append("datum_dospijeca", data.datum_dospijeca);
    if (data.iznos != null) formData.append("iznos", data.iznos);
    if (data.valuta) formData.append("valuta", data.valuta);
    if (data.nekretnina_id)
      formData.append("nekretnina_id", data.nekretnina_id);
    if (data.zakupnik_id) formData.append("zakupnik_id", data.zakupnik_id);
    if (data.property_unit_id)
      formData.append("property_unit_id", data.property_unit_id);
    if (data.status_placanja)
      formData.append("status_placanja", data.status_placanja);
    if (data.preknjizavanje_status)
      formData.append("preknjizavanje_status", data.preknjizavanje_status);
    if (data.preknjizavanje_napomena)
      formData.append("preknjizavanje_napomena", data.preknjizavanje_napomena);
    if (data.napomena) formData.append("napomena", data.napomena);
    if (data.period_od) formData.append("period_od", data.period_od);
    if (data.period_do) formData.append("period_do", data.period_do);
    if (data.potrosnja_kwh != null)
      formData.append("potrosnja_kwh", data.potrosnja_kwh);
    if (data.potrosnja_m3 != null)
      formData.append("potrosnja_m3", data.potrosnja_m3);
    if (data.file) formData.append("file", data.file);
    return apiClient.post(`${API_ROOT}/racuni`, formData);
  },
  updateRacun: (id, data) => apiClient.put(`${API_ROOT}/racuni/${id}`, data),
  deleteRacun: (id) => apiClient.delete(`${API_ROOT}/racuni/${id}`),
  updatePreknjizavanje: (id, data) =>
    apiClient.patch(`${API_ROOT}/racuni/${id}/preknjizavanje`, data),
  parseRacunWithAI: (id) => apiClient.post(`${API_ROOT}/racuni/${id}/parse-ai`),
  recordPayment: (id, data) =>
    apiClient.post(`${API_ROOT}/racuni/${id}/payment`, data),
  getTenantLedger: (zakupnikId) =>
    apiClient.get(`${API_ROOT}/racuni/ledger/${zakupnikId}`),
  getRacuniAnalytics: (params = {}) =>
    apiClient.get(`${API_ROOT}/racuni/analytics/summary`, { params }),
  getTaxSummary: (params = {}) =>
    apiClient.get(`${API_ROOT}/racuni/tax-summary`, { params }),

  // Dobavljaci (Vendors)
  getVendors: (params = {}) =>
    apiClient.get(`${API_ROOT}/dobavljaci`, { params }),
  getVendor: (id) => apiClient.get(`${API_ROOT}/dobavljaci/${id}`),
  createVendor: (data) => apiClient.post(`${API_ROOT}/dobavljaci`, data),
  updateVendor: (id, data) =>
    apiClient.put(`${API_ROOT}/dobavljaci/${id}`, data),
  deleteVendor: (id) => apiClient.delete(`${API_ROOT}/dobavljaci/${id}`),

  // AI Monthly Report
  generateMonthlyReport: (data) =>
    apiClient.post(`${API_ROOT}/ai/monthly-report`, data),

  // Settings
  getSettings: () => apiClient.get(`${API_ROOT}/settings`),
  updateSettings: (data) => apiClient.put(`${API_ROOT}/settings`, data),
  syncContractStatuses: () =>
    apiClient.post(`${API_ROOT}/settings/sync-statuses`),

  // Reports
  getMaintenanceReport: (params = {}) =>
    apiClient.get(`${API_ROOT}/maintenance/report`, { params }),
  getPropertyReport: (id) =>
    apiClient.get(`${API_ROOT}/nekretnine/${id}/report`),

  getBackendUrl: getBackendUrl,

  // Tenant Members
  addTenantMember: (tenantId, data) =>
    apiClient.post(`${API_ROOT}/tenants/${tenantId}/members`, data),
  updateTenantMember: (tenantId, userId, data) =>
    apiClient.put(`${API_ROOT}/tenants/${tenantId}/members/${userId}`, data),
  removeTenantMember: (tenantId, userId) =>
    apiClient.delete(`${API_ROOT}/tenants/${tenantId}/members/${userId}`),

  // Export CSV
  exportNekretnine: () =>
    apiClient.get(`${API_ROOT}/export/nekretnine`, { responseType: "blob" }),
  exportZakupnici: () =>
    apiClient.get(`${API_ROOT}/export/zakupnici`, { responseType: "blob" }),
  exportUgovori: () =>
    apiClient.get(`${API_ROOT}/export/ugovori`, { responseType: "blob" }),
  exportMaintenance: () =>
    apiClient.get(`${API_ROOT}/export/maintenance`, { responseType: "blob" }),
  exportRacuni: () =>
    apiClient.get(`${API_ROOT}/export/racuni`, { responseType: "blob" }),

  // Import CSV
  importCsv: (endpoint, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiClient.post(`${API_ROOT}/import/${endpoint}`, formData);
  },

  // Contract Approval
  submitUgovorForApproval: (id) =>
    apiClient.post(`${API_ROOT}/ugovori/${id}/submit-for-approval`),
  approveUgovor: (id, data = {}) =>
    apiClient.post(`${API_ROOT}/ugovori/${id}/approve`, data),
  rejectUgovor: (id, data) =>
    apiClient.post(`${API_ROOT}/ugovori/${id}/reject`, data),
  withdrawUgovor: (id) => apiClient.post(`${API_ROOT}/ugovori/${id}/withdraw`),

  // Contract Renewal & Escalation
  previewEscalation: (id, params = {}) =>
    apiClient.get(`${API_ROOT}/ugovori/${id}/escalation-preview`, { params }),
  renewUgovor: (id, data) =>
    apiClient.post(`${API_ROOT}/ugovori/${id}/renew`, data),

  // Oglasi (Listings)
  getOglasi: (params = {}) => apiClient.get(`${API_ROOT}/oglasi/`, { params }),
  getOglas: (id) => apiClient.get(`${API_ROOT}/oglasi/${id}`),
  createOglas: (data) => apiClient.post(`${API_ROOT}/oglasi/`, data),
  updateOglas: (id, data) => apiClient.put(`${API_ROOT}/oglasi/${id}`, data),
  changeOglasStatus: (id, newStatus) =>
    apiClient.patch(`${API_ROOT}/oglasi/${id}/status`, null, {
      params: { new_status: newStatus },
    }),
  deleteOglas: (id) => apiClient.delete(`${API_ROOT}/oglasi/${id}`),
  exportOglasiXml: (portal) =>
    apiClient.get(`${API_ROOT}/oglasi/xml-export`, {
      params: portal ? { portal } : {},
      responseType: "blob",
    }),

  // Bill Approval
  submitRacunForApproval: (id) =>
    apiClient.post(`${API_ROOT}/racuni/${id}/submit-for-approval`),
  approveRacun: (id, data = {}) =>
    apiClient.post(`${API_ROOT}/racuni/${id}/approve`, data),
  rejectRacun: (id, data) =>
    apiClient.post(`${API_ROOT}/racuni/${id}/reject`, data),
  withdrawRacun: (id) => apiClient.post(`${API_ROOT}/racuni/${id}/withdraw`),

  // Notifications
  getNotifications: (params = {}) =>
    apiClient.get(`${API_ROOT}/notifications`, { params }),
  markNotificationRead: (id) =>
    apiClient.post(`${API_ROOT}/notifications/${id}/read`),
  markAllNotificationsRead: () =>
    apiClient.post(`${API_ROOT}/notifications/read-all`),

  // AI Agent
  agentCreateConversation: (data) =>
    apiClient.post(`${API_ROOT}/agent/conversations`, data),
  agentListConversations: () =>
    apiClient.get(`${API_ROOT}/agent/conversations`),
  agentGetConversation: (id) =>
    apiClient.get(`${API_ROOT}/agent/conversations/${id}`),
  agentSendMessage: (conversationId, data) =>
    apiClient.post(
      `${API_ROOT}/agent/conversations/${conversationId}/messages`,
      data,
    ),
  agentConfirmAction: (conversationId, data) =>
    apiClient.post(
      `${API_ROOT}/agent/conversations/${conversationId}/confirm`,
      data,
    ),
  agentDeleteConversation: (id) =>
    apiClient.delete(`${API_ROOT}/agent/conversations/${id}`),
};

export const buildDocumentUrl = (dokument) => {
  if (!dokument || !dokument.putanja_datoteke) {
    return null;
  }
  const path = dokument.putanja_datoteke.replace(/^\/+/, "");
  return BACKEND_URL ? `${BACKEND_URL}/${path}` : `/${path}`;
};

export { API_ROOT as API };
