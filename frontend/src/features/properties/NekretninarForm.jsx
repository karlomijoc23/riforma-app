import React, { useState, useMemo } from "react";
import { Label } from "../../components/ui/label";
import { useNavigate } from "react-router-dom";
import { toast } from "../../components/ui/sonner";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Checkbox } from "../../components/ui/checkbox";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Trash2,
  Plus,
  Loader2,
  MoreVertical,
  FileText,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import {
  UNIT_STATUS_CONFIG,
  sortUnitsByPosition,
  getUnitDisplayName,
  getUnitStatusBadgeClass,
  formatUnitStatus,
} from "../../shared/units";
import { parseNumericValue, parseSmartNumber } from "../../shared/formatters";
import { api } from "../../shared/api";

const NekretninarForm = ({
  nekretnina,
  onSubmit,
  onCancel,
  existingUnits = [],
  submitting = false,
}) => {
  const [formData, setFormData] = useState({
    naziv: nekretnina?.naziv || "",
    adresa: nekretnina?.adresa || "",
    katastarska_opcina: nekretnina?.katastarska_opcina || "",
    broj_kat_cestice: nekretnina?.broj_kat_cestice || "",
    vrsta: nekretnina?.vrsta || "stan",
    povrsina: nekretnina?.povrsina || "",
    godina_izgradnje: nekretnina?.godina_izgradnje || "",
    vlasnik: nekretnina?.vlasnik || "",
    udio_vlasnistva: nekretnina?.udio_vlasnistva || "",
    nabavna_cijena: nekretnina?.nabavna_cijena || "",
    trzisna_vrijednost: nekretnina?.trzisna_vrijednost || "",
    prosllogodisnji_prihodi: nekretnina?.prosllogodisnji_prihodi || "",
    prosllogodisnji_rashodi: nekretnina?.prosllogodisnji_rashodi || "",
    amortizacija: nekretnina?.amortizacija || "",
    proslogodisnji_neto_prihod: nekretnina?.neto_prihod || "",
    zadnja_obnova: nekretnina?.zadnja_obnova || "",
    potrebna_ulaganja: nekretnina?.potrebna_ulaganja || "",
    troskovi_odrzavanja: nekretnina?.troskovi_odrzavanja || "",
    osiguranje: nekretnina?.osiguranje || "",
    sudski_sporovi: nekretnina?.sudski_sporovi || "",
    hipoteke: nekretnina?.hipoteke || "",
    napomene: nekretnina?.napomene || "",
    financijska_povijest: nekretnina?.financijska_povijest || [],
    has_parking: nekretnina?.has_parking || false,
  });
  const [units, setUnits] = useState([]);
  const [deletedUnitIds, setDeletedUnitIds] = useState([]);
  const [activeContracts, setActiveContracts] = useState([]);
  const [unitToDelete, setUnitToDelete] = useState(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    const fetchContracts = async () => {
      if (nekretnina?.id) {
        try {
          const res = await api.getUgovori({ nekretnina_id: nekretnina.id });
          setActiveContracts(
            res.data?.filter((c) => c.status === "aktivno") || [],
          );
        } catch (error) {
          console.error("Failed to fetch contracts for unit mapping", error);
        }
      }
    };
    fetchContracts();
  }, [nekretnina?.id]);

  // Initialize units from existingUnits when they load
  React.useEffect(() => {
    if (existingUnits && existingUnits.length > 0 && units.length === 0) {
      setUnits(
        existingUnits.map((u) => ({
          ...u,
          localId: u.id, // Use real ID as local ID for existing
          isExisting: true,
          // Ensure numeric values are strings for inputs
          povrsina_m2: u.povrsina_m2?.toString() || "",
          osnovna_zakupnina: u.osnovna_zakupnina?.toString() || "",
        })),
      );
    }
  }, [existingUnits]);
  // Calculate total area from units
  React.useEffect(() => {
    if (units.length > 0) {
      const totalArea = units.reduce((sum, unit) => {
        const area = parseFloat(unit.povrsina_m2) || 0;
        return sum + area;
      }, 0);

      // Only update if different to avoid loops, and format to 2 decimals
      const formattedArea = totalArea.toFixed(2);
      // Check if we need to update (compare as numbers to avoid string format diffs)
      if (Math.abs(parseFloat(formData.povrsina || 0) - totalArea) > 0.01) {
        setFormData((prev) => ({ ...prev, povrsina: formattedArea }));
      }
    }
  }, [units, formData.povrsina]);

  // Auto-calculate Net Income (Prihod - Rashod + Amortizacija)
  React.useEffect(() => {
    const prihodi = parseSmartNumber(formData.prosllogodisnji_prihodi);
    const rashodi = parseSmartNumber(formData.prosllogodisnji_rashodi);
    const amortizacija = parseSmartNumber(formData.amortizacija);

    // Only update if at least one value is set to avoid overwriting existing data with 0s unnecessarily
    // or if the user is actively editing.
    // Formula: Income - Expenses + Amortization
    const calculatedNet = (prihodi - rashodi + amortizacija).toFixed(2);

    // Update if changed
    if (formData.proslogodisnji_neto_prihod !== calculatedNet) {
      // Only update if strictly driven by inputs.
      // Issue: if we load existing data, this might overwrite it if the formula wasn't used before.
      // But the user WANTS this formula.
      setFormData((prev) => ({
        ...prev,
        proslogodisnji_neto_prihod: calculatedNet,
      }));
    }
  }, [
    formData.prosllogodisnji_prihodi,
    formData.prosllogodisnji_rashodi,
    formData.amortizacija,
  ]);

  const isEditing = Boolean(nekretnina);
  const unitStatusOptions = useMemo(
    () =>
      Object.entries(UNIT_STATUS_CONFIG).map(([value, config]) => ({
        value,
        label: config.label,
      })),
    [],
  );
  const existingUnitsList = useMemo(
    () => sortUnitsByPosition(existingUnits || []),
    [existingUnits],
  );

  const createDraftUnit = () => ({
    localId: `new-${Date.now()}-${Math.random()}`,
    oznaka: "",
    naziv: "",
    kat: "",
    povrsina_m2: "",
    status: "dostupno",
    osnovna_zakupnina: "",
    napomena: "",
    isExisting: false,
  });

  const handleAddUnit = () => {
    setUnits((prev) => [...prev, createDraftUnit()]);
  };

  const handleRemoveUnit = (localId, isExisting) => {
    if (isExisting) {
      setDeletedUnitIds((prev) => [...prev, localId]);
    }
    setUnits((prev) => prev.filter((unit) => unit.localId !== localId));
  };

  const handleUpdateUnit = (localId, field, value) => {
    setUnits((prev) =>
      prev.map((unit) =>
        unit.localId === localId ? { ...unit, [field]: value } : unit,
      ),
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) {
      return;
    }

    if (!formData.naziv?.trim()) {
      toast.error("Naziv nekretnine je obavezan");
      return;
    }

    if (formData.povrsina && isNaN(parseFloat(formData.povrsina))) {
      toast.error("Površina mora biti broj");
      return;
    }

    const data = {
      ...formData,
      povrsina: parseFloat(formData.povrsina) || 0,
      godina_izgradnje: formData.godina_izgradnje
        ? parseInt(formData.godina_izgradnje)
        : null,
      nabavna_cijena: formData.nabavna_cijena
        ? parseFloat(formData.nabavna_cijena)
        : null,
      trzisna_vrijednost: formData.trzisna_vrijednost
        ? parseFloat(formData.trzisna_vrijednost)
        : null,
      prosllogodisnji_prihodi: formData.prosllogodisnji_prihodi
        ? parseFloat(formData.prosllogodisnji_prihodi)
        : null,
      prosllogodisnji_rashodi: formData.prosllogodisnji_rashodi
        ? parseFloat(formData.prosllogodisnji_rashodi)
        : null,
      amortizacija: formData.amortizacija
        ? parseFloat(formData.amortizacija)
        : null,
      neto_prihod: formData.proslogodisnji_neto_prihod
        ? parseFloat(formData.proslogodisnji_neto_prihod)
        : null,
      troskovi_odrzavanja: formData.troskovi_odrzavanja
        ? parseFloat(formData.troskovi_odrzavanja)
        : null,
      zadnja_obnova: formData.zadnja_obnova || null,
    };
    // Validate units
    const validUnits = units.filter(
      (unit) =>
        (unit.oznaka && unit.oznaka.trim()) ||
        (unit.naziv && unit.naziv.trim()),
    );

    const invalidUnits = validUnits.filter(
      (unit) => !unit.oznaka || !unit.oznaka.trim(),
    );

    if (invalidUnits.length > 0) {
      toast.error("Sve jedinice moraju imati oznaku (identifikator).");
      return;
    }

    const preparedUnits = validUnits.map((unit) => ({
      id: unit.isExisting ? unit.localId : undefined, // Include ID for existing units
      oznaka: unit.oznaka.trim(),
      naziv: unit.naziv?.trim() || null,
      kat: unit.kat?.trim() || null,
      povrsina_m2: unit.povrsina_m2
        ? parseNumericValue(unit.povrsina_m2)
        : null,
      status: unit.status || "dostupno",
      osnovna_zakupnina: unit.osnovna_zakupnina
        ? parseNumericValue(unit.osnovna_zakupnina)
        : null,
      napomena: unit.napomena?.trim() || null,
    }));

    await onSubmit({
      nekretnina: data,
      units: preparedUnits,
      deletedUnitIds,
      imageFile: formData.selectedImage,
    });
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="space-y-4"
        data-testid="nekretnina-form"
      >
        <Tabs defaultValue="osnovni" className="w-full">
          <TabsList className="grid w-full grid-cols-3 md:grid-cols-5">
            <TabsTrigger value="osnovni">Osnovni podaci</TabsTrigger>
            <TabsTrigger value="financije">Financije</TabsTrigger>
            <TabsTrigger value="odrzavanje">Održavanje</TabsTrigger>
            <TabsTrigger value="rizici">Rizici</TabsTrigger>
            <TabsTrigger value="units">Jedinice</TabsTrigger>
          </TabsList>

          <TabsContent value="osnovni" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="naziv">Naziv nekretnine *</Label>
                <Input
                  id="naziv"
                  value={formData.naziv}
                  onChange={(e) =>
                    setFormData({ ...formData, naziv: e.target.value })
                  }
                  data-testid="nekretnina-naziv-input"
                  required
                />
              </div>
              <div>
                <Label htmlFor="vrsta">Vrsta nekretnine *</Label>
                <Select
                  value={formData.vrsta}
                  onValueChange={(value) =>
                    setFormData({ ...formData, vrsta: value })
                  }
                >
                  <SelectTrigger data-testid="nekretnina-vrsta-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="poslovna_zgrada">
                      Poslovna zgrada
                    </SelectItem>
                    <SelectItem value="stan">Stan</SelectItem>
                    <SelectItem value="zemljiste">Zemljište</SelectItem>
                    <SelectItem value="ostalo">Ostalo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="slika">Slika nekretnine</Label>
              <Input
                id="slika"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
                    if (file.size > MAX_SIZE) {
                      toast.error(
                        `Datoteka je prevelika (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimalna veličina je 5 MB.`,
                      );
                      e.target.value = "";
                      return;
                    }
                    setFormData({ ...formData, selectedImage: file });
                  }
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Preporučena veličina: 800x600px. Max 5MB.
              </p>
            </div>

            <div>
              <Label htmlFor="adresa">Adresa *</Label>
              <Input
                id="adresa"
                value={formData.adresa}
                onChange={(e) =>
                  setFormData({ ...formData, adresa: e.target.value })
                }
                data-testid="nekretnina-adresa-input"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="katastarska_opcina">Katastarska općina *</Label>
                <Input
                  id="katastarska_opcina"
                  value={formData.katastarska_opcina}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      katastarska_opcina: e.target.value,
                    })
                  }
                  data-testid="nekretnina-ko-input"
                  required
                />
              </div>
              <div>
                <Label htmlFor="broj_kat_cestice">Broj kat. čestice *</Label>
                <Input
                  id="broj_kat_cestice"
                  value={formData.broj_kat_cestice}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      broj_kat_cestice: e.target.value,
                    })
                  }
                  data-testid="nekretnina-cestica-input"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="povrsina">Površina (m²) *</Label>
                <Input
                  id="povrsina"
                  type="number"
                  step="0.01"
                  value={formData.povrsina}
                  onChange={(e) =>
                    setFormData({ ...formData, povrsina: e.target.value })
                  }
                  data-testid="nekretnina-povrsina-input"
                  required
                />
              </div>
              <div>
                <Label htmlFor="godina_izgradnje">Godina izgradnje</Label>
                <Input
                  id="godina_izgradnje"
                  type="number"
                  value={formData.godina_izgradnje}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      godina_izgradnje: e.target.value,
                    })
                  }
                  data-testid="nekretnina-godina-input"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="has_parking"
                checked={formData.has_parking}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, has_parking: checked })
                }
              />
              <Label htmlFor="has_parking" className="cursor-pointer">
                Ova nekretnina ima garažu/parking
              </Label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="vlasnik">Vlasnik *</Label>
                <Input
                  id="vlasnik"
                  value={formData.vlasnik}
                  onChange={(e) =>
                    setFormData({ ...formData, vlasnik: e.target.value })
                  }
                  data-testid="nekretnina-vlasnik-input"
                  required
                />
              </div>
              <div>
                <Label htmlFor="udio_vlasnistva">Udio vlasništva *</Label>
                <Input
                  id="udio_vlasnistva"
                  value={formData.udio_vlasnistva}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      udio_vlasnistva: e.target.value,
                    })
                  }
                  data-testid="nekretnina-udio-input"
                  placeholder="npr. 1/1, 50%, itd."
                  required
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="financije" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nabavna_cijena">Nabavna cijena (€)</Label>
                <Input
                  id="nabavna_cijena"
                  type="number"
                  step="0.01"
                  value={formData.nabavna_cijena}
                  onChange={(e) =>
                    setFormData({ ...formData, nabavna_cijena: e.target.value })
                  }
                  data-testid="nekretnina-nabavna-input"
                />
              </div>
              <div>
                <Label htmlFor="trzisna_vrijednost">
                  Tržišna vrijednost (€)
                </Label>
                <Input
                  id="trzisna_vrijednost"
                  type="number"
                  step="0.01"
                  value={formData.trzisna_vrijednost}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      trzisna_vrijednost: e.target.value,
                    })
                  }
                  data-testid="nekretnina-trzisna-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="prosllogodisnji_prihodi">
                  Prošlogodišnji prihodi (€)
                </Label>
                <Input
                  id="prosllogodisnji_prihodi"
                  type="number"
                  step="0.01"
                  value={formData.prosllogodisnji_prihodi}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      prosllogodisnji_prihodi: e.target.value,
                    })
                  }
                  data-testid="nekretnina-prihodi-input"
                />
              </div>
              <div>
                <Label htmlFor="prosllogodisnji_rashodi">
                  Prošlogodišnji rashodi (€)
                </Label>
                <Input
                  id="prosllogodisnji_rashodi"
                  type="number"
                  step="0.01"
                  value={formData.prosllogodisnji_rashodi}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      prosllogodisnji_rashodi: e.target.value,
                    })
                  }
                  data-testid="nekretnina-rashodi-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="amortizacija">Amortizacija (€)</Label>
                <Input
                  id="amortizacija"
                  type="number"
                  step="0.01"
                  value={formData.amortizacija}
                  onChange={(e) =>
                    setFormData({ ...formData, amortizacija: e.target.value })
                  }
                  data-testid="nekretnina-amortizacija-input"
                />
              </div>
              <div>
                <Label htmlFor="proslogodisnji_neto_prihod">
                  Prošlogodišnji neto prihod (€)
                </Label>
                <Input
                  id="proslogodisnji_neto_prihod"
                  type="number"
                  step="0.01"
                  value={formData.proslogodisnji_neto_prihod}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      proslogodisnji_neto_prihod: e.target.value,
                    })
                  }
                  data-testid="nekretnina-neto-input"
                />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium">Povijest financija</h4>
              <p className="text-sm text-muted-foreground">
                Unesite podatke za prethodne godine.
              </p>

              {formData.financijska_povijest?.map((historyItem, index) => {
                const prihodi = parseSmartNumber(historyItem.prihodi);
                const rashodi = parseSmartNumber(historyItem.rashodi);
                const amortizacija = parseSmartNumber(historyItem.amortizacija);
                const neto = (prihodi - rashodi + amortizacija).toFixed(2);

                return (
                  <div
                    key={index}
                    className="grid grid-cols-5 gap-4 items-end border-b pb-4 last:border-0"
                  >
                    <div>
                      <Label>Godina</Label>
                      <Input
                        type="number"
                        value={historyItem.godina}
                        onChange={(e) => {
                          const newYear = parseInt(e.target.value) || 0;
                          const newHistory = [
                            ...(formData.financijska_povijest || []),
                          ];
                          newHistory[index] = {
                            ...newHistory[index],
                            godina: newYear,
                          };
                          setFormData({
                            ...formData,
                            financijska_povijest: newHistory,
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label>Prihodi (€)</Label>
                      <Input
                        type="number"
                        value={historyItem.prihodi}
                        onChange={(e) => {
                          const newHistory = [
                            ...(formData.financijska_povijest || []),
                          ];
                          newHistory[index] = {
                            ...newHistory[index],
                            prihodi: e.target.value,
                          };
                          setFormData({
                            ...formData,
                            financijska_povijest: newHistory,
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label>Rashodi (€)</Label>
                      <Input
                        type="number"
                        value={historyItem.rashodi}
                        onChange={(e) => {
                          const newHistory = [
                            ...(formData.financijska_povijest || []),
                          ];
                          newHistory[index] = {
                            ...newHistory[index],
                            rashodi: e.target.value,
                          };
                          setFormData({
                            ...formData,
                            financijska_povijest: newHistory,
                          });
                        }}
                      />
                    </div>
                    <div>
                      <Label>Amortizacija (€)</Label>
                      <Input
                        type="number"
                        value={historyItem.amortizacija || ""}
                        onChange={(e) => {
                          const newHistory = [
                            ...(formData.financijska_povijest || []),
                          ];
                          newHistory[index] = {
                            ...newHistory[index],
                            amortizacija: e.target.value,
                          };
                          setFormData({
                            ...formData,
                            financijska_povijest: newHistory,
                          });
                        }}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>Neto dobit (€)</Label>
                      <div className="flex h-10 w-full rounded-md border border-input bg-gray-50 px-3 py-2 text-sm ring-offset-background text-muted-foreground font-mono">
                        {neto}
                      </div>
                    </div>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const currentYear = new Date().getFullYear();
                  const newHistory = [...(formData.financijska_povijest || [])];
                  // Add next previous year
                  const lastYear =
                    newHistory.length > 0
                      ? Math.min(...newHistory.map((h) => h.godina))
                      : currentYear;
                  newHistory.push({
                    godina: lastYear - 1,
                    prihodi: "",
                    rashodi: "",
                    amortizacija: "",
                  });
                  setFormData({
                    ...formData,
                    financijska_povijest: newHistory,
                  });
                }}
              >
                + Dodaj godinu
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="odrzavanje" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="zadnja_obnova">Zadnja obnova</Label>
                <Input
                  id="zadnja_obnova"
                  type="date"
                  value={formData.zadnja_obnova}
                  onChange={(e) =>
                    setFormData({ ...formData, zadnja_obnova: e.target.value })
                  }
                  data-testid="nekretnina-obnova-input"
                />
              </div>
              <div>
                <Label htmlFor="troskovi_odrzavanja">
                  Troškovi održavanja (€)
                </Label>
                <Input
                  id="troskovi_odrzavanja"
                  type="number"
                  step="0.01"
                  value={formData.troskovi_odrzavanja}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      troskovi_odrzavanja: e.target.value,
                    })
                  }
                  data-testid="nekretnina-troskovi-input"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="potrebna_ulaganja">Potrebna ulaganja</Label>
              <Textarea
                id="potrebna_ulaganja"
                value={formData.potrebna_ulaganja}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    potrebna_ulaganja: e.target.value,
                  })
                }
                data-testid="nekretnina-ulaganja-input"
              />
            </div>

            <div>
              <Label htmlFor="osiguranje">Osiguranje</Label>
              <Input
                id="osiguranje"
                value={formData.osiguranje}
                onChange={(e) =>
                  setFormData({ ...formData, osiguranje: e.target.value })
                }
                data-testid="nekretnina-osiguranje-input"
              />
            </div>

            <div>
              <Label htmlFor="napomene">Napomene i brojila</Label>
              <Textarea
                id="napomene"
                value={formData.napomene}
                onChange={(e) =>
                  setFormData({ ...formData, napomene: e.target.value })
                }
                data-testid="nekretnina-napomene-input"
                rows={4}
                placeholder="Primjer: Struja – brojilo 12345; Voda – brojilo A44; Glavni ventil u ormaru L3; PIN za alarm 4321"
              />
              <p className="text-xs text-muted-foreground/80">
                Sačuvajte operativne napomene poput lokacija brojila, kodova,
                specifičnih procedura ili kontakata za održavanje.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="rizici" className="space-y-4">
            <div>
              <Label htmlFor="sudski_sporovi">Sudski sporovi</Label>
              <Textarea
                id="sudski_sporovi"
                value={formData.sudski_sporovi}
                onChange={(e) =>
                  setFormData({ ...formData, sudski_sporovi: e.target.value })
                }
                data-testid="nekretnina-sporovi-input"
              />
            </div>

            <div>
              <Label htmlFor="hipoteke">Hipoteke</Label>
              <Textarea
                id="hipoteke"
                value={formData.hipoteke}
                onChange={(e) =>
                  setFormData({ ...formData, hipoteke: e.target.value })
                }
                data-testid="nekretnina-hipoteke-input"
              />
            </div>

            <div>
              <Label htmlFor="napomene_rizici">Napomene</Label>
              <Textarea
                id="napomene_rizici"
                value={formData.napomene}
                onChange={(e) =>
                  setFormData({ ...formData, napomene: e.target.value })
                }
                data-testid="nekretnina-napomene-rizici-input"
              />
            </div>
          </TabsContent>

          <TabsContent value="units" className="space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  Plan jedinica
                </h4>
                <p className="text-xs text-muted-foreground">
                  Upravljajte jedinicama unutar ove nekretnine.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddUnit}
              >
                <Plus className="w-4 h-4 mr-2" /> Dodaj jedinicu
              </Button>
            </div>

            {units.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                Još niste dodali nijednu jedinicu. Kliknite na gumb iznad za
                dodavanje.
              </div>
            ) : (
              <div className="space-y-3">
                {units.map((unit, index) => {
                  const activeContract = activeContracts.find(
                    (c) =>
                      c.property_unit_id === unit.localId ||
                      c.property_unit_id === unit.id,
                  );
                  const tenantName = activeContract
                    ? activeContract.zakupnik_naziv || "Nepoznat zakupnik"
                    : null;

                  return (
                    <div
                      key={unit.localId}
                      className="space-y-3 rounded-xl border border-border/60 bg-white/80 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {getUnitDisplayName(unit)}
                          </p>
                          {tenantName && (
                            <p className="text-xs font-medium text-blue-600 mt-0.5">
                              Zakupnik: {tenantName}
                            </p>
                          )}
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Izbornik</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>
                              Opcije jedinice
                            </DropdownMenuLabel>
                            {activeContract && (
                              <>
                                <DropdownMenuItem
                                  onClick={() =>
                                    navigate(
                                      `/ugovori?contractId=${activeContract.id}`,
                                    )
                                  }
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Vidi Ugovor
                                </DropdownMenuItem>
                                {/* Future: <DropdownMenuItem onClick={() => navigate(...) }><User .../> Vidi Zakupnika</DropdownMenuItem> */}
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem
                              onClick={() =>
                                setUnitToDelete({
                                  localId: unit.localId,
                                  isExisting: unit.isExisting,
                                  oznaka: unit.oznaka,
                                })
                              }
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Ukloni jedinicu
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div>
                          <Label>Oznaka *</Label>
                          <Input
                            value={unit.oznaka}
                            onChange={(e) =>
                              handleUpdateUnit(
                                unit.localId,
                                "oznaka",
                                e.target.value,
                              )
                            }
                            placeholder="npr. A2"
                            required
                          />
                        </div>
                        <div>
                          <Label>Naziv</Label>
                          <Input
                            value={unit.naziv}
                            onChange={(e) =>
                              handleUpdateUnit(
                                unit.localId,
                                "naziv",
                                e.target.value,
                              )
                            }
                            placeholder="npr. Ured A2"
                          />
                        </div>
                        <div>
                          <Label>Kat / zona</Label>
                          <Input
                            value={unit.kat}
                            onChange={(e) =>
                              handleUpdateUnit(
                                unit.localId,
                                "kat",
                                e.target.value,
                              )
                            }
                            placeholder="npr. Kat 3"
                          />
                        </div>
                        <div>
                          <Label>Površina (m²)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={unit.povrsina_m2}
                            onChange={(e) =>
                              handleUpdateUnit(
                                unit.localId,
                                "povrsina_m2",
                                e.target.value,
                              )
                            }
                            placeholder="npr. 120"
                          />
                        </div>
                        <div>
                          <Label>Status</Label>
                          <Select
                            value={unit.status}
                            onValueChange={(value) =>
                              handleUpdateUnit(unit.localId, "status", value)
                            }
                            disabled={!!activeContract}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Odaberite status" />
                            </SelectTrigger>
                            <SelectContent>
                              {unitStatusOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                  disabled={option.value === "iznajmljeno"}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {activeContract ? (
                            <p className="text-[10px] text-blue-600 mt-1">
                              Statusom upravlja ugovor{" "}
                              {activeContract.interna_oznaka}
                            </p>
                          ) : (
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Status "Iznajmljeno" postavlja se isključivo
                              aktivacijom ugovora.
                            </p>
                          )}
                        </div>
                        <div>
                          <Label>Osnovna zakupnina (€)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={unit.osnovna_zakupnina}
                            onChange={(e) =>
                              handleUpdateUnit(
                                unit.localId,
                                "osnovna_zakupnina",
                                e.target.value,
                              )
                            }
                            placeholder="npr. 1500"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Napomena</Label>
                        <Textarea
                          value={unit.napomena}
                          onChange={(e) =>
                            handleUpdateUnit(
                              unit.localId,
                              "napomena",
                              e.target.value,
                            )
                          }
                          placeholder="npr. open space ured, pogled na park"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex space-x-2 pt-4">
          <Button
            type="submit"
            data-testid="potvrdi-nekretninu-form"
            disabled={submitting}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {nekretnina ? "Ažuriraj" : "Kreiraj"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            data-testid="odustani-nekretninu-form"
            disabled={submitting}
          >
            Odustani
          </Button>
        </div>
      </form>

      <AlertDialog
        open={!!unitToDelete}
        onOpenChange={(open) => !open && setUnitToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ukloni jedinicu?</AlertDialogTitle>
            <AlertDialogDescription>
              Jeste li sigurni da želite ukloniti jedinicu
              {unitToDelete?.oznaka ? (
                <>
                  {" "}
                  <span className="font-medium text-foreground">
                    {unitToDelete.oznaka}
                  </span>
                </>
              ) : null}
              ? Ova radnja se ne može poništiti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Odustani</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (unitToDelete) {
                  handleRemoveUnit(
                    unitToDelete.localId,
                    unitToDelete.isExisting,
                  );
                }
                setUnitToDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ukloni
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default NekretninarForm;
