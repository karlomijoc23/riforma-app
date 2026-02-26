import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useEntityStore } from "../../shared/entityStore";
import { api } from "../../shared/api";
import { toast } from "../../components/ui/sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../../components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import {
  Plus,
  Building,
  MapPin,
  Ruler,
  Euro,
  Search,
  Filter,
  LayoutGrid,
  Eye,
  MoreVertical,
  Edit,
  Trash2,
  Printer,
  FileBarChart,
  Upload,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import NekretninarForm from "./NekretninarForm";
import NekretninaDetails from "./NekretninaDetails";
import { formatCurrency, formatArea } from "../../shared/formatters";

import { generatePdf } from "../../shared/pdfGenerator";
import PropertyPrintTemplate from "./PropertyPrintTemplate";
import { EmptyState } from "../../components/ui/empty-state";
import ImportDialog from "../../components/ImportDialog";

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

const NekretninePage = () => {
  const navigate = useNavigate();
  const {
    nekretnine,
    ugovori,
    refresh: refreshNekretnine,
    loading,
    propertyUnits,
    ensureNekretnine,
    ensureZakupnici,
    ensureUgovori,
  } = useEntityStore();

  useEffect(() => {
    ensureNekretnine();
    ensureZakupnici();
    ensureUgovori();
  }, [ensureNekretnine, ensureZakupnici, ensureUgovori]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [existingUnits, setExistingUnits] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Import Dialog State
  const [importOpen, setImportOpen] = useState(false);

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState(null);

  const confirmDelete = async () => {
    if (!propertyToDelete) return;
    try {
      await api.deleteNekretnina(propertyToDelete.id);
      toast.success("Nekretnina je obrisana");
      await refreshNekretnine();
    } catch (error) {
      console.error("Greška pri brisanju:", error);
      toast.error("Brisanje nije uspjelo");
    } finally {
      setDeleteDialogOpen(false);
      setPropertyToDelete(null);
    }
  };

  const handleDeleteCallback = (property) => {
    setPropertyToDelete(property);
    setDeleteDialogOpen(true);
  };

  // Quick View State
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [viewProperty, setViewProperty] = useState(null);
  const [viewContracts, setViewContracts] = useState([]);

  // Filtering state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  /* Helper to calculate monthly income from active contracts */
  const calculateMonthlyIncome = (propertyId, allContracts) => {
    const activeContracts = allContracts.filter(
      (c) =>
        c.nekretnina_id === propertyId &&
        (c.status === "aktivno" || c.status === "na_isteku"),
    );
    return activeContracts.reduce(
      (sum, c) => sum + (parseFloat(c.osnovna_zakupnina) || 0),
      0,
    );
  };

  const printRef = React.useRef();

  const calculateOccupancy = (propertyId, allUnits) => {
    const units = allUnits.filter(
      (u) => u.nekretnina_id === propertyId || u.localId === propertyId,
    );
    if (units.length === 0)
      return {
        percent: 0,
        occupied: 0,
        total: 0,
        occupiedCount: 0,
        totalCount: 0,
      };

    // Build set of unit IDs that have an active contract for this property
    const activeUnitIds = new Set(
      (ugovori || [])
        .filter(
          (c) =>
            c.nekretnina_id === propertyId &&
            (c.status === "aktivno" || c.status === "na_isteku") &&
            c.property_unit_id,
        )
        .map((c) => c.property_unit_id),
    );

    const totalArea = units.reduce(
      (sum, u) => sum + (parseFloat(u.povrsina_m2) || 0),
      0,
    );
    // Consider unit occupied if status is iznajmljeno OR has an active contract
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
  };

  const handleCreate = () => {
    setSelectedProperty(null);
    setExistingUnits([]);
    setIsDialogOpen(true);
  };

  const handleEdit = async (property) => {
    setSelectedProperty(property);
    setExistingUnits([]); // Reset while loading
    try {
      const res = await api.getUnitsForProperty(property.id);
      setExistingUnits(res.data || []);
    } catch (err) {
      console.error("Failed to fetch units for editing", err);
      toast.error("Neuspješno učitavanje jedinica");
    }
    setIsDialogOpen(true);
  };

  const handleDelete = (property) => {
    setPropertyToDelete(property);
    setDeleteDialogOpen(true);
  };

  const handleView = (property) => {
    setViewProperty(property);
    setViewContracts([]); // Reset
    setIsSheetOpen(true);
  };

  const handlePrint = async () => {
    if (!viewProperty) return;
    try {
      // Use contracts from store which are already enriching with tenant names
      const propertyContracts = ugovori.filter(
        (c) => c.nekretnina_id === viewProperty.id,
      );
      setViewContracts(propertyContracts);

      // Allow state to update before printing
      setTimeout(async () => {
        await generatePdf(
          printRef.current,
          `nekretnina_${viewProperty.naziv.replace(/\s+/g, "_")}`,
          "portrait",
        );
        toast.success("PDF je generiran");
      }, 100);
    } catch (error) {
      console.error("Print error:", error);
      toast.error("Greška pri generiranju PDF-a");
    }
  };

  const handleSubmit = async ({
    nekretnina,
    units,
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
            tip: "ostalo", // Or "slika_nekretnine" if supported, but "ostalo" is safe
            naziv: `Slika - ${nekretnina.naziv || "Nekretnina"}`,
            nekretnina_id: selectedProperty?.id, // Might be null for new property, handled below
          });
          // If it's a new property, we can't link it yet in createDokument if we don't have ID.
          // But we need the path to save in property.
          // Actually, createDokument returns the document object.
          // We can use the returned path.
          // If we want to link it to the property, we might need to update the document AFTER creating the property if it's new.
          // But for now, let's just use the path for the property 'slika' field.
          if (docResponse.data && docResponse.data.putanja_datoteke) {
            imagePath = docResponse.data.putanja_datoteke;
          }
        } catch (uploadError) {
          console.error("Failed to upload image", uploadError);
          toast.error(
            "Prijenos slike nije uspio, ali nastavljam sa spremanjem nekretnine.",
          );
        }
      }

      const propertyData = { ...nekretnina, slika: imagePath };

      if (selectedProperty) {
        await api.updateNekretnina(selectedProperty.id, propertyData);
        const propertyId = selectedProperty.id;

        // Handle Units (Create & Update)
        if (units && units.length > 0) {
          for (const unit of units) {
            if (unit.id) {
              await api.updateUnit(unit.id, unit);
            } else {
              await api.createUnit(propertyId, unit);
            }
          }
        }

        // Handle Unit Deletions
        if (deletedUnitIds && deletedUnitIds.length > 0) {
          for (const unitId of deletedUnitIds) {
            await api.deleteUnit(unitId);
          }
        }

        toast.success("Nekretnina je ažurirana");
      } else {
        const response = await api.createNekretnina(propertyData);
        const newPropertyId = response.data.id;

        if (units && units.length > 0) {
          for (const unit of units) {
            await api.createUnit(newPropertyId, unit);
          }
        }
        toast.success("Nekretnina je kreirana");
      }
      setIsDialogOpen(false);
      await refreshNekretnine();
    } catch (error) {
      console.error("Greška pri spremanju nekretnine:", error);
      toast.error("Spremanje nije uspjelo");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProperties = useMemo(() => {
    return nekretnine.filter((property) => {
      const matchesSearch =
        (property.naziv?.toLowerCase() || "").includes(
          searchQuery.toLowerCase(),
        ) ||
        (property.adresa?.toLowerCase() || "").includes(
          searchQuery.toLowerCase(),
        );

      const matchesType = typeFilter === "all" || property.vrsta === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [nekretnine, searchQuery, typeFilter]);

  const propertyTypes = useMemo(() => {
    const types = new Set(nekretnine.map((p) => p.vrsta).filter(Boolean));
    return Array.from(types);
  }, [nekretnine]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 space-y-8">
      {/* Off-screen print template */}
      <div className="absolute top-0 left-[-9999px] -z-50">
        <PropertyPrintTemplate
          ref={printRef}
          property={viewProperty}
          contracts={viewContracts}
          units={
            viewProperty
              ? propertyUnits.filter(
                  (u) =>
                    u.nekretnina_id === viewProperty.id ||
                    u.localId === viewProperty.id,
                )
              : []
          }
        />
      </div>

      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            Nekretnine
          </h1>
          <p className="mt-1 text-muted-foreground">
            Upravljajte portfeljem nekretnina, pratite vrijednost i ključne
            informacije.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="lg"
            className="shadow-sm"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="mr-2 h-4 w-4" /> Uvoz CSV
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="shadow-sm"
            onClick={() => navigate("/nekretnine/report")}
          >
            <FileBarChart className="mr-2 h-4 w-4" /> Izvještaj
          </Button>
          <Button onClick={handleCreate} size="lg" className="shadow-sm">
            <Plus className="mr-2 h-4 w-4" /> Dodaj nekretninu
          </Button>
        </div>
      </div>

      {/* Filters Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between bg-muted/30 p-4 rounded-lg border border-border/50">
        <div className="flex flex-1 items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pretraži po nazivu ili adresi..."
              className="pl-9 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] bg-background">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Tip nekretnine" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi tipovi</SelectItem>
              {propertyTypes.map((type) => (
                <SelectItem key={type} value={type} className="capitalize">
                  {type.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-muted-foreground font-medium">
          Prikazano {filteredProperties.length} od {nekretnine.length}{" "}
          nekretnina
        </div>
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProperties.map((property) => (
          <Card
            key={property.id}
            className="group overflow-hidden transition-all hover:shadow-lg hover:border-primary/20 flex flex-col cursor-pointer"
            onClick={() => navigate(`/nekretnine/${property.id}`)}
          >
            {/* Image / Header */}
            <div className="h-40 bg-muted relative flex items-center justify-center border-b overflow-hidden">
              {property.slika ? (
                <img
                  src={`${api.getBackendUrl()}/${property.slika}`}
                  alt={property.naziv}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = "";
                    e.target.style.display = "none";
                    e.target.nextSibling.style.display = "flex";
                  }}
                />
              ) : null}

              {/* Placeholder (shown if no image or error) */}
              <div
                className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted/50 ${property.slika ? "hidden" : "flex"}`}
              >
                <Building className="h-12 w-12 text-muted-foreground/20" />
              </div>

              <Badge
                variant="secondary"
                className="absolute top-3 right-3 capitalize shadow-sm bg-background/80 backdrop-blur-sm z-10"
              >
                {property.vrsta?.replace(/_/g, " ") || "Nekretnina"}
              </Badge>
            </div>

            <CardHeader className="pb-2">
              <CardTitle className="line-clamp-1 text-lg group-hover:text-primary transition-colors">
                {property.naziv}
              </CardTitle>
              <div className="flex items-center text-sm text-muted-foreground mt-1">
                <MapPin className="mr-1 h-3 w-3" />
                <span className="truncate">{property.adresa}</span>
              </div>
            </CardHeader>

            <CardContent className="pb-3 flex-1 flex flex-col justify-end">
              <div className="flex justify-between items-center text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Ruler className="h-3.5 w-3.5" />
                  <span>{formatArea(property.povrsina)}</span>
                </div>
                <span className="font-medium text-foreground">
                  {formatCurrency(
                    property.trzisna_vrijednost || property.nabavna_cijena,
                  )}
                </span>
              </div>
            </CardContent>

            {/* Compact occupancy bar */}
            <div className="px-6 pb-3">
              {(() => {
                const occupancy = calculateOccupancy(
                  property.id,
                  propertyUnits,
                );
                if (occupancy.totalCount === 0) return null;
                return (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ease-in-out ${
                          occupancy.percent >= 75
                            ? "bg-emerald-500"
                            : occupancy.percent >= 40
                              ? "bg-amber-500"
                              : occupancy.percent > 0
                                ? "bg-red-400"
                                : "bg-secondary"
                        }`}
                        style={{ width: `${occupancy.percent}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground font-medium w-8 text-right">
                      {occupancy.percent}%
                    </span>
                  </div>
                );
              })()}
            </div>

            <CardFooter className="pt-2 pb-3 px-6 border-t flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Opcije"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleView(property);
                    }}
                  >
                    <Eye className="mr-2 h-4 w-4" /> Brzi pregled
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(property);
                    }}
                  >
                    <Edit className="mr-2 h-4 w-4" /> Uredi
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCallback(property);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Obriši
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardFooter>
          </Card>
        ))}

        {filteredProperties.length === 0 && !loading && (
          <div className="col-span-full">
            {searchQuery || typeFilter !== "all" ? (
              <EmptyState
                icon={Search}
                title="Nema pronađenih nekretnina"
                description="Nismo pronašli nijednu nekretninu koja odgovara vašim kriterijima pretraživanja."
                actionLabel="Očisti filtere"
                onAction={() => {
                  setSearchQuery("");
                  setTypeFilter("all");
                }}
              />
            ) : (
              <EmptyState
                icon={Building}
                title="Nema nekretnina"
                description="Vaš portfelj je trenutno prazan. Dodajte svoju prvu nekretninu."
                actionLabel="Dodaj nekretninu"
                onAction={handleCreate}
              />
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedProperty ? "Uredi nekretninu" : "Nova nekretnina"}
            </DialogTitle>
            <DialogDescription>
              {selectedProperty
                ? "Izmijenite detalje postojeće nekretnine."
                : "Unesite podatke za novu nekretninu u portfelju."}
            </DialogDescription>
          </DialogHeader>
          <NekretninarForm
            nekretnina={selectedProperty}
            existingUnits={existingUnits}
            onSubmit={handleSubmit}
            onCancel={() => setIsDialogOpen(false)}
            submitting={submitting}
          />
        </DialogContent>
      </Dialog>

      {/* Quick View Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-[400px] sm:w-[800px] sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="flex flex-row justify-between items-start">
            <div>
              <SheetTitle>Detalji nekretnine</SheetTitle>
              <SheetDescription>
                Pregled svih informacija o nekretnini.
              </SheetDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="mr-8"
            >
              <Printer className="mr-2 h-4 w-4" /> Ispiši
            </Button>
          </SheetHeader>
          <div className="mt-6">
            <NekretninaDetails nekretnina={viewProperty} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Jeste li sigurni?</AlertDialogTitle>
            <AlertDialogDescription>
              Ova radnja se ne može poništiti. Ovo će trajno obrisati nekretninu
              "{propertyToDelete?.naziv}" i sve povezane podatke.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Odustani</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Obriši
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        endpoint="nekretnine"
        title="Uvoz nekretnina iz CSV"
        onSuccess={refreshNekretnine}
      />
    </div>
  );
};

export default NekretninePage;
