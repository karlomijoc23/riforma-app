import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Ruler,
  Euro,
  Calendar,
  FileText,
  Printer,
  Edit,
  MapPin,
  Building,
  AlertTriangle,
  Activity,
  MoreHorizontal,
  User,
  Plus,
  Clock,
  CheckCircle2,
  Wrench,
  Lock,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { Badge } from "../../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Separator } from "../../components/ui/separator";
import { api } from "../../shared/api";
import { useEntityStore } from "../../shared/entityStore";
import {
  formatCurrency,
  formatArea,
  formatDate,
  parseSmartNumber,
} from "../../shared/formatters";
import NekretninarForm from "./NekretninarForm";
import ParkingTab from "./ParkingTab";
import PropertyPrintTemplate from "./PropertyPrintTemplate";
import { generatePdf } from "../../shared/pdfGenerator";
import { toast } from "../../components/ui/sonner";

const NekretninaDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    ugovori,
    zakupnici,
    nekretnine,
    propertyUnits,
    refresh,
    ensureNekretnine,
    ensureZakupnici,
    ensureUgovori,
  } = useEntityStore();

  useEffect(() => {
    ensureNekretnine();
    ensureZakupnici();
    ensureUgovori();
  }, [ensureNekretnine, ensureZakupnici, ensureUgovori]);

  // State
  const [property, setProperty] = useState(null);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [existingUnits, setExistingUnits] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [printContracts, setPrintContracts] = useState([]);
  const printRef = useRef();

  // Load property and units
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Try store first (instant when navigating from list)
        const fromStore = nekretnine.find((n) => String(n.id) === String(id));
        if (fromStore) {
          setProperty(fromStore);
        } else {
          // Deep-link or direct URL
          const res = await api.getNekretnina(id);
          setProperty(res.data);
        }
        // Always fetch units fresh
        const unitsRes = await api.getUnitsForProperty(id);
        setUnits(unitsRes.data || []);
      } catch (err) {
        console.error("Failed to load property", err);
        toast.error("Nekretnina nije pronađena");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id, nekretnine]);

  // Keep property in sync with store updates (e.g. after edit)
  useEffect(() => {
    if (!property) return;
    const updated = nekretnine.find((n) => String(n.id) === String(id));
    if (updated && updated !== property) {
      setProperty(updated);
    }
  }, [nekretnine, id]);

  // Computed values
  const activeContracts = useMemo(
    () =>
      (ugovori || []).filter(
        (c) =>
          String(c.nekretnina_id) === String(id) &&
          (c.status === "aktivno" || c.status === "na_isteku"),
      ),
    [ugovori, id],
  );

  const monthlyIncome = useMemo(
    () =>
      activeContracts.reduce(
        (sum, c) => sum + (parseFloat(c.osnovna_zakupnina) || 0),
        0,
      ),
    [activeContracts],
  );

  const occupancy = useMemo(() => {
    // Nekretnina bez jedinica — popunjenost temelji na ugovorima direktno
    if (units.length === 0) {
      const hasActiveContract = activeContracts.length > 0;
      return {
        percent: hasActiveContract ? 100 : 0,
        occupied: 0,
        total: 0,
        occupiedCount: hasActiveContract ? 1 : 0,
        totalCount: 1,
        noUnits: true,
      };
    }

    const activeUnitIds = new Set(
      activeContracts
        .filter((c) => c.property_unit_id)
        .map((c) => c.property_unit_id),
    );

    const totalArea = units.reduce(
      (sum, u) => sum + (parseFloat(u.povrsina_m2) || 0),
      0,
    );
    const occupiedUnits = units.filter(
      (u) => u.status === "iznajmljeno" || activeUnitIds.has(u.id),
    );
    const occupiedArea = occupiedUnits.reduce(
      (sum, u) => sum + (parseFloat(u.povrsina_m2) || 0),
      0,
    );

    if (totalArea === 0)
      return {
        percent: 0,
        occupied: 0,
        total: 0,
        occupiedCount: 0,
        totalCount: units.length,
      };

    return {
      percent: Math.round((occupiedArea / totalArea) * 100),
      occupied: occupiedArea,
      total: totalArea,
      occupiedCount: occupiedUnits.length,
      totalCount: units.length,
    };
  }, [units, activeContracts]);

  // Financial history
  const financialHistory = useMemo(() => {
    if (!property) return [];
    const currentYear = new Date().getFullYear();

    if (
      property.financijska_povijest &&
      property.financijska_povijest.length > 0
    ) {
      return property.financijska_povijest
        .sort((a, b) => b.godina - a.godina)
        .map((item) => {
          const prihodi = parseSmartNumber(item.prihodi);
          const rashodi = parseSmartNumber(item.rashodi);
          const amortizacija = parseSmartNumber(item.amortizacija);
          return {
            year: item.godina,
            prihodi,
            rashodi,
            amortizacija,
            neto: prihodi - rashodi + amortizacija,
          };
        });
    }
    // Fallback
    return [
      {
        year: currentYear - 1,
        prihodi: property.prosllogodisnji_prihodi || 0,
        rashodi: property.prosllogodisnji_rashodi || 0,
        neto: property.neto_prihod || 0,
      },
    ].filter((f) => f.prihodi > 0 || f.rashodi > 0);
  }, [property]);

  // All contracts for this property (for print & financije)
  const allPropertyContracts = useMemo(
    () => (ugovori || []).filter((c) => String(c.nekretnina_id) === String(id)),
    [ugovori, id],
  );

  // Handlers
  const handleEdit = async () => {
    try {
      const res = await api.getUnitsForProperty(id);
      setExistingUnits(res.data || []);
    } catch (err) {
      console.error("Failed to fetch units for editing", err);
      toast.error("Neuspješno učitavanje jedinica");
    }
    setIsEditOpen(true);
  };

  const handleSubmit = async ({
    nekretnina,
    units: formUnits,
    deletedUnitIds,
    imageFile,
  }) => {
    setSubmitting(true);
    try {
      let imagePath = nekretnina.slika;

      if (imageFile) {
        try {
          const docResponse = await api.createDokument({
            file: imageFile,
            tip: "ostalo",
            naziv: `Slika - ${nekretnina.naziv || "Nekretnina"}`,
            nekretnina_id: id,
          });
          if (docResponse.data && docResponse.data.putanja_datoteke) {
            imagePath = docResponse.data.putanja_datoteke;
          }
        } catch (uploadError) {
          console.error("Failed to upload image", uploadError);
          toast.error(
            "Prijenos slike nije uspio, ali nastavljam sa spremanjem.",
          );
        }
      }

      const propertyData = { ...nekretnina, slika: imagePath };
      await api.updateNekretnina(id, propertyData);

      // Handle units
      if (formUnits && formUnits.length > 0) {
        for (const unit of formUnits) {
          if (unit.id) {
            await api.updateUnit(unit.id, unit);
          } else {
            await api.createUnit(id, unit);
          }
        }
      }

      // Handle unit deletions
      if (deletedUnitIds && deletedUnitIds.length > 0) {
        for (const unitId of deletedUnitIds) {
          await api.deleteUnit(unitId);
        }
      }

      toast.success("Nekretnina je ažurirana");
      setIsEditOpen(false);

      // Refresh store and reload local data
      await refresh();
      const [propRes, unitsRes] = await Promise.all([
        api.getNekretnina(id),
        api.getUnitsForProperty(id),
      ]);
      setProperty(propRes.data);
      setUnits(unitsRes.data || []);
    } catch (error) {
      console.error("Greška pri spremanju:", error);
      toast.error("Spremanje nije uspjelo");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = async () => {
    if (!property) return;
    try {
      const propertyContracts = (ugovori || []).filter(
        (c) => String(c.nekretnina_id) === String(id),
      );
      setPrintContracts(propertyContracts);
      setTimeout(async () => {
        await generatePdf(
          printRef.current,
          `nekretnina_${property.naziv.replace(/\s+/g, "_")}`,
          "portrait",
        );
        toast.success("PDF je generiran");
      }, 100);
    } catch (error) {
      console.error("Print error:", error);
      toast.error("Greška pri generiranju PDF-a");
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not found state
  if (!property) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">
        <Building className="mx-auto h-16 w-16 text-muted-foreground/30" />
        <h2 className="mt-4 text-xl font-semibold">
          Nekretnina nije pronađena
        </h2>
        <p className="mt-2 text-muted-foreground">
          Tražena nekretnina ne postoji ili je uklonjena.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/nekretnine">
            <ArrowLeft className="mr-2 h-4 w-4" /> Natrag na listu
          </Link>
        </Button>
      </div>
    );
  }

  const occupancyColor =
    occupancy.percent >= 75
      ? "text-emerald-600"
      : occupancy.percent >= 40
        ? "text-amber-600"
        : "text-red-500";

  const occupancyBarColor =
    occupancy.percent >= 75
      ? "bg-emerald-500"
      : occupancy.percent >= 40
        ? "bg-amber-500"
        : occupancy.percent > 0
          ? "bg-red-400"
          : "bg-secondary";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 space-y-6">
      {/* Off-screen print template */}
      <div className="absolute top-0 left-[-9999px] -z-50">
        <PropertyPrintTemplate
          ref={printRef}
          property={property}
          contracts={printContracts}
          units={units}
        />
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="mt-1 shrink-0">
            <Link to="/nekretnine">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">
                {property.naziv}
              </h1>
              <Badge variant="outline" className="capitalize">
                {property.vrsta?.replace(/_/g, " ") || "Nekretnina"}
              </Badge>
            </div>
            <div className="flex items-center text-muted-foreground mt-1">
              <MapPin className="mr-1.5 h-4 w-4 shrink-0" />
              <span>{property.adresa}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleEdit}>
            <Edit className="mr-2 h-4 w-4" /> Uredi
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Ispiši
          </Button>
        </div>
      </div>

      {/* Hero Image */}
      {property.slika && (
        <div className="w-full max-h-64 rounded-lg overflow-hidden bg-muted">
          <img
            src={`${api.getBackendUrl()}/${property.slika}`}
            alt={property.naziv}
            className="w-full h-full object-cover max-h-64"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Ukupna površina
            </CardTitle>
            <Ruler className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatArea(property.povrsina)}
            </div>
            {units.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {units.length} {units.length === 1 ? "jedinica" : "jedinica"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Tržišna vrijednost
            </CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(
                property.trzisna_vrijednost || property.nabavna_cijena,
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Mjesečni prihod
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(monthlyIncome)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {activeContracts.length}{" "}
              {activeContracts.length === 1
                ? "aktivan ugovor"
                : "aktivnih ugovora"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Zakupljenost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${occupancyColor}`}>
              {occupancy.percent}%
            </div>
            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden mt-2">
              <div
                className={`h-full transition-all duration-500 ease-in-out ${occupancyBarColor}`}
                style={{ width: `${occupancy.percent}%` }}
              />
            </div>
            {occupancy.noUnits ? (
              <p className="text-xs text-muted-foreground mt-1">
                {activeContracts.length > 0
                  ? "Iznajmljeno (bez jedinica)"
                  : "Slobodno"}
              </p>
            ) : occupancy.totalCount > 0 ? (
              <p className="text-xs text-muted-foreground mt-1">
                {occupancy.occupiedCount}/{occupancy.totalCount} jedinica •{" "}
                {formatArea(occupancy.occupied)} od{" "}
                {formatArea(occupancy.total)}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pregled" className="w-full">
        <TabsList className="flex flex-wrap h-auto p-1 gap-1 w-full justify-start">
          <TabsTrigger value="pregled" className="flex-1 min-w-[80px]">
            Pregled
          </TabsTrigger>
          <TabsTrigger value="financije" className="flex-1 min-w-[80px]">
            Financije
          </TabsTrigger>
          <TabsTrigger value="units" className="flex-1 min-w-[100px]">
            Jedinice ({units.length})
          </TabsTrigger>
          <TabsTrigger value="napomene" className="flex-1 min-w-[80px]">
            Napomene
          </TabsTrigger>
          {property.has_parking && (
            <TabsTrigger value="parking" className="flex-1 min-w-[80px]">
              Parking
            </TabsTrigger>
          )}
        </TabsList>

        {/* === PREGLED TAB === */}
        <TabsContent value="pregled" className="space-y-6 mt-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Osnovni podaci */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building className="h-4 w-4 text-primary" />
                  Osnovni podaci
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Godina izgradnje
                    </p>
                    <p className="font-medium mt-0.5">
                      {property.godina_izgradnje || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Vlasnik
                    </p>
                    <p className="font-medium mt-0.5">
                      {property.vlasnik || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Udio vlasništva
                    </p>
                    <p className="font-medium mt-0.5">
                      {property.udio_vlasnistva || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Katastarska općina
                    </p>
                    <p className="font-medium mt-0.5">
                      {property.katastarska_opcina || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Broj kat. čestice
                    </p>
                    <p className="font-medium mt-0.5">
                      {property.broj_kat_cestice || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Osiguranje
                    </p>
                    <p className="font-medium mt-0.5">
                      {property.osiguranje || "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tehnički / Održavanje */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Održavanje i ulaganja
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Zadnja obnova
                    </p>
                    <p className="font-medium mt-0.5">
                      {formatDate(property.zadnja_obnova) || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      Troškovi održavanja
                    </p>
                    <p className="font-medium mt-0.5">
                      {property.troskovi_odrzavanja
                        ? formatCurrency(property.troskovi_odrzavanja)
                        : "—"}
                    </p>
                  </div>
                </div>
                {property.potrebna_ulaganja && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Potrebna ulaganja
                    </p>
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <p className="whitespace-pre-wrap text-amber-900">
                          {property.potrebna_ulaganja}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {property.napomene && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      Napomene i brojila
                    </p>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                      {property.napomene}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* === FINANCIJE TAB === */}
        <TabsContent value="financije" className="space-y-6 mt-4">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Nabavna cijena
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(property.nabavna_cijena)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Amortizacija
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(property.amortizacija)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Troškovi održavanja
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(property.troskovi_odrzavanja)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Active contract revenue breakdown */}
          {activeContracts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  Prihod iz aktivnih ugovora
                </CardTitle>
                <CardDescription>
                  Pregled mjesečnog prihoda po ugovorima.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ugovor</TableHead>
                      <TableHead>Zakupnik</TableHead>
                      <TableHead>Jedinica</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">
                        Mjesečna zakupnina
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeContracts.map((c) => {
                      const tenant = (zakupnici || []).find(
                        (z) => z.id === c.zakupnik_id,
                      );
                      const unit = units.find(
                        (u) => u.id === c.property_unit_id,
                      );
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {c.interna_oznaka || "—"}
                          </TableCell>
                          <TableCell>
                            {tenant?.naziv || c.zakupnik_naziv || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {unit?.oznaka || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={
                                c.status === "aktivno"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                              }
                            >
                              {c.status === "aktivno" ? "Aktivan" : "Na isteku"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium text-emerald-600">
                            {formatCurrency(c.osnovna_zakupnina)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="border-t-2">
                      <TableCell colSpan={4} className="font-bold text-right">
                        Ukupno mjesečno:
                      </TableCell>
                      <TableCell className="text-right font-bold text-emerald-600">
                        {formatCurrency(monthlyIncome)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="font-medium text-right text-muted-foreground"
                      >
                        Godišnji prihod (projekcija):
                      </TableCell>
                      <TableCell className="text-right font-medium text-muted-foreground">
                        {formatCurrency(monthlyIncome * 12)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Financial history */}
          {financialHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Financijski pregled</CardTitle>
                <CardDescription>
                  Prikaz prihoda, rashoda i neto dobiti kroz godine.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Godina</TableHead>
                      <TableHead className="text-right">Prihodi</TableHead>
                      <TableHead className="text-right">Rashodi</TableHead>
                      <TableHead className="text-right">Neto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {financialHistory.map((item) => (
                      <TableRow key={item.year}>
                        <TableCell className="font-medium">
                          {item.year}.
                        </TableCell>
                        <TableCell className="text-right text-emerald-600">
                          {formatCurrency(item.prihodi)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatCurrency(item.rashodi)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-bold ${
                            item.neto >= 0 ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {formatCurrency(item.neto)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === PODPROSTORI TAB === */}
        <TabsContent value="units" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Jedinice</CardTitle>
                <CardDescription>
                  Popis svih jedinica unutar nekretnine. Statusi se automatski
                  ažuriraju na temelju ugovora.
                </CardDescription>
              </div>
              {units.length > 0 && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    {units.filter((u) => u.status === "dostupno").length}{" "}
                    dostupno
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                    {units.filter((u) => u.status === "iznajmljeno").length}{" "}
                    iznajmljeno
                  </span>
                  {units.filter(
                    (u) =>
                      u.status === "rezervirano" || u.status === "u_odrzavanju",
                  ).length > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                      {
                        units.filter(
                          (u) =>
                            u.status === "rezervirano" ||
                            u.status === "u_odrzavanju",
                        ).length
                      }{" "}
                      ostalo
                    </span>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {units.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Building className="mx-auto h-10 w-10 text-muted-foreground/30 mb-2" />
                  <p>Nema definiranih jedinica.</p>
                  <p className="text-sm mt-1">
                    Dodajte jedinice kroz formu za uređivanje nekretnine.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Oznaka</TableHead>
                      <TableHead>Naziv</TableHead>
                      <TableHead>Kat</TableHead>
                      <TableHead>Površina</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Zakupnik</TableHead>
                      <TableHead>Zakupnina</TableHead>
                      <TableHead>Ugovor do</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {units.map((unit) => {
                      const activeContract = (ugovori || []).find(
                        (c) =>
                          (c.status === "aktivno" ||
                            c.status === "na_isteku") &&
                          (c.property_unit_id === unit.id ||
                            c.property_unit_id === unit.localId),
                      );
                      const tenant = activeContract
                        ? (zakupnici || []).find(
                            (z) => z.id === activeContract.zakupnik_id,
                          )
                        : null;
                      const tenantName = tenant
                        ? tenant.naziv
                        : activeContract?.zakupnik_naziv || null;

                      // Contract expiry info
                      let daysLeft = null;
                      let expiryDate = null;
                      if (activeContract?.datum_zavrsetka) {
                        expiryDate = new Date(activeContract.datum_zavrsetka);
                        daysLeft = Math.ceil(
                          (expiryDate - new Date()) / (1000 * 60 * 60 * 24),
                        );
                      }

                      const statusConfig = {
                        iznajmljeno: {
                          label: "Iznajmljeno",
                          className:
                            "bg-blue-100 text-blue-700 border-blue-200",
                          icon: <Lock className="h-3 w-3" />,
                        },
                        dostupno: {
                          label: "Dostupno",
                          className:
                            "bg-emerald-100 text-emerald-700 border-emerald-200",
                          icon: <CheckCircle2 className="h-3 w-3" />,
                        },
                        slobodno: {
                          label: "Dostupno",
                          className:
                            "bg-emerald-100 text-emerald-700 border-emerald-200",
                          icon: <CheckCircle2 className="h-3 w-3" />,
                        },
                        rezervirano: {
                          label: "Rezervirano",
                          className:
                            "bg-amber-100 text-amber-700 border-amber-200",
                          icon: <Clock className="h-3 w-3" />,
                        },
                        u_odrzavanju: {
                          label: "U održavanju",
                          className:
                            "bg-slate-100 text-slate-700 border-slate-200",
                          icon: <Wrench className="h-3 w-3" />,
                        },
                      };
                      const sc = statusConfig[unit.status] || {
                        label: unit.status || "—",
                        className: "",
                        icon: null,
                      };

                      return (
                        <TableRow key={unit.id}>
                          <TableCell className="font-medium">
                            {unit.oznaka}
                          </TableCell>
                          <TableCell>{unit.naziv || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {unit.kat || "—"}
                          </TableCell>
                          <TableCell>{formatArea(unit.povrsina_m2)}</TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`${sc.className} inline-flex items-center gap-1`}
                            >
                              {sc.icon}
                              {sc.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {tenantName ? (
                              <span className="font-medium text-blue-600">
                                {tenantName}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {activeContract
                              ? formatCurrency(activeContract.osnovna_zakupnina)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {expiryDate ? (
                              <span
                                className={`text-xs font-medium tabular-nums ${
                                  daysLeft <= 30
                                    ? "text-red-600"
                                    : daysLeft <= 90
                                      ? "text-amber-600"
                                      : "text-muted-foreground"
                                }`}
                                title={`${daysLeft} dana do isteka`}
                              >
                                {formatDate(activeContract.datum_zavrsetka)}
                                {daysLeft <= 90 && (
                                  <span className="block text-[10px] font-normal">
                                    ({daysLeft} dana)
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Akcije</DropdownMenuLabel>
                                {activeContract ? (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      navigate(`/ugovori/${activeContract.id}`)
                                    }
                                  >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Vidi ugovor
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      navigate(
                                        `/ugovori?new=1&nekretnina_id=${id}&property_unit_id=${unit.id}`,
                                      )
                                    }
                                  >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Novi ugovor
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === NAPOMENE TAB === */}
        <TabsContent value="napomene" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <CardTitle className="text-base">Sudski sporovi</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">
                  {property.sudski_sporovi || "Nema aktivnih sudskih sporova."}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <CardTitle className="text-base">Hipoteke i tereti</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">
                  {property.hipoteke ||
                    "Nema zabilježenih hipoteka ili tereta."}
                </p>
              </CardContent>
            </Card>
          </div>
          {property.napomene && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Opće napomene</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">
                  {property.napomene}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === PARKING TAB === */}
        {property.has_parking && (
          <TabsContent value="parking" className="mt-4">
            <ParkingTab nekretninaId={property.id} zakupnici={zakupnici} />
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Uredi nekretninu</DialogTitle>
            <DialogDescription>
              Izmijenite detalje postojeće nekretnine.
            </DialogDescription>
          </DialogHeader>
          <NekretninarForm
            nekretnina={property}
            existingUnits={existingUnits}
            onSubmit={handleSubmit}
            onCancel={() => setIsEditOpen(false)}
            submitting={submitting}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NekretninaDetailPage;
