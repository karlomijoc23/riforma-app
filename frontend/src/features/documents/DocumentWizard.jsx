import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useContext,
  useEffect,
} from "react";
import { Button } from "../../components/ui/button";
import { toast } from "../../components/ui/sonner";
import { Badge } from "../../components/ui/badge";
import { api } from "../../shared/api";
import {
  DOCUMENT_TYPE_LABELS,
  getDocumentRequirements,
  resolveDocumentType,
  formatDocumentType,
} from "../../shared/documents";
import {
  UNIT_STATUS_CONFIG,
  getUnitDisplayName,
  sortUnitsByPosition,
  resolveUnitTenantName,
} from "../../shared/units";
import { parseNumericValue } from "../../shared/formatters";
import UploadStep from "./steps/UploadStep";
import MetaStep from "./steps/MetaStep";
import LinkingStep from "./steps/LinkingStep";
import ManualUnitForm from "./components/ManualUnitForm";
import NekretninarForm from "../properties/NekretninarForm";
import ZakupnikForm from "../tenants/ZakupnikForm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { normaliseNekretninaPayload } from "../../shared/units";

const DocumentWizardContext = React.createContext(null);

export const useDocumentWizard = () => {
  const context = useContext(DocumentWizardContext);
  if (!context) {
    throw new Error("useDocumentWizard must be used within DocumentWizard");
  }
  return context;
};

const steps = [
  { id: "upload", title: "Učitaj dokument", component: UploadStep },
  { id: "meta", title: "Detalji", component: MetaStep },
  { id: "linking", title: "Povezivanje", component: LinkingStep },
];

const initialManualUnitState = {
  oznaka: "",
  naziv: "",
  kat: "",
  povrsina_m2: "",
  status: "dostupno",
  osnovna_zakupnina: "",
  napomena: "",
};

const initialFormState = {
  naziv: "",
  tip: "ugovor",
  opis: "",
  datum_isteka: "",
  nekretnina_id: "",
  zakupnik_id: "",
  ugovor_id: "",
  property_unit_id: "",
  metadata: {},
  file: null,
};

const cloneFormState = (state) => ({
  ...state,
  metadata: { ...(state?.metadata || {}) },
});

const resolveConfidenceScore = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (typeof value === "object") {
    if (typeof value.confidence === "number") return value.confidence;
    if (typeof value.score === "number") return value.score;
    if (typeof value.confidence_score === "number")
      return value.confidence_score;
    if (typeof value.value === "number") return value.value;
  }
  return null;
};

const formatConfidenceBadgeClass = (score) => {
  if (score === null || score === undefined) {
    return "bg-muted text-muted-foreground";
  }
  const percent = score > 1 ? score : score * 100;
  if (percent >= 80) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (percent >= 50) {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-rose-100 text-rose-700";
};

const formatConfidenceLabel = (score) => {
  if (score === null || score === undefined) {
    return "nije dostupno";
  }
  const percent = score > 1 ? score : score * 100;
  return `${Math.round(percent)}%`;
};

const DocumentWizard = ({
  nekretnine,
  zakupnici,
  ugovori,
  propertyUnitsByProperty = {},
  propertyUnitsById = {},
  onSubmit,
  onCancel,
  refreshEntities,
  loading,
  initialData,
}) => {
  const [formData, setFormData] = useState(
    initialData
      ? {
          ...initialFormState,
          ...initialData,
          metadata: initialData.metadata || {},
        }
      : initialFormState,
  );

  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialFormState,
        ...initialData,
        metadata: initialData.metadata || {},
      });
    } else {
      setFormData(initialFormState);
    }
  }, [initialData]);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [tenantOptions, setTenantOptions] = useState(zakupnici);
  const [manualUnitForm, setManualUnitForm] = useState(initialManualUnitState);
  const [manualUnitErrors, setManualUnitErrors] = useState({});
  const [showManualUnitForm, setShowManualUnitForm] = useState(false);
  const [quickCreateLoading, setQuickCreateLoading] = useState({
    property: false,
    tenant: false,
    contract: false,
    unit: false,
  });
  const [activeStep, setActiveStep] = useState(0);
  const [aiApplied, setAiApplied] = useState(true);
  const [hasAutoFocusedDescription, setHasAutoFocusedDescription] =
    useState(false);

  const activeRequirements = useMemo(
    () => getDocumentRequirements(formData.tip),
    [formData.tip],
  );

  const isPropertyOnlyDocument =
    activeRequirements.requireProperty &&
    !activeRequirements.allowTenant &&
    !activeRequirements.allowContract;

  const allowsTenant = activeRequirements.allowTenant;
  const allowsContract = activeRequirements.allowContract;
  const allowsPropertyUnit = activeRequirements.allowPropertyUnit;

  const applyDocumentTypeChange = useCallback(
    (state, nextType) => {
      const baseState = cloneFormState(state);
      const requirements = getDocumentRequirements(nextType);
      const nextMetadata = {};
      requirements.metaFields.forEach((field) => {
        nextMetadata[field.id] = baseState.metadata?.[field.id] ?? "";
      });
      const next = {
        ...baseState,
        tip: nextType,
        metadata: nextMetadata,
      };
      if (!requirements.allowTenant) {
        next.zakupnik_id = "";
      }
      if (!requirements.allowContract) {
        next.ugovor_id = "";
      }
      if (!requirements.allowPropertyUnit) {
        next.property_unit_id = "";
      }
      return next;
    },
    [getDocumentRequirements],
  );

  const handleDocumentTypeChange = useCallback(
    (value) => {
      setFormData((prev) => applyDocumentTypeChange(prev, value));
    },
    [applyDocumentTypeChange],
  );

  const fileInputRef = useRef(null);
  const latestCreatedUnitRef = useRef(null);
  const manualSnapshotRef = useRef(null);
  const aiSnapshotRef = useRef(null);

  const manualUnitStatusOptions = useMemo(
    () =>
      Object.entries(UNIT_STATUS_CONFIG).map(([value, config]) => ({
        value,
        label: config.label,
      })),
    [],
  );

  const propertyUnitSuggestion = useMemo(
    () => (allowsPropertyUnit ? aiSuggestions?.property_unit || null : null),
    [aiSuggestions, allowsPropertyUnit],
  );

  const normalizeValue = useCallback(
    (value) => (value ? value.toString().trim().toLowerCase() : ""),
    [],
  );

  useEffect(() => {
    setTenantOptions(zakupnici);
  }, [zakupnici]);

  useEffect(() => {
    setHasAutoFocusedDescription(false);
    setFormData((prev) => {
      const requirements = getDocumentRequirements(prev.tip);
      const nextMetadata = {};
      requirements.metaFields.forEach((field) => {
        nextMetadata[field.id] = prev.metadata?.[field.id] ?? "";
      });
      const prevMetadata = prev.metadata || {};
      const prevKeys = Object.keys(prevMetadata);
      const nextKeys = Object.keys(nextMetadata);
      const sameLength = prevKeys.length === nextKeys.length;
      const sameValues =
        sameLength &&
        nextKeys.every((key) => prevMetadata[key] === nextMetadata[key]);
      if (sameValues) {
        return prev;
      }
      return { ...prev, metadata: nextMetadata };
    });
  }, [formData.tip]);

  const findPropertyMatch = useCallback(
    (suggestion) => {
      if (!suggestion) return null;
      const name = normalizeValue(suggestion.naziv);
      const address = normalizeValue(suggestion.adresa);
      if (!name && !address) return null;
      return (
        nekretnine.find((item) => {
          const itemName = normalizeValue(item.naziv);
          const itemAddress = normalizeValue(item.adresa);
          if (name && itemName === name) return true;
          if (address && itemAddress === address) return true;
          if (name && itemName.includes(name)) return true;
          if (address && itemAddress.includes(address)) return true;
          return false;
        }) || null
      );
    },
    [nekretnine, normalizeValue],
  );

  const findPropertyUnitMatch = useCallback(
    (propertyId, suggestion) => {
      if (!propertyId || !suggestion) {
        return null;
      }
      const targetOznaka = normalizeValue(suggestion.oznaka);
      const targetNaziv = normalizeValue(suggestion.naziv);
      if (!targetOznaka && !targetNaziv) {
        return null;
      }
      const units = propertyUnitsByProperty?.[propertyId] || [];
      return (
        units.find((unit) => {
          const unitOznaka = normalizeValue(unit.oznaka);
          const unitNaziv = normalizeValue(unit.naziv);
          if (targetOznaka && unitOznaka === targetOznaka) {
            return true;
          }
          if (targetNaziv && unitNaziv === targetNaziv) {
            return true;
          }
          return false;
        }) || null
      );
    },
    [normalizeValue, propertyUnitsByProperty],
  );

  const findTenantMatch = useCallback(
    (suggestion) => {
      if (!suggestion) return null;
      const name = normalizeValue(
        suggestion.naziv_firme || suggestion.ime_prezime,
      );
      const oib = normalizeValue(suggestion.oib);
      return (
        tenantOptions.find((tenant) => {
          const tenantName = normalizeValue(
            tenant.naziv_firme || tenant.ime_prezime,
          );
          const tenantOib = normalizeValue(tenant.oib);
          if (oib && tenantOib === oib) return true;
          if (name && tenantName === name) return true;
          if (name && tenantName.includes(name)) return true;
          return false;
        }) || null
      );
    },
    [normalizeValue, tenantOptions],
  );

  const findContractMatch = useCallback(
    (suggestion) => {
      if (!suggestion) return null;
      const oznaka = normalizeValue(suggestion.interna_oznaka);
      if (!oznaka) return null;
      return (
        ugovori.find(
          (contract) => normalizeValue(contract.interna_oznaka) === oznaka,
        ) || null
      );
    },
    [normalizeValue, ugovori],
  );

  const activeTenantOptions = useMemo(
    () =>
      allowsTenant
        ? tenantOptions.filter(
            (tenant) => (tenant.status || "aktivan") !== "arhiviran",
          )
        : [],
    [tenantOptions, allowsTenant],
  );

  const tenantsById = useMemo(
    () => Object.fromEntries(zakupnici.map((tenant) => [tenant.id, tenant])),
    [zakupnici],
  );

  const contractsForProperty = useMemo(() => {
    if (!allowsContract) {
      return [];
    }
    if (!formData.nekretnina_id) {
      return ugovori;
    }
    return ugovori.filter(
      (contract) => contract.nekretnina_id === formData.nekretnina_id,
    );
  }, [allowsContract, ugovori, formData.nekretnina_id]);

  const unitsForSelectedProperty = useMemo(() => {
    if (!allowsPropertyUnit || !formData.nekretnina_id) {
      return [];
    }
    return sortUnitsByPosition(
      propertyUnitsByProperty[formData.nekretnina_id] || [],
    );
  }, [allowsPropertyUnit, formData.nekretnina_id, propertyUnitsByProperty]);

  const matchedProperty = useMemo(
    () => findPropertyMatch(aiSuggestions?.nekretnina),
    [aiSuggestions, findPropertyMatch],
  );

  const matchedTenant = useMemo(
    () => (allowsTenant ? findTenantMatch(aiSuggestions?.zakupnik) : null),
    [aiSuggestions, findTenantMatch, allowsTenant],
  );

  const matchedContract = useMemo(
    () => (allowsContract ? findContractMatch(aiSuggestions?.ugovor) : null),
    [aiSuggestions, findContractMatch, allowsContract],
  );

  const matchedPropertyUnit = useMemo(() => {
    if (!allowsPropertyUnit || !formData.property_unit_id) {
      return null;
    }
    const fallback =
      latestCreatedUnitRef.current &&
      latestCreatedUnitRef.current.id === formData.property_unit_id
        ? latestCreatedUnitRef.current
        : null;
    return propertyUnitsById?.[formData.property_unit_id] || fallback;
  }, [allowsPropertyUnit, formData.property_unit_id, propertyUnitsById]);

  useEffect(() => {
    if (!allowsPropertyUnit || !formData.property_unit_id) {
      return;
    }
    const fallbackUnit =
      latestCreatedUnitRef.current &&
      latestCreatedUnitRef.current.id === formData.property_unit_id
        ? latestCreatedUnitRef.current
        : null;
    const unit = propertyUnitsById?.[formData.property_unit_id] || fallbackUnit;
    if (!unit) {
      setFormData((prev) => ({ ...prev, property_unit_id: "" }));
      return;
    }
    if (
      formData.nekretnina_id &&
      unit.nekretnina_id !== formData.nekretnina_id
    ) {
      setFormData((prev) => ({ ...prev, property_unit_id: "" }));
    }
    if (propertyUnitsById?.[formData.property_unit_id]) {
      latestCreatedUnitRef.current = null;
    }
  }, [
    allowsPropertyUnit,
    formData.nekretnina_id,
    formData.property_unit_id,
    propertyUnitsById,
  ]);

  useEffect(() => {
    if (!allowsPropertyUnit && showManualUnitForm) {
      setShowManualUnitForm(false);
    }
  }, [allowsPropertyUnit, showManualUnitForm]);

  useEffect(() => {
    if (!allowsPropertyUnit || !formData.property_unit_id) {
      return;
    }
    const fallbackUnit =
      latestCreatedUnitRef.current &&
      latestCreatedUnitRef.current.id === formData.property_unit_id
        ? latestCreatedUnitRef.current
        : null;
    const unit = propertyUnitsById?.[formData.property_unit_id] || fallbackUnit;
    if (!unit) {
      return;
    }
    setFormData((prev) => {
      const updates = {};
      if (!prev.nekretnina_id && unit.nekretnina_id) {
        updates.nekretnina_id = unit.nekretnina_id;
      }
      if (!prev.zakupnik_id && unit.zakupnik_id && allowsTenant) {
        updates.zakupnik_id = unit.zakupnik_id;
      }
      if (!prev.ugovor_id && unit.ugovor_id && allowsContract) {
        updates.ugovor_id = unit.ugovor_id;
      }
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });
  }, [
    allowsContract,
    allowsPropertyUnit,
    allowsTenant,
    formData.property_unit_id,
    propertyUnitsById,
  ]);

  const aiSuggestionDocumentType = aiSuggestions
    ? resolveDocumentType(aiSuggestions.document_type)
    : null;

  const detectedValues = useMemo(() => {
    if (!aiSuggestions) {
      return [];
    }
    const rows = [];
    const propertySuggestion = aiSuggestions.nekretnina || {};
    const tenantSuggestion = aiSuggestions.zakupnik || {};
    const contractSuggestion = aiSuggestions.ugovor || {};
    const propertyUnitCandidate = propertyUnitSuggestion || {};

    rows.push({
      label: "Tip dokumenta",
      value: formatDocumentType(
        aiSuggestionDocumentType || aiSuggestions.document_type,
      ),
      confidence: resolveConfidenceScore(
        aiSuggestions.confidence?.document_type ||
          aiSuggestions.document_type_confidence ||
          aiSuggestions.document_type_score ||
          null,
      ),
    });

    rows.push({
      label: "Nekretnina",
      value:
        propertySuggestion.naziv ||
        propertySuggestion.adresa ||
        "Nije prepoznato",
      matched: matchedProperty?.naziv,
      confidence: resolveConfidenceScore(
        propertySuggestion.confidence ||
          aiSuggestions.confidence?.nekretnina ||
          propertySuggestion.score,
      ),
    });

    if (allowsTenant) {
      rows.push({
        label: "Zakupnik",
        value:
          tenantSuggestion.naziv_firme ||
          tenantSuggestion.ime_prezime ||
          "Nije prepoznato",
        matched:
          matchedTenant?.naziv_firme || matchedTenant?.ime_prezime || null,
        confidence: resolveConfidenceScore(
          tenantSuggestion.confidence ||
            aiSuggestions.confidence?.zakupnik ||
            tenantSuggestion.score,
        ),
      });
    }

    if (allowsContract) {
      rows.push({
        label: "Ugovor",
        value: contractSuggestion.interna_oznaka || "Nije prepoznato",
        matched: matchedContract?.interna_oznaka,
        confidence: resolveConfidenceScore(
          contractSuggestion.confidence ||
            aiSuggestions.confidence?.ugovor ||
            contractSuggestion.score,
        ),
      });
    }

    if (allowsPropertyUnit) {
      rows.push({
        label: "Jedinica",
        value:
          propertyUnitCandidate.oznaka ||
          propertyUnitCandidate.naziv ||
          "Nije prepoznato",
        matched: matchedPropertyUnit
          ? getUnitDisplayName(matchedPropertyUnit)
          : null,
        confidence: resolveConfidenceScore(
          propertyUnitCandidate.confidence ||
            aiSuggestions.confidence?.property_unit ||
            propertyUnitCandidate.score,
        ),
      });
    }

    return rows;
  }, [
    aiSuggestions,
    aiSuggestionDocumentType,
    allowsContract,
    allowsPropertyUnit,
    allowsTenant,
    matchedContract,
    matchedProperty,
    matchedPropertyUnit,
    matchedTenant,
    propertyUnitSuggestion,
  ]);

  useEffect(() => {
    if (!isPropertyOnlyDocument) {
      return;
    }
    if (!formData.nekretnina_id) {
      return;
    }
    if (!aiSuggestions) {
      return;
    }
    if (hasAutoFocusedDescription) {
      return;
    }
    setHasAutoFocusedDescription(true);
    setActiveStep((prev) => (prev === 0 ? 1 : prev));
    const focusDescription = () => {
      if (typeof document === "undefined") {
        return;
      }
      const descriptionField = document.getElementById("opis");
      if (descriptionField && typeof descriptionField.focus === "function") {
        descriptionField.focus();
      }
    };
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(focusDescription);
    } else {
      focusDescription();
    }
  }, [
    aiSuggestions,
    formData.nekretnina_id,
    hasAutoFocusedDescription,
    isPropertyOnlyDocument,
    setActiveStep,
  ]);

  const handleResetState = useCallback(() => {
    setFormData(cloneFormState(initialFormState));
    setAiSuggestions(null);
    setAiLoading(false);
    setAiError(null);
    setUploadedFile(null);
    setTenantOptions(zakupnici);
    setManualUnitForm(initialManualUnitState);
    setManualUnitErrors({});
    setShowManualUnitForm(false);
    setQuickCreateLoading({
      property: false,
      tenant: false,
      contract: false,
      unit: false,
    });
    setActiveStep(0);
    setAiApplied(true);
    setHasAutoFocusedDescription(false);
    manualSnapshotRef.current = null;
    aiSnapshotRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [zakupnici]);

  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0] || null;
      setAiSuggestions(null);
      setAiError(null);

      if (!file) {
        setUploadedFile(null);
        setFormData((prev) => ({ ...prev, file: null }));
        manualSnapshotRef.current = null;
        aiSnapshotRef.current = null;
        setAiApplied(true);
        return;
      }

      if (file.type !== "application/pdf") {
        toast.error("Molimo odaberite PDF datoteku");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        setUploadedFile(null);
        setFormData((prev) => ({ ...prev, file: null }));
        return;
      }

      toast.dismiss("document-pdf-parse");
      toast.loading("Analiziram PDF dokument…", {
        description: file.name,
        id: "document-pdf-parse",
      });

      manualSnapshotRef.current = cloneFormState(formData);
      setUploadedFile(file);
      setFormData((prev) => ({ ...prev, file }));
      setAiLoading(true);

      try {
        const response = await api.parsePdfContract(file);
        const payload = response.data;
        if (!payload.success) {
          const message = payload.message || "AI analiza PDF-a nije uspjela";
          setAiError(message);
          toast.warning(
            "AI analiza nije uspjela. Molimo unesite podatke ručno.",
          );
          // Do not return, allow manual entry
          setAiLoading(false);
          return;
        }

        const suggestions = payload.data || {};
        setAiSuggestions(suggestions);

        const contract = suggestions.ugovor || {};
        const finances = suggestions.financije || {};
        const propertySuggestion = suggestions.nekretnina || {};
        const tenantSuggestion = suggestions.zakupnik || {};
        const propertyUnitSuggestion = suggestions.property_unit || {};
        const propertyMatch = findPropertyMatch(propertySuggestion);
        const tenantMatch = findTenantMatch(tenantSuggestion);
        const contractMatch = findContractMatch(contract);
        const tenantMatchStatus = tenantMatch
          ? tenantMatch.status || "aktivan"
          : null;
        const tenantMatchIsArchived = tenantMatchStatus === "arhiviran";
        const documentType = resolveDocumentType(suggestions.document_type);
        const requirementsForType = getDocumentRequirements(documentType);
        const propertyOnlyDoc =
          requirementsForType.requireProperty &&
          !requirementsForType.allowTenant &&
          !requirementsForType.allowContract;
        const canUseTenant = requirementsForType.allowTenant;
        const canUseContract = requirementsForType.allowContract;
        const canUsePropertyUnit = requirementsForType.allowPropertyUnit;
        const contractRelevant =
          canUseContract &&
          (requirementsForType.requireContract ||
            documentType === "ugovor" ||
            documentType === "aneks");
        const matchedPropertyUnitResponse =
          payload.matched_property_unit || null;
        const createdPropertyUnit = payload.created_property_unit || null;

        let inferredPropertyUnitId = "";

        if (canUsePropertyUnit) {
          if (
            createdPropertyUnit &&
            propertyMatch &&
            createdPropertyUnit.nekretnina_id === propertyMatch.id
          ) {
            latestCreatedUnitRef.current = createdPropertyUnit;
            inferredPropertyUnitId = createdPropertyUnit.id;
            await refreshEntities();
            toast.success(
              `Jedinica ${
                createdPropertyUnit.oznaka ||
                createdPropertyUnit.naziv ||
                createdPropertyUnit.id
              } je automatski kreiran.`,
            );
          } else if (
            matchedPropertyUnitResponse &&
            propertyMatch &&
            matchedPropertyUnitResponse.nekretnina_id === propertyMatch.id
          ) {
            inferredPropertyUnitId = matchedPropertyUnitResponse.id;
            toast.success(
              `Jedinica ${
                matchedPropertyUnitResponse.oznaka ||
                matchedPropertyUnitResponse.naziv ||
                matchedPropertyUnitResponse.id
              } je povezan s dokumentom.`,
            );
          } else if (
            propertyMatch &&
            (propertyUnitSuggestion.oznaka || propertyUnitSuggestion.naziv)
          ) {
            const localMatch = findPropertyUnitMatch(
              propertyMatch.id,
              propertyUnitSuggestion,
            );
            if (localMatch) {
              inferredPropertyUnitId = localMatch.id;
              toast.info(
                `Jedinica ${
                  localMatch.oznaka || localMatch.naziv
                } je povezan s dokumentom.`,
              );
            } else {
              toast.warning(
                `AI je identificirao jedinicu ${
                  propertyUnitSuggestion.oznaka || propertyUnitSuggestion.naziv
                }, ali ga nije pronašao u sustavu.`,
              );
            }
          } else if (
            (propertyUnitSuggestion.oznaka || propertyUnitSuggestion.naziv) &&
            !propertyMatch
          ) {
            toast.info(
              "AI je prepoznao jedinicu, ali nije pronašao odgovarajuću nekretninu.",
            );
          }
        }

        setFormData((prev) => {
          let updated = applyDocumentTypeChange(prev, documentType);

          if (!prev.naziv) {
            const suggestedName = (() => {
              if (documentType === "racun" && suggestions.racun?.broj_racuna) {
                return `Račun ${suggestions.racun.broj_racuna}`;
              }
              if (documentType === "aneks" && contract.interna_oznaka) {
                return `Aneks ${contract.interna_oznaka}`;
              }
              if (documentType === "ugovor" && contract.interna_oznaka) {
                return `Ugovor ${contract.interna_oznaka}`;
              }
              if (propertyOnlyDoc) {
                const propertyLabel =
                  propertyMatch?.naziv || propertySuggestion.naziv;
                if (propertyLabel) {
                  const docLabel =
                    DOCUMENT_TYPE_LABELS[documentType] ||
                    formatDocumentType(documentType);
                  return `${docLabel} – ${propertyLabel}`;
                }
              }
              return null;
            })();

            if (suggestedName) {
              updated.naziv = suggestedName;
            }
          }

          if (propertyMatch) {
            updated.nekretnina_id = propertyMatch.id;
          } else if (contractRelevant && contractMatch?.nekretnina_id) {
            updated.nekretnina_id = contractMatch.nekretnina_id;
          }

          if (!prev.opis && !propertyOnlyDoc) {
            const descriptionSource =
              tenantSuggestion.naziv_firme ||
              tenantSuggestion.ime_prezime ||
              "";
            if (descriptionSource) {
              updated.opis = descriptionSource;
            }
          }

          if (!canUseTenant) {
            updated.zakupnik_id = "";
          } else if (tenantMatch && !tenantMatchIsArchived) {
            updated.zakupnik_id = tenantMatch.id;
          }

          if (!canUseContract) {
            updated.ugovor_id = "";
          } else if (contractMatch) {
            updated.ugovor_id = contractMatch.id;
          }

          if (!canUsePropertyUnit) {
            updated.property_unit_id = "";
          } else if (inferredPropertyUnitId) {
            updated.property_unit_id = inferredPropertyUnitId;
          }

          aiSnapshotRef.current = cloneFormState(updated);
          return updated;
        });

        if (
          canUseTenant &&
          (!tenantMatch || tenantMatchIsArchived) &&
          (tenantSuggestion.naziv_firme || tenantSuggestion.ime_prezime)
        ) {
          await handleCreateTenantFromAI(tenantSuggestion);
        }

        setAiApplied(true);
        toast.success("AI prijedlozi spremni – provjerite prijedloge ispod.");
      } catch (error) {
        console.error("AI parse error:", error);
        setAiError("AI analiza nije uspjela. Molimo unesite podatke ručno.");
        toast.warning("AI analiza nije uspjela. Molimo unesite podatke ručno.");
        // Ensure we don't block the UI, user can still proceed manually
      } finally {
        setAiLoading(false);
        toast.dismiss("document-pdf-parse");
      }
    },
    [
      api,
      applyDocumentTypeChange,
      findContractMatch,
      findPropertyMatch,
      findPropertyUnitMatch,
      findTenantMatch,
      formData,
      refreshEntities,
      zakupnici,
    ],
  );

  const handleRemoveFile = useCallback(() => {
    setUploadedFile(null);
    setFormData((prev) => ({ ...prev, file: null }));
    setAiSuggestions(null);
    setAiError(null);
    setAiApplied(true);
    manualSnapshotRef.current = null;
    aiSnapshotRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleAiToggle = useCallback((checked) => {
    if (checked) {
      setAiApplied(true);
      if (aiSnapshotRef.current) {
        setFormData(cloneFormState(aiSnapshotRef.current));
      }
    } else {
      setAiApplied(false);
      if (manualSnapshotRef.current) {
        setFormData(cloneFormState(manualSnapshotRef.current));
      }
    }
  }, []);

  const [showPropertyCreateDialog, setShowPropertyCreateDialog] =
    useState(false);
  const [propertyPreFillData, setPropertyPreFillData] = useState(null);

  const handleCreatePropertyFromAI = useCallback(
    (overrideData = null) => {
      const suggestion = overrideData || aiSuggestions?.nekretnina || {};

      const toNumber = (value, fallback = "") => {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
      };
      const toNumberOrNull = (value) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : "";
      };

      const prefill = {
        naziv: suggestion.naziv || "",
        adresa: suggestion.adresa || "",
        katastarska_opcina: suggestion.katastarska_opcina || "",
        broj_kat_cestice: suggestion.broj_kat_cestice || "",
        vrsta: suggestion.vrsta || "stan",
        povrsina: toNumber(suggestion.povrsina),
        godina_izgradnje: suggestion.godina_izgradnje || "",
        vlasnik: suggestion.vlasnik || "",
        udio_vlasnistva: suggestion.udio_vlasnistva || "",
        nabavna_cijena: toNumberOrNull(suggestion.nabavna_cijena),
        trzisna_vrijednost: toNumberOrNull(suggestion.trzisna_vrijednost),
        prosllogodisnji_prihodi: toNumberOrNull(
          suggestion.prosllogodisnji_prihodi,
        ),
        prosllogodisnji_rashodi: toNumberOrNull(
          suggestion.prosllogodisnji_rashodi,
        ),
        amortizacija: toNumberOrNull(suggestion.amortizacija),
        proslogodisnji_neto_prihod: toNumberOrNull(
          suggestion.proslogodisnji_neto_prihod || suggestion.neto_prihod,
        ),
        zadnja_obnova: suggestion.zadnja_obnova || "",
        potrebna_ulaganja: suggestion.potrebna_ulaganja || "",
        troskovi_odrzavanja: toNumberOrNull(suggestion.troskovi_odrzavanja),
        osiguranje: suggestion.osiguranje || "",
        sudski_sporovi: suggestion.sudski_sporovi || "",
        hipoteke: suggestion.hipoteke || "",
        napomene: suggestion.napomene || "",
      };

      setPropertyPreFillData(prefill);
      setShowPropertyCreateDialog(true);
    },
    [aiSuggestions],
  );

  const handlePropertyCreateSubmit = useCallback(
    async (formPayload) => {
      setQuickCreateLoading((prev) => ({ ...prev, property: true }));
      try {
        const { property, units } = normaliseNekretninaPayload(formPayload);
        const response = await api.createNekretnina(property);
        const createdProperty = response.data;

        if (units && units.length) {
          for (const unitPayload of units) {
            if (!unitPayload.oznaka) continue;
            try {
              await api.createUnit(createdProperty.id, unitPayload);
            } catch (error) {
              console.error("Neuspjelo kreiranje jedinice:", error);
              toast.warning(`Jedinica ${unitPayload.oznaka} nije kreirana.`);
            }
          }
        }

        toast.success("Nekretnina je uspješno kreirana");
        await refreshEntities();
        setFormData((prev) => ({ ...prev, nekretnina_id: createdProperty.id }));
        setShowPropertyCreateDialog(false);
      } catch (error) {
        console.error("Greška pri kreiranju nekretnine:", error);
        toast.error("Greška pri kreiranju nekretnine");
      } finally {
        setQuickCreateLoading((prev) => ({ ...prev, property: false }));
      }
    },
    [refreshEntities],
  );

  const [showTenantCreateDialog, setShowTenantCreateDialog] = useState(false);
  const [tenantPreFillData, setTenantPreFillData] = useState(null);

  const handleCreateTenantFromAI = useCallback(
    async (suggestionOverride = null) => {
      if (!allowsTenant) {
        toast.info("Zakupnik nije potreban za ovaj tip dokumenta.");
        return;
      }
      const suggestion = suggestionOverride || aiSuggestions?.zakupnik || {};

      const fallbackName =
        suggestion.naziv_firme ||
        suggestion.ime_prezime ||
        suggestion.kontakt_ime ||
        "Zakupnik";

      const prefill = {
        tip:
          suggestion.tip || (suggestion.naziv_firme ? "zakupnik" : "partner"),
        naziv_firme: suggestion.naziv_firme || "",
        ime_prezime: suggestion.ime_prezime || "",
        oib: suggestion.oib || "",
        sjediste: suggestion.sjediste || "",
        kontakt_ime: suggestion.kontakt_ime || fallbackName,
        kontakt_email: suggestion.kontakt_email || "",
        kontakt_telefon: suggestion.kontakt_telefon || "",
        status: suggestion.status || "aktivan",
        opis_usluge: suggestion.opis_usluge || "",
        adresa_ulica: suggestion.adresa_ulica || "",
        adresa_kucni_broj: suggestion.adresa_kucni_broj || "",
        adresa_postanski_broj: suggestion.adresa_postanski_broj || "",
        adresa_grad: suggestion.adresa_grad || "",
        adresa_drzava: suggestion.adresa_drzava || "",
        pdv_obveznik:
          suggestion.pdv_obveznik === true ||
          suggestion.pdv_obveznik === "true",
        pdv_id: suggestion.pdv_id || "",
        maticni_broj: suggestion.maticni_broj || "",
        registracijski_broj: suggestion.registracijski_broj || "",
      };

      setTenantPreFillData(prefill);
      setShowTenantCreateDialog(true);
    },
    [allowsTenant, aiSuggestions],
  );

  const handleTenantCreateSubmit = useCallback(
    async (formPayload) => {
      setQuickCreateLoading((prev) => ({ ...prev, tenant: true }));
      try {
        const response = await api.createZakupnik(formPayload);
        toast.success("Zakupnik je uspješno kreiran");
        await refreshEntities();
        setFormData((prev) => ({ ...prev, zakupnik_id: response.data.id }));
        setShowTenantCreateDialog(false);
      } catch (error) {
        console.error("Greška pri kreiranju zakupnika:", error);
        toast.error("Greška pri kreiranju zakupnika");
      } finally {
        setQuickCreateLoading((prev) => ({ ...prev, tenant: false }));
      }
    },
    [refreshEntities],
  );

  const handleCreateContractFromAI = useCallback(async () => {
    if (!allowsContract) {
      toast.info("Kreiranje ugovora nije dostupno za ovaj tip dokumenta.");
      return;
    }
    if (!aiSuggestions?.ugovor) {
      toast.error("AI nije pronašao podatke o ugovoru");
      return;
    }
    if (!formData.nekretnina_id || !formData.zakupnik_id) {
      toast.error("Povežite nekretninu i zakupnika prije kreiranja ugovora");
      return;
    }
    setQuickCreateLoading((prev) => ({ ...prev, contract: true }));
    const contract = aiSuggestions.ugovor || {};
    const finances = aiSuggestions.financije || {};
    const other = aiSuggestions.ostalo || {};
    const toNumber = (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
    const toNumberOrNull = (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };
    try {
      const today = new Date().toISOString().split("T")[0];
      const payload = {
        interna_oznaka: contract.interna_oznaka || `UG-${Date.now()}`,
        nekretnina_id: formData.nekretnina_id,
        zakupnik_id: formData.zakupnik_id,
        datum_potpisivanja: contract.datum_potpisivanja || today,
        datum_pocetka: contract.datum_pocetka || today,
        datum_zavrsetka: contract.datum_zavrsetka || today,
        trajanje_mjeseci: contract.trajanje_mjeseci || 12,
        rok_otkaza_dani: contract.rok_otkaza_dani || 30,
        osnovna_zakupnina: toNumber(finances.osnovna_zakupnina, 0),
        zakupnina_po_m2: toNumberOrNull(finances.zakupnina_po_m2),
        cam_troskovi: toNumberOrNull(finances.cam_troskovi),
        polog_depozit: toNumberOrNull(finances.polog_depozit),
        garancija: toNumberOrNull(finances.garancija),
        indeksacija: finances.indeksacija ?? false,
        indeks: finances.indeks || null,
        formula_indeksacije: finances.formula_indeksacije || null,
        obveze_odrzavanja: other.obveze_odrzavanja || null,
        namjena_prostora:
          aiSuggestions.nekretnina?.namjena_prostora ||
          contract.namjena_prostora ||
          "",
        rezije_brojila: other.rezije_brojila || "",
      };
      const propertyUnitId = formData.property_unit_id;
      if (allowsPropertyUnit && !propertyUnitId) {
        toast.error(
          "AI nije uspio povezati jedinicu. Molimo odaberite jedinicu ručno prije kreiranja ugovora.",
        );
        return;
      }
      if (allowsPropertyUnit && propertyUnitId) {
        payload.property_unit_id = propertyUnitId;
      }
      const response = await api.createUgovor(payload);
      toast.success("Ugovor je kreiran iz AI prijedloga");
      await refreshEntities();
      setFormData((prev) => ({
        ...prev,
        ugovor_id: response.data.id,
        naziv: prev.naziv || `Ugovor ${response.data.interna_oznaka}`,
      }));
    } catch (error) {
      console.error("Greška pri kreiranju ugovora iz AI prijedloga:", error);
      toast.error("Greška pri kreiranju ugovora");
    } finally {
      setQuickCreateLoading((prev) => ({ ...prev, contract: false }));
    }
  }, [
    aiSuggestions,
    allowsContract,
    allowsPropertyUnit,
    formData,
    refreshEntities,
  ]);

  const openManualUnitForm = useCallback(
    ({ prefill = null, reset = false } = {}) => {
      if (!allowsPropertyUnit) {
        toast.info("Jedinice nisu potrebne za odabrani tip dokumenta.");
        return false;
      }
      const propertyId = formData.nekretnina_id || matchedProperty?.id || null;
      if (!propertyId) {
        toast.error("Povežite nekretninu prije dodavanja jedinice.");
        return false;
      }

      if (!formData.nekretnina_id && matchedProperty?.id === propertyId) {
        setFormData((prev) => ({ ...prev, nekretnina_id: propertyId }));
      }

      setManualUnitErrors({});
      setShowManualUnitForm(true);

      if (prefill) {
        const toInputValue = (value) => {
          if (value === null || value === undefined) {
            return "";
          }
          if (typeof value === "number") {
            return Number.isFinite(value) ? String(value) : "";
          }
          if (typeof value === "object") {
            if (value.value !== undefined) {
              return toInputValue(value.value);
            }
            if (value.raw !== undefined) {
              return toInputValue(value.raw);
            }
          }
          return String(value);
        };

        setManualUnitForm(() => ({
          ...initialManualUnitState,
          oznaka: prefill.oznaka ?? "",
          naziv: prefill.naziv ?? "",
          kat: prefill.kat ?? prefill.lokacija ?? "",
          povrsina_m2: toInputValue(
            prefill.povrsina_m2 ?? prefill.povrsina ?? "",
          ),
          status: prefill.status || initialManualUnitState.status,
          osnovna_zakupnina: toInputValue(
            prefill.osnovna_zakupnina ?? prefill.cijena ?? "",
          ),
          napomena: prefill.napomena ?? "",
        }));
      } else if (reset) {
        setManualUnitForm(initialManualUnitState);
      }

      return true;
    },
    [
      allowsPropertyUnit,
      formData.nekretnina_id,
      matchedProperty,
      setFormData,
      setManualUnitErrors,
      setManualUnitForm,
    ],
  );

  const handleApplyUnitSuggestion = useCallback(() => {
    if (!allowsPropertyUnit) {
      toast.info("Jedinice nisu potrebne za odabrani tip dokumenta.");
      return;
    }
    const propertyId = formData.nekretnina_id || matchedProperty?.id || null;
    if (!propertyId) {
      toast.error("Povežite nekretninu prije dodavanja jedinice.");
      return;
    }

    if (!formData.nekretnina_id && matchedProperty?.id === propertyId) {
      setFormData((prev) => ({ ...prev, nekretnina_id: propertyId }));
    }

    if (!propertyUnitSuggestion) {
      const opened = openManualUnitForm();
      if (opened) {
        toast.info("AI nije prepoznao jedinicu. Unesite je ručno.");
      }
      return;
    }

    const localMatch = findPropertyUnitMatch(
      propertyId,
      propertyUnitSuggestion,
    );
    if (localMatch) {
      setFormData((prev) => ({
        ...prev,
        nekretnina_id: propertyId,
        property_unit_id: localMatch.id,
      }));
      toast.success(
        `Jedinica ${
          localMatch.oznaka || localMatch.naziv || localMatch.id
        } je povezan s dokumentom.`,
      );
      return;
    }

    openManualUnitForm({ prefill: propertyUnitSuggestion, reset: true });
    toast.info(
      "Jedinica iz AI prijedloga nije pronađena u sustavu. Unesite detalje ručno.",
    );
  }, [
    allowsPropertyUnit,
    findPropertyUnitMatch,
    formData.nekretnina_id,
    matchedProperty,
    openManualUnitForm,
    propertyUnitSuggestion,
    setFormData,
  ]);

  const handleManualUnitSubmit = useCallback(async () => {
    if (!allowsPropertyUnit) {
      toast.info("Jedinice nisu potrebne za odabrani tip dokumenta.");
      return;
    }
    setManualUnitErrors({});
    const targetPropertyId = formData.nekretnina_id || matchedProperty?.id;
    const errors = {};
    if (!targetPropertyId) {
      errors.property = "Odaberite nekretninu prije spremanja jedinice.";
    }
    if (!manualUnitForm.oznaka.trim()) {
      errors.oznaka = "Oznaka je obavezna.";
    }

    if (Object.keys(errors).length) {
      setManualUnitErrors(errors);
      return;
    }

    if (quickCreateLoading.unit) {
      return;
    }
    setQuickCreateLoading((prev) => ({ ...prev, unit: true }));
    try {
      const payload = {
        oznaka: manualUnitForm.oznaka.trim(),
        naziv: manualUnitForm.naziv.trim() || null,
        kat: manualUnitForm.kat.trim() || null,
        povrsina_m2: manualUnitForm.povrsina_m2
          ? parseNumericValue(manualUnitForm.povrsina_m2)
          : null,
        status: manualUnitForm.status || "dostupno",
        osnovna_zakupnina: manualUnitForm.osnovna_zakupnina
          ? parseNumericValue(manualUnitForm.osnovna_zakupnina)
          : null,
        napomena: manualUnitForm.napomena.trim() || null,
      };

      const response = await api.createUnit(targetPropertyId, payload);
      const createdUnit = response?.data || null;
      toast.success("Jedinica je kreirana.");

      if (createdUnit?.id) {
        latestCreatedUnitRef.current = createdUnit;
        setFormData((prev) => ({
          ...prev,
          nekretnina_id: targetPropertyId,
          property_unit_id: createdUnit.id,
        }));
      }

      try {
        await refreshEntities();
      } catch (refreshError) {
        console.error(
          "Greška pri osvježavanju podataka nakon kreiranja jedinice:",
          refreshError,
        );
      }

      setManualUnitForm(initialManualUnitState);
      setShowManualUnitForm(false);
    } catch (error) {
      console.error("Greška pri ručnom kreiranju jedinice:", error);
      const message =
        error.response?.data?.detail ||
        "Jedinica nije kreirana. Pokušajte ponovno.";
      toast.error(message);
    } finally {
      setQuickCreateLoading((prev) => ({ ...prev, unit: false }));
    }
  }, [
    allowsPropertyUnit,
    formData.nekretnina_id,
    manualUnitForm,
    matchedProperty,
    quickCreateLoading.unit,
    refreshEntities,
  ]);

  const resetManualUnitForm = useCallback(() => {
    setManualUnitForm(initialManualUnitState);
    setManualUnitErrors({});
  }, []);

  const canProceedToNextStep = useMemo(() => {
    if (activeStep === 0) {
      return Boolean(uploadedFile || formData.file || formData.id);
    }
    if (activeStep === 1) {
      const metaFieldsValid = activeRequirements.metaFields.every((field) => {
        if (!field.required) {
          return true;
        }
        const value = formData.metadata?.[field.id];
        return Boolean(String(value ?? "").trim());
      });
      return Boolean(formData.naziv.trim() && formData.tip && metaFieldsValid);
    }
    return true;
  }, [
    activeRequirements,
    activeStep,
    formData.file,
    formData.id,
    formData.metadata,
    formData.naziv,
    formData.tip,
    uploadedFile,
  ]);

  const handleNext = useCallback(() => {
    if (activeStep < steps.length - 1) {
      setActiveStep((prev) => prev + 1);
    }
  }, [activeStep]);

  const handlePrev = useCallback(() => {
    if (activeStep > 0) {
      setActiveStep((prev) => prev - 1);
    }
  }, [activeStep]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      const requirements = getDocumentRequirements(formData.tip);
      if (!formData.file && !formData.id) {
        toast.error("PDF dokument je obavezan. Učitajte PDF prije spremanja.");
        return;
      }
      if (requirements.requireProperty && !formData.nekretnina_id) {
        toast.error("Za ovaj tip dokumenta odaberite pripadajuću nekretninu.");
        setActiveStep(2);
        return;
      }
      if (
        requirements.requireTenant &&
        requirements.allowTenant &&
        !formData.zakupnik_id
      ) {
        toast.error("Za ovaj tip dokumenta povežite zakupnika.");
        setActiveStep(2);
        return;
      }
      if (
        requirements.requireContract &&
        requirements.allowContract &&
        !formData.ugovor_id
      ) {
        toast.error("Za ovaj tip dokumenta povežite ugovor.");
        setActiveStep(2);
        return;
      }
      const missingMeta = requirements.metaFields.find((field) => {
        if (!field.required) {
          return false;
        }
        const value = formData.metadata?.[field.id];
        return !String(value ?? "").trim();
      });
      if (missingMeta) {
        toast.error(`Popunite polje "${missingMeta.label}".`);
        setActiveStep(1);
        return;
      }
      try {
        const metadataPayload = {};
        for (const field of requirements.metaFields) {
          const raw = formData.metadata?.[field.id];
          if (raw === undefined || raw === null) {
            continue;
          }
          if (typeof raw === "string") {
            const trimmed = raw.trim();
            if (!trimmed) {
              continue;
            }
            if (field.type === "number") {
              const numeric = Number(trimmed);
              if (!Number.isNaN(numeric)) {
                metadataPayload[field.id] = numeric;
              }
            } else {
              metadataPayload[field.id] = trimmed;
            }
          } else {
            metadataPayload[field.id] = raw;
          }
        }
        await onSubmit({
          ...formData,
          nekretnina_id: formData.nekretnina_id || null,
          zakupnik_id: requirements.allowTenant
            ? formData.zakupnik_id || null
            : null,
          ugovor_id: requirements.allowContract
            ? formData.ugovor_id || null
            : null,
          property_unit_id: requirements.allowPropertyUnit
            ? formData.property_unit_id || null
            : null,
          metadata: metadataPayload,
        });
        handleResetState();
      } catch (error) {
        console.error("Greška pri spremanju dokumenta:", error);
      }
    },
    [formData, handleResetState, onSubmit],
  );

  const currentStep = steps[activeStep];
  const StepComponent = currentStep.component;

  const contextValue = {
    formData,
    setFormData,
    aiSuggestions,
    aiLoading,
    aiError,
    uploadedFile,
    setUploadedFile,
    fileInputRef,
    aiApplied,
    handleAiToggle,
    detectedValues,
    quickCreateLoading,
    handleFileChange,
    handleRemoveFile,
    handleCreatePropertyFromAI,
    handleCreateTenantFromAI,
    handleCreateContractFromAI,
    manualUnitForm,
    setManualUnitForm,
    manualUnitErrors,
    setManualUnitErrors,
    showManualUnitForm,
    setShowManualUnitForm,
    manualUnitStatusOptions,
    activeTenantOptions,
    contractsForProperty,
    unitsForSelectedProperty,
    matchedProperty,
    matchedTenant,
    matchedContract,
    matchedPropertyUnit,
    propertyUnitSuggestion,
    propertyUnitsByProperty,
    propertyUnitsById,
    nekretnine,
    zakupnici,
    ugovori,
    tenantsById,
    handleManualUnitSubmit,
    handleApplyUnitSuggestion,
    openManualUnitForm,
    resetManualUnitForm,
    resolveConfidenceScore,
    formatConfidenceBadgeClass,
    formatConfidenceLabel,
    DOCUMENT_TYPE_LABELS,
    formatDocumentType,
    activeRequirements,
    allowsTenant,
    allowsContract,
    allowsPropertyUnit,
    isPropertyOnlyDocument,
    getDocumentRequirements,
    handleDocumentTypeChange,
  };

  return (
    <DocumentWizardContext.Provider value={contextValue}>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {steps.map((step, index) => (
                <React.Fragment key={step.id}>
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                      index === activeStep
                        ? "bg-primary text-white"
                        : index < activeStep
                          ? "bg-primary/80 text-white"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index + 1}
                  </div>
                  <span
                    className={
                      index === activeStep
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {step.title}
                  </span>
                  {index < steps.length - 1 && (
                    <span className="mx-2 h-px w-8 bg-border" aria-hidden />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        <StepComponent />

        {showManualUnitForm && <ManualUnitForm />}

        <div className="flex items-center justify-between border-t border-border/60 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            Odustani
          </Button>
          <div className="flex items-center gap-2">
            {activeStep > 0 && (
              <Button type="button" variant="ghost" onClick={handlePrev}>
                Nazad
              </Button>
            )}
            {activeStep < steps.length - 1 && (
              <Button
                type="button"
                onClick={handleNext}
                disabled={!canProceedToNextStep}
              >
                Sljedeći korak
              </Button>
            )}
            {activeStep === steps.length - 1 && (
              <Button
                type="submit"
                disabled={loading}
                data-testid="potvrdi-dokument-form"
              >
                {loading ? "Spremam..." : "Dodaj dokument"}
              </Button>
            )}
          </div>
        </div>
      </form>

      <Dialog
        open={showPropertyCreateDialog}
        onOpenChange={setShowPropertyCreateDialog}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dodaj novu nekretninu</DialogTitle>
          </DialogHeader>
          <NekretninarForm
            nekretnina={propertyPreFillData}
            onSubmit={handlePropertyCreateSubmit}
            onCancel={() => setShowPropertyCreateDialog(false)}
            submitting={quickCreateLoading.property}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={showTenantCreateDialog}
        onOpenChange={setShowTenantCreateDialog}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dodaj novog zakupnika</DialogTitle>
          </DialogHeader>
          <ZakupnikForm
            zakupnik={tenantPreFillData}
            onSubmit={handleTenantCreateSubmit}
            onCancel={() => setShowTenantCreateDialog(false)}
            submitting={quickCreateLoading.tenant}
          />
        </DialogContent>
      </Dialog>
    </DocumentWizardContext.Provider>
  );
};

export default DocumentWizard;
