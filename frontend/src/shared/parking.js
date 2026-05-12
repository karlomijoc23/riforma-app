import { parseNumericValue } from "./formatters";

export const PARKING_STATUS_CONFIG = {
  dostupno: {
    label: "Dostupno",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  rezervirano: {
    label: "Rezervirano",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  iznajmljeno: {
    label: "Iznajmljeno",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
  u_odrzavanju: {
    label: "U održavanju",
    badge: "border-slate-200 bg-slate-100 text-slate-700",
    dot: "bg-slate-500",
  },
};

export const getParkingStatusBadgeClass = (status) =>
  PARKING_STATUS_CONFIG[status]?.badge ||
  "border-border bg-muted text-muted-foreground";

export const getParkingStatusDotClass = (status) =>
  PARKING_STATUS_CONFIG[status]?.dot || "bg-muted-foreground/70";

export const formatParkingStatus = (status) => {
  if (!status) {
    return "Nepoznato";
  }
  return PARKING_STATUS_CONFIG[status]?.label || status;
};

export const getParkingDisplayName = (space) => {
  if (!space) {
    return "Nepoznato parkirno mjesto";
  }
  const parts = [];
  if (space.internal_id && String(space.internal_id).trim()) {
    parts.push(String(space.internal_id).trim());
  }
  if (space.naziv && String(space.naziv).trim()) {
    if (parts.length > 0) {
      parts.push(`— ${String(space.naziv).trim()}`);
    } else {
      parts.push(String(space.naziv).trim());
    }
  }
  if (space.floor !== undefined && space.floor !== null && space.floor !== "") {
    parts.push(`(etaža ${space.floor})`);
  }
  return parts.length > 0 ? parts.join(" ") : "Parkirno mjesto";
};

export const computeParkingSummary = (spaces = []) => {
  const summary = {
    total: spaces.length,
    leased: 0,
    reserved: 0,
    available: 0,
    maintenance: 0,
  };
  spaces.forEach((space) => {
    switch (space?.status) {
      case "iznajmljeno":
        summary.leased += 1;
        break;
      case "rezervirano":
        summary.reserved += 1;
        break;
      case "u_odrzavanju":
        summary.maintenance += 1;
        break;
      case "dostupno":
      default:
        summary.available += 1;
        break;
    }
  });
  summary.occupancy = summary.total
    ? (summary.leased / summary.total) * 100
    : 0;
  return summary;
};

export const convertParkingDraftToPayload = (draft = {}) => {
  const trimOrNull = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };
  return {
    floor: trimOrNull(draft.floor) || "",
    internal_id: trimOrNull(draft.internal_id) || "",
    naziv: trimOrNull(draft.naziv),
    status: draft.status || "dostupno",
    osnovna_zakupnina: parseNumericValue(draft.osnovna_zakupnina),
    vehicle_plates: Array.isArray(draft.vehicle_plates)
      ? draft.vehicle_plates.filter((p) => p && p.trim() !== "")
      : [],
    notes: trimOrNull(draft.notes),
  };
};
