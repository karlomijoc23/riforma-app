import { useState, useMemo, useRef, useCallback } from "react";
import { toast } from "../../components/ui/sonner";
import { api } from "../../shared/api";
import {
  DOCUMENT_TYPE_LABELS,
  getDocumentRequirements,
  resolveDocumentType,
  formatDocumentType,
} from "../../shared/documents";
import { getUnitDisplayName } from "../../shared/units";

const cloneFormState = (state) => ({
  ...state,
  metadata: { ...(state?.metadata || {}) },
});

export const resolveConfidenceScore = (value) => {
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

export const formatConfidenceBadgeClass = (score) => {
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

export const formatConfidenceLabel = (score) => {
  if (score === null || score === undefined) {
    return "nije dostupno";
  }
  const percent = score > 1 ? score : score * 100;
  return `${Math.round(percent)}%`;
};

export default function useDocumentAI({
  formData,
  setFormData,
  setUploadedFile,
  fileInputRef,
  refreshEntities,
  applyDocumentTypeChange,
  findPropertyMatch,
  findTenantMatch,
  findContractMatch,
  findPropertyUnitMatch,
  matchedPropertyUnit,
  allowsTenant,
  allowsContract,
  allowsPropertyUnit,
  createTenantFromAIRef,
  latestCreatedUnitRef,
}) {
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiApplied, setAiApplied] = useState(true);

  const manualSnapshotRef = useRef(null);
  const aiSnapshotRef = useRef(null);

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

  const propertyUnitSuggestion = useMemo(
    () => (allowsPropertyUnit ? aiSuggestions?.property_unit || null : null),
    [aiSuggestions, allowsPropertyUnit],
  );

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
        const propertyUnitSuggestionLocal = suggestions.property_unit || {};
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
            (propertyUnitSuggestionLocal.oznaka ||
              propertyUnitSuggestionLocal.naziv)
          ) {
            const localMatch = findPropertyUnitMatch(
              propertyMatch.id,
              propertyUnitSuggestionLocal,
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
                  propertyUnitSuggestionLocal.oznaka ||
                  propertyUnitSuggestionLocal.naziv
                }, ali ga nije pronašao u sustavu.`,
              );
            }
          } else if (
            (propertyUnitSuggestionLocal.oznaka ||
              propertyUnitSuggestionLocal.naziv) &&
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
          await createTenantFromAIRef.current?.(tenantSuggestion);
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
      applyDocumentTypeChange,
      fileInputRef,
      findContractMatch,
      findPropertyMatch,
      findPropertyUnitMatch,
      findTenantMatch,
      formData,
      latestCreatedUnitRef,
      refreshEntities,
      setFormData,
      setUploadedFile,
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
  }, [fileInputRef, setFormData, setUploadedFile]);

  const handleAiToggle = useCallback(
    (checked) => {
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
    },
    [setFormData],
  );

  const resetAI = useCallback(() => {
    setAiSuggestions(null);
    setAiLoading(false);
    setAiError(null);
    setAiApplied(true);
    manualSnapshotRef.current = null;
    aiSnapshotRef.current = null;
  }, []);

  return {
    aiSuggestions,
    aiLoading,
    aiError,
    aiApplied,
    handleFileChange,
    handleRemoveFile,
    handleAiToggle,
    detectedValues,
    aiSuggestionDocumentType,
    propertyUnitSuggestion,
    matchedProperty,
    matchedTenant,
    matchedContract,
    resolveConfidenceScore,
    formatConfidenceBadgeClass,
    formatConfidenceLabel,
    resetAI,
  };
}
