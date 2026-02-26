import React, { useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Switch } from "../../../components/ui/switch";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../../../components/ui/command";
import { useDocumentWizard } from "../DocumentWizard";
import { FileText, Trash2, Check } from "lucide-react";
import { getUnitDisplayName } from "../../../shared/units";

const UploadStep = () => {
  const {
    formData,
    setFormData,
    uploadedFile,
    aiSuggestions,
    aiLoading,
    aiError,
    handleFileChange,
    handleRemoveFile,
    fileInputRef,
    aiApplied,
    handleAiToggle,
    detectedValues,
    quickCreateLoading,
    handleCreatePropertyFromAI,
    handleCreateTenantFromAI,
    handleCreateContractFromAI,
    matchedProperty,
    matchedTenant,
    matchedContract,
    matchedPropertyUnit,
    propertyUnitSuggestion,
    handleApplyUnitSuggestion,
    openManualUnitForm,
    nekretnine,
    zakupnici,
    ugovori,
    formatConfidenceBadgeClass,
    formatConfidenceLabel,
    activeRequirements,
    allowsTenant,
    allowsContract,
    allowsPropertyUnit,
    DOCUMENT_TYPE_LABELS,
    formatDocumentType,
    handleDocumentTypeChange,
  } = useDocumentWizard();

  const documentOptions = useMemo(
    () =>
      Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
    [DOCUMENT_TYPE_LABELS],
  );

  const selectedDocTypeLabel = formatDocumentType(formData.tip);

  const hasAiSuggestions = Boolean(aiSuggestions);

  const propertySelected = Boolean(formData.nekretnina_id);
  const tenantSelected = allowsTenant && Boolean(formData.zakupnik_id);
  const contractSelected = allowsContract && Boolean(formData.ugovor_id);
  const propertyUnitSelected =
    allowsPropertyUnit && Boolean(formData.property_unit_id);

  const selectedProperty = propertySelected
    ? nekretnine.find((item) => item.id === formData.nekretnina_id)
    : null;
  const selectedTenant = tenantSelected
    ? zakupnici.find((item) => item.id === formData.zakupnik_id)
    : null;
  const selectedContract = contractSelected
    ? ugovori.find((item) => item.id === formData.ugovor_id)
    : null;

  const selectedUnitLabel = matchedPropertyUnit
    ? getUnitDisplayName(matchedPropertyUnit)
    : null;

  const propertyUnitLinked =
    allowsPropertyUnit &&
    Boolean(formData.nekretnina_id || matchedProperty?.id);

  const hasAiContract = allowsContract && Boolean(aiSuggestions?.ugovor);
  const canAutoCreateContract = Boolean(
    allowsContract &&
      hasAiContract &&
      formData.nekretnina_id &&
      formData.zakupnik_id &&
      (allowsPropertyUnit ? formData.property_unit_id : true),
  );

  const [showPropertySelect, setShowPropertySelect] = useState(false);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="dokument-tip-select">Tip dokumenta *</Label>
          <Select value={formData.tip} onValueChange={handleDocumentTypeChange}>
            <SelectTrigger
              id="dokument-tip-select"
              data-testid="dokument-tip-select"
            >
              <SelectValue placeholder="Odaberite tip" />
            </SelectTrigger>
            <SelectContent>
              {documentOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Aktivni tip:</span>
            <Badge variant="outline">{selectedDocTypeLabel}</Badge>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground/80">
            Tip dokumenta određuje koje su dodatne informacije i poveznice
            potrebne prije spremanja.
          </p>
        </div>
      </div>

      <div className="rounded-lg border-2 border-dashed border-border/50 bg-primary/5 p-6 text-center">
        <h3 className="text-lg font-medium text-foreground">
          📄 Učitaj PDF dokument
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          PDF je obavezan i koristi se za AI prijedloge, automatsko povezivanje
          i spremanje u arhivu.
        </p>
        <input
          id="dokument-pdf-upload"
          type="file"
          accept=".pdf"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          disabled={aiLoading}
        />
        {!uploadedFile ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={aiLoading}
            className="mt-4 inline-flex items-center"
          >
            {aiLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-primary" />
                Analiziram PDF...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" /> Odaberite PDF
              </>
            )}
          </Button>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white px-4 py-2 text-sm font-medium text-primary">
              <FileText className="h-4 w-4" />
              {uploadedFile.name}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRemoveFile}
              disabled={aiLoading}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Ukloni PDF
            </Button>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground/80">
          Podržani format: PDF
        </p>
      </div>

      {formData.id && !uploadedFile && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>
              Trenutno postoji datoteka. Učitajte novu samo ako je želite
              zamijeniti.
            </span>
          </div>
        </div>
      )}

      {aiLoading && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          Analiziram PDF dokument. Molimo pričekajte...
        </div>
      )}
      {aiError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {aiError}
        </div>
      )}

      {hasAiSuggestions && (
        <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-blue-900">
                AI prijedlozi iz PDF-a
              </h4>
              <p className="text-xs text-blue-700/80">
                Pregled prepoznatih vrijednosti i prijedloga povezivanja. Možete
                privremeno isključiti AI prijedloge za ručne izmjene.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-blue-800">
                <Switch checked={aiApplied} onCheckedChange={handleAiToggle} />
                <span>
                  {aiApplied
                    ? "AI vrijednosti aktivne"
                    : "AI vrijednosti isključene"}
                </span>
              </div>
              <Badge
                variant="outline"
                className="border-blue-200 text-blue-800"
              >
                Eksperimentalno
              </Badge>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-blue-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-blue-100 text-xs uppercase tracking-wide text-blue-900">
                <tr>
                  <th className="px-4 py-2 text-left">Polje</th>
                  <th className="px-4 py-2 text-left">Prepoznato</th>
                  <th className="px-4 py-2 text-left">U sustavu</th>
                  <th className="px-4 py-2 text-left">Povjerenje</th>
                </tr>
              </thead>
              <tbody>
                {detectedValues.map((row) => {
                  const badgeClass = formatConfidenceBadgeClass(row.confidence);
                  const badgeLabel = formatConfidenceLabel(row.confidence);
                  return (
                    <tr key={row.label} className="border-t border-blue-100">
                      <td className="px-4 py-2 font-medium text-blue-900">
                        {row.label}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {row.value || "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {row.matched || "—"}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}
                        >
                          {badgeLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SuggestionCard
              title="Nekretnina"
              primary={aiSuggestions.nekretnina?.naziv || "Nije prepoznato"}
              secondary={aiSuggestions.nekretnina?.adresa}
              matched={matchedProperty?.naziv}
              actionLabel={
                propertySelected
                  ? "Nekretnina povezana"
                  : matchedProperty
                    ? "Poveži s pronađenom"
                    : "Kreiraj nekretninu"
              }
              loading={quickCreateLoading.property}
              disabled={propertySelected}
              helperText={
                propertySelected
                  ? selectedProperty
                    ? `Povezano: ${
                        selectedProperty.naziv || selectedProperty.adresa
                      }. Uređivanje je moguće u koraku "Povezivanje".`
                    : "Nekretnina je već povezana s dokumentom."
                  : null
              }
              onAction={() => {
                if (propertySelected) {
                  return;
                }
                if (matchedProperty) {
                  setFormData((prev) => ({
                    ...prev,
                    nekretnina_id: matchedProperty.id,
                  }));
                } else {
                  handleCreatePropertyFromAI();
                }
              }}
              secondaryActionLabel={
                !propertySelected && !matchedProperty
                  ? "Odaberi postojeću"
                  : null
              }
              onSecondaryAction={() => setShowPropertySelect(true)}
            />
            {allowsTenant && (
              <SuggestionCard
                title="Zakupnik"
                primary={
                  aiSuggestions.zakupnik?.naziv_firme ||
                  aiSuggestions.zakupnik?.ime_prezime ||
                  "Nije prepoznato"
                }
                secondary={
                  aiSuggestions.zakupnik?.oib
                    ? `OIB: ${aiSuggestions.zakupnik.oib}`
                    : null
                }
                matched={
                  matchedTenant?.naziv_firme ||
                  matchedTenant?.ime_prezime ||
                  null
                }
                actionLabel={
                  tenantSelected
                    ? "Zakupnik povezan"
                    : matchedTenant
                      ? "Poveži s pronađenim"
                      : "Kreiraj zakupnika"
                }
                loading={quickCreateLoading.tenant}
                disabled={tenantSelected}
                helperText={
                  tenantSelected
                    ? selectedTenant
                      ? `Povezano: ${
                          selectedTenant.naziv_firme ||
                          selectedTenant.ime_prezime
                        }. Uređivanje je moguće u koraku "Povezivanje".`
                      : "Zakupnik je već povezan s dokumentom."
                    : null
                }
                onAction={() => {
                  if (tenantSelected) {
                    return;
                  }
                  if (matchedTenant) {
                    setFormData((prev) => ({
                      ...prev,
                      zakupnik_id: matchedTenant.id,
                    }));
                  } else {
                    handleCreateTenantFromAI();
                  }
                }}
              />
            )}
            {allowsPropertyUnit && (
              <SuggestionCard
                title="Jedinica"
                primary={
                  propertyUnitSuggestion?.oznaka ||
                  propertyUnitSuggestion?.naziv ||
                  "Nije prepoznato"
                }
                secondary={
                  propertyUnitSuggestion?.kat
                    ? `Kat / zona: ${propertyUnitSuggestion.kat}`
                    : null
                }
                matched={selectedUnitLabel}
                actionLabel={
                  propertyUnitSelected
                    ? "Jedinica povezana"
                    : propertyUnitSuggestion
                      ? "Primijeni prijedlog"
                      : "Dodaj ručno"
                }
                loading={quickCreateLoading.unit}
                disabled={propertyUnitSelected}
                helperText={(() => {
                  if (propertyUnitSelected) {
                    return selectedUnitLabel
                      ? `Povezano: ${selectedUnitLabel}. Uređivanje je moguće u koraku "Povezivanje".`
                      : "Jedinica je povezana s dokumentom.";
                  }
                  if (!propertyUnitLinked) {
                    return "Prvo povežite ili kreirajte nekretninu.";
                  }
                  if (!propertyUnitSuggestion) {
                    return "AI nije prepoznao jedinicu – možete ga unijeti ručno.";
                  }
                  return null;
                })()}
                onAction={() => {
                  if (propertyUnitSelected) {
                    return;
                  }
                  if (!propertyUnitLinked) {
                    openManualUnitForm({ reset: true });
                    return;
                  }
                  if (propertyUnitSuggestion) {
                    handleApplyUnitSuggestion();
                  } else {
                    openManualUnitForm({ reset: true });
                  }
                }}
                secondaryActionLabel={
                  !propertyUnitSelected && propertyUnitSuggestion
                    ? "Unesi ručno"
                    : null
                }
                onSecondaryAction={() => {
                  openManualUnitForm({
                    prefill: propertyUnitSuggestion,
                    reset: true,
                  });
                }}
                secondaryDisabled={propertyUnitSelected || !propertyUnitLinked}
              />
            )}
            {allowsContract && (
              <SuggestionCard
                title="Ugovor"
                primary={
                  aiSuggestions.ugovor?.interna_oznaka || "Nije prepoznato"
                }
                secondary={
                  aiSuggestions.ugovor?.datum_pocetka &&
                  aiSuggestions.ugovor?.datum_zavrsetka
                    ? `${aiSuggestions.ugovor.datum_pocetka} – ${aiSuggestions.ugovor.datum_zavrsetka}`
                    : null
                }
                matched={matchedContract?.interna_oznaka}
                actionLabel={
                  contractSelected
                    ? "Ugovor povezan"
                    : matchedContract
                      ? "Poveži s pronađenim"
                      : "Kreiraj ugovor"
                }
                loading={quickCreateLoading.contract}
                disabled={
                  contractSelected ||
                  (!matchedContract && !canAutoCreateContract)
                }
                helperText={(() => {
                  if (contractSelected) {
                    return selectedContract
                      ? `Povezano: ${selectedContract.interna_oznaka}.`
                      : "Ugovor je već povezan s dokumentom.";
                  }
                  if (!formData.nekretnina_id) {
                    return "Prvo povežite nekretninu.";
                  }
                  if (activeRequirements.allowTenant && !formData.zakupnik_id) {
                    return "Povežite zakupnika kako biste kreirali ugovor.";
                  }
                  if (allowsPropertyUnit && !formData.property_unit_id) {
                    return "Povežite jedinicu prije kreiranja ugovora.";
                  }
                  if (!matchedContract && !hasAiContract) {
                    return "AI nije prepoznao detalje ugovora.";
                  }
                  return null;
                })()}
                onAction={() => {
                  if (contractSelected) {
                    return;
                  }
                  if (matchedContract) {
                    setFormData((prev) => ({
                      ...prev,
                      ugovor_id: matchedContract.id,
                    }));
                  } else {
                    handleCreateContractFromAI();
                  }
                }}
              />
            )}
          </div>

          {matchedPropertyUnit && (
            <div className="rounded-md border border-blue-200 bg-white p-3 text-sm text-blue-900">
              Povezana jedinica:{" "}
              <strong>
                {matchedPropertyUnit.oznaka || matchedPropertyUnit.naziv}
              </strong>
            </div>
          )}
        </div>
      )}

      <CommandDialog
        open={showPropertySelect}
        onOpenChange={setShowPropertySelect}
      >
        <CommandInput placeholder="Pretraži nekretnine..." />
        <CommandList>
          <CommandEmpty>Nema rezultata.</CommandEmpty>
          <CommandGroup heading="Nekretnine">
            {nekretnine.map((property) => (
              <CommandItem
                key={property.id}
                value={`${property.naziv} ${property.adresa}`}
                onSelect={() => {
                  setFormData((prev) => ({
                    ...prev,
                    nekretnina_id: property.id,
                  }));
                  setShowPropertySelect(false);
                }}
              >
                <div className="flex flex-col">
                  <span className="font-medium">{property.naziv}</span>
                  <span className="text-xs text-muted-foreground">
                    {property.adresa}
                  </span>
                </div>
                {formData.nekretnina_id === property.id && (
                  <Check className="ml-auto h-4 w-4" />
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
};

const SuggestionCard = ({
  title,
  primary,
  secondary,
  matched,
  actionLabel,
  loading,
  onAction,
  disabled = false,
  helperText = null,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryDisabled = false,
}) => (
  <div className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
          {title}
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{primary}</p>
        {secondary && (
          <p className="text-xs text-muted-foreground/80">{secondary}</p>
        )}
        {matched && (
          <p className="mt-2 text-xs text-green-700">
            Podudaranje u sustavu: <strong>{matched}</strong>
          </p>
        )}
        {helperText && (
          <p className="mt-2 text-xs text-amber-600">{helperText}</p>
        )}
      </div>
      <Badge
        variant="outline"
        className="border-blue-200 bg-blue-50 text-blue-700"
      >
        AI
      </Badge>
    </div>
    <div className="mt-4 grid gap-2">
      <Button
        type="button"
        className="w-full"
        variant={matched ? "outline" : "default"}
        onClick={onAction}
        disabled={loading || disabled}
      >
        {loading ? "Spremam..." : actionLabel}
      </Button>
      {secondaryActionLabel && onSecondaryAction && (
        <Button
          type="button"
          className="w-full"
          variant="outline"
          onClick={onSecondaryAction}
          disabled={loading || secondaryDisabled}
        >
          {secondaryActionLabel}
        </Button>
      )}
    </div>
  </div>
);

export default UploadStep;
