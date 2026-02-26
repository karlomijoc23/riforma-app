import React, { useState, useMemo, useEffect } from "react";
import { useEntityStore } from "../../shared/entityStore";
import { api, buildDocumentUrl, getErrorMessage } from "../../shared/api";
import { toast } from "../../components/ui/sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import {
  Plus,
  FileText,
  Calendar,
  CalendarDays,
  Users,
  AlertCircle,
  MoreVertical,
  CheckCircle,
  XCircle,
  Clock,
  Archive,
  Printer,
  TrendingUp,
  AlertTriangle,
  Building,
  DollarSign,
  Eye,
  Edit,
  FileSignature,
  ArrowRight,
  Trash2,
  Search,
  X,
  Send,
  Undo2,
  RefreshCw,
  TableProperties,
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

import {
  formatDate,
  formatCurrency,
  formatContractDate,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_VARIANTS,
} from "../../shared/formatters";
import { getUnitDisplayName } from "../../shared/units";
import UgovorForm from "./UgovorForm";
import RenewalDialog from "./RenewalDialog";
import LeaseTimeline from "./LeaseTimeline";
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { Switch } from "../../components/ui/switch";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useNavigate } from "react-router-dom";
import { generatePdf } from "../../shared/pdfGenerator";
import ContractPrintTemplate from "./ContractPrintTemplate";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { Separator } from "../../components/ui/separator";
import { ScrollArea } from "../../components/ui/scroll-area";
import { EmptyState } from "../../components/ui/empty-state";

const UgovoriPage = () => {
  const navigate = useNavigate();
  const {
    ugovori,
    refresh: refreshUgovori,
    loading,
    nekretnine,
    zakupnici,
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

  const [viewMode, setViewMode] = useState("tablica"); // "tablica" | "vremenska_crta"
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUgovor, setSelectedUgovor] = useState(null);
  const [filterProperty, setFilterProperty] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterZakupnik, setFilterZakupnik] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterApprovalStatus, setFilterApprovalStatus] = useState("all");

  // Reject Dialog State
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [contractToReject, setContractToReject] = useState(null);
  const [rejectComment, setRejectComment] = useState("");

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contractToDelete, setContractToDelete] = useState(null);

  // Renewal Dialog State
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [renewContract, setRenewContract] = useState(null);

  // Sync statuses
  const [syncing, setSyncing] = useState(false);
  const handleSyncStatuses = async () => {
    setSyncing(true);
    try {
      await api.syncContractStatuses();
      toast.success("Statusi sinkronizirani — slobodne jedinice su ažurirane");
      refreshUgovori();
    } catch (err) {
      toast.error("Sinkronizacija nije uspjela");
    } finally {
      setSyncing(false);
    }
  };

  const confirmDelete = async () => {
    if (!contractToDelete) return;
    try {
      await api.deleteUgovor(contractToDelete.id);
      toast.success("Ugovor je obrisan");
      refreshUgovori();
    } catch (error) {
      console.error("Greška pri brisanju:", error);
      toast.error("Brisanje nije uspjelo");
    } finally {
      setDeleteDialogOpen(false);
      setContractToDelete(null);
    }
  };

  const handleDeleteCallback = (ugovor) => {
    setContractToDelete(ugovor);
    setDeleteDialogOpen(true);
  };

  // Approval handlers
  const handleSubmitForApproval = async (ugovor) => {
    try {
      await api.submitUgovorForApproval(ugovor.id);
      toast.success("Ugovor poslan na odobrenje");
      refreshUgovori();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleApproveContract = async (ugovor) => {
    try {
      await api.approveUgovor(ugovor.id);
      toast.success("Ugovor odobren");
      refreshUgovori();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleWithdrawContract = async (ugovor) => {
    try {
      await api.withdrawUgovor(ugovor.id);
      toast.success("Ugovor povučen u nacrt");
      refreshUgovori();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const openRejectContractDialog = (ugovor) => {
    setContractToReject(ugovor);
    setRejectComment("");
    setRejectDialogOpen(true);
  };

  const confirmRejectContract = async () => {
    if (!contractToReject || !rejectComment.trim()) return;
    try {
      await api.rejectUgovor(contractToReject.id, {
        komentar: rejectComment.trim(),
      });
      toast.success("Ugovor odbijen");
      refreshUgovori();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRejectDialogOpen(false);
      setContractToReject(null);
      setRejectComment("");
    }
  };

  // New state for details and archive
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [viewContract, setViewContract] = useState(null);

  // Pre-fill data from URL params (e.g. from "Novi ugovor" button on property detail)
  const [prefillData, setPrefillData] = useState(null);

  // Deep link support
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const contractId = params.get("contractId");
    const zakupnikSearch = params.get("zakupnik");
    const statusParam = params.get("status");
    const isNew = params.get("new");
    const prefillNekretnina = params.get("nekretnina_id");
    const prefillUnit = params.get("property_unit_id");

    if (contractId && ugovori.length > 0) {
      const target = ugovori.find((c) => c.id === contractId);
      if (target) {
        setViewContract(target);
        setDetailsOpen(true);
      }
    }
    if (zakupnikSearch) {
      setSearchQuery(zakupnikSearch);
    }
    if (statusParam) {
      setFilterStatus(statusParam);
      // If filtering for archived/terminated, enable archive view
      if (statusParam === "arhivirano" || statusParam === "raskinuto") {
        setShowArchive(true);
      }
    }
    // Open create dialog with pre-filled property/unit
    if (isNew === "1") {
      const pf = {};
      if (prefillNekretnina) pf.nekretnina_id = prefillNekretnina;
      if (prefillUnit) pf.property_unit_id = prefillUnit;
      setPrefillData(Object.keys(pf).length > 0 ? pf : null);
      setSelectedUgovor(null);
      setIsDialogOpen(true);
      // Clean URL after opening
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [ugovori]);
  const [showArchive, setShowArchive] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [allDocuments, setAllDocuments] = useState([]);

  const printRef = React.useRef();

  // Fetch all documents for the main table view
  useEffect(() => {
    const fetchAllDocs = async () => {
      try {
        const res = await api.getDokumenti();
        setAllDocuments(res.data || []);
      } catch (err) {
        console.error("Failed to fetch all documents", err);
      }
    };
    fetchAllDocs();
  }, []);

  // Group documents by contract ID for quick lookup
  const docsByContract = useMemo(() => {
    const docs = {};
    allDocuments.forEach((doc) => {
      if (doc.ugovor_id) {
        if (!docs[doc.ugovor_id]) {
          docs[doc.ugovor_id] = {};
        }
        if (doc.tip === "ugovor") {
          docs[doc.ugovor_id].contract = doc;
        } else if (doc.tip === "primopredajni_zapisnik") {
          const lowerName = doc.naziv.toLowerCase();
          if (lowerName.includes("ulazni")) {
            docs[doc.ugovor_id].entryProtocol = doc;
          } else if (lowerName.includes("izlazni")) {
            docs[doc.ugovor_id].exitProtocol = doc;
          } else {
            // Fallback for older protocols without specific naming
            docs[doc.ugovor_id].protocol = doc;
          }
        }
      }
    });
    return docs;
  }, [allDocuments]);

  React.useEffect(() => {
    if (viewContract && detailsOpen) {
      const fetchDocs = async () => {
        try {
          const res = await api.getDokumentiUgovora(viewContract.id);
          setDocuments(res.data || []);
        } catch (err) {
          console.error("Failed to fetch contract documents", err);
        }
      };
      fetchDocs();
    } else {
      setDocuments([]);
    }
  }, [viewContract, detailsOpen]);

  const handleCreate = () => {
    setSelectedUgovor(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (ugovor) => {
    setSelectedUgovor(ugovor);
    setIsDialogOpen(true);
  };

  const handleSuccess = () => {
    setIsDialogOpen(false);
    refreshUgovori();
  };

  const handleStatusChange = async (ugovor, newStatus) => {
    try {
      await api.updateStatusUgovora(ugovor.id, newStatus);
      toast.success(
        `Status ugovora promijenjen u ${newStatus}. ${newStatus === "raskinuto" || newStatus === "arhivirano" ? 'Ako je ugovor nestao, provjerite filter "Prikaži arhivu".' : ""}`,
      );
      refreshUgovori();
    } catch (error) {
      console.error("Greška pri promjeni statusa:", error);
      toast.error("Promjena statusa nije uspjela");
    }
  };

  const isExpiring = (date) => {
    if (!date) return false;
    const today = new Date();
    const expiry = new Date(date);
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 90;
  };

  const isExpired = (date) => {
    if (!date) return false;
    const today = new Date();
    const expiry = new Date(date);
    return expiry < today;
  };

  const filteredUgovori = useMemo(() => {
    let filtered = ugovori;

    // Filter by archive status
    if (!showArchive) {
      filtered = filtered.filter(
        (u) => u.status !== "arhivirano" && u.status !== "raskinuto",
      );
    } else {
      filtered = filtered.filter(
        (u) => u.status === "arhivirano" || u.status === "raskinuto",
      );
    }

    // Filter by property
    if (filterProperty !== "all") {
      filtered = filtered.filter((u) => u.nekretnina_id === filterProperty);
    }

    // Filter by status
    if (filterStatus !== "all") {
      filtered = filtered.filter((u) => u.status === filterStatus);
    }

    // Filter by zakupnik
    if (filterZakupnik !== "all") {
      filtered = filtered.filter((u) => u.zakupnik_id === filterZakupnik);
    }

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((u) => {
        const zakupnik = zakupnici.find((z) => z.id === u.zakupnik_id);
        const nekretnina = nekretnine.find((n) => n.id === u.nekretnina_id);
        const haystack = [
          u.interna_oznaka,
          u.napomena,
          zakupnik?.naziv_firme,
          zakupnik?.ime_prezime,
          nekretnina?.naziv,
          nekretnina?.adresa,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    // Date range filter — "from" filters start date, "to" filters end date
    if (filterDateFrom) {
      filtered = filtered.filter(
        (u) => u.datum_pocetka && u.datum_pocetka >= filterDateFrom,
      );
    }
    if (filterDateTo) {
      filtered = filtered.filter(
        (u) => u.datum_zavrsetka && u.datum_zavrsetka <= filterDateTo,
      );
    }

    // Filter by approval status
    if (filterApprovalStatus !== "all") {
      filtered = filtered.filter((u) => {
        const approval = u.approval_status || "approved";
        return approval === filterApprovalStatus;
      });
    }

    return filtered;
  }, [
    ugovori,
    filterProperty,
    filterStatus,
    filterZakupnik,
    searchQuery,
    filterDateFrom,
    filterDateTo,
    filterApprovalStatus,
    showArchive,
    zakupnici,
    nekretnine,
  ]);

  const handlePrint = async () => {
    try {
      await generatePdf(
        printRef.current,
        `izvjestaj_ugovori_${new Date().toISOString().split("T")[0]}`,
        "landscape",
      );
      toast.success("Izvještaj je generiran");
    } catch (error) {
      toast.error("Greška pri generiranju izvještaja");
    }
  };

  // Metrics Calculation
  const {
    activeContracts,
    totalMonthlyValue,
    expiringSoonCount,
    indexationNeededCount,
  } = useMemo(() => {
    const active = ugovori.filter((c) => c.status === "aktivno");
    return {
      activeContracts: active,
      totalMonthlyValue: active.reduce(
        (sum, c) => sum + (Number(c.osnovna_zakupnina) || 0),
        0,
      ),
      expiringSoonCount: active.filter((c) => isExpiring(c.datum_zavrsetka))
        .length,
      indexationNeededCount: active.filter((c) => c.indeksacija === true)
        .length,
    };
  }, [ugovori]);

  // Pending approval contracts (not archived)
  const pendingContracts = ugovori.filter(
    (c) =>
      c.approval_status === "pending_approval" &&
      c.status !== "arhivirano" &&
      c.status !== "raskinuto",
  );

  // Expired contracts that are not yet archived
  const expiredNotArchived = ugovori.filter(
    (c) => c.status === "istekao" && c.approval_status !== "pending_approval",
  );

  const handleBulkArchiveExpired = async () => {
    let archived = 0;
    for (const c of expiredNotArchived) {
      try {
        await api.updateStatusUgovora(c.id, "arhivirano");
        archived++;
      } catch (err) {
        console.error("Greška pri arhiviranju:", err);
      }
    }
    toast.success(`Arhivirano ${archived} isteklih ugovora`);
    refreshUgovori();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      {/* Off-screen print template */}
      <div className="absolute top-0 left-[-9999px] -z-50">
        <ContractPrintTemplate
          ref={printRef}
          contracts={filteredUgovori.map((c) => ({
            ...c,
            zakupnik_naziv: c.zakupnik_naziv || "Nepoznat zakupnik", // Ensure name is present
          }))}
          nekretnine={nekretnine}
          zakupnici={zakupnici}
        />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">
            Ugovori
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Pregled i upravljanje ugovorima o zakupu, aneksima i rokovima.
          </p>
        </div>
        <div className="flex gap-2">
          {/* View mode toggle */}
          <div className="inline-flex items-center rounded-lg border bg-muted/30 p-0.5">
            <Button
              variant={viewMode === "tablica" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-3 gap-1.5"
              onClick={() => setViewMode("tablica")}
            >
              <TableProperties className="h-4 w-4" />
              <span className="hidden sm:inline">Tablica</span>
            </Button>
            <Button
              variant={viewMode === "vremenska_crta" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-3 gap-1.5"
              onClick={() => setViewMode("vremenska_crta")}
            >
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline">Vremenska crta</span>
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncStatuses}
            disabled={syncing}
            title="Ažuriraj statuse ugovora i slobodnih jedinica"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "Sinkronizacija..." : "Sinkroniziraj"}
          </Button>
          <Button variant="outline" onClick={() => navigate("/ugovori/report")}>
            <Printer className="mr-2 h-4 w-4" /> Izvještaj
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" /> Novi ugovor
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 mb-6 space-y-4">
        {/* Row 1: Search + Archive toggle */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pretraži po broju ugovora, zakupniku, nekretnini..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-8"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              id="archive-mode"
              checked={showArchive}
              onCheckedChange={setShowArchive}
            />
            <Label
              htmlFor="archive-mode"
              className="cursor-pointer text-sm whitespace-nowrap"
            >
              Arhiva
            </Label>
          </div>
        </div>

        {/* Row 2: Dropdown filters - 4 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <Select value={filterProperty} onValueChange={setFilterProperty}>
            <SelectTrigger>
              <SelectValue placeholder="Sve nekretnine" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sve nekretnine</SelectItem>
              {nekretnine.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.naziv}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Svi statusi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi statusi</SelectItem>
              <SelectItem value="aktivno">Aktivno</SelectItem>
              <SelectItem value="na_isteku">Na isteku</SelectItem>
              <SelectItem value="istekao">Istekao</SelectItem>
              <SelectItem value="raskinuto">Raskinuto</SelectItem>
              <SelectItem value="arhivirano">Arhivirano</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterZakupnik} onValueChange={setFilterZakupnik}>
            <SelectTrigger>
              <SelectValue placeholder="Svi zakupnici" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi zakupnici</SelectItem>
              {zakupnici.map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.naziv_firme || z.ime_prezime || z.kontakt_email || "Zakupnik"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterApprovalStatus}
            onValueChange={setFilterApprovalStatus}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sva odobrenja" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sva odobrenja</SelectItem>
              <SelectItem value="draft">Nacrt</SelectItem>
              <SelectItem value="pending_approval">Čeka odobrenje</SelectItem>
              <SelectItem value="approved">Odobreno</SelectItem>
              <SelectItem value="rejected">Odbijeno</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Row 3: Date range - dedicated row, 2 columns */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Datum od
            </span>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Datum do
            </span>
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>
        </div>

        {/* Active filter count + clear */}
        {(filterProperty !== "all" ||
          filterStatus !== "all" ||
          filterZakupnik !== "all" ||
          filterApprovalStatus !== "all" ||
          searchQuery ||
          filterDateFrom ||
          filterDateTo) && (
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <p className="text-xs text-muted-foreground">
              Prikazano {filteredUgovori.length} od {ugovori.length} ugovora
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterProperty("all");
                setFilterStatus("all");
                setFilterZakupnik("all");
                setFilterApprovalStatus("all");
                setSearchQuery("");
                setFilterDateFrom("");
                setFilterDateTo("");
              }}
            >
              <X className="mr-1 h-3 w-3" /> Očisti filtere
            </Button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Ukupna mjesečna vrijednost
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalMonthlyValue)}
            </div>
            <p className="text-xs text-muted-foreground">
              Samo aktivni ugovori
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Ugovori na isteku (90 dana)
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{expiringSoonCount}</div>
            <p className="text-xs text-muted-foreground">Zahtijevaju pažnju</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Ugovori s indeksacijom
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{indexationNeededCount}</div>
            <p className="text-xs text-muted-foreground">
              Ukupno ugovora s klauzulom
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approval Banner */}
      {pendingContracts.length > 0 && !showArchive && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-900">
                {pendingContracts.length}{" "}
                {pendingContracts.length === 1
                  ? "ugovor čeka"
                  : "ugovora čekaju"}{" "}
                odobrenje
              </h3>
              <div className="mt-2 space-y-1.5">
                {pendingContracts.map((c) => {
                  const zakupnik = zakupnici.find(
                    (z) => z.id === c.zakupnik_id,
                  );
                  const nekretnina = nekretnine.find(
                    (n) => n.id === c.nekretnina_id,
                  );
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-amber-800">
                        <strong>{c.interna_oznaka || "Bez oznake"}</strong>
                        {" — "}
                        {zakupnik?.naziv_firme ||
                          zakupnik?.ime_prezime ||
                          "Nepoznat"}
                        {nekretnina ? ` (${nekretnina.naziv})` : ""}
                      </span>
                      <div className="flex gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => handleApproveContract(c)}
                        >
                          <CheckCircle className="mr-1 h-3 w-3" /> Odobri
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => openRejectContractDialog(c)}
                        >
                          <XCircle className="mr-1 h-3 w-3" /> Odbij
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expired Contracts — Quick Archive */}
      {expiredNotArchived.length > 0 && !showArchive && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-slate-500 shrink-0" />
              <p className="text-sm text-slate-700">
                <strong>{expiredNotArchived.length}</strong> istekl
                {expiredNotArchived.length === 1 ? "i ugovor" : "ih ugovora"} —
                prebacite u arhivu?
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={handleBulkArchiveExpired}
            >
              <Archive className="mr-1.5 h-3.5 w-3.5" /> Arhiviraj sve
            </Button>
          </div>
        </div>
      )}

      {/* Timeline View */}
      {viewMode === "vremenska_crta" && (
        <LeaseTimeline ugovori={ugovori} nekretnine={nekretnine} />
      )}

      {/* Desktop Table View */}
      <div
        className={`${viewMode === "tablica" ? "hidden md:block" : "hidden"} rounded-md border`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Broj ugovora</TableHead>
              <TableHead>Zakupnik</TableHead>
              <TableHead>Nekretnina</TableHead>
              <TableHead>Trajanje</TableHead>
              <TableHead className="text-right">Iznos</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Odobrenje</TableHead>
              <TableHead className="text-center">Dokument</TableHead>
              <TableHead className="text-center">Ulazni</TableHead>
              <TableHead className="text-center">Izlazni</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUgovori.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="h-96 text-center">
                  <EmptyState
                    icon={FileText}
                    title="Nema ugovora"
                    description={
                      showArchive
                        ? "Nema arhiviranih ugovora u sustavu."
                        : filterProperty !== "all"
                          ? "Nema aktivnih ugovora za odabranu nekretninu."
                          : "Trenutno nemate aktivnih ugovora."
                    }
                    actionLabel={
                      !showArchive && filterProperty === "all"
                        ? "Kreiraj novi ugovor"
                        : null
                    }
                    onAction={
                      !showArchive && filterProperty === "all"
                        ? handleCreate
                        : null
                    }
                    className="border-0 shadow-none animate-none"
                  />
                </TableCell>
              </TableRow>
            ) : (
              filteredUgovori.map((ugovor) => {
                const expired = isExpired(ugovor.datum_zavrsetka);
                const expiring = isExpiring(ugovor.datum_zavrsetka);
                const property = nekretnine.find(
                  (n) => n.id === ugovor.nekretnina_id,
                );
                const propertyName = property?.naziv || "—";

                const unit = propertyUnits?.find(
                  (u) => u.id === ugovor.property_unit_id,
                );
                const unitName = unit ? getUnitDisplayName(unit) : null;

                let displayStatus = ugovor.status || "Nepoznato";
                if (ugovor.status === "aktivno" && expiring) {
                  displayStatus = "Na isteku";
                }

                const contractDoc = docsByContract[ugovor.id]?.contract;

                const isExpiredRow = ugovor.status === "istekao";

                return (
                  <TableRow
                    key={ugovor.id}
                    className="group/row cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/ugovori/${ugovor.id}`)}
                  >
                    <TableCell
                      className="font-mono font-medium whitespace-nowrap text-xs"
                      title={ugovor.interna_oznaka}
                    >
                      {ugovor.interna_oznaka?.length > 15
                        ? `${ugovor.interna_oznaka.substring(0, 15)}...`
                        : ugovor.interna_oznaka}
                    </TableCell>
                    <TableCell className="max-w-[150px]">
                      <div className="truncate" title={ugovor.zakupnik_naziv}>
                        {ugovor.zakupnik_naziv || "Nepoznat zakupnik"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{propertyName}</span>
                        {unitName && (
                          <span className="text-xs text-muted-foreground">
                            {unitName}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs text-muted-foreground">
                        <span>{formatContractDate(ugovor.datum_pocetka)}</span>
                        <span
                          className={
                            expired ? "text-destructive font-medium" : ""
                          }
                        >
                          {formatContractDate(ugovor.datum_zavrsetka)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">
                      {formatCurrency(ugovor.osnovna_zakupnina)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          displayStatus === "Na isteku"
                            ? "warning"
                            : ugovor.status === "aktivno"
                              ? "default"
                              : "secondary"
                        }
                        className={`capitalize ${displayStatus === "Na isteku" ? "bg-amber-500 hover:bg-amber-600" : ""}`}
                      >
                        {displayStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={
                          APPROVAL_STATUS_VARIANTS[
                            ugovor.approval_status || "approved"
                          ] || "success"
                        }
                        className="text-xs"
                      >
                        {APPROVAL_STATUS_LABELS[
                          ugovor.approval_status || "approved"
                        ] || "Odobreno"}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {contractDoc && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            window.open(buildDocumentUrl(contractDoc), "_blank")
                          }
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(docsByContract[ugovor.id]?.entryProtocol ||
                        docsByContract[ugovor.id]?.protocol) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() =>
                            window.open(
                              buildDocumentUrl(
                                docsByContract[ugovor.id]?.entryProtocol ||
                                  docsByContract[ugovor.id]?.protocol,
                              ),
                              "_blank",
                            )
                          }
                        >
                          <FileSignature className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {docsByContract[ugovor.id]?.exitProtocol && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            window.open(
                              buildDocumentUrl(
                                docsByContract[ugovor.id]?.exitProtocol,
                              ),
                              "_blank",
                            )
                          }
                        >
                          <FileSignature className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      className="relative"
                    >
                      {/* Hover archive shortcut for expired contracts */}
                      {isExpiredRow && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 opacity-0 group-hover/row:opacity-100 transition-opacity pointer-events-none">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs bg-background border-slate-300 hover:bg-slate-100 shadow-sm pointer-events-auto"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusChange(ugovor, "arhivirano");
                            }}
                          >
                            <Archive className="h-3.5 w-3.5" /> Arhiviraj
                          </Button>
                        </div>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label="Opcije"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(ugovor)}>
                            <FileText className="mr-2 h-4 w-4" /> Uredi
                          </DropdownMenuItem>
                          {(ugovor.status === "aktivno" ||
                            ugovor.status === "na_isteku") && (
                            <DropdownMenuItem
                              onClick={() => {
                                setRenewContract(ugovor);
                                setRenewDialogOpen(true);
                              }}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" /> Produzi
                              ugovor
                            </DropdownMenuItem>
                          )}
                          {/* Approval actions */}
                          {(ugovor.approval_status === "draft" ||
                            ugovor.approval_status === "rejected") && (
                            <DropdownMenuItem
                              onClick={() => handleSubmitForApproval(ugovor)}
                            >
                              <Send className="mr-2 h-4 w-4" />
                              {ugovor.approval_status === "rejected"
                                ? "Ponovo pošalji"
                                : "Pošalji na odobrenje"}
                            </DropdownMenuItem>
                          )}
                          {ugovor.approval_status === "pending_approval" && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleApproveContract(ugovor)}
                                className="text-emerald-600 focus:text-emerald-600"
                              >
                                <CheckCircle className="mr-2 h-4 w-4" /> Odobri
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => openRejectContractDialog(ugovor)}
                                className="text-destructive focus:text-destructive"
                              >
                                <XCircle className="mr-2 h-4 w-4" /> Odbij
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleWithdrawContract(ugovor)}
                              >
                                <Undo2 className="mr-2 h-4 w-4" /> Povuci
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>
                            Promijeni status
                          </DropdownMenuLabel>
                          {ugovor.status !== "aktivno" &&
                            ugovor.status !== "arhivirano" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(ugovor, "aktivno")
                                }
                              >
                                <CheckCircle className="mr-2 h-4 w-4" /> Aktivno
                              </DropdownMenuItem>
                            )}
                          {ugovor.status !== "na_isteku" &&
                            ugovor.status !== "arhivirano" &&
                            ugovor.status !== "raskinuto" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(ugovor, "na_isteku")
                                }
                              >
                                <Clock className="mr-2 h-4 w-4" /> Na isteku
                              </DropdownMenuItem>
                            )}
                          {ugovor.status !== "raskinuto" &&
                            ugovor.status !== "arhivirano" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(ugovor, "raskinuto")
                                }
                                className="text-orange-600 focus:text-orange-600"
                              >
                                <XCircle className="mr-2 h-4 w-4" /> Raskinuto
                              </DropdownMenuItem>
                            )}
                          {ugovor.status !== "arhivirano" && (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusChange(ugovor, "arhivirano")
                              }
                            >
                              <Archive className="mr-2 h-4 w-4" /> Arhivirano
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteCallback(ugovor)}
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
      <div
        className={`${viewMode === "tablica" ? "grid grid-cols-1 gap-4 md:hidden" : "hidden"}`}
      >
        {filteredUgovori.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nema ugovora"
            description={
              showArchive
                ? "Nema arhiviranih ugovora."
                : filterProperty !== "all"
                  ? "Nema aktivnih ugovora za odabranu nekretninu."
                  : "Trenutno nemate aktivnih ugovora."
            }
            actionLabel={
              !showArchive && filterProperty === "all" ? "Novi ugovor" : null
            }
            onAction={
              !showArchive && filterProperty === "all" ? handleCreate : null
            }
          />
        ) : (
          filteredUgovori.map((ugovor) => {
            const expired = isExpired(ugovor.datum_zavrsetka);
            const expiring = isExpiring(ugovor.datum_zavrsetka);
            const propertyName =
              nekretnine.find((n) => n.id === ugovor.nekretnina_id)?.naziv ||
              "—";

            let displayStatus = ugovor.status || "Nepoznato";
            if (ugovor.status === "aktivno" && expiring) {
              displayStatus = "Na isteku";
            }

            return (
              <Card
                key={ugovor.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => navigate(`/ugovori/${ugovor.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base font-mono">
                        {ugovor.interna_oznaka}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {ugovor.zakupnik_naziv || "Nepoznat zakupnik"}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge
                        variant={
                          APPROVAL_STATUS_VARIANTS[
                            ugovor.approval_status || "approved"
                          ] || "success"
                        }
                        className="text-[10px]"
                      >
                        {APPROVAL_STATUS_LABELS[
                          ugovor.approval_status || "approved"
                        ] || "Odobreno"}
                      </Badge>
                      <Badge
                        variant={
                          displayStatus === "Na isteku"
                            ? "warning"
                            : ugovor.status === "aktivno"
                              ? "default"
                              : "secondary"
                        }
                        className={`capitalize ${displayStatus === "Na isteku" ? "bg-amber-500 hover:bg-amber-600" : ""}`}
                      >
                        {displayStatus}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>
                      <span className="text-xs text-muted-foreground block">
                        Nekretnina
                      </span>
                      <span className="font-medium truncate block">
                        {propertyName}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">
                        Iznos
                      </span>
                      <span className="font-medium">
                        {formatCurrency(ugovor.osnovna_zakupnina)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="text-xs text-muted-foreground">
                      {formatContractDate(ugovor.datum_pocetka)} -{" "}
                      <span
                        className={
                          expired ? "text-destructive font-medium" : ""
                        }
                      >
                        {formatContractDate(ugovor.datum_zavrsetka)}
                      </span>
                    </div>
                    <div className="flex gap-1.5">
                      {ugovor.status === "istekao" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(ugovor, "arhivirano");
                          }}
                        >
                          <Archive className="mr-1 h-3 w-3" /> Arhiviraj
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-8">
                        Detalji <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedUgovor ? "Uredi ugovor" : "Novi ugovor"}
            </DialogTitle>
            <DialogDescription>
              {selectedUgovor
                ? "Izmijenite detalje postojećeg ugovora."
                : "Unesite podatke za novi ugovor o zakupu."}
            </DialogDescription>
          </DialogHeader>
          <UgovorForm
            ugovor={selectedUgovor}
            prefill={prefillData}
            onSuccess={() => {
              handleSuccess();
              setPrefillData(null);
            }}
            onCancel={() => {
              setIsDialogOpen(false);
              setPrefillData(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className="w-full max-w-full sm:w-[600px] overflow-y-auto p-0 flex flex-col h-full">
          {viewContract && (
            <>
              <div
                className={`h-2 w-full ${viewContract.status === "aktivno" ? "bg-emerald-500" : viewContract.status === "na_isteku" ? "bg-amber-500" : "bg-slate-300"}`}
              />
              <SheetHeader className="px-6 pt-6 pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    {/* Context Header: Property - Unit */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Building className="h-3 w-3" />
                      <span className="font-medium uppercase tracking-wider">
                        {nekretnine.find(
                          (n) => n.id === viewContract.nekretnina_id,
                        )?.naziv || "Nepoznata nekretnina"}
                      </span>
                      {viewContract.property_unit_id && (
                        <>
                          <span className="text-muted-foreground/50 mx-1">
                            /
                          </span>
                          <span className="font-bold text-primary">
                            {getUnitDisplayName(
                              propertyUnits.find(
                                (u) =>
                                  u.id === viewContract.property_unit_id ||
                                  u.localId === viewContract.property_unit_id,
                              ),
                            ) || "Jedinica"}
                          </span>
                        </>
                      )}
                    </div>
                    <SheetTitle className="text-2xl font-bold text-foreground break-all">
                      {viewContract.interna_oznaka}
                    </SheetTitle>
                    <SheetDescription className="mt-1">
                      {viewContract.zakupnik_naziv || "Nepoznat zakupnik"}
                    </SheetDescription>
                  </div>
                  <Badge
                    variant={
                      viewContract.status === "aktivno"
                        ? "default"
                        : "secondary"
                    }
                    className="text-sm px-3 py-1 capitalize"
                  >
                    {viewContract.status?.replace("_", " ")}
                  </Badge>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                <Tabs defaultValue="pregled" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-6">
                    <TabsTrigger value="pregled">Pregled</TabsTrigger>
                    <TabsTrigger value="financije">Financije</TabsTrigger>
                    <TabsTrigger value="dokumenti">Dokumenti</TabsTrigger>
                  </TabsList>

                  <TabsContent value="pregled" className="space-y-6 mt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                          Nekretnina
                        </Label>
                        <div className="font-medium flex items-center gap-2">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          {nekretnine.find(
                            (n) => n.id === viewContract.nekretnina_id,
                          )?.naziv || "—"}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                          Zakupnik
                        </Label>
                        <div className="font-medium flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {viewContract.zakupnik_naziv || "—"}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        Trajanje i rokovi
                      </h4>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                        <div>
                          <span className="text-muted-foreground block mb-1">
                            Početak
                          </span>
                          <span className="font-medium">
                            {formatContractDate(viewContract.datum_pocetka)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block mb-1">
                            Završetak
                          </span>
                          <span className="font-medium">
                            {formatContractDate(viewContract.datum_zavrsetka)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block mb-1">
                            Trajanje
                          </span>
                          <span className="font-medium">
                            {viewContract.trajanje_mjeseci} mj.
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block mb-1">
                            Rok otkaza
                          </span>
                          <span className="font-medium">
                            {viewContract.rok_otkaza_dani} dana
                          </span>
                        </div>
                      </div>
                    </div>

                    {viewContract.napomena && (
                      <div className="bg-muted/30 p-4 rounded-lg border text-sm">
                        <span className="font-semibold block mb-1">
                          Napomena
                        </span>
                        <p className="text-muted-foreground">
                          {viewContract.napomena}
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="financije" className="space-y-6 mt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-2xl font-bold text-primary mb-1">
                            {formatCurrency(viewContract.osnovna_zakupnina)}
                          </div>
                          <p className="text-xs text-muted-foreground uppercase">
                            Mjesečna zakupnina
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-2xl font-bold mb-1">
                            {formatCurrency(viewContract.polog_depozit)}
                          </div>
                          <p className="text-xs text-muted-foreground uppercase">
                            Depozit
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-primary" />
                        Detalji plaćanja
                      </h4>
                      <div className="rounded-lg border divide-y">
                        <div className="flex justify-between p-3 text-sm">
                          <span className="text-muted-foreground">
                            Cijena po m²
                          </span>
                          <span className="font-medium">
                            {viewContract.zakupnina_po_m2
                              ? formatCurrency(viewContract.zakupnina_po_m2)
                              : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between p-3 text-sm">
                          <span className="text-muted-foreground">
                            CAM troškovi
                          </span>
                          <span className="font-medium">
                            {viewContract.cam_troskovi
                              ? formatCurrency(viewContract.cam_troskovi)
                              : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between p-3 text-sm">
                          <span className="text-muted-foreground">
                            Garancija
                          </span>
                          <span className="font-medium">
                            {viewContract.garancija
                              ? formatCurrency(viewContract.garancija)
                              : "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {viewContract.indeksacija && (
                      <div className="space-y-3">
                        <h4 className="font-semibold flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-primary" />
                          Indeksacija
                        </h4>
                        <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 text-sm space-y-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Indeks
                            </span>
                            <span className="font-medium">
                              {viewContract.indeks || "Nije definiran"}
                            </span>
                          </div>
                          {viewContract.formula_indeksacije && (
                            <div className="pt-2 border-t border-blue-200/50">
                              <span className="text-xs text-muted-foreground block mb-1">
                                Formula
                              </span>
                              <code className="bg-white px-2 py-1 rounded border text-xs block w-full">
                                {viewContract.formula_indeksacije}
                              </code>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="dokumenti" className="mt-0">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          Priloženi dokumenti
                        </h4>
                        <Badge variant="outline">{documents.length}</Badge>
                      </div>

                      <ScrollArea className="h-[400px] pr-4">
                        {documents.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl bg-muted/30">
                            <FileText className="h-8 w-8 text-muted-foreground/50 mb-2" />
                            <p className="text-sm text-muted-foreground">
                              Nema priloženih dokumenata
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {documents.map((doc) => (
                              <div
                                key={doc.id}
                                className="group flex items-center justify-between p-3 rounded-lg border bg-card hover:shadow-sm transition-all"
                              >
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <div className="flex-shrink-0 rounded-md bg-primary/10 p-2">
                                    <FileText className="h-4 w-4 text-primary" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">
                                      {doc.naziv}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatDate(doc.created_at)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() =>
                                      window.open(
                                        buildDocumentUrl(doc),
                                        "_blank",
                                      )
                                    }
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      const win = window.open(
                                        buildDocumentUrl(doc),
                                        "_blank",
                                      );
                                      if (win) win.onload = () => win.print();
                                    }}
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              <div className="p-6 border-t bg-muted/10 mt-auto">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setDetailsOpen(false)}
                  >
                    Zatvori
                  </Button>
                  <Button
                    onClick={() => {
                      setDetailsOpen(false);
                      handleEdit(viewContract);
                    }}
                  >
                    <Edit className="mr-2 h-4 w-4" /> Uredi ugovor
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Jeste li sigurni?</AlertDialogTitle>
            <AlertDialogDescription>
              Ova radnja se ne može poništiti. Ovo će trajno obrisati ugovor "
              {contractToDelete?.interna_oznaka}" i sve povezane podatke.
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

      {/* Reject Contract Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odbij ugovor</DialogTitle>
            <DialogDescription>
              Unesite razlog odbijanja ugovora &quot;
              {contractToReject?.interna_oznaka}&quot;.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Razlog odbijanja..."
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
            >
              Odustani
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRejectContract}
              disabled={!rejectComment.trim()}
            >
              Odbij
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Renewal Dialog */}
      <RenewalDialog
        open={renewDialogOpen}
        onOpenChange={setRenewDialogOpen}
        contract={renewContract}
        onSuccess={refreshUgovori}
      />
    </div>
  );
};

export default UgovoriPage;
