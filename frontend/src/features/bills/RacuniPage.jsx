import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useEntityStore } from "../../shared/entityStore";
import { api } from "../../shared/api";
import { toast } from "../../components/ui/sonner";
import {
  formatCurrency,
  formatDate,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_VARIANTS,
} from "../../shared/formatters";
import { getErrorMessage } from "../../shared/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { EmptyState } from "../../components/ui/empty-state";
import {
  Plus,
  Filter,
  Search,
  X,
  FileText,
  Trash2,
  Edit,
  Receipt,
  AlertTriangle,
  ArrowRightLeft,
  Euro,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Check,
  Ban,
  MoreVertical,
  Send,
  CheckCircle,
  XCircle,
  Undo2,
  CreditCard,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";

const UTILITY_LABELS = {
  struja: "Struja",
  voda: "Voda",
  plin: "Plin",
  komunalije: "Komunalije",
  internet: "Internet",
  ostalo: "Ostalo",
};

const STATUS_LABELS = {
  ceka_placanje: "Ceka placanje",
  placeno: "Placeno",
  djelomicno_placeno: "Djelomicno placeno",
  prekoraceno: "Prekoraceno",
};

const PREKNJIZAVANJE_LABELS = {
  nije_primjenjivo: "N/A",
  ceka: "Ceka",
  zavrseno: "Zavrseno",
};

const UTILITY_BADGE_CLASSES = {
  struja: "bg-yellow-100 text-yellow-800 border-yellow-200",
  voda: "bg-blue-100 text-blue-800 border-blue-200",
  plin: "bg-orange-100 text-orange-800 border-orange-200",
  komunalije: "bg-purple-100 text-purple-800 border-purple-200",
  internet: "bg-teal-100 text-teal-800 border-teal-200",
  ostalo: "bg-gray-100 text-gray-800 border-gray-200",
};

const STATUS_BADGE_CLASSES = {
  ceka_placanje: "bg-yellow-100 text-yellow-800 border-yellow-200",
  placeno: "bg-emerald-100 text-emerald-800 border-emerald-200",
  djelomicno_placeno: "bg-blue-100 text-blue-800 border-blue-200",
  prekoraceno: "bg-red-100 text-red-800 border-red-200",
};

const PREKNJIZAVANJE_BADGE_CLASSES = {
  nije_primjenjivo: "bg-gray-100 text-gray-600 border-gray-200",
  ceka: "bg-amber-100 text-amber-800 border-amber-200",
  zavrseno: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const EMPTY_FORM = {
  tip_utroska: "",
  dobavljac: "",
  broj_racuna: "",
  datum_racuna: "",
  datum_dospijeca: "",
  iznos: "",
  valuta: "EUR",
  nekretnina_id: "",
  zakupnik_id: "",
  status_placanja: "ceka_placanje",
  preknjizavanje_status: "nije_primjenjivo",
  napomena: "",
  period_od: "",
  period_do: "",
  potrosnja_kwh: "",
  potrosnja_m3: "",
};

const RacuniPage = () => {
  const {
    racuni,
    nekretnine,
    zakupnici,
    refreshRacuni,
    ensureRacuni,
    ensureNekretnine,
    ensureZakupnici,
  } = useEntityStore();

  useEffect(() => {
    ensureRacuni();
    ensureNekretnine();
    ensureZakupnici();
  }, [ensureRacuni, ensureNekretnine, ensureZakupnici]);

  // UI state
  const [activeTab, setActiveTab] = useState("svi");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTip, setFilterTip] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterNekretnina, setFilterNekretnina] = useState("all");

  // Approval filter state
  const [filterApprovalStatus, setFilterApprovalStatus] = useState("all");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [billToReject, setBillToReject] = useState(null);
  const [rejectComment, setRejectComment] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRacun, setEditingRacun] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [racunToDelete, setRacunToDelete] = useState(null);

  // Payment recording state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentBill, setPaymentBill] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    iznos_uplate: "",
    datum_uplate: new Date().toISOString().split("T")[0],
    napomena: "",
  });
  const [paymentSaving, setPaymentSaving] = useState(false);

  // Helpers
  const updateForm = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const resetDialog = useCallback(() => {
    setForm(EMPTY_FORM);
    setFile(null);
    setEditingRacun(null);
    setDialogOpen(false);
  }, []);

  const openCreate = useCallback(() => {
    setEditingRacun(null);
    setForm(EMPTY_FORM);
    setFile(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((racun) => {
    setEditingRacun(racun);
    setForm({
      tip_utroska: racun.tip_utroska || "",
      dobavljac: racun.dobavljac || "",
      broj_racuna: racun.broj_racuna || "",
      datum_racuna: racun.datum_racuna || "",
      datum_dospijeca: racun.datum_dospijeca || "",
      iznos: racun.iznos ?? "",
      valuta: racun.valuta || "EUR",
      nekretnina_id: racun.nekretnina_id || "",
      zakupnik_id: racun.zakupnik_id || "",
      status_placanja: racun.status_placanja || "ceka_placanje",
      preknjizavanje_status: racun.preknjizavanje_status || "nije_primjenjivo",
      napomena: racun.napomena || "",
      period_od: racun.period_od || "",
      period_do: racun.period_do || "",
      potrosnja_kwh: racun.potrosnja_kwh ?? "",
      potrosnja_m3: racun.potrosnja_m3 ?? "",
    });
    setFile(null);
    setDialogOpen(true);
  }, []);

  // Save handler
  const handleSave = async () => {
    if (!form.tip_utroska) {
      toast.error("Odaberite tip utroska");
      return;
    }
    setSaving(true);
    try {
      if (editingRacun) {
        // Update sends JSON
        const payload = { ...form };
        if (payload.iznos !== "") payload.iznos = Number(payload.iznos);
        else delete payload.iznos;
        if (payload.potrosnja_kwh !== "")
          payload.potrosnja_kwh = Number(payload.potrosnja_kwh);
        else delete payload.potrosnja_kwh;
        if (payload.potrosnja_m3 !== "")
          payload.potrosnja_m3 = Number(payload.potrosnja_m3);
        else delete payload.potrosnja_m3;
        // Remove empty strings for optional fields
        Object.keys(payload).forEach((key) => {
          if (payload[key] === "") delete payload[key];
        });
        await api.updateRacun(editingRacun.id, payload);
        toast.success("Racun je azuriran");
      } else {
        // Create sends FormData
        const data = { ...form, file };
        if (data.iznos !== "") data.iznos = Number(data.iznos);
        if (data.potrosnja_kwh !== "")
          data.potrosnja_kwh = Number(data.potrosnja_kwh);
        if (data.potrosnja_m3 !== "")
          data.potrosnja_m3 = Number(data.potrosnja_m3);
        await api.createRacun(data);
        toast.success("Racun je kreiran");
      }
      resetDialog();
      refreshRacuni();
    } catch (err) {
      console.error("Save racun error:", err);
      toast.error(
        err?.response?.data?.message || "Greska pri spremanju racuna",
      );
    } finally {
      setSaving(false);
    }
  };

  // AI Parse: create first, then parse
  const handleAIParse = async () => {
    if (!form.tip_utroska) {
      toast.error("Odaberite tip utroska prije AI parsiranja");
      return;
    }
    if (!file && !editingRacun) {
      toast.error("Priložite PDF datoteku za AI parsiranje");
      return;
    }
    setAiParsing(true);
    try {
      let racunId = editingRacun?.id;
      // If new, create first
      if (!racunId) {
        const data = { ...form, file };
        if (data.iznos !== "") data.iznos = Number(data.iznos);
        const res = await api.createRacun(data);
        racunId = res.data?.id;
        if (!racunId) throw new Error("Racun kreiran ali ID nije vracen");
        setEditingRacun(res.data);
      }
      const parseRes = await api.parseRacunWithAI(racunId);
      const parsed = parseRes.data;
      if (parsed) {
        setForm((prev) => ({
          ...prev,
          dobavljac: parsed.dobavljac || prev.dobavljac,
          broj_racuna: parsed.broj_racuna || prev.broj_racuna,
          datum_racuna: parsed.datum_racuna || prev.datum_racuna,
          datum_dospijeca: parsed.datum_dospijeca || prev.datum_dospijeca,
          iznos: parsed.iznos ?? prev.iznos,
          period_od: parsed.period_od || prev.period_od,
          period_do: parsed.period_do || prev.period_do,
          potrosnja_kwh: parsed.potrosnja_kwh ?? prev.potrosnja_kwh,
          potrosnja_m3: parsed.potrosnja_m3 ?? prev.potrosnja_m3,
        }));
        toast.success("AI je parsirao podatke iz racuna");
      }
      refreshRacuni();
    } catch (err) {
      console.error("AI parse error:", err);
      toast.error(err?.response?.data?.message || "AI parsiranje nije uspjelo");
    } finally {
      setAiParsing(false);
    }
  };

  // Delete handler
  const confirmDelete = async () => {
    if (!racunToDelete) return;
    try {
      await api.deleteRacun(racunToDelete.id);
      toast.success("Racun je obrisan");
      refreshRacuni();
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Brisanje nije uspjelo");
    } finally {
      setDeleteDialogOpen(false);
      setRacunToDelete(null);
    }
  };

  // Preknjizavanje quick actions
  const handlePreknjizavanje = async (racun, status) => {
    try {
      await api.updatePreknjizavanje(racun.id, {
        preknjizavanje_status: status,
      });
      toast.success(
        `Preknjizavanje oznaceno kao ${PREKNJIZAVANJE_LABELS[status]}`,
      );
      refreshRacuni();
    } catch (err) {
      console.error("Preknjizavanje error:", err);
      toast.error("Azuriranje preknjizavanja nije uspjelo");
    }
  };

  // Payment recording
  const openPaymentDialog = useCallback((racun) => {
    setPaymentBill(racun);
    setPaymentForm({
      iznos_uplate: racun.iznos ?? "",
      datum_uplate: new Date().toISOString().split("T")[0],
      napomena: "",
    });
    setPaymentDialogOpen(true);
  }, []);

  const handleRecordPayment = async () => {
    if (!paymentBill || !paymentForm.iznos_uplate) {
      toast.error("Unesite iznos uplate");
      return;
    }
    setPaymentSaving(true);
    try {
      await api.recordPayment(paymentBill.id, {
        iznos_uplate: Number(paymentForm.iznos_uplate),
        datum_uplate: paymentForm.datum_uplate,
        napomena: paymentForm.napomena || undefined,
      });
      toast.success("Uplata je evidentirana");
      setPaymentDialogOpen(false);
      setPaymentBill(null);
      refreshRacuni();
      window.dispatchEvent(
        new CustomEvent("entity:invalidate", {
          detail: { resource: "racuni" },
        }),
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPaymentSaving(false);
    }
  };

  // Approval handlers
  const handleSubmitForApproval = async (racun) => {
    try {
      await api.submitRacunForApproval(racun.id);
      toast.success("Račun poslan na odobrenje");
      refreshRacuni();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleApproveBill = async (racun) => {
    try {
      await api.approveRacun(racun.id);
      toast.success("Račun odobren");
      refreshRacuni();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleWithdrawBill = async (racun) => {
    try {
      await api.withdrawRacun(racun.id);
      toast.success("Račun povučen u nacrt");
      refreshRacuni();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const openRejectBillDialog = (racun) => {
    setBillToReject(racun);
    setRejectComment("");
    setRejectDialogOpen(true);
  };

  const confirmRejectBill = async () => {
    if (!billToReject || !rejectComment.trim()) return;
    try {
      await api.rejectRacun(billToReject.id, {
        komentar: rejectComment.trim(),
      });
      toast.success("Račun odbijen");
      refreshRacuni();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRejectDialogOpen(false);
      setBillToReject(null);
      setRejectComment("");
    }
  };

  // Filtering
  const filteredRacuni = useMemo(() => {
    let list = racuni || [];

    // Tab filter
    if (activeTab === "preknjizavanje") {
      list = list.filter((r) => r.preknjizavanje_status === "ceka");
    }

    if (filterTip !== "all") {
      list = list.filter((r) => r.tip_utroska === filterTip);
    }
    if (filterStatus !== "all") {
      list = list.filter((r) => r.status_placanja === filterStatus);
    }
    if (filterNekretnina !== "all") {
      list = list.filter((r) => r.nekretnina_id === filterNekretnina);
    }
    if (filterApprovalStatus !== "all") {
      list = list.filter((r) => {
        const approval = r.approval_status || "approved";
        return approval === filterApprovalStatus;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const haystack = [r.dobavljac, r.broj_racuna]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    return list;
  }, [
    racuni,
    activeTab,
    filterTip,
    filterStatus,
    filterNekretnina,
    filterApprovalStatus,
    searchQuery,
  ]);

  // Summary metrics
  const metrics = useMemo(() => {
    const all = racuni || [];
    const totalCount = all.length;
    const unpaidAmount = all
      .filter(
        (r) =>
          r.status_placanja === "ceka_placanje" ||
          r.status_placanja === "prekoraceno",
      )
      .reduce((sum, r) => sum + (Number(r.iznos) || 0), 0);
    const preknjizavanjeCount = all.filter(
      (r) => r.preknjizavanje_status === "ceka",
    ).length;
    const totalAmount = all.reduce((sum, r) => sum + (Number(r.iznos) || 0), 0);
    return { totalCount, unpaidAmount, preknjizavanjeCount, totalAmount };
  }, [racuni]);

  const hasActiveFilters =
    filterTip !== "all" ||
    filterStatus !== "all" ||
    filterNekretnina !== "all" ||
    filterApprovalStatus !== "all" ||
    searchQuery;

  const clearFilters = () => {
    setFilterTip("all");
    setFilterStatus("all");
    setFilterNekretnina("all");
    setFilterApprovalStatus("all");
    setSearchQuery("");
  };

  // Render bill row for table
  const renderTableRow = (racun) => (
    <TableRow key={racun.id} className="hover:bg-muted/50">
      <TableCell>
        <Badge
          variant="outline"
          className={UTILITY_BADGE_CLASSES[racun.tip_utroska] || ""}
        >
          {UTILITY_LABELS[racun.tip_utroska] || racun.tip_utroska}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[140px] truncate">
        {racun.dobavljac || "\u2014"}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {racun.broj_racuna || "\u2014"}
      </TableCell>
      <TableCell className="text-sm">
        {formatDate(racun.datum_racuna)}
      </TableCell>
      <TableCell className="text-right font-medium whitespace-nowrap">
        {formatCurrency(racun.iznos)}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={STATUS_BADGE_CLASSES[racun.status_placanja] || ""}
        >
          {STATUS_LABELS[racun.status_placanja] || racun.status_placanja}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={
            PREKNJIZAVANJE_BADGE_CLASSES[racun.preknjizavanje_status] || ""
          }
        >
          {PREKNJIZAVANJE_LABELS[racun.preknjizavanje_status] ||
            racun.preknjizavanje_status}
        </Badge>
      </TableCell>
      <TableCell className="text-center">
        <Badge
          variant={
            APPROVAL_STATUS_VARIANTS[racun.approval_status || "approved"] ||
            "success"
          }
          className="text-xs"
        >
          {APPROVAL_STATUS_LABELS[racun.approval_status || "approved"] ||
            "Odobreno"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {activeTab === "preknjizavanje" ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                title="Zavrseno"
                onClick={() => handlePreknjizavanje(racun, "zavrseno")}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-gray-500 hover:text-gray-700"
                title="Nije primjenjivo"
                onClick={() => handlePreknjizavanje(racun, "nije_primjenjivo")}
              >
                <Ban className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openEdit(racun)}>
                  <Edit className="mr-2 h-4 w-4" /> Uredi
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openPaymentDialog(racun)}>
                  <CreditCard className="mr-2 h-4 w-4" /> Evidentiraj uplatu
                </DropdownMenuItem>
                {/* Approval actions based on current status */}
                {(!racun.approval_status ||
                  racun.approval_status === "draft") && (
                  <DropdownMenuItem
                    onClick={() => handleSubmitForApproval(racun)}
                  >
                    <Send className="mr-2 h-4 w-4" /> Pošalji na odobrenje
                  </DropdownMenuItem>
                )}
                {racun.approval_status === "pending_approval" && (
                  <>
                    <DropdownMenuItem
                      onClick={() => handleApproveBill(racun)}
                      className="text-emerald-600 focus:text-emerald-600"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" /> Odobri
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => openRejectBillDialog(racun)}
                      className="text-destructive focus:text-destructive"
                    >
                      <XCircle className="mr-2 h-4 w-4" /> Odbij
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleWithdrawBill(racun)}>
                      <Undo2 className="mr-2 h-4 w-4" /> Povuci
                    </DropdownMenuItem>
                  </>
                )}
                {racun.approval_status === "rejected" && (
                  <DropdownMenuItem
                    onClick={() => handleSubmitForApproval(racun)}
                  >
                    <Send className="mr-2 h-4 w-4" /> Ponovo pošalji
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    setRacunToDelete(racun);
                    setDeleteDialogOpen(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Obrisi
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </TableCell>
    </TableRow>
  );

  // Render bill card for mobile
  const renderMobileCard = (racun) => (
    <Card key={racun.id} className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Badge
              variant="outline"
              className={UTILITY_BADGE_CLASSES[racun.tip_utroska] || ""}
            >
              {UTILITY_LABELS[racun.tip_utroska] || racun.tip_utroska}
            </Badge>
            <p className="text-sm font-medium">{racun.dobavljac || "\u2014"}</p>
          </div>
          <Badge
            variant="outline"
            className={STATUS_BADGE_CLASSES[racun.status_placanja] || ""}
          >
            {STATUS_LABELS[racun.status_placanja] || racun.status_placanja}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div>
            <span className="text-xs text-muted-foreground block">
              Broj racuna
            </span>
            <span className="font-mono text-xs">
              {racun.broj_racuna || "\u2014"}
            </span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Iznos</span>
            <span className="font-medium">{formatCurrency(racun.iznos)}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Datum</span>
            <span className="text-xs">{formatDate(racun.datum_racuna)}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">
              Preknjizavanje
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] ${PREKNJIZAVANJE_BADGE_CLASSES[racun.preknjizavanje_status] || ""}`}
            >
              {PREKNJIZAVANJE_LABELS[racun.preknjizavanje_status] ||
                racun.preknjizavanje_status}
            </Badge>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">
              Odobrenje
            </span>
            <Badge
              variant={
                APPROVAL_STATUS_VARIANTS[racun.approval_status || "approved"] ||
                "success"
              }
              className="text-[10px]"
            >
              {APPROVAL_STATUS_LABELS[racun.approval_status || "approved"] ||
                "Odobreno"}
            </Badge>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 pt-2 border-t">
          {activeTab === "preknjizavanje" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-emerald-600"
                onClick={() => handlePreknjizavanje(racun, "zavrseno")}
              >
                <Check className="mr-1 h-3 w-3" /> Zavrseno
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => handlePreknjizavanje(racun, "nije_primjenjivo")}
              >
                <Ban className="mr-1 h-3 w-3" /> N/A
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => openEdit(racun)}
              >
                <Edit className="mr-1 h-3 w-3" /> Uredi
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => openPaymentDialog(racun)}
              >
                <CreditCard className="mr-1 h-3 w-3" /> Uplata
              </Button>
              {(!racun.approval_status ||
                racun.approval_status === "draft") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => handleSubmitForApproval(racun)}
                >
                  <Send className="mr-1 h-3 w-3" /> Na odobrenje
                </Button>
              )}
              {racun.approval_status === "pending_approval" && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-emerald-600"
                    onClick={() => handleApproveBill(racun)}
                  >
                    <CheckCircle className="mr-1 h-3 w-3" /> Odobri
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-destructive"
                    onClick={() => openRejectBillDialog(racun)}
                  >
                    <XCircle className="mr-1 h-3 w-3" /> Odbij
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => handleWithdrawBill(racun)}
                  >
                    <Undo2 className="mr-1 h-3 w-3" /> Povuci
                  </Button>
                </>
              )}
              {racun.approval_status === "rejected" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => handleSubmitForApproval(racun)}
                >
                  <Send className="mr-1 h-3 w-3" /> Ponovo pošalji
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-destructive"
                onClick={() => {
                  setRacunToDelete(racun);
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="mr-1 h-3 w-3" /> Obrisi
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-primary">
            Racuni
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Pregled i upravljanje racunima za rezije i komunalne troskove.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Novi racun
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ukupno racuna</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Neplaceno</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(metrics.unpaidAmount)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Za preknjizavanje
            </CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.preknjizavanjeCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Ukupni troskovi
            </CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(metrics.totalAmount)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="svi">Svi racuni</TabsTrigger>
            <TabsTrigger value="preknjizavanje">
              Preknjizavanje
              {metrics.preknjizavanjeCount > 0 && (
                <Badge
                  variant="outline"
                  className="ml-2 h-5 px-1.5 text-[10px] bg-amber-100 text-amber-800 border-amber-200"
                >
                  {metrics.preknjizavanjeCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filteri
            {filtersOpen ? (
              <ChevronUp className="ml-1 h-3 w-3" />
            ) : (
              <ChevronDown className="ml-1 h-3 w-3" />
            )}
          </Button>
        </div>

        {/* Filter Panel */}
        {filtersOpen && (
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              <Select value={filterTip} onValueChange={setFilterTip}>
                <SelectTrigger>
                  <SelectValue placeholder="Tip utroska" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Svi tipovi</SelectItem>
                  {Object.entries(UTILITY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status placanja" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Svi statusi</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filterNekretnina}
                onValueChange={setFilterNekretnina}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nekretnina" />
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
              <Select
                value={filterApprovalStatus}
                onValueChange={setFilterApprovalStatus}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Odobrenje" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Sva odobrenja</SelectItem>
                  <SelectItem value="draft">Nacrt</SelectItem>
                  <SelectItem value="pending_approval">
                    Čeka odobrenje
                  </SelectItem>
                  <SelectItem value="approved">Odobreno</SelectItem>
                  <SelectItem value="rejected">Odbijeno</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Trazi dobavljaca ili br. racuna..."
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
            </div>
            {hasActiveFilters && (
              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <p className="text-xs text-muted-foreground">
                  Prikazano {filteredRacuni.length} od {(racuni || []).length}{" "}
                  racuna
                </p>
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-1 h-3 w-3" /> Ocisti filtere
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Svi racuni tab content */}
        <TabsContent value="svi" className="mt-4">
          {/* Desktop Table */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tip</TableHead>
                  <TableHead>Dobavljac</TableHead>
                  <TableHead>Broj racuna</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Iznos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Preknjizavanje</TableHead>
                  <TableHead className="text-center">Odobrenje</TableHead>
                  <TableHead className="w-[60px]">Akcije</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRacuni.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-96 text-center">
                      <EmptyState
                        icon={FileText}
                        title="Nema racuna"
                        description="Trenutno nema racuna koji odgovaraju filtrima."
                        actionLabel="Dodaj racun"
                        onAction={openCreate}
                        className="border-0 shadow-none animate-none"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRacuni.map(renderTableRow)
                )}
              </TableBody>
            </Table>
          </div>
          {/* Mobile Cards */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredRacuni.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Nema racuna"
                description="Trenutno nema racuna koji odgovaraju filtrima."
                actionLabel="Dodaj racun"
                onAction={openCreate}
              />
            ) : (
              filteredRacuni.map(renderMobileCard)
            )}
          </div>
        </TabsContent>

        {/* Preknjizavanje tab content */}
        <TabsContent value="preknjizavanje" className="mt-4">
          {/* Desktop Table */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tip</TableHead>
                  <TableHead>Dobavljac</TableHead>
                  <TableHead>Broj racuna</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Iznos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Preknjizavanje</TableHead>
                  <TableHead className="text-center">Odobrenje</TableHead>
                  <TableHead className="w-[100px]">Akcije</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRacuni.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-96 text-center">
                      <EmptyState
                        icon={ArrowRightLeft}
                        title="Nema racuna za preknjizavanje"
                        description="Svi racuni su obradeni."
                        className="border-0 shadow-none animate-none"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRacuni.map(renderTableRow)
                )}
              </TableBody>
            </Table>
          </div>
          {/* Mobile Cards */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredRacuni.length === 0 ? (
              <EmptyState
                icon={ArrowRightLeft}
                title="Nema racuna za preknjizavanje"
                description="Svi racuni su obradeni."
              />
            ) : (
              filteredRacuni.map(renderMobileCard)
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRacun ? "Uredi racun" : "Novi racun"}
            </DialogTitle>
            <DialogDescription>
              {editingRacun
                ? "Izmijenite podatke postojeceg racuna."
                : "Unesite podatke za novi racun."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Row 1: Tip + Dobavljac */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Tip utroska <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.tip_utroska}
                  onValueChange={(v) => updateForm("tip_utroska", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Odaberite tip" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(UTILITY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Dobavljac</Label>
                <Input
                  value={form.dobavljac}
                  onChange={(e) => updateForm("dobavljac", e.target.value)}
                  placeholder="Naziv dobavljaca"
                />
              </div>
            </div>

            {/* Row 2: Broj racuna + Iznos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Broj racuna</Label>
                <Input
                  value={form.broj_racuna}
                  onChange={(e) => updateForm("broj_racuna", e.target.value)}
                  placeholder="BR-2024-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Iznos ({form.valuta})</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.iznos}
                  onChange={(e) => updateForm("iznos", e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Row 3: Datumi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Datum racuna</Label>
                <Input
                  type="date"
                  value={form.datum_racuna}
                  onChange={(e) => updateForm("datum_racuna", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Datum dospijeca</Label>
                <Input
                  type="date"
                  value={form.datum_dospijeca}
                  onChange={(e) =>
                    updateForm("datum_dospijeca", e.target.value)
                  }
                />
              </div>
            </div>

            {/* Row 4: Nekretnina + Zakupnik */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nekretnina</Label>
                <Select
                  value={form.nekretnina_id || "none"}
                  onValueChange={(v) =>
                    updateForm("nekretnina_id", v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Odaberite nekretninu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nije odabrano</SelectItem>
                    {nekretnine.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.naziv}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Zakupnik</Label>
                <Select
                  value={form.zakupnik_id || "none"}
                  onValueChange={(v) =>
                    updateForm("zakupnik_id", v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Odaberite zakupnika" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nije odabrano</SelectItem>
                    {zakupnici.map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {z.naziv_firme || z.ime_prezime || z.kontakt_email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 5: Status + Preknjizavanje */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status placanja</Label>
                <Select
                  value={form.status_placanja}
                  onValueChange={(v) => updateForm("status_placanja", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Preknjizavanje</Label>
                <Select
                  value={form.preknjizavanje_status}
                  onValueChange={(v) => updateForm("preknjizavanje_status", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PREKNJIZAVANJE_LABELS).map(
                      ([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 6: Period */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Period od</Label>
                <Input
                  type="date"
                  value={form.period_od}
                  onChange={(e) => updateForm("period_od", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Period do</Label>
                <Input
                  type="date"
                  value={form.period_do}
                  onChange={(e) => updateForm("period_do", e.target.value)}
                />
              </div>
            </div>

            {/* Row 7: Consumption */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Potrosnja (kWh)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.potrosnja_kwh}
                  onChange={(e) => updateForm("potrosnja_kwh", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Potrosnja (m3)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.potrosnja_m3}
                  onChange={(e) => updateForm("potrosnja_m3", e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Napomena */}
            <div className="space-y-2">
              <Label>Napomena</Label>
              <Textarea
                value={form.napomena}
                onChange={(e) => updateForm("napomena", e.target.value)}
                placeholder="Dodatne napomene..."
                rows={2}
              />
            </div>

            {/* File upload (only on create) */}
            {!editingRacun && (
              <div className="space-y-2">
                <Label>PDF datoteka</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="flex-1"
                  />
                  {file && (
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {file.name}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAIParse}
                disabled={aiParsing || saving}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {aiParsing ? "Parsiranje..." : "AI Parse"}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetDialog}>
                  Odustani
                </Button>
                <Button onClick={handleSave} disabled={saving || aiParsing}>
                  {saving
                    ? "Spremanje..."
                    : editingRacun
                      ? "Spremi"
                      : "Kreiraj"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Jeste li sigurni?</AlertDialogTitle>
            <AlertDialogDescription>
              Ova radnja se ne moze ponistiti. Racun "
              {racunToDelete?.broj_racuna || racunToDelete?.dobavljac || ""}" ce
              biti trajno obrisan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Odustani</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Obrisi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Bill Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odbij račun</DialogTitle>
            <DialogDescription>
              Unesite razlog odbijanja računa od &quot;{billToReject?.dobavljac}
              &quot;.
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
              onClick={confirmRejectBill}
              disabled={!rejectComment.trim()}
            >
              Odbij
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Recording Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Evidentiraj uplatu</DialogTitle>
            <DialogDescription>
              Zabilježite uplatu za račun &quot;
              {paymentBill?.broj_racuna || paymentBill?.dobavljac || ""}&quot;
              {paymentBill?.iznos != null && (
                <> (iznos: {formatCurrency(paymentBill.iznos)})</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="iznos_uplate">
                Iznos uplate <span className="text-destructive">*</span>
              </Label>
              <Input
                id="iznos_uplate"
                type="number"
                step="0.01"
                min="0"
                value={paymentForm.iznos_uplate}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    iznos_uplate: e.target.value,
                  }))
                }
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="datum_uplate">Datum uplate</Label>
              <Input
                id="datum_uplate"
                type="date"
                value={paymentForm.datum_uplate}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    datum_uplate: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="napomena_uplate">Napomena</Label>
              <Input
                id="napomena_uplate"
                value={paymentForm.napomena}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    napomena: e.target.value,
                  }))
                }
                placeholder="Opcionalna napomena..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setPaymentDialogOpen(false)}
            >
              Odustani
            </Button>
            <Button
              onClick={handleRecordPayment}
              disabled={paymentSaving || !paymentForm.iznos_uplate}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {paymentSaving ? "Spremanje..." : "Evidentiraj"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RacuniPage;
