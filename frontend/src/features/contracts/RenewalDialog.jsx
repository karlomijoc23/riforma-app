import React, { useState, useCallback } from "react";
import { api, getErrorMessage } from "../../shared/api";
import { toast } from "../../components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Separator } from "../../components/ui/separator";
import { formatCurrency, formatContractDate } from "../../shared/formatters";
import { TrendingUp, Calendar, ArrowRight, RefreshCw, Eye } from "lucide-react";

const RenewalDialog = ({ contract, open, onOpenChange, onSuccess }) => {
  const [trajanje, setTrajanje] = useState(12);
  const [eskalacija, setEskalacija] = useState(() => {
    // Try to extract a default percentage from formula_indeksacije
    if (contract?.formula_indeksacije) {
      const match = contract.formula_indeksacije.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (match) {
        return parseFloat(match[1].replace(",", "."));
      }
    }
    return 0;
  });

  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handlePreview = useCallback(async () => {
    if (!contract?.id) return;
    setLoadingPreview(true);
    try {
      const res = await api.previewEscalation(contract.id, {
        postotak: eskalacija,
        trajanje_mjeseci: trajanje,
      });
      setPreview(res.data);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoadingPreview(false);
    }
  }, [contract?.id, eskalacija, trajanje]);

  const handleRenew = async () => {
    if (!contract?.id) return;
    setSubmitting(true);
    try {
      await api.renewUgovor(contract.id, {
        trajanje_mjeseci: trajanje,
        eskalacija_postotak: eskalacija,
      });
      toast.success("Ugovor je uspješno produžen");
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  // Reset state when dialog opens/closes
  const handleOpenChange = (isOpen) => {
    if (!isOpen) {
      setPreview(null);
    }
    onOpenChange(isOpen);
  };

  if (!contract) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Produži ugovor
          </DialogTitle>
          <DialogDescription>
            Kreirajte novi ugovor na temelju postojećeg s opcionalnim povećanjem
            zakupnine.
          </DialogDescription>
        </DialogHeader>

        {/* Current contract summary */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Trenutni ugovor
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground block text-xs">
                Oznaka
              </span>
              <span className="font-medium font-mono">
                {contract.interna_oznaka}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">
                Zakupnina
              </span>
              <span className="font-medium">
                {formatCurrency(contract.osnovna_zakupnina)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">
                Početak
              </span>
              <span>{formatContractDate(contract.datum_pocetka)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">
                Završetak
              </span>
              <span>{formatContractDate(contract.datum_zavrsetka)}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Renewal form */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Parametri produljenja
          </h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="trajanje">Trajanje (mjeseci)</Label>
              <Input
                id="trajanje"
                type="number"
                min={1}
                max={120}
                value={trajanje}
                onChange={(e) => {
                  setTrajanje(parseInt(e.target.value) || 1);
                  setPreview(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eskalacija">Eskalacija (%)</Label>
              <Input
                id="eskalacija"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={eskalacija}
                onChange={(e) => {
                  setEskalacija(parseFloat(e.target.value) || 0);
                  setPreview(null);
                }}
              />
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={handlePreview}
            disabled={loadingPreview}
          >
            <Eye className="mr-2 h-4 w-4" />
            {loadingPreview ? "Izračunavam..." : "Pregled"}
          </Button>
        </div>

        {/* Preview results */}
        {preview && (
          <>
            <Separator />
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Pregled novog ugovora
              </h4>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs mb-1">
                    Trenutna zakupnina
                  </span>
                  <span className="font-medium">
                    {formatCurrency(preview.trenutna_zakupnina)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-1">
                    Nova zakupnina
                  </span>
                  <span className="font-bold text-primary text-base">
                    {formatCurrency(preview.nova_zakupnina)}
                  </span>
                  {preview.razlika > 0 && (
                    <span className="text-xs text-emerald-600 ml-1.5">
                      +{preview.postotak}%
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm pt-1">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{formatContractDate(preview.novi_datum_pocetka)}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">
                  {formatContractDate(preview.novi_datum_zavrsetka)}
                </span>
                <span className="text-muted-foreground">
                  ({preview.trajanje_mjeseci} mj.)
                </span>
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Odustani
          </Button>
          <Button onClick={handleRenew} disabled={submitting}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${submitting ? "animate-spin" : ""}`}
            />
            {submitting ? "Produljivanje..." : "Produži ugovor"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RenewalDialog;
