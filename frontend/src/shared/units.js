import { parseNumericValue } from "./formatters";

export const UNIT_STATUS_CONFIG = {
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

export const getUnitStatusBadgeClass = (status) =>
  UNIT_STATUS_CONFIG[status]?.badge ||
  "border-border bg-muted text-muted-foreground";

export const getUnitStatusDotClass = (status) =>
  UNIT_STATUS_CONFIG[status]?.dot || "bg-muted-foreground/70";

export const formatUnitStatus = (status) => {
  if (!status) {
    return "Nepoznato";
  }
  return UNIT_STATUS_CONFIG[status]?.label || status;
};

export const getUnitDisplayName = (unit, { showArea = false } = {}) => {
  if (!unit) {
    return "Nepoznata jedinica";
  }
  const parts = [];
  if (unit.oznaka && unit.oznaka.trim()) {
    parts.push(unit.oznaka.trim());
  }
  if (unit.naziv && unit.naziv.trim()) {
    // If we already have oznaka, add naziv as clarification
    if (parts.length > 0) {
      parts.push(`— ${unit.naziv.trim()}`);
    } else {
      parts.push(unit.naziv.trim());
    }
  }
  if (unit.kat) {
    parts.push(`(kat ${unit.kat})`);
  }
  if (showArea && unit.povrsina_m2) {
    const area = parseFloat(unit.povrsina_m2);
    if (area > 0) {
      parts.push(`${area} m²`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : "Nepoznata jedinica";
};

export const computeUnitsSummary = (units = []) => {
  const summary = {
    total: units.length,
    leased: 0,
    reserved: 0,
    available: 0,
    maintenance: 0,
  };

  units.forEach((unit) => {
    switch (unit?.status) {
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
  summary.vacancy = summary.total
    ? (summary.available / summary.total) * 100
    : 0;
  return summary;
};

export const sortUnitsByPosition = (units = []) => {
  return [...units].sort((a, b) => {
    const floorCompare = String(a.kat ?? "").localeCompare(
      String(b.kat ?? ""),
      undefined,
      { numeric: true },
    );
    if (floorCompare !== 0) {
      return floorCompare;
    }
    return (a.oznaka || "").localeCompare(b.oznaka || "");
  });
};

export const convertUnitDraftToPayload = (unitDraft = {}) => {
  const trimOrNull = (value) => {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== "string") {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };

  const payload = {
    oznaka: trimOrNull(unitDraft.oznaka) || "",
    naziv: trimOrNull(unitDraft.naziv),
    kat: trimOrNull(unitDraft.kat),
    povrsina_m2: parseNumericValue(unitDraft.povrsina_m2),
    status: unitDraft.status || "dostupno",
    osnovna_zakupnina: parseNumericValue(unitDraft.osnovna_zakupnina),
    zakupnik_id: unitDraft.zakupnik_id || null,
    ugovor_id: unitDraft.ugovor_id || null,
    raspolozivo_od: unitDraft.raspolozivo_od || null,
    layout_ref: trimOrNull(unitDraft.layout_ref),
    napomena: trimOrNull(unitDraft.napomena),
    opis: trimOrNull(unitDraft.opis),
    metadata: unitDraft.metadata || null,
  };

  return payload;
};

export const normaliseNekretninaPayload = (formPayload = {}) => {
  const property = { ...(formPayload.nekretnina || {}) };
  const units = Array.isArray(formPayload.units)
    ? formPayload.units
        .map((unit) => convertUnitDraftToPayload(unit))
        .filter((unit) => unit.oznaka)
    : [];

  return { property, units };
};

export const resolveUnitTenantName = (unit, tenantsById) => {
  if (!unit?.zakupnik_id) {
    return "—";
  }
  const tenant = tenantsById?.[unit.zakupnik_id];
  if (!tenant) {
    return "Nepoznat zakupnik";
  }
  return tenant.naziv_firme || tenant.ime_prezime || "Nepoznat zakupnik";
};
