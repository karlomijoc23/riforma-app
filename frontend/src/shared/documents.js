import rawRequirements from "./documentRequirements.json";

export const DOCUMENT_TYPE_LABELS = {
  ugovor: "Ugovor",
  racun: "Račun",
  procjena_vrijednosti: "Procjena vrijednosti",
  lokacijska_informacija: "Lokacijska informacija",
  aneks: "Aneks ugovora",
  zemljisnoknjizni_izvadak: "Zemljišnoknjižni izvadak",
  uporabna_dozvola: "Uporabna dozvola",
  gradevinska_dozvola: "Građevinska dozvola",
  energetski_certifikat: "Energetski certifikat",
  osiguranje: "Osiguranje",
  izvadak_iz_registra: "Izvadak iz registra",
  bon_2: "BON-2",
  certifikat: "Certifikat",
  ostalo: "Ostalo",
};

export const DOCUMENT_TYPE_ALIASES = {
  ugovor_o_zakupu: "ugovor",
  lease_agreement: "ugovor",
  contract: "ugovor",
  aneks_ugovora: "aneks",
  annex: "aneks",
  invoice: "racun",
  bill: "racun",
  building_permit: "gradevinska_dozvola",
  construction_permit: "gradevinska_dozvola",
  usage_permit: "uporabna_dozvola",
  location_information: "lokacijska_informacija",
  location_permit: "lokacijska_informacija",
  property_valuation: "procjena_vrijednosti",
  valuation: "procjena_vrijednosti",
  energy_certificate: "energetski_certifikat",
  land_registry_extract: "zemljisnoknjizni_izvadak",
  register_extract: "izvadak_iz_registra",
  insurance_policy: "osiguranje",
  certificate: "certifikat",
};

const DEFAULT_REQUIREMENTS = Object.freeze({
  requireProperty: false,
  requireTenant: false,
  requireContract: false,
  allowTenant: true,
  allowContract: true,
  allowPropertyUnit: true,
  metaFields: [],
  infoHint: "",
});

const DEFAULT_META_FIELD = Object.freeze({
  type: "text",
  required: false,
  placeholder: "",
});

export const DOCUMENT_REQUIREMENTS = Object.freeze({ ...rawRequirements });

export const normaliseDocumentTypeKey = (value) => {
  if (!value) {
    return "";
  }
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
};

export const getDocumentRequirements = (value) => {
  const key = normaliseDocumentTypeKey(value);
  const raw = DOCUMENT_REQUIREMENTS[key] || {};
  const metaFields = Array.isArray(raw.metaFields)
    ? raw.metaFields.map((field) => ({
        ...DEFAULT_META_FIELD,
        ...field,
        id:
          field.id || field.name || normaliseDocumentTypeKey(field.label || ""),
      }))
    : [];
  return {
    ...DEFAULT_REQUIREMENTS,
    ...raw,
    metaFields,
  };
};

const PROPERTY_ONLY_TYPES = new Set(
  Object.keys(DOCUMENT_REQUIREMENTS).filter((type) => {
    const config = getDocumentRequirements(type);
    return (
      config.requireProperty && !config.allowTenant && !config.allowContract
    );
  }),
);

export const PROPERTY_DOCUMENT_TYPES = PROPERTY_ONLY_TYPES;

const CONTRACT_FOCUSED_TYPES = new Set(
  ["ugovor", "aneks", "racun", "bon_2"].concat(
    Object.keys(DOCUMENT_REQUIREMENTS).filter(
      (type) => getDocumentRequirements(type).requireContract,
    ),
  ),
);

export const CONTRACT_DOCUMENT_TYPES = new Set(CONTRACT_FOCUSED_TYPES);

export const resolveDocumentType = (value) => {
  const key = normaliseDocumentTypeKey(value);
  if (!key) {
    return "ugovor";
  }
  if (DOCUMENT_TYPE_ALIASES[key]) {
    return DOCUMENT_TYPE_ALIASES[key];
  }
  if (DOCUMENT_TYPE_LABELS[key] || DOCUMENT_REQUIREMENTS[key]) {
    return key;
  }
  return "ostalo";
};

export const formatDocumentType = (tip) => DOCUMENT_TYPE_LABELS[tip] || tip;
