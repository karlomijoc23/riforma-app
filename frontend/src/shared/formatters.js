export const parseNumericValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const normalised = value.replace(/[^0-9,.-]/g, "").replace(/,/g, "");
    const parsed = Number(normalised);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const parseSmartNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;

  // Handle string input
  let strVal = String(value).trim();

  // Handle localized format "1.234,56" -> remove dots, replace comma with dot
  if (strVal.includes(",") && strVal.includes(".")) {
    if (strVal.indexOf(".") < strVal.indexOf(",")) {
      // "1.234,56" format
      strVal = strVal.replace(/\./g, "").replace(",", ".");
    } else {
      // "1,234.56" format (US) - just remove commas
      strVal = strVal.replace(/,/g, "");
    }
  } else if (strVal.includes(",")) {
    // "1234,56" -> replace last comma with dot (handles "1,234,56" edge case)
    const lastCommaIdx = strVal.lastIndexOf(",");
    strVal =
      strVal.slice(0, lastCommaIdx).replace(/,/g, "") +
      "." +
      strVal.slice(lastCommaIdx + 1);
  }

  const parsed = parseFloat(strVal);
  return isNaN(parsed) ? 0 : parsed;
};

export const formatCurrency = (value) => {
  const numeric = parseNumericValue(value);
  if (numeric === null) {
    return "—";
  }
  return `${numeric.toLocaleString("hr-HR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
};

export const formatArea = (value) => {
  const numeric = parseNumericValue(value);
  if (numeric === null) {
    return "—";
  }
  return `${numeric.toLocaleString("hr-HR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} m²`;
};

export const formatPercentage = (value) => {
  const numeric = typeof value === "string" ? parseFloat(value) : value;
  if (numeric === null || numeric === undefined || !Number.isFinite(numeric)) {
    return "—";
  }
  return `${numeric.toFixed(1)} %`;
};

export const formatDeltaPercentage = (value) => {
  const numeric = typeof value === "string" ? parseFloat(value) : value;
  if (numeric === null || numeric === undefined || !Number.isFinite(numeric)) {
    return "—";
  }
  const rounded = numeric.toFixed(1);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${rounded} %`;
};

export const formatDate = (value) => {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString("hr-HR");
};

export const formatContractDate = (value) => {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear().toString().slice(-2);
  return `${day}/${month}/${year}`;
};

export const formatDateTime = (value) => {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString("hr-HR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatBooleanish = (value) => {
  if (value === true || value === "DA") {
    return "Da";
  }
  if (value === false || value === "NE") {
    return "Ne";
  }
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return value;
};

/** Returns dd.mm.yy string for use in PDF filenames */
export const pdfDateStamp = () => {
  const d = new Date();
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const yy = d.getFullYear().toString().slice(-2);
  return `${dd}.${mm}.${yy}`;
};

export const APPROVAL_STATUS_LABELS = {
  draft: "Nacrt",
  pending_approval: "Čeka odobrenje",
  approved: "Odobreno",
  rejected: "Odbijeno",
};

export const APPROVAL_STATUS_VARIANTS = {
  draft: "outline",
  pending_approval: "warning",
  approved: "success",
  rejected: "destructive",
};

export const formatApprovalStatus = (status) => {
  return APPROVAL_STATUS_LABELS[status] || status || "Odobreno";
};

export const formatPropertyType = (value) => {
  if (!value) {
    return "Nepoznata vrsta";
  }
  const map = {
    poslovna_zgrada: "Poslovna zgrada",
    stan: "Stan",
    zemljiste: "Zemljište",
    ostalo: "Ostalo",
  };
  return map[value] || value;
};
