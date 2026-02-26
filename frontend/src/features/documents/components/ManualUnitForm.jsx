import React from "react";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { useDocumentWizard } from "../DocumentWizard";

const ManualUnitForm = () => {
  const {
    manualUnitForm,
    setManualUnitForm,
    manualUnitErrors,
    setManualUnitErrors,
    manualUnitStatusOptions,
    handleManualUnitSubmit,
    setShowManualUnitForm,
    quickCreateLoading,
  } = useDocumentWizard();

  const handleFieldChange = (field, value) => {
    setManualUnitForm((prev) => ({ ...prev, [field]: value }));
    if (manualUnitErrors[field]) {
      setManualUnitErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-white p-4 shadow-sm">
      <h4 className="text-sm font-semibold text-foreground">Nova jedinica</h4>
      <p className="text-xs text-muted-foreground">
        Unesite osnovne informacije kako biste spremili novu jedinicu u odabranu
        nekretninu.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="manual-unit-oznaka">Oznaka *</Label>
          <Input
            id="manual-unit-oznaka"
            value={manualUnitForm.oznaka}
            onChange={(event) =>
              handleFieldChange("oznaka", event.target.value)
            }
            placeholder="npr. A-101"
          />
          {manualUnitErrors.oznaka && (
            <p className="text-xs text-destructive">
              {manualUnitErrors.oznaka}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="manual-unit-naziv">Naziv</Label>
          <Input
            id="manual-unit-naziv"
            value={manualUnitForm.naziv}
            onChange={(event) => handleFieldChange("naziv", event.target.value)}
            placeholder="npr. Ured A-101"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="manual-unit-kat">Kat / zona</Label>
          <Input
            id="manual-unit-kat"
            value={manualUnitForm.kat}
            onChange={(event) => handleFieldChange("kat", event.target.value)}
            placeholder="npr. Kat 2"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="manual-unit-povrsina">Površina (m²)</Label>
          <Input
            id="manual-unit-povrsina"
            type="number"
            step="0.01"
            value={manualUnitForm.povrsina_m2}
            onChange={(event) =>
              handleFieldChange("povrsina_m2", event.target.value)
            }
            placeholder="npr. 125"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="manual-unit-status">Status</Label>
          <Select
            value={manualUnitForm.status}
            onValueChange={(value) => handleFieldChange("status", value)}
          >
            <SelectTrigger id="manual-unit-status">
              <SelectValue placeholder="Odaberite status" />
            </SelectTrigger>
            <SelectContent>
              {manualUnitStatusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="manual-unit-zakupnina">Osnovna zakupnina (€)</Label>
          <Input
            id="manual-unit-zakupnina"
            type="number"
            step="0.01"
            value={manualUnitForm.osnovna_zakupnina}
            onChange={(event) =>
              handleFieldChange("osnovna_zakupnina", event.target.value)
            }
            placeholder="npr. 1500"
          />
        </div>
        <div className="md:col-span-2 space-y-1">
          <Label htmlFor="manual-unit-napomena">Napomena</Label>
          <Textarea
            id="manual-unit-napomena"
            rows={3}
            value={manualUnitForm.napomena}
            onChange={(event) =>
              handleFieldChange("napomena", event.target.value)
            }
            placeholder="Dodatne informacije ili posebnosti prostora"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button
          type="button"
          onClick={handleManualUnitSubmit}
          disabled={quickCreateLoading.unit}
        >
          {quickCreateLoading.unit ? "Spremam..." : "Spremi jedinicu"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowManualUnitForm(false)}
          disabled={quickCreateLoading.unit}
        >
          Odustani
        </Button>
      </div>
    </div>
  );
};

export default ManualUnitForm;
