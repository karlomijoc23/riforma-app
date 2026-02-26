import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Megaphone,
  Download,
  Eye,
  Pencil,
  Trash2,
  Loader2,
  Building,
  Euro,
  SquareArrowOutUpRight,
  Tag,
} from "lucide-react";
import { api } from "../../shared/api";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
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
import { toast } from "sonner";
import OglasDialog from "./components/OglasDialog";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS = {
  nacrt: "Nacrt",
  aktivan: "Aktivan",
  pauziran: "Pauziran",
  arhiviran: "Arhiviran",
};

const STATUS_COLORS = {
  nacrt: "bg-slate-100 text-slate-700 border-slate-200",
  aktivan: "bg-green-100 text-green-700 border-green-200",
  pauziran: "bg-yellow-100 text-yellow-700 border-yellow-200",
  arhiviran: "bg-gray-100 text-gray-500 border-gray-200",
};

const TIP_LABELS = {
  iznajmljivanje: "Iznajmljivanje",
  prodaja: "Prodaja",
};

function formatPrice(cijena, valuta = "EUR") {
  if (cijena == null) return "—";
  return new Intl.NumberFormat("hr-HR", {
    style: "currency",
    currency: valuta,
    maximumFractionDigits: 0,
  }).format(cijena);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function OglasiPage() {
  const [oglasi, setOglasi] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [tipFilter, setTipFilter] = useState("all");

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOglas, setEditingOglas] = useState(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // XML export loading
  const [exportingXml, setExportingXml] = useState(false);

  const fetchOglasi = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter !== "all") params.status = statusFilter;
      if (tipFilter !== "all") params.tip_ponude = tipFilter;
      const res = await api.getOglasi(params);
      setOglasi(res.data?.items || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error("Failed to fetch oglasi", err);
      toast.error("Greška pri učitavanju oglasa");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, tipFilter]);

  useEffect(() => {
    fetchOglasi();
  }, [fetchOglasi]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await api.changeOglasStatus(id, newStatus);
      toast.success(`Status promijenjen u "${STATUS_LABELS[newStatus]}"`);
      fetchOglasi();
    } catch {
      toast.error("Greška pri promjeni statusa");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await api.deleteOglas(deleteTarget.id);
      toast.success("Oglas obrisan");
      setDeleteTarget(null);
      fetchOglasi();
    } catch {
      toast.error("Greška pri brisanju oglasa");
    } finally {
      setDeleting(false);
    }
  };

  const handleExportXml = async () => {
    try {
      setExportingXml(true);
      const res = await api.exportOglasiXml();
      const blob = new Blob([res.data], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `oglasi_feed_${new Date().toISOString().slice(0, 10)}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("XML feed preuzet");
    } catch {
      toast.error("Greška pri izvozu XML feeda");
    } finally {
      setExportingXml(false);
    }
  };

  const openCreate = () => {
    setEditingOglas(null);
    setIsDialogOpen(true);
  };

  const openEdit = (oglas) => {
    setEditingOglas(oglas);
    setIsDialogOpen(true);
  };

  const handleDialogSaved = () => {
    setIsDialogOpen(false);
    fetchOglasi();
  };

  return (
    <div className="min-h-screen bg-muted/20 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Megaphone className="h-6 w-6 text-primary" />
            Oglasi
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upravljajte oglasima za iznajmljivanje i prodaju nekretnina.
            Izvezite XML feed za objavu na Njuškalo / Index.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportXml}
            disabled={exportingXml}
          >
            {exportingXml ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            XML Feed
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novi oglas
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue placeholder="Svi statusi" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Svi statusi</SelectItem>
            <SelectItem value="nacrt">Nacrt</SelectItem>
            <SelectItem value="aktivan">Aktivan</SelectItem>
            <SelectItem value="pauziran">Pauziran</SelectItem>
            <SelectItem value="arhiviran">Arhiviran</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tipFilter} onValueChange={setTipFilter}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="Tip ponude" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Svi tipovi</SelectItem>
            <SelectItem value="iznajmljivanje">Iznajmljivanje</SelectItem>
            <SelectItem value="prodaja">Prodaja</SelectItem>
          </SelectContent>
        </Select>

        <span className="ml-auto self-center text-sm text-muted-foreground">
          {total} {total === 1 ? "oglas" : total < 5 ? "oglasa" : "oglasa"}
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : oglasi.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 py-20 text-center">
          <Megaphone className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground">Nema oglasa</p>
          <p className="mt-1 text-sm text-muted-foreground/60">
            Kreirajte prvi oglas klikom na &ldquo;Novi oglas&rdquo;
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {oglasi.map((oglas) => (
            <OglasCard
              key={oglas.id}
              oglas={oglas}
              onEdit={() => openEdit(oglas)}
              onDelete={() => setDeleteTarget(oglas)}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <OglasDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        oglas={editingOglas}
        onSaved={handleDialogSaved}
      />

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Obriši oglas?</AlertDialogTitle>
            <AlertDialogDescription>
              Oglas &ldquo;{deleteTarget?.naslov}&rdquo; bit će trajno obrisan.
              Ova radnja se ne može poništiti.
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
              Obriši
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OglasCard
// ---------------------------------------------------------------------------

function OglasCard({ oglas, onEdit, onDelete, onStatusChange }) {
  const [statusChanging, setStatusChanging] = useState(false);

  const handleStatusChange = async (val) => {
    setStatusChanging(true);
    await onStatusChange(oglas.id, val);
    setStatusChanging(false);
  };

  const portali = oglas.objavi_na || [];

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      {/* Slika placeholder ili prva slika */}
      {oglas.slike?.length > 0 ? (
        <div className="relative h-40 w-full overflow-hidden bg-muted">
          <img
            src={oglas.slike[0]}
            alt={oglas.naslov}
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center bg-muted/40">
          <Building className="h-10 w-10 text-muted-foreground/30" />
        </div>
      )}

      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-2 text-base leading-snug">
            {oglas.naslov}
          </CardTitle>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[oglas.status] || STATUS_COLORS.nacrt}`}
          >
            {STATUS_LABELS[oglas.status] || oglas.status}
          </span>
        </div>

        {/* Tip + lokacija */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Badge variant="outline" className="text-xs">
            <Tag className="mr-1 h-3 w-3" />
            {TIP_LABELS[oglas.tip_ponude] || oglas.tip_ponude}
          </Badge>
          {oglas.grad && (
            <Badge variant="outline" className="text-xs">
              {oglas.grad}
            </Badge>
          )}
          {oglas.vrsta && (
            <Badge variant="secondary" className="text-xs capitalize">
              {oglas.vrsta.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 pb-2">
        {/* Cijena */}
        <div className="flex items-center gap-1 text-lg font-semibold text-primary">
          <Euro className="h-4 w-4" />
          {formatPrice(oglas.cijena, oglas.cijena_valuta)}
          {oglas.tip_ponude === "iznajmljivanje" && (
            <span className="text-sm font-normal text-muted-foreground">
              /mj
            </span>
          )}
        </div>

        {/* Detalji */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {oglas.povrsina_m2 && <span>{oglas.povrsina_m2} m²</span>}
          {oglas.broj_soba && <span>{oglas.broj_soba} sobe</span>}
          {oglas.kat && <span>Kat: {oglas.kat}</span>}
        </div>

        {/* Portali */}
        {portali.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {portali.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
              >
                <SquareArrowOutUpRight className="h-3 w-3" />
                {p}
              </span>
            ))}
          </div>
        )}

        {/* Opis skraćen */}
        {oglas.opis && (
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
            {oglas.opis}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between gap-2 border-t bg-muted/20 pt-3">
        {/* Status promjena */}
        <Select
          value={oglas.status}
          onValueChange={handleStatusChange}
          disabled={statusChanging}
        >
          <SelectTrigger className="h-7 w-32 text-xs">
            {statusChanging ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <SelectValue />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nacrt">Nacrt</SelectItem>
            <SelectItem value="aktivan">Aktivan</SelectItem>
            <SelectItem value="pauziran">Pauziran</SelectItem>
            <SelectItem value="arhiviran">Arhiviran</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onEdit}
            title="Uredi oglas"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
            title="Obriši oglas"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
