import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Calendar,
  DollarSign,
  FileText,
  Printer,
  Edit,
  Building,
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Archive,
  FileSignature,
  Eye,
  ExternalLink,
  Send,
  Undo2,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
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
import { Separator } from "../../components/ui/separator";
import { Progress } from "../../components/ui/progress";
import { api, buildDocumentUrl, getErrorMessage } from "../../shared/api";
import { useEntityStore } from "../../shared/entityStore";
import {
  formatCurrency,
  formatDate,
  formatContractDate,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_VARIANTS,
  formatApprovalStatus,
} from "../../shared/formatters";
import { getUnitDisplayName } from "../../shared/units";
import { useAuth } from "../../shared/auth";
import UgovorForm from "./UgovorForm";
import ContractPrintTemplate from "./ContractPrintTemplate";
import { generatePdf } from "../../shared/pdfGenerator";
import { Textarea } from "../../components/ui/textarea";
import { toast } from "../../components/ui/sonner";

const UgovorDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    ugovori,
    nekretnine,
    zakupnici,
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

  const { user } = useAuth();
  const canApproveLeases =
    user?.scopes?.includes("leases:approve") ||
    user?.scopes?.includes("leases:*") ||
    user?.scopes?.includes("*");

  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const printRef = useRef();

  // Load contract
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Try store first (instant when navigating from list)
        const fromStore = ugovori.find((u) => String(u.id) === String(id));
        if (fromStore) {
          setContract(fromStore);
        } else {
          // Deep-link fallback: fetch all contracts (no single-contract endpoint)
          const res = await api.getUgovori();
          const all = res.data || [];
          const found = all.find((u) => String(u.id) === String(id));
          setContract(found || null);
        }
      } catch (err) {
        console.error("Failed to load contract", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id, ugovori]);

  // Fetch documents for this contract
  useEffect(() => {
    if (!contract) return;
    const fetchDocs = async () => {
      try {
        const res = await api.getDokumentiUgovora(contract.id);
        setDocuments(res.data || []);
      } catch (err) {
        console.error("Failed to fetch contract documents", err);
      }
    };
    fetchDocs();
  }, [contract?.id]);

  // Derived data
  const property = useMemo(
    () => nekretnine.find((n) => n.id === contract?.nekretnina_id),
    [nekretnine, contract?.nekretnina_id],
  );
  const tenant = useMemo(
    () => zakupnici.find((z) => z.id === contract?.zakupnik_id),
    [zakupnici, contract?.zakupnik_id],
  );
  const unit = useMemo(
    () => propertyUnits?.find((u) => u.id === contract?.property_unit_id),
    [propertyUnits, contract?.property_unit_id],
  );

  // Contract duration and timeline
  const timeline = useMemo(() => {
    if (!contract?.datum_pocetka || !contract?.datum_zavrsetka) return null;
    const start = new Date(contract.datum_pocetka);
    const end = new Date(contract.datum_zavrsetka);
    const today = new Date();
    const totalDays = Math.max(
      1,
      Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
    );
    const elapsedDays = Math.ceil((today - start) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
    const progress = Math.min(
      100,
      Math.max(0, (elapsedDays / totalDays) * 100),
    );
    const isExpired = end < today;
    const isExpiring = remainingDays > 0 && remainingDays <= 90;
    return {
      totalDays,
      elapsedDays,
      remainingDays,
      progress,
      isExpired,
      isExpiring,
    };
  }, [contract?.datum_pocetka, contract?.datum_zavrsetka]);

  // Status display
  const displayStatus = useMemo(() => {
    if (!contract) return "";
    if (contract.status === "aktivno" && timeline?.isExpiring)
      return "Na isteku";
    return contract.status || "Nepoznato";
  }, [contract, timeline]);

  const statusColor = useMemo(() => {
    switch (displayStatus) {
      case "aktivno":
        return "bg-emerald-500";
      case "Na isteku":
        return "bg-amber-500";
      case "istekao":
        return "bg-red-500";
      case "raskinuto":
        return "bg-orange-500";
      case "arhivirano":
        return "bg-slate-400";
      default:
        return "bg-slate-300";
    }
  }, [displayStatus]);

  // Total contract value
  const totalContractValue = useMemo(() => {
    if (!contract) return 0;
    const monthly = Number(contract.osnovna_zakupnina) || 0;
    const months = Number(contract.trajanje_mjeseci) || 0;
    return monthly * months;
  }, [contract]);

  // Print handler
  const handlePrint = async () => {
    if (!printRef.current) return;
    try {
      await generatePdf(
        printRef.current,
        `ugovor_${contract.interna_oznaka || contract.id}_${new Date().toISOString().split("T")[0]}`,
        "landscape",
      );
      toast.success("PDF generiran");
    } catch (error) {
      toast.error("Greška pri generiranju PDF-a");
    }
  };

  // Edit handler
  const handleEditSuccess = () => {
    setIsEditOpen(false);
    refresh();
  };

  // Approval handlers
  const handleSubmitForApproval = async () => {
    try {
      await api.submitUgovorForApproval(contract.id);
      toast.success("Ugovor poslan na odobrenje");
      refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleApproveContract = async () => {
    try {
      await api.approveUgovor(contract.id);
      toast.success("Ugovor odobren");
      refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleWithdrawContract = async () => {
    try {
      await api.withdrawUgovor(contract.id);
      toast.success("Ugovor povučen u nacrt");
      refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const openRejectDialog = () => {
    setRejectComment("");
    setRejectDialogOpen(true);
  };

  const confirmRejectContract = async () => {
    if (!rejectComment.trim()) return;
    try {
      await api.rejectUgovor(contract.id, {
        komentar: rejectComment.trim(),
      });
      toast.success("Ugovor odbijen");
      refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRejectDialogOpen(false);
      setRejectComment("");
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not found
  if (!contract) {
    return (
      <div className="container mx-auto py-16 text-center">
        <FileText className="mx-auto h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold">Ugovor nije pronađen</h2>
        <p className="text-muted-foreground mt-2">
          Ugovor s traženim ID-em ne postoji ili je obrisan.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/ugovori">Natrag na ugovore</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Off-screen print template */}
      <div className="absolute top-0 left-[-9999px] -z-50">
        <ContractPrintTemplate
          ref={printRef}
          contracts={[
            {
              ...contract,
              zakupnik_naziv:
                contract.zakupnik_naziv ||
                tenant?.naziv_firme ||
                tenant?.ime_prezime ||
                "Nepoznat",
            },
          ]}
          nekretnine={nekretnine}
          zakupnici={zakupnici}
        />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild className="mt-1">
            <Link to="/ugovori">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold tracking-tight font-mono">
                {contract.interna_oznaka || "Bez oznake"}
              </h1>
              <Badge
                variant={
                  displayStatus === "Na isteku"
                    ? "warning"
                    : displayStatus === "aktivno"
                      ? "default"
                      : "secondary"
                }
                className={`capitalize ${displayStatus === "Na isteku" ? "bg-amber-500 hover:bg-amber-600" : ""}`}
              >
                {displayStatus?.replace("_", " ")}
              </Badge>
              {contract.approval_status &&
                contract.approval_status !== "approved" && (
                  <Badge
                    variant={APPROVAL_STATUS_VARIANTS[contract.approval_status]}
                    className="text-xs"
                  >
                    {APPROVAL_STATUS_LABELS[contract.approval_status]}
                  </Badge>
                )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {tenant && (
                <Link
                  to={`/zakupnici/${tenant.id}`}
                  className="flex items-center gap-1.5 hover:text-primary transition-colors"
                >
                  <Users className="h-3.5 w-3.5" />
                  {tenant.naziv_firme || tenant.ime_prezime}
                </Link>
              )}
              {property && (
                <Link
                  to={`/nekretnine/${property.id}`}
                  className="flex items-center gap-1.5 hover:text-primary transition-colors"
                >
                  <Building className="h-3.5 w-3.5" />
                  {property.naziv}
                  {unit && (
                    <span className="text-primary font-medium">
                      / {getUnitDisplayName(unit)}
                    </span>
                  )}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {/* Approval action buttons */}
          {(contract.approval_status === "draft" ||
            contract.approval_status === "rejected") && (
            <Button variant="outline" onClick={handleSubmitForApproval}>
              <Send className="mr-2 h-4 w-4" />
              {contract.approval_status === "rejected"
                ? "Ponovo pošalji"
                : "Pošalji na odobrenje"}
            </Button>
          )}
          {contract.approval_status === "pending_approval" && (
            <>
              <Button
                variant="outline"
                className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                onClick={handleApproveContract}
              >
                <CheckCircle className="mr-2 h-4 w-4" /> Odobri
              </Button>
              <Button variant="destructive" onClick={openRejectDialog}>
                <XCircle className="mr-2 h-4 w-4" /> Odbij
              </Button>
              <Button variant="outline" onClick={handleWithdrawContract}>
                <Undo2 className="mr-2 h-4 w-4" /> Povuci
              </Button>
            </>
          )}
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Ispiši
          </Button>
          {(contract.approval_status !== "pending_approval" ||
            canApproveLeases) && (
            <Button onClick={() => setIsEditOpen(true)}>
              <Edit className="mr-2 h-4 w-4" /> Uredi
            </Button>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className={`h-1.5 w-full rounded-full ${statusColor}`} />

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Mjesečna zakupnina
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(contract.osnovna_zakupnina)}
            </div>
            {contract.zakupnina_po_m2 && (
              <p className="text-xs text-muted-foreground">
                {formatCurrency(contract.zakupnina_po_m2)}/m²
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Ukupna vrijednost
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalContractValue)}
            </div>
            <p className="text-xs text-muted-foreground">
              {contract.trajanje_mjeseci || 0} mjeseci
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trajanje</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {timeline
                ? timeline.isExpired
                  ? "Istekao"
                  : `${timeline.remainingDays} dana`
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatContractDate(contract.datum_pocetka)} -{" "}
              {formatContractDate(contract.datum_zavrsetka)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Napredak</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {timeline ? `${Math.round(timeline.progress)}%` : "—"}
            </div>
            <Progress value={timeline?.progress || 0} className="mt-2 h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pregled" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pregled">Pregled</TabsTrigger>
          <TabsTrigger value="financije">Financije</TabsTrigger>
          <TabsTrigger value="dokumenti">
            Dokumenti
            {documents.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 text-[10px] px-1.5 py-0 h-4"
              >
                {documents.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="napomene">Napomene</TabsTrigger>
        </TabsList>

        {/* Pregled Tab */}
        <TabsContent value="pregled" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Osnovni podaci</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-8 text-sm">
                <div>
                  <span className="text-muted-foreground block mb-1">
                    Broj ugovora
                  </span>
                  <span className="font-medium font-mono">
                    {contract.interna_oznaka || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">
                    Zakupnik
                  </span>
                  {tenant ? (
                    <Link
                      to={`/zakupnici/${tenant.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {tenant.naziv_firme || tenant.ime_prezime}
                    </Link>
                  ) : (
                    <span className="font-medium">
                      {contract.zakupnik_naziv || "—"}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">
                    Nekretnina
                  </span>
                  {property ? (
                    <Link
                      to={`/nekretnine/${property.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {property.naziv}
                    </Link>
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>
                {unit && (
                  <div>
                    <span className="text-muted-foreground block mb-1">
                      Jedinica
                    </span>
                    <span className="font-medium">
                      {getUnitDisplayName(unit)}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground block mb-1">
                    Datum početka
                  </span>
                  <span className="font-medium">
                    {formatDate(contract.datum_pocetka)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">
                    Datum završetka
                  </span>
                  <span
                    className={`font-medium ${timeline?.isExpired ? "text-destructive" : timeline?.isExpiring ? "text-amber-600" : ""}`}
                  >
                    {formatDate(contract.datum_zavrsetka)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">
                    Trajanje
                  </span>
                  <span className="font-medium">
                    {contract.trajanje_mjeseci
                      ? `${contract.trajanje_mjeseci} mjeseci`
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">
                    Rok otkaza
                  </span>
                  <span className="font-medium">
                    {contract.rok_otkaza_dani
                      ? `${contract.rok_otkaza_dani} dana`
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-1">
                    Status
                  </span>
                  <Badge
                    variant={
                      displayStatus === "Na isteku"
                        ? "warning"
                        : contract.status === "aktivno"
                          ? "default"
                          : "secondary"
                    }
                    className={`capitalize ${displayStatus === "Na isteku" ? "bg-amber-500" : ""}`}
                  >
                    {displayStatus?.replace("_", " ")}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Approval info card */}
          {contract.approval_status &&
            contract.approval_status !== "approved" && (
              <Card
                className={`border-l-4 ${
                  contract.approval_status === "pending_approval"
                    ? "border-l-amber-400"
                    : contract.approval_status === "rejected"
                      ? "border-l-red-400"
                      : "border-l-gray-400"
                }`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    Status odobrenja
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        APPROVAL_STATUS_VARIANTS[contract.approval_status]
                      }
                    >
                      {APPROVAL_STATUS_LABELS[contract.approval_status]}
                    </Badge>
                  </div>
                  {contract.submitted_for_approval_at && (
                    <div className="text-sm text-muted-foreground">
                      Poslano: {formatDate(contract.submitted_for_approval_at)}
                    </div>
                  )}
                  {contract.approval_status === "rejected" &&
                    contract.approval_comment && (
                      <div className="bg-muted/50 border rounded-md p-3 text-sm">
                        <span className="font-medium block mb-1">
                          Razlog odbijanja:
                        </span>
                        <p className="text-muted-foreground">
                          {contract.approval_comment}
                        </p>
                      </div>
                    )}
                </CardContent>
              </Card>
            )}

          {/* Timeline visualization */}
          {timeline && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vremenski tijek</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {formatDate(contract.datum_pocetka)}
                    </span>
                    <span
                      className={`font-medium ${timeline.isExpired ? "text-destructive" : ""}`}
                    >
                      {formatDate(contract.datum_zavrsetka)}
                    </span>
                  </div>
                  <div className="relative">
                    <Progress value={timeline.progress} className="h-3" />
                    {!timeline.isExpired && (
                      <div
                        className="absolute top-0 h-3 w-0.5 bg-foreground"
                        style={{ left: `${Math.min(timeline.progress, 100)}%` }}
                      />
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      Prošlo: {Math.max(0, timeline.elapsedDays)} dana
                    </span>
                    <span>
                      {timeline.isExpired
                        ? `Istekao prije ${Math.abs(timeline.remainingDays)} dana`
                        : `Preostalo: ${timeline.remainingDays} dana`}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Financije Tab */}
        <TabsContent value="financije" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-primary mb-1">
                  {formatCurrency(contract.osnovna_zakupnina)}
                </div>
                <p className="text-xs text-muted-foreground uppercase">
                  Mjesečna zakupnina
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold mb-1">
                  {formatCurrency(contract.polog_depozit)}
                </div>
                <p className="text-xs text-muted-foreground uppercase">
                  Depozit
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                Detalji plaćanja
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border divide-y">
                <div className="flex justify-between p-3 text-sm">
                  <span className="text-muted-foreground">
                    Osnovna zakupnina
                  </span>
                  <span className="font-medium">
                    {formatCurrency(contract.osnovna_zakupnina)}
                  </span>
                </div>
                <div className="flex justify-between p-3 text-sm">
                  <span className="text-muted-foreground">Cijena po m²</span>
                  <span className="font-medium">
                    {contract.zakupnina_po_m2
                      ? formatCurrency(contract.zakupnina_po_m2)
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between p-3 text-sm">
                  <span className="text-muted-foreground">CAM troškovi</span>
                  <span className="font-medium">
                    {contract.cam_troskovi
                      ? formatCurrency(contract.cam_troskovi)
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between p-3 text-sm">
                  <span className="text-muted-foreground">Polog / Depozit</span>
                  <span className="font-medium">
                    {contract.polog_depozit
                      ? formatCurrency(contract.polog_depozit)
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between p-3 text-sm">
                  <span className="text-muted-foreground">Garancija</span>
                  <span className="font-medium">
                    {contract.garancija
                      ? formatCurrency(contract.garancija)
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between p-3 text-sm bg-muted/30 font-semibold">
                  <span>Ukupna vrijednost ugovora</span>
                  <span className="text-primary">
                    {formatCurrency(totalContractValue)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {contract.indeksacija && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Indeksacija
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Indeks</span>
                    <span className="font-medium">
                      {contract.indeks || "Nije definiran"}
                    </span>
                  </div>
                  {contract.formula_indeksacije && (
                    <div className="pt-2 border-t border-blue-200/50">
                      <span className="text-xs text-muted-foreground block mb-1">
                        Formula
                      </span>
                      <code className="bg-white px-2 py-1 rounded border text-xs block w-full">
                        {contract.formula_indeksacije}
                      </code>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Dokumenti Tab */}
        <TabsContent value="dokumenti" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Priloženi dokumenti
                </CardTitle>
                <Badge variant="outline">{documents.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
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
                          {doc.tip === "primopredajni_zapisnik" ? (
                            <FileSignature className="h-4 w-4 text-primary" />
                          ) : (
                            <FileText className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {doc.naziv}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatDate(doc.created_at)}</span>
                            {doc.tip && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 h-4"
                              >
                                {doc.tip === "ugovor"
                                  ? "Ugovor"
                                  : doc.tip === "primopredajni_zapisnik"
                                    ? "Zapisnik"
                                    : doc.tip}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            window.open(buildDocumentUrl(doc), "_blank")
                          }
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Napomene Tab */}
        <TabsContent value="napomene" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Napomene i bilješke</CardTitle>
            </CardHeader>
            <CardContent>
              {contract.napomena ? (
                <div className="bg-muted/30 p-4 rounded-lg border text-sm whitespace-pre-wrap">
                  {contract.napomena}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl bg-muted/30">
                  <FileText className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nema dodatnih napomena za ovaj ugovor
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Related entities card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Povezane stavke</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Property link */}
              {property && (
                <Link
                  to={`/nekretnine/${property.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                >
                  <Building className="h-5 w-5 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{property.naziv}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {property.adresa}
                      {property.grad ? `, ${property.grad}` : ""}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </Link>
              )}

              {/* Tenant link */}
              {tenant && (
                <Link
                  to={`/zakupnici/${tenant.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                >
                  <Users className="h-5 w-5 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      {tenant.naziv_firme || tenant.ime_prezime}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {tenant.kontakt_email || tenant.kontakt_telefon || ""}
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </Link>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Uredi ugovor</DialogTitle>
            <DialogDescription>
              Izmijenite detalje ugovora {contract.interna_oznaka}.
            </DialogDescription>
          </DialogHeader>
          <UgovorForm
            ugovor={contract}
            onSuccess={handleEditSuccess}
            onCancel={() => setIsEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Reject Contract Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odbij ugovor</DialogTitle>
            <DialogDescription>
              Unesite razlog odbijanja ugovora &quot;
              {contract.interna_oznaka}&quot;.
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
    </div>
  );
};

export default UgovorDetailPage;
