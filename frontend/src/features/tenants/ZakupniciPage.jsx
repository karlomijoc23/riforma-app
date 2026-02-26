import React, { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useEntityStore } from "../../shared/entityStore";
import { api } from "../../shared/api";
import { formatCurrency } from "../../shared/formatters";
import { toast } from "../../components/ui/sonner";
import { Switch } from "../../components/ui/switch";
import { Label } from "../../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
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
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Plus,
  Users,
  Mail,
  Phone,
  MapPin,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  ArrowRight,
  X,
  Building2,
  FileText,
} from "lucide-react";

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
import ZakupnikForm from "./ZakupnikForm";
import ZakupnikDetails from "./ZakupnikDetails";
import { useReactToPrint } from "react-to-print";

const ZakupniciPage = () => {
  const navigate = useNavigate();
  const {
    zakupnici,
    ugovori,
    refresh: refreshZakupnici,
    loading,
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
  const [selectedZakupnik, setSelectedZakupnik] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState(null);

  const confirmDelete = async () => {
    if (!tenantToDelete) return;
    try {
      await api.deleteZakupnik(tenantToDelete.id);
      toast.success("Zakupnik je obrisan");
      refreshZakupnici();
    } catch (error) {
      console.error("Greška pri brisanju:", error);
      toast.error("Brisanje nije uspjelo");
    } finally {
      setDeleteDialogOpen(false);
      setTenantToDelete(null);
    }
  };

  const handleDeleteCallback = (zakupnik, e) => {
    e.stopPropagation();
    setTenantToDelete(zakupnik);
    setDeleteDialogOpen(true);
  };

  // Filtering state
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("active");
  const [filterType, setFilterType] = useState("all"); // all, firma, fizicka
  const [sortBy, setSortBy] = useState("name"); // name, oib, contracts
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  const printRef = useRef();
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: selectedZakupnik
      ? `Zakupnik_${selectedZakupnik.naziv_firme || selectedZakupnik.ime_prezime}`
      : "Zakupnik",
  });

  const handleCreate = () => {
    setSelectedZakupnik(null);
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleEdit = (zakupnik) => {
    setSelectedZakupnik(zakupnik);
    setIsEditing(false);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (data) => {
    setSubmitting(true);
    try {
      if (selectedZakupnik) {
        await api.updateZakupnik(selectedZakupnik.id, data);
        toast.success("Zakupnik je ažuriran");
      } else {
        await api.createZakupnik(data);
        toast.success("Zakupnik je kreiran");
      }
      setIsDialogOpen(false);
      await refreshZakupnici();
    } catch (error) {
      console.error("Greška pri spremanju zakupnika:", error);
      toast.error("Spremanje nije uspjelo");
    } finally {
      setSubmitting(false);
    }
  };

  // Build contract summary per tenant (count + monthly revenue)
  const contractSummaryMap = useMemo(() => {
    const map = {};
    ugovori.forEach((u) => {
      if (
        u.zakupnik_id &&
        (u.status === "aktivno" || u.status === "na_isteku")
      ) {
        if (!map[u.zakupnik_id]) {
          map[u.zakupnik_id] = { count: 0, monthlyRent: 0 };
        }
        map[u.zakupnik_id].count += 1;
        map[u.zakupnik_id].monthlyRent += Number(u.osnovna_zakupnina) || 0;
      }
    });
    return map;
  }, [ugovori]);

  // Keep backwards-compat alias for sort
  const contractCountMap = useMemo(() => {
    const map = {};
    for (const [id, summary] of Object.entries(contractSummaryMap)) {
      map[id] = summary.count;
    }
    return map;
  }, [contractSummaryMap]);

  const filteredTenants = useMemo(() => {
    let result = zakupnici.filter((tenant) => {
      const name = (
        tenant.naziv_firme ||
        tenant.ime_prezime ||
        ""
      ).toLowerCase();
      const oib = tenant.oib || "";
      const email = (tenant.kontakt_email || "").toLowerCase();
      const phone = tenant.kontakt_telefon || "";
      const city = (tenant.adresa_grad || tenant.sjediste || "").toLowerCase();
      const q = searchQuery.toLowerCase();

      const matchesSearch =
        !searchQuery ||
        name.includes(q) ||
        oib.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        city.includes(q);

      const isActive = !tenant.status || tenant.status === "aktivan";
      const matchesStatus = viewMode === "active" ? isActive : !isActive;

      const isFirma = !!tenant.naziv_firme;
      const matchesType =
        filterType === "all" ||
        (filterType === "firma" && isFirma) ||
        (filterType === "fizicka" && !isFirma);

      return matchesSearch && matchesStatus && matchesType;
    });

    // Sort
    result.sort((a, b) => {
      if (sortBy === "name") {
        const nameA = (a.naziv_firme || a.ime_prezime || "").toLowerCase();
        const nameB = (b.naziv_firme || b.ime_prezime || "").toLowerCase();
        return nameA.localeCompare(nameB, "hr");
      }
      if (sortBy === "contracts") {
        return (contractCountMap[b.id] || 0) - (contractCountMap[a.id] || 0);
      }
      return 0;
    });

    return result;
  }, [zakupnici, searchQuery, viewMode, filterType, sortBy, contractCountMap]);

  const activeFilterCount = [
    filterType !== "all" ? 1 : 0,
    sortBy !== "name" ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterType, sortBy, viewMode]);

  const totalPages = Math.max(1, Math.ceil(filteredTenants.length / PAGE_SIZE));
  const paginatedTenants = filteredTenants.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const clearFilters = () => {
    setSearchQuery("");
    setFilterType("all");
    setSortBy("name");
    setViewMode("active");
    setCurrentPage(1);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            Zakupnici
          </h1>
          <p className="mt-1 text-muted-foreground">
            Upravljajte bazom zakupnika i partnera, kontakt podacima i
            ugovorima.
          </p>
        </div>
        <Button onClick={handleCreate} size="lg" className="shadow-sm">
          <Plus className="mr-2 h-4 w-4" /> Dodaj zakupnika
        </Button>
      </div>

      {/* Filters Section */}
      <div className="space-y-3 bg-muted/30 p-4 rounded-lg border border-border/50">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pretraži po imenu, OIB-u, emailu, gradu..."
              className="pl-9 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px] bg-background">
              <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Tip" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi tipovi</SelectItem>
              <SelectItem value="firma">Tvrtke</SelectItem>
              <SelectItem value="fizicka">Fizičke osobe</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[170px] bg-background">
              <SelectValue placeholder="Sortiraj" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Po nazivu</SelectItem>
              <SelectItem value="contracts">Po br. ugovora</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch
              id="archive-mode"
              checked={viewMode === "archived"}
              onCheckedChange={(checked) =>
                setViewMode(checked ? "archived" : "active")
              }
            />
            <Label htmlFor="archive-mode" className="cursor-pointer text-sm">
              Arhiva
            </Label>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground font-medium">
            Prikazano {filteredTenants.length} od {zakupnici.length} zapisa
          </div>
          {(activeFilterCount > 0 || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-7 text-xs"
            >
              <X className="h-3 w-3 mr-1" /> Očisti filtere
            </Button>
          )}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-md border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Naziv / Ime</TableHead>
              <TableHead>OIB</TableHead>
              <TableHead>Kontakt</TableHead>
              <TableHead className="text-center">Ugovori</TableHead>
              <TableHead className="text-right">Akcije</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  {loading ? (
                    <span className="text-muted-foreground">Učitavanje...</span>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                      <Users className="h-8 w-8 mb-2 opacity-20" />
                      <p>Nema rezultata za zadane kriterije.</p>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              paginatedTenants.map((tenant) => {
                const isActive = !tenant.status || tenant.status === "aktivan";
                const contracts = contractCountMap[tenant.id] || 0;
                return (
                  <TableRow
                    key={tenant.id}
                    className="group cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/zakupnici/${tenant.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                            isActive ? "bg-green-500" : "bg-red-500"
                          }`}
                          title={isActive ? "Aktivan" : "Neaktivan/Arhiviran"}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-foreground truncate">
                            {tenant.naziv_firme || tenant.ime_prezime}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5">
                            {tenant.naziv_firme ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-4"
                              >
                                Tvrtka
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 h-4"
                              >
                                Fizička osoba
                              </Badge>
                            )}
                            {(tenant.adresa_grad || tenant.sjediste) && (
                              <span className="text-xs text-muted-foreground flex items-center">
                                <MapPin className="h-3 w-3 mr-0.5" />
                                {tenant.adresa_grad || tenant.sjediste}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {tenant.oib || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {tenant.kontakt_email && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span
                              className="truncate max-w-[180px]"
                              title={tenant.kontakt_email}
                            >
                              {tenant.kontakt_email}
                            </span>
                          </div>
                        )}
                        {tenant.kontakt_telefon && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {tenant.kontakt_telefon}
                            </span>
                          </div>
                        )}
                        {!tenant.kontakt_email && !tenant.kontakt_telefon && (
                          <span className="text-muted-foreground text-xs">
                            —
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {contracts > 0 ? (
                        <div
                          className="inline-flex flex-col items-center gap-0.5 cursor-pointer group/contract"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(
                              `/ugovori?zakupnik=${encodeURIComponent(tenant.naziv_firme || tenant.ime_prezime || "")}`,
                            );
                          }}
                          title="Prikaži ugovore zakupnika"
                        >
                          <Badge
                            variant="default"
                            className="text-xs group-hover/contract:bg-primary/80 transition-colors"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            {contracts}
                          </Badge>
                          {contractSummaryMap[tenant.id]?.monthlyRent > 0 && (
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {formatCurrency(
                                contractSummaryMap[tenant.id].monthlyRent,
                              )}
                              /mj
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
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
                              navigate(`/zakupnici/${tenant.id}`);
                            }}
                          >
                            <Edit className="mr-2 h-4 w-4" /> Detalji
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => handleDeleteCallback(tenant, e)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Obriši
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {filteredTenants.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/10">
            {loading ? "Učitavanje..." : "Nema rezultata za zadane kriterije."}
          </div>
        ) : (
          paginatedTenants.map((tenant) => {
            const isActive = !tenant.status || tenant.status === "aktivan";
            const contracts = contractCountMap[tenant.id] || 0;
            return (
              <Card
                key={tenant.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => navigate(`/zakupnici/${tenant.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${isActive ? "bg-green-500" : "bg-red-500"}`}
                        title={isActive ? "Aktivan" : "Neaktivan/Arhiviran"}
                      />
                      <div>
                        <CardTitle className="text-base">
                          {tenant.naziv_firme || tenant.ime_prezime}
                        </CardTitle>
                        {(tenant.adresa_grad || tenant.sjediste) && (
                          <p className="text-xs text-muted-foreground flex items-center mt-1">
                            <MapPin className="h-3 w-3 mr-1" />
                            {tenant.adresa_grad || tenant.sjediste}
                          </p>
                        )}
                      </div>
                    </div>
                    {contracts > 0 && (
                      <Badge variant="default" className="text-xs">
                        {contracts} ugovor{contracts > 1 ? "a" : ""}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="space-y-2 text-sm mb-3">
                    <div className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted-foreground">OIB</span>
                      <span className="font-mono">{tenant.oib || "—"}</span>
                    </div>
                    <div className="space-y-1 pt-1">
                      {tenant.kontakt_email && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          <span className="truncate">
                            {tenant.kontakt_email}
                          </span>
                        </div>
                      )}
                      {tenant.kontakt_telefon && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>{tenant.kontakt_telefon}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end pt-2">
                    <Button variant="ghost" size="sm" className="h-8">
                      Detalji <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            Prethodna
          </Button>
          <span className="text-sm text-muted-foreground">
            Stranica {currentPage} od {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            Sljedeća
          </Button>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between pr-8">
            <div>
              <DialogTitle>
                {selectedZakupnik ? "Detalji zakupnika" : "Novi zakupnik"}
              </DialogTitle>
              <DialogDescription>
                {selectedZakupnik
                  ? "Pregled i izmjena podataka o zakupniku."
                  : "Unesite podatke za novog zakupnika."}
              </DialogDescription>
            </div>
          </DialogHeader>
          <div ref={printRef} className="p-1">
            {isEditing ? (
              <ZakupnikForm
                zakupnik={selectedZakupnik}
                onSubmit={handleSubmit}
                onCancel={() => {
                  if (selectedZakupnik) {
                    setIsEditing(false);
                  } else {
                    setIsDialogOpen(false);
                  }
                }}
                submitting={submitting}
              />
            ) : (
              <ZakupnikDetails
                zakupnik={selectedZakupnik}
                onEdit={() => setIsEditing(true)}
                onPrint={handlePrint}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Jeste li sigurni?</AlertDialogTitle>
            <AlertDialogDescription>
              Ova radnja se ne može poništiti. Ovo će trajno obrisati zakupnika
              "{tenantToDelete?.naziv_firme || tenantToDelete?.ime_prezime}" i
              sve povezane podatke.
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
    </div>
  );
};

export default ZakupniciPage;
