import React, { useMemo, useCallback } from "react";
import { Label } from "../../../components/ui/label";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Badge } from "../../../components/ui/badge";
import { useDocumentWizard } from "../DocumentWizard";

const MetaStep = () => {
  const {
    formData,
    setFormData,
    aiSuggestions,
    aiLoading,
    aiError,
    aiApplied,
    formatDocumentType,
    activeRequirements,
  } = useDocumentWizard();

  const selectedDocTypeLabel = formatDocumentType(formData.tip);

  const metadataValues = formData.metadata || {};
  const isPropertyOnly = useMemo(
    () =>
      activeRequirements.requireProperty &&
      !activeRequirements.allowTenant &&
      !activeRequirements.allowContract,
    [activeRequirements],
  );
  const requiresContract = activeRequirements.requireContract;
  const requiresTenant = activeRequirements.requireTenant;

  const handleMetadataChange = useCallback(
    (fieldId, value) => {
      setFormData((prev) => ({
        ...prev,
        metadata: {
          ...(prev.metadata || {}),
          [fieldId]: value,
        },
      }));
    },
    [setFormData],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="naziv">Naziv dokumenta *</Label>
          <Input
            id="naziv"
            value={formData.naziv}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, naziv: event.target.value }))
            }
            data-testid="dokument-naziv-input"
            placeholder="npr. Ugovor o zakupu"
            required
          />
        </div>
        <div>
          <Label>Tip dokumenta</Label>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline">{selectedDocTypeLabel}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground/80">
            Tip dokumenta odabire se u koraku "Učitaj dokument".
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="opis">Opis dokumenta</Label>
          <Textarea
            id="opis"
            value={formData.opis}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, opis: event.target.value }))
            }
            data-testid="dokument-opis-input"
            rows={4}
            placeholder="Sažetak sadržaja dokumenta ili posebne napomene"
          />
        </div>
        <div>
          <Label htmlFor="datum_isteka">Datum isteka</Label>
          <Input
            id="datum_isteka"
            type="date"
            value={formData.datum_isteka || ""}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                datum_isteka: event.target.value,
              }))
            }
            data-testid="dokument-datum-isteka-input"
          />
          <p className="mt-1 text-xs text-muted-foreground/80">
            Opcionalno. Datum kad dokument prestaje vrijediti.
          </p>
        </div>
      </div>

      {activeRequirements.metaFields.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {activeRequirements.metaFields.map((field) => {
            const value = metadataValues[field.id] ?? "";
            const inputType =
              field.type === "date"
                ? "date"
                : field.type === "number"
                  ? "number"
                  : field.type === "textarea"
                    ? "textarea"
                    : "text";
            const isTextarea = inputType === "textarea";
            const isMissing = field.required && !String(value).trim();
            return (
              <div key={field.id}>
                <Label htmlFor={`meta-${field.id}`}>
                  {field.label}
                  {field.required ? " *" : ""}
                </Label>
                {isTextarea ? (
                  <Textarea
                    id={`meta-${field.id}`}
                    value={value}
                    onChange={(event) =>
                      handleMetadataChange(field.id, event.target.value)
                    }
                    rows={3}
                    placeholder={field.placeholder || ""}
                  />
                ) : (
                  <Input
                    id={`meta-${field.id}`}
                    type={inputType}
                    value={value}
                    onChange={(event) =>
                      handleMetadataChange(field.id, event.target.value)
                    }
                    placeholder={field.placeholder || ""}
                    {...(inputType === "number" ? { step: "any" } : {})}
                  />
                )}
                {isMissing && (
                  <p className="mt-1 text-xs text-amber-600">
                    Polje je obavezno.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {aiSuggestions && (
        <div className="rounded-md border border-border/60 bg-white/70 p-4 text-xs text-muted-foreground">
          <p>
            AI predloženi tip dokumenta:{" "}
            <strong>{formatDocumentType(aiSuggestions.document_type)}</strong>
            {aiApplied ? " (primijenjeno)" : " (isključeno)"}
          </p>
          {isPropertyOnly && (
            <p className="mt-2 text-amber-600">
              Ovo je dokument povezan isključivo s nekretninom. Polja za
              zakupnika, ugovor i jedinica su onemogućeni.
            </p>
          )}
          {!isPropertyOnly && !activeRequirements.allowTenant && (
            <p className="mt-2 text-amber-600">
              Polje za zakupnika nije dostupno za ovaj tip dokumenta.
            </p>
          )}
          {requiresTenant && activeRequirements.allowTenant && (
            <p className="mt-2 text-emerald-600">
              Dokument zahtijeva povezivanje sa zakupnikom.
            </p>
          )}
          {requiresContract && activeRequirements.allowContract && (
            <p className="mt-2 text-emerald-600">
              Dokument je povezan s ugovorima. Preporučujemo povezivanje s
              postojećim ugovorom.
            </p>
          )}
        </div>
      )}

      {(aiLoading || aiError) && (
        <div className="rounded-md border border-border/60 bg-white p-3 text-xs text-muted-foreground">
          {aiLoading && (
            <p>Analiziram podatke kako bi popunio osnovne informacije…</p>
          )}
          {aiError && <p className="text-destructive">{aiError}</p>}
        </div>
      )}
    </div>
  );
};

export default MetaStep;
