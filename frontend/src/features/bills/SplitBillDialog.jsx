import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Calculator, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import { api, getErrorMessage } from "../../shared/api";
import { toast } from "../../components/ui/sonner";
import { formatCurrency } from "../../shared/formatters";

/**
 * Split a master utility bill into per-unit child bills.
 *
 * Flow:
 *   1. User picks units to allocate across.
 *   2. User picks method (po_m2, po_jedinici, custom_percent, manual_amount).
 *   3. For percent/manual modes, user fills value per unit.
 *   4. "Izračunaj" calls /split-preview → live breakdown.
 *   5. "Potvrdi podjelu" calls /split → child bills are materialised.
 *
 * The dialog deliberately does both preview and apply through the same
 * inputs so the user always sees what's about to happen before committing.
 */
const METHODS = [
  { value: "po_m2", label: "Po površini (m²)", needsValues: false },
  { value: "po_jedinici", label: "Jednako po jedinicama", needsValues: false },
  { value: "custom_percent", label: "Po postocima (%)", needsValues: true },
  { value: "manual_amount", label: "Ručno po iznosu (€)", needsValues: true },
];

const SplitBillDialog = ({ open, onOpenChange, masterBill, onSplitDone }) => {
  const [units, setUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState([]);
  const [method, setMethod] = useState("po_m2");
  const [values, setValues] = useState({}); // unit_id → number
  const [preview, setPreview] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const methodMeta = METHODS.find((m) => m.value === method);

  // Load units for the master bill's nekretnina when the dialog opens.
  useEffect(() => {
    if (!open || !masterBill?.nekretnina_id) return;
    let cancelled = false;
    setLoadingUnits(true);
    api
      .getUnitsForProperty(masterBill.nekretnina_id)
      .then((res) => {
        if (cancelled) return;
        setUnits(res.data || []);
        // Pre-select all units by default — most common case is "split
        // across every unit in the building".
        setSelectedUnitIds((res.data || []).map((u) => u.id));
      })
      .catch(() => {
        if (!cancelled) toast.error("Neuspješno učitavanje jedinica.");
      })
      .finally(() => {
        if (!cancelled) setLoadingUnits(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, masterBill?.nekretnina_id]);

  // Reset preview when the inputs change — old breakdown would be stale.
  useEffect(() => {
    setPreview(null);
  }, [method, selectedUnitIds, values]);

  const toggleUnit = (id) => {
    setSelectedUnitIds((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id],
    );
  };

  const buildValuesArray = () =>
    selectedUnitIds.map((id) => Number(values[id] || 0));

  const handlePreview = async () => {
    if (!selectedUnitIds.length) {
      toast.error("Odaberite barem jednu jedinicu.");
      return;
    }
    setCalculating(true);
    try {
      const body = {
        method,
        unit_ids: selectedUnitIds,
        values: methodMeta?.needsValues ? buildValuesArray() : undefined,
      };
      const res = await api.previewBillSplit(masterBill.id, body);
      setPreview(res.data);
    } catch (err) {
      toast.error(getErrorMessage(err) || "Greška pri izračunu.");
    } finally {
      setCalculating(false);
    }
  };

  const handleSplit = async () => {
    if (!preview) {
      toast.error("Prvo izračunajte podjelu pa potvrdite.");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        method,
        unit_ids: selectedUnitIds,
        values: methodMeta?.needsValues ? buildValuesArray() : undefined,
      };
      await api.splitBill(masterBill.id, body);
      toast.success(`Račun podijeljen na ${preview.breakdown.length} podračun(a).`);
      onSplitDone?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err) || "Greška pri podjeli.");
    } finally {
      setSubmitting(false);
    }
  };

  const masterAmount = Number(masterBill?.iznos || 0);
  const previewTotal = preview ? Number(preview.total) : null;
  const totalsMatch =
    previewTotal !== null && Math.abs(previewTotal - masterAmount) < 0.01;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Podijeli račun na jedinice
          </DialogTitle>
          <DialogDescription>
            Master račun:{" "}
            <strong>{masterBill?.broj_racuna || "—"}</strong> ·{" "}
            {formatCurrency(masterAmount)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Način podjele</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              Jedinice ({selectedUnitIds.length} odabrano od {units.length})
            </Label>
            {loadingUnits ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : units.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                Ova nekretnina nema definirane jedinice — kreiraj ih prije podjele.
              </div>
            ) : (
              <div className="rounded-md border max-h-64 overflow-y-auto divide-y">
                {units.map((u) => {
                  const checked = selectedUnitIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={checked}
                        onChange={() => toggleUnit(u.id)}
                      />
                      <div className="flex-1 text-sm">
                        <div className="font-medium">
                          {u.oznaka || u.naziv}
                          {u.povrsina_m2 ? (
                            <span className="text-muted-foreground ml-2 text-xs">
                              {u.povrsina_m2} m²
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {checked && methodMeta?.needsValues && (
                        <Input
                          type="number"
                          step="0.01"
                          className="w-28 h-9"
                          placeholder={
                            method === "custom_percent" ? "%" : "€"
                          }
                          value={values[u.id] ?? ""}
                          onChange={(e) =>
                            setValues((prev) => ({
                              ...prev,
                              [u.id]: e.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {preview && (
            <div className="rounded-md border bg-muted/20 p-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase">
                Pregled podjele
              </div>
              {preview.breakdown.map((b) => (
                <div
                  key={b.unit_id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex-1">
                    <div className="font-medium">{b.unit_label}</div>
                    {b.zakupnik_label ? (
                      <div className="text-xs text-muted-foreground">
                        Zakupnik: {b.zakupnik_label}
                      </div>
                    ) : (
                      <div className="text-xs text-amber-700">
                        Bez aktivnog ugovora — terminat će vlasnik snositi
                      </div>
                    )}
                  </div>
                  <div className="font-mono font-medium">
                    {formatCurrency(b.amount)}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2 mt-2 text-sm">
                <span className="font-medium">Ukupno</span>
                <span
                  className={`font-mono font-bold ${
                    totalsMatch ? "text-emerald-700" : "text-destructive"
                  }`}
                >
                  {formatCurrency(previewTotal)}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Odustani
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handlePreview}
            disabled={calculating || submitting || !selectedUnitIds.length}
          >
            {calculating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Izračunaj
          </Button>
          <Button
            type="button"
            onClick={handleSplit}
            disabled={!preview || !totalsMatch || submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Potvrdi podjelu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SplitBillDialog;
