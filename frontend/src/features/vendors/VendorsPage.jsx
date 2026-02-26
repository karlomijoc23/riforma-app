import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Truck,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Star,
  Phone,
  Mail,
} from "lucide-react";
import { api } from "../../shared/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../../components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
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
import { EmptyState } from "../../components/ui/empty-state";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VENDOR_TYPES = [
  { value: "elektricar", label: "Elektricar" },
  { value: "vodoinstalater", label: "Vodoinstalater" },
  { value: "stolar", label: "Stolar" },
  { value: "bravar", label: "Bravar" },
  { value: "keramicar", label: "Keramicar" },
  { value: "soboslikar", label: "Soboslikar" },
  { value: "klima_serviser", label: "Klima serviser" },
  { value: "cistacica", label: "Cistacica" },
  { value: "gradjevinar", label: "Gradjevinar" },
  { value: "ostalo", label: "Ostalo" },
];

function StarRating({ rating, interactive = false, onChange }) {
  const [hover, setHover] = useState(0);
  const stars = [1, 2, 3, 4, 5];

  if (!interactive) {
    if (!rating)
      return <span className="text-sm text-muted-foreground">-</span>;
    return (
      <div className="flex items-center gap-0.5">
        {stars.map((s) => (
          <Star
            key={s}
            className={`h-3.5 w-3.5 ${
              s <= rating
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/30"
            }`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {stars.map((s) => (
        <button
          key={s}
          type="button"
          className="p-0.5 transition-transform hover:scale-110"
          onClick={() => onChange(s === rating ? null : s)}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
        >
          <Star
            className={`h-5 w-5 ${
              s <= (hover || rating || 0)
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
      {rating && (
        <button
          type="button"
          className="ml-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onChange(null)}
        >
          Ponisti
        </button>
      )}
    </div>
  );
}

function getVendorTypeLabel(value) {
  const found = VENDOR_TYPES.find((t) => t.value === value);
  return found ? found.label : value || "-";
}

const INITIAL_FORM = {
  naziv: "",
  tip: "",
  kontakt_ime: "",
  kontakt_email: "",
  kontakt_telefon: "",
  oib: "",
  adresa: "",
  napomena: "",
  ocjena: null,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VendorsPage({ embedded = false }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Sheet form state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchVendors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getVendors();
      setVendors(res.data || []);
    } catch (err) {
      console.error("Failed to fetch vendors", err);
      toast.error("Greska pri ucitavanju dobavljaca");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const filteredVendors = useMemo(() => {
    if (!searchQuery.trim()) return vendors;
    const q = searchQuery.toLowerCase();
    return vendors.filter(
      (v) =>
        (v.naziv || "").toLowerCase().includes(q) ||
        (v.tip || "").toLowerCase().includes(q) ||
        (v.kontakt_ime || "").toLowerCase().includes(q) ||
        (v.kontakt_email || "").toLowerCase().includes(q) ||
        (v.kontakt_telefon || "").toLowerCase().includes(q),
    );
  }, [vendors, searchQuery]);

  // --- Form handlers ---

  const openCreate = () => {
    setEditingVendor(null);
    setForm(INITIAL_FORM);
    setSheetOpen(true);
  };

  const openEdit = (vendor) => {
    setEditingVendor(vendor);
    setForm({
      naziv: vendor.naziv || "",
      tip: vendor.tip || "",
      kontakt_ime: vendor.kontakt_ime || "",
      kontakt_email: vendor.kontakt_email || "",
      kontakt_telefon: vendor.kontakt_telefon || "",
      oib: vendor.oib || "",
      adresa: vendor.adresa || "",
      napomena: vendor.napomena || "",
      ocjena: vendor.ocjena || null,
    });
    setSheetOpen(true);
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.naziv.trim()) {
      toast.error("Naziv dobavljaca je obavezan");
      return;
    }

    const payload = {
      ...form,
      tip: form.tip || null,
      kontakt_ime: form.kontakt_ime || null,
      kontakt_email: form.kontakt_email || null,
      kontakt_telefon: form.kontakt_telefon || null,
      oib: form.oib || null,
      adresa: form.adresa || null,
      napomena: form.napomena || null,
      ocjena: form.ocjena || null,
    };

    try {
      setSubmitting(true);
      if (editingVendor) {
        await api.updateVendor(editingVendor.id, payload);
        toast.success("Dobavljac je azuriran");
      } else {
        await api.createVendor(payload);
        toast.success("Dobavljac je dodan");
      }
      setSheetOpen(false);
      fetchVendors();
    } catch (err) {
      console.error("Failed to save vendor", err);
      toast.error("Spremanje nije uspjelo");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await api.deleteVendor(deleteTarget.id);
      toast.success("Dobavljac je obrisan");
      setDeleteTarget(null);
      fetchVendors();
    } catch {
      toast.error("Brisanje nije uspjelo");
    } finally {
      setDeleting(false);
    }
  };

  const content = (
    <>
      {/* Header (standalone mode only) */}
      {!embedded && (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-primary">
              <Truck className="h-7 w-7" />
              Dobavljaci
            </h1>
            <p className="mt-1 text-muted-foreground">
              Upravljajte popisom dobavljaca i servisera za odrzavanje nekretnina.
            </p>
          </div>
          <Button onClick={openCreate} size="lg" className="shadow-sm">
            <Plus className="mr-2 h-4 w-4" /> Dodaj dobavljaca
          </Button>
        </div>
      )}

      {embedded && (
        <div className="flex justify-end">
          <Button onClick={openCreate} size="lg" className="shadow-sm">
            <Plus className="mr-2 h-4 w-4" /> Dodaj dobavljaca
          </Button>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-lg border border-border/50">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pretrazi po nazivu, tipu, kontaktu..."
            className="pl-9 bg-background"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <span className="ml-auto text-sm text-muted-foreground font-medium">
          {filteredVendors.length} od {vendors.length} dobavljaca
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : vendors.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nema dobavljaca"
          description="Dodajte prvog dobavljaca kako biste mogli pratiti servisere i partnere za odrzavanje."
          actionLabel="Dodaj prvog dobavljaca"
          onAction={openCreate}
        />
      ) : filteredVendors.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nema rezultata"
          description="Nismo pronasli nijednog dobavljaca koji odgovara vasim kriterijima pretrazivanja."
          actionLabel="Ocisti pretragu"
          onAction={() => setSearchQuery("")}
        />
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naziv</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead className="hidden md:table-cell">Kontakt</TableHead>
                <TableHead className="hidden sm:table-cell">Telefon</TableHead>
                <TableHead className="hidden lg:table-cell">Email</TableHead>
                <TableHead>Ocjena</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">{vendor.naziv}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {getVendorTypeLabel(vendor.tip)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {vendor.kontakt_ime || "-"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {vendor.kontakt_telefon ? (
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        {vendor.kontakt_telefon}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {vendor.kontakt_email ? (
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {vendor.kontakt_email}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StarRating rating={vendor.ocjena} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openEdit(vendor)}
                        title="Uredi"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteTarget(vendor)}
                        title="Obrisi"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingVendor ? "Uredi dobavljaca" : "Novi dobavljac"}
            </SheetTitle>
            <SheetDescription>
              {editingVendor
                ? "Izmijenite podatke o dobavljacu."
                : "Unesite podatke za novog dobavljaca."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Naziv */}
            <div className="space-y-2">
              <Label htmlFor="naziv">Naziv *</Label>
              <Input
                id="naziv"
                placeholder="Naziv tvrtke ili obrtnika"
                value={form.naziv}
                onChange={(e) => handleChange("naziv", e.target.value)}
                maxLength={200}
                required
              />
            </div>

            {/* Tip */}
            <div className="space-y-2">
              <Label htmlFor="tip">Tip djelatnosti</Label>
              <Select
                value={form.tip}
                onValueChange={(val) => handleChange("tip", val)}
              >
                <SelectTrigger id="tip">
                  <SelectValue placeholder="Odaberite tip" />
                </SelectTrigger>
                <SelectContent>
                  {VENDOR_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* OIB */}
            <div className="space-y-2">
              <Label htmlFor="oib">OIB</Label>
              <Input
                id="oib"
                placeholder="12345678901"
                value={form.oib}
                onChange={(e) => handleChange("oib", e.target.value)}
                maxLength={20}
              />
            </div>

            {/* Adresa */}
            <div className="space-y-2">
              <Label htmlFor="adresa">Adresa</Label>
              <Input
                id="adresa"
                placeholder="Ulica i broj, grad"
                value={form.adresa}
                onChange={(e) => handleChange("adresa", e.target.value)}
                maxLength={500}
              />
            </div>

            {/* Separator */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground mb-3">
                Kontakt podaci
              </p>
            </div>

            {/* Kontakt ime */}
            <div className="space-y-2">
              <Label htmlFor="kontakt_ime">Kontakt osoba</Label>
              <Input
                id="kontakt_ime"
                placeholder="Ime i prezime"
                value={form.kontakt_ime}
                onChange={(e) => handleChange("kontakt_ime", e.target.value)}
                maxLength={200}
              />
            </div>

            {/* Email + Telefon in a row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="kontakt_email">Email</Label>
                <Input
                  id="kontakt_email"
                  type="email"
                  placeholder="email@primjer.hr"
                  value={form.kontakt_email}
                  onChange={(e) =>
                    handleChange("kontakt_email", e.target.value)
                  }
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kontakt_telefon">Telefon</Label>
                <Input
                  id="kontakt_telefon"
                  placeholder="+385 ..."
                  value={form.kontakt_telefon}
                  onChange={(e) =>
                    handleChange("kontakt_telefon", e.target.value)
                  }
                  maxLength={100}
                />
              </div>
            </div>

            {/* Ocjena */}
            <div className="space-y-2">
              <Label>Ocjena</Label>
              <StarRating
                rating={form.ocjena}
                interactive
                onChange={(val) => handleChange("ocjena", val)}
              />
            </div>

            {/* Napomena */}
            <div className="space-y-2">
              <Label htmlFor="napomena">Napomena</Label>
              <Textarea
                id="napomena"
                placeholder="Dodatne informacije o dobavljacu..."
                value={form.napomena}
                onChange={(e) => handleChange("napomena", e.target.value)}
                rows={3}
                maxLength={2000}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSheetOpen(false)}
              >
                Odustani
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingVendor ? "Spremi promjene" : "Dodaj dobavljaca"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Obrisi dobavljaca?</AlertDialogTitle>
            <AlertDialogDescription>
              Dobavljac &ldquo;{deleteTarget?.naziv}&rdquo; bit ce trajno
              obrisan. Ova radnja se ne moze ponistiti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Odustani</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Obrisi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (embedded) return <div className="space-y-6">{content}</div>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 space-y-6">
      {content}
    </div>
  );
}
