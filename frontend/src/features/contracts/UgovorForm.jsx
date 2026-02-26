import React, { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Checkbox } from "../../components/ui/checkbox";
import { Textarea } from "../../components/ui/textarea";
import { api } from "../../shared/api";
import { toast } from "../../components/ui/sonner";
import {
  Loader2,
  UploadCloud,
  X,
  FileText,
  Trash2,
  Plus,
  UserPlus,
  Building,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
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
import { differenceInMonths } from "date-fns";
import { formatDate } from "../../shared/formatters";
import { getUnitDisplayName } from "../../shared/units";

const emptyForm = {
  interna_oznaka: "",
  nekretnina_id: "",
  zakupnik_id: "",
  property_unit_id: "",
  datum_potpisivanja: "",
  datum_pocetka: "",
  datum_zavrsetka: "",
  trajanje_mjeseci: "",
  opcija_produljenja: false,
  uvjeti_produljenja: "",
  rok_otkaza_dani: "",
  osnovna_zakupnina: "",
  zakupnina_po_m2: "",
  cam_troskovi: "",
  polog_depozit: "",
  garancija: "",
  indeksacija: false,
  indeks: "",
  formula_indeksacije: "",
  obveze_odrzavanja: "",
  namjena_prostora: "",
  rezije_brojila: "",
  status: "aktivno",
  napomena: "",
};

const UgovorForm = ({ ugovor, prefill, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [nekretnine, setNekretnine] = useState([]);
  const [zakupnici, setZakupnici] = useState([]);
  const [units, setUnits] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Inline zakupnik creation
  const [showNewZakupnik, setShowNewZakupnik] = useState(false);
  const [newZakupnikData, setNewZakupnikData] = useState({
    naziv_firme: "",
    ime_prezime: "",
    oib: "",
    kontakt_email: "",
    kontakt_telefon: "",
    kontakt_ime: "",
  });
  const [creatingZakupnik, setCreatingZakupnik] = useState(false);

  const handleCreateZakupnik = async () => {
    if (!newZakupnikData.oib?.trim()) {
      toast.error("OIB je obavezan za kreiranje zakupnika.");
      return;
    }
    if (
      !newZakupnikData.naziv_firme?.trim() &&
      !newZakupnikData.ime_prezime?.trim()
    ) {
      toast.error("Unesite naziv firme ili ime i prezime.");
      return;
    }
    setCreatingZakupnik(true);
    try {
      const res = await api.createZakupnik({
        ...newZakupnikData,
        status: "aktivan",
        tip: "zakupnik",
      });
      const created = res.data;
      setZakupnici((prev) => [...prev, created]);
      handleChange("zakupnik_id", created.id);
      setShowNewZakupnik(false);
      setNewZakupnikData({
        naziv_firme: "",
        ime_prezime: "",
        oib: "",
        kontakt_email: "",
        kontakt_telefon: "",
        kontakt_ime: "",
      });
      toast.success("Zakupnik uspješno kreiran i odabran.");
    } catch (error) {
      console.error("Error creating zakupnik:", error);
      const msg =
        error?.response?.data?.detail || "Neuspješno kreiranje zakupnika.";
      toast.error(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setCreatingZakupnik(false);
    }
  };

  const [protocolDocuments, setProtocolDocuments] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [nekretnineRes, zakupniciRes] = await Promise.all([
          api.getNekretnine(),
          api.getZakupnici(),
        ]);
        setNekretnine(nekretnineRes.data || []);
        setZakupnici(zakupniciRes.data || []);
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Neuspješno učitavanje podataka.");
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (ugovor) {
      setFormData({
        ...emptyForm,
        ...ugovor,
        // Ensure dates are in YYYY-MM-DD format for input type="date"
        datum_potpisivanja: ugovor.datum_potpisivanja
          ? ugovor.datum_potpisivanja.split("T")[0]
          : "",
        datum_pocetka: ugovor.datum_pocetka
          ? ugovor.datum_pocetka.split("T")[0]
          : "",
        datum_zavrsetka: ugovor.datum_zavrsetka
          ? ugovor.datum_zavrsetka.split("T")[0]
          : "",
      });
      if (ugovor.nekretnina_id) {
        fetchUnits(ugovor.nekretnina_id);
      }
      fetchProtocolDocuments(ugovor.id);
    }
  }, [ugovor]);

  // Apply prefill data from URL params (e.g. "Novi ugovor" from property detail)
  useEffect(() => {
    if (prefill && !ugovor && !loadingData) {
      if (prefill.nekretnina_id) {
        setFormData((prev) => ({
          ...prev,
          nekretnina_id: prefill.nekretnina_id,
          property_unit_id: prefill.property_unit_id || "",
        }));
        fetchUnits(prefill.nekretnina_id);
      }
    }
  }, [prefill, ugovor, loadingData]);

  useEffect(() => {
    if (formData.datum_pocetka && formData.datum_zavrsetka) {
      const start = new Date(formData.datum_pocetka);
      const end = new Date(formData.datum_zavrsetka);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
        const months = differenceInMonths(end, start) || 1;
        setFormData((prev) => ({ ...prev, trajanje_mjeseci: months }));
      }
    }
  }, [formData.datum_pocetka, formData.datum_zavrsetka]);

  const fetchUnits = async (propertyId) => {
    try {
      const res = await api.getUnitsForProperty(propertyId);
      setUnits(res.data || []);
    } catch (error) {
      console.error("Error fetching units:", error);
    }
  };

  const fetchProtocolDocuments = async (contractId) => {
    try {
      const res = await api.getDokumentiUgovora(contractId);
      const docs = res.data || [];
      // Filter for handover protocol documents
      setProtocolDocuments(
        docs.filter((d) => d.tip === "primopredajni_zapisnik"),
      );
    } catch (error) {
      console.error("Error fetching protocol documents:", error);
    }
  };

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (key === "nekretnina_id") {
      fetchUnits(value);
      setFormData((prev) => ({ ...prev, property_unit_id: "" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.nekretnina_id) {
      toast.error("Nekretnina je obavezna");
      return;
    }
    if (!formData.zakupnik_id) {
      toast.error("Zakupnik je obavezan");
      return;
    }
    if (
      formData.datum_pocetka &&
      formData.datum_zavrsetka &&
      formData.datum_pocetka >= formData.datum_zavrsetka
    ) {
      toast.error("Datum završetka mora biti nakon datuma početka");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        trajanje_mjeseci: parseInt(formData.trajanje_mjeseci) || 0,
        rok_otkaza_dani: parseInt(formData.rok_otkaza_dani) || 0,
        osnovna_zakupnina: parseFloat(formData.osnovna_zakupnina) || 0,
        zakupnina_po_m2: parseFloat(formData.zakupnina_po_m2) || 0,
        cam_troskovi: parseFloat(formData.cam_troskovi) || 0,
        polog_depozit: parseFloat(formData.polog_depozit) || 0,
        garancija: parseFloat(formData.garancija) || 0,
        // Handle empty strings for optional fields
        property_unit_id: formData.property_unit_id || null,
        datum_potpisivanja: formData.datum_potpisivanja || null,
      };

      let savedContract;
      if (ugovor) {
        const res = await api.updateUgovor(ugovor.id, payload);
        savedContract = res.data;
        toast.success("Ugovor uspješno ažuriran.");
      } else {
        const res = await api.createUgovor(payload);
        savedContract = res.data;
        toast.success("Ugovor uspješno kreiran.");
      }

      // Upload file if selected
      if (selectedFile && savedContract) {
        try {
          await api.createDokument({
            file: selectedFile,
            naziv: "Ugovor - " + savedContract.interna_oznaka,
            tip: "ugovor",
            ugovor_id: savedContract.id,
            nekretnina_id: savedContract.nekretnina_id,
            zakupnik_id: savedContract.zakupnik_id,
          });
          toast.success("Dokument ugovora spremljen.");
        } catch (docError) {
          console.error("Error saving document:", docError);
          toast.error(
            "Ugovor je spremljen, ali spremanje dokumenta nije uspjelo.",
          );
        }
      }

      onSuccess();
    } catch (error) {
      console.error("Error saving contract:", error);
      const errorDetail =
        error.response?.data?.detail || "Spremanje ugovora nije uspjelo.";
      toast.error(errorDetail);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!ugovor) return;
    setLoading(true);
    try {
      await api.deleteUgovor(ugovor.id);
      toast.success("Ugovor je obrisan.");
      setDeleteDialogOpen(false);
      onSuccess();
    } catch (error) {
      console.error("Error deleting contract:", error);
      toast.error("Brisanje ugovora nije uspjelo.");
    } finally {
      setLoading(false);
    }
  };

  // Keep handleDelete for compatibility if used elsewhere, or just alias it
  const handleDelete = handleDeleteClick;

  const [analyzing, setAnalyzing] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setAnalyzing(true);
    try {
      const response = await api.parsePdfContract(file);

      if (response.data && response.data.data) {
        const data = response.data.data;

        // Map AI response to form fields
        setFormData((prev) => ({
          ...prev,
          interna_oznaka: data.ugovor?.interna_oznaka || prev.interna_oznaka,
          datum_potpisivanja:
            data.ugovor?.datum_sklapanja || prev.datum_potpisivanja,
          datum_pocetka: data.ugovor?.datum_pocetka || prev.datum_pocetka,
          datum_zavrsetka: data.ugovor?.datum_zavrsetka || prev.datum_zavrsetka,
          osnovna_zakupnina:
            data.financije?.iznos != null
              ? String(data.financije.iznos)
              : prev.osnovna_zakupnina,
          polog_depozit:
            data.financije?.depozit != null
              ? String(data.financije.depozit)
              : prev.polog_depozit,
          napomena:
            (prev.napomena ? prev.napomena + "\n" : "") +
            (data.ugovor?.sazetak || ""),
          // Nekretnina + unit if matched in DB
          nekretnina_id: data.nekretnina?.id || prev.nekretnina_id,
          property_unit_id: data.property_unit?.id || prev.property_unit_id,
        }));

        // Zakupnik — backend auto-creates if not found, always returns id
        if (data.zakupnik?.id) {
          // Refresh zakupnici list so new one appears in dropdown
          if (data.zakupnik._auto_created) {
            try {
              const res = await api.getZakupnici();
              setZakupnici(res.data || []);
            } catch (_) {
              // non-critical
            }
            toast.success(
              `Zakupnik "${data.zakupnik.naziv_firme}" automatski kreiran i odabran.`,
            );
          } else {
            toast.success("Dokument analiziran! Provjerite podatke.");
          }
          setFormData((prev) => ({ ...prev, zakupnik_id: data.zakupnik.id }));
        } else {
          toast.success("Dokument analiziran! Provjerite podatke.");
        }

        // Load units for matched property
        if (data.nekretnina?.id) {
          try {
            const res = await api.getUnitsForProperty(data.nekretnina.id);
            setUnits(res.data || []);
          } catch (_) {
            // non-critical
          }
        }
      }
    } catch (error) {
      console.error("AI analysis failed:", error);
      toast.error("Analiza nije uspjela. Molimo unesite podatke ručno.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleProtocolUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const typeLabel = type === "ulazni" ? "Ulazni" : "Izlazni";
      await api.createDokument({
        file: file,
        naziv: `Primopredajni zapisnik - ${typeLabel} - ${ugovor?.interna_oznaka || "Novi"}`,
        tip: "primopredajni_zapisnik",
        ugovor_id: ugovor.id,
        nekretnina_id: ugovor.nekretnina_id,
        zakupnik_id: ugovor.zakupnik_id,
      });
      toast.success(`${typeLabel} zapisnik uspješno učitan.`);
      fetchProtocolDocuments(ugovor.id);
    } catch (err) {
      console.error("Upload failed", err);
      toast.error("Učitavanje nije uspjelo.");
    }
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const FormContent = (
    <div className="space-y-6">
      <div
        className="relative rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/5 p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/10 cursor-pointer"
        onClick={() =>
          !selectedFile && document.getElementById("contract-upload")?.click()
        }
      >
        {selectedFile ? (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3 shadow-sm ring-1 ring-border">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-primary">
                {selectedFile.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
              }}
            >
              <X className="mr-2 h-4 w-4" /> Ukloni datoteku
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-background p-3 shadow-sm ring-1 ring-border">
              {analyzing ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <UploadCloud className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="contract-upload"
                className="cursor-pointer text-sm font-medium text-primary hover:underline"
              >
                {analyzing
                  ? "Analiziram dokument..."
                  : "Kliknite za učitavanje PDF ugovora"}
              </Label>
              <p className="text-xs text-muted-foreground">
                AI će automatski izvući ključne podatke iz dokumenta
              </p>
            </div>
            <Input
              id="contract-upload"
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileUpload}
              disabled={analyzing}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="interna_oznaka">
            Broj ugovora / Interna oznaka{" "}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="interna_oznaka"
            value={formData.interna_oznaka}
            onChange={(e) => handleChange("interna_oznaka", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(val) => handleChange("status", val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Odaberi status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="aktivno">Aktivno</SelectItem>
              <SelectItem value="na_isteku">Na isteku</SelectItem>
              <SelectItem value="istekao">Istekao</SelectItem>
              <SelectItem value="raskinuto">Raskinuto</SelectItem>
              <SelectItem value="arhivirano">Arhivirano</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="nekretnina_id">
            Nekretnina <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.nekretnina_id}
            onValueChange={(val) => handleChange("nekretnina_id", val)}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="Odaberi nekretninu" />
            </SelectTrigger>
            <SelectContent>
              {nekretnine.length === 0 ? (
                <div className="px-2 py-3 text-center">
                  <Building className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nema nekretnina u sustavu
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Kreirajte nekretninu u sekciji Nekretnine
                  </p>
                </div>
              ) : (
                nekretnine.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.naziv}
                    {n.adresa ? (
                      <span className="text-muted-foreground ml-1">
                        — {n.adresa}
                      </span>
                    ) : null}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="property_unit_id">
            Jedinica
            {units.length > 0 && (
              <span className="text-xs text-muted-foreground ml-1">
                ({units.filter((u) => u.status === "dostupno").length} dostupno)
              </span>
            )}
          </Label>
          <Select
            value={formData.property_unit_id}
            onValueChange={(val) =>
              handleChange("property_unit_id", val === "_none" ? "" : val)
            }
            disabled={!formData.nekretnina_id || units.length === 0}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  units.length === 0
                    ? "Nema jedinica za ovu nekretninu"
                    : "Odaberi jedinicu"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— Bez jedinice —</SelectItem>
              {units.map((u) => {
                const isAvailable =
                  u.status === "dostupno" ||
                  u.id === ugovor?.property_unit_id ||
                  u.id === prefill?.property_unit_id;
                return (
                  <SelectItem
                    key={u.id}
                    value={u.id}
                    disabled={!isAvailable && u.status === "iznajmljeno"}
                  >
                    {getUnitDisplayName(u, { showArea: true })}
                    {u.status === "iznajmljeno" &&
                    u.id !== ugovor?.property_unit_id
                      ? " (zauzeto)"
                      : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="zakupnik_id">
          Zakupnik <span className="text-destructive">*</span>
        </Label>
        <div className="flex gap-2">
          <div className="flex-1">
            <Select
              value={formData.zakupnik_id}
              onValueChange={(val) => handleChange("zakupnik_id", val)}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Odaberi zakupnika" />
              </SelectTrigger>
              <SelectContent>
                {zakupnici.length === 0 ? (
                  <div className="px-2 py-3 text-center">
                    <UserPlus className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Nema zakupnika u sustavu
                    </p>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="mt-1 text-primary"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowNewZakupnik(true);
                      }}
                    >
                      + Dodaj prvog zakupnika
                    </Button>
                  </div>
                ) : (
                  zakupnici.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.naziv_firme ||
                        z.ime_prezime ||
                        z.kontakt_email ||
                        "Nepoznat zakupnik"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setShowNewZakupnik(true)}
            title="Dodaj novog zakupnika"
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <Dialog open={showNewZakupnik} onOpenChange={setShowNewZakupnik}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                Novi zakupnik
              </DialogTitle>
              <DialogDescription>
                Brzo kreirajte novog zakupnika. Unesite barem naziv/ime i OIB.
                Ostale podatke možete urediti naknadno.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>
                  Naziv firme{" "}
                  {!newZakupnikData.ime_prezime?.trim() && (
                    <span className="text-destructive">*</span>
                  )}
                </Label>
                <Input
                  value={newZakupnikData.naziv_firme}
                  onChange={(e) =>
                    setNewZakupnikData((p) => ({
                      ...p,
                      naziv_firme: e.target.value,
                    }))
                  }
                  placeholder="npr. Firma d.o.o."
                />
              </div>
              <div className="space-y-1">
                <Label>
                  Ime i prezime{" "}
                  {!newZakupnikData.naziv_firme?.trim() && (
                    <span className="text-destructive">*</span>
                  )}
                </Label>
                <Input
                  value={newZakupnikData.ime_prezime}
                  onChange={(e) =>
                    setNewZakupnikData((p) => ({
                      ...p,
                      ime_prezime: e.target.value,
                    }))
                  }
                  placeholder="npr. Ivan Horvat"
                />
                {!newZakupnikData.naziv_firme?.trim() &&
                  !newZakupnikData.ime_prezime?.trim() && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Info className="h-3 w-3" />
                      Unesite naziv firme ili ime i prezime
                    </p>
                  )}
              </div>
              <div className="space-y-1">
                <Label>
                  OIB <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={newZakupnikData.oib}
                  onChange={(e) =>
                    setNewZakupnikData((p) => ({
                      ...p,
                      oib: e.target.value,
                    }))
                  }
                  placeholder="12345678901"
                  maxLength={11}
                />
                {newZakupnikData.oib && newZakupnikData.oib.length !== 11 && (
                  <p className="text-xs text-amber-600">
                    OIB mora imati 11 znamenki
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Kontakt ime</Label>
                <Input
                  value={newZakupnikData.kontakt_ime}
                  onChange={(e) =>
                    setNewZakupnikData((p) => ({
                      ...p,
                      kontakt_ime: e.target.value,
                    }))
                  }
                  placeholder="Kontakt osoba"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={newZakupnikData.kontakt_email}
                    onChange={(e) =>
                      setNewZakupnikData((p) => ({
                        ...p,
                        kontakt_email: e.target.value,
                      }))
                    }
                    placeholder="email@primjer.hr"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Telefon</Label>
                  <Input
                    value={newZakupnikData.kontakt_telefon}
                    onChange={(e) =>
                      setNewZakupnikData((p) => ({
                        ...p,
                        kontakt_telefon: e.target.value,
                      }))
                    }
                    placeholder="+385..."
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewZakupnik(false)}
              >
                Odustani
              </Button>
              <Button
                type="button"
                onClick={handleCreateZakupnik}
                disabled={
                  creatingZakupnik ||
                  !newZakupnikData.oib?.trim() ||
                  (!newZakupnikData.naziv_firme?.trim() &&
                    !newZakupnikData.ime_prezime?.trim())
                }
              >
                {creatingZakupnik && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Kreiraj zakupnika
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="datum_potpisivanja">Datum potpisivanja</Label>
          <Input
            id="datum_potpisivanja"
            type="date"
            value={formData.datum_potpisivanja}
            onChange={(e) => handleChange("datum_potpisivanja", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="datum_pocetka">
            Datum početka <span className="text-destructive">*</span>
          </Label>
          <Input
            id="datum_pocetka"
            type="date"
            value={formData.datum_pocetka}
            onChange={(e) => handleChange("datum_pocetka", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="datum_zavrsetka">
            Datum završetka <span className="text-destructive">*</span>
          </Label>
          <Input
            id="datum_zavrsetka"
            type="date"
            value={formData.datum_zavrsetka}
            onChange={(e) => handleChange("datum_zavrsetka", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="osnovna_zakupnina">
            Osnovna zakupnina (€) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="osnovna_zakupnina"
            type="number"
            step="0.01"
            value={formData.osnovna_zakupnina}
            onChange={(e) => handleChange("osnovna_zakupnina", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="zakupnina_po_m2">Zakupnina po m² (€)</Label>
          <Input
            id="zakupnina_po_m2"
            type="number"
            step="0.01"
            value={formData.zakupnina_po_m2}
            onChange={(e) => handleChange("zakupnina_po_m2", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cam_troskovi">CAM troškovi (€)</Label>
          <Input
            id="cam_troskovi"
            type="number"
            step="0.01"
            value={formData.cam_troskovi}
            onChange={(e) => handleChange("cam_troskovi", e.target.value)}
          />
        </div>
      </div>

      {formData.datum_pocetka &&
        formData.datum_zavrsetka &&
        new Date(formData.datum_zavrsetka) <=
          new Date(formData.datum_pocetka) && (
          <p className="text-sm text-destructive flex items-center gap-1 -mt-2">
            <Info className="h-3.5 w-3.5" />
            Datum završetka mora biti nakon datuma početka
          </p>
        )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="polog_depozit">Polog / Depozit (€)</Label>
          <Input
            id="polog_depozit"
            type="number"
            step="0.01"
            value={formData.polog_depozit}
            onChange={(e) => handleChange("polog_depozit", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="garancija">Garancija (€)</Label>
          <Input
            id="garancija"
            type="number"
            step="0.01"
            value={formData.garancija}
            onChange={(e) => handleChange("garancija", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rok_otkaza_dani">Rok otkaza (dani)</Label>
          <Input
            id="rok_otkaza_dani"
            type="number"
            value={formData.rok_otkaza_dani}
            onChange={(e) => handleChange("rok_otkaza_dani", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="trajanje_mjeseci">Trajanje (mjeseci)</Label>
          <Input
            id="trajanje_mjeseci"
            type="number"
            value={formData.trajanje_mjeseci}
            onChange={(e) => handleChange("trajanje_mjeseci", e.target.value)}
            readOnly
            className="bg-muted"
          />
        </div>
        <div className="flex items-center space-x-2 pt-8">
          <Checkbox
            id="opcija_produljenja"
            checked={formData.opcija_produljenja}
            onCheckedChange={(checked) =>
              handleChange("opcija_produljenja", checked)
            }
          />
          <Label htmlFor="opcija_produljenja">Opcija produljenja</Label>
        </div>
      </div>

      {formData.opcija_produljenja && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <Label htmlFor="uvjeti_produljenja">Uvjeti produljenja</Label>
          <Textarea
            id="uvjeti_produljenja"
            value={formData.uvjeti_produljenja}
            onChange={(e) => handleChange("uvjeti_produljenja", e.target.value)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex items-center space-x-2 pt-2">
          <Checkbox
            id="indeksacija"
            checked={formData.indeksacija}
            onCheckedChange={(checked) => handleChange("indeksacija", checked)}
          />
          <Label htmlFor="indeksacija">Indeksacija</Label>
        </div>
        {formData.indeksacija && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <Label htmlFor="indeks">Indeks</Label>
            <Input
              id="indeks"
              value={formData.indeks}
              onChange={(e) => handleChange("indeks", e.target.value)}
              placeholder="npr. HICP"
            />
          </div>
        )}
      </div>

      {formData.indeksacija && (
        <div className="space-y-2">
          <Label htmlFor="formula_indeksacije">Formula indeksacije</Label>
          <Input
            id="formula_indeksacije"
            value={formData.formula_indeksacije}
            onChange={(e) =>
              handleChange("formula_indeksacije", e.target.value)
            }
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="namjena_prostora">Namjena prostora</Label>
        <Input
          id="namjena_prostora"
          value={formData.namjena_prostora}
          onChange={(e) => handleChange("namjena_prostora", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="obveze_odrzavanja">Obveze održavanja</Label>
        <Textarea
          id="obveze_odrzavanja"
          value={formData.obveze_odrzavanja}
          onChange={(e) => handleChange("obveze_odrzavanja", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rezije_brojila">Režije i brojila</Label>
        <Textarea
          id="rezije_brojila"
          value={formData.rezije_brojila}
          onChange={(e) => handleChange("rezije_brojila", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="napomena">Napomena</Label>
        <Textarea
          id="napomena"
          value={formData.napomena}
          onChange={(e) => handleChange("napomena", e.target.value)}
        />
      </div>
    </div>
  );

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {ugovor ? (
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Detalji ugovora</TabsTrigger>
              <TabsTrigger value="protocols">Primopredaja</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="pt-4">
              {FormContent}
            </TabsContent>
            <TabsContent value="protocols" className="pt-4 space-y-4">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Entry Protocol Upload */}
                  <div className="space-y-4 rounded-lg border p-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      Ulazni zapisnik
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Učitajte potpisani primopredajni zapisnik pri ulasku u
                      posjed.
                    </p>
                    <div className="relative">
                      <input
                        type="file"
                        id="protocol-upload-ulazni"
                        className="hidden"
                        accept=".pdf"
                        onChange={(e) => handleProtocolUpload(e, "ulazni")}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() =>
                          document
                            .getElementById("protocol-upload-ulazni")
                            .click()
                        }
                      >
                        <UploadCloud className="h-4 w-4 mr-2" />
                        Učitaj Ulazni Zapisnik
                      </Button>
                    </div>
                  </div>

                  {/* Exit Protocol Upload */}
                  <div className="space-y-4 rounded-lg border p-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-red-500" />
                      Izlazni zapisnik
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Učitajte potpisani primopredajni zapisnik pri izlasku iz
                      posjeda.
                    </p>
                    <div className="relative">
                      <input
                        type="file"
                        id="protocol-upload-izlazni"
                        className="hidden"
                        accept=".pdf"
                        onChange={(e) => handleProtocolUpload(e, "izlazni")}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() =>
                          document
                            .getElementById("protocol-upload-izlazni")
                            .click()
                        }
                      >
                        <UploadCloud className="h-4 w-4 mr-2" />
                        Učitaj Izlazni Zapisnik
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Uploaded Documents List */}
                <div className="mt-8">
                  <h3 className="text-lg font-medium mb-4">
                    Učitani zapisnici
                  </h3>
                  {protocolDocuments.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm border border-dashed rounded-lg bg-muted/10">
                      Nema učitanih primopredajnih zapisnika.
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {protocolDocuments.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 border rounded-lg bg-card"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-primary" />
                            <div>
                              <p className="text-sm font-medium">{doc.naziv}</p>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {doc.naziv.toLowerCase().includes("ulazni")
                                    ? "Ulazni"
                                    : doc.naziv
                                          .toLowerCase()
                                          .includes("izlazni")
                                      ? "Izlazni"
                                      : "Ostalo"}
                                </Badge>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(doc.created_at)}
                                </p>
                              </div>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={`${api.getBackendUrl()}/api/v1/dokumenti/${doc.id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Preuzmi
                            </a>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          FormContent
        )}

        <div className="flex justify-end gap-2 pt-4 border-t mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            Odustani
          </Button>
          {ugovor && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
              className="mr-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Obriši ugovor
            </Button>
          )}
          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {ugovor ? "Spremi promjene" : "Kreiraj ugovor"}
          </Button>
        </div>
      </form>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Jeste li sigurni?</AlertDialogTitle>
            <AlertDialogDescription>
              Ova radnja se ne može poništiti. Ovo će trajno obrisati ugovor{" "}
              <span className="font-medium text-foreground">
                {ugovor?.interna_oznaka}
              </span>{" "}
              i sve povezane podatke.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Odustani</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? "Brisanje..." : "Obriši"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UgovorForm;
