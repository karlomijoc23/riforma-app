import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../shared/api";
import { useAuth } from "../../shared/auth";
import { toast } from "../../components/ui/sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { formatCurrency, formatDate } from "../../shared/formatters";
import {
  Loader2,
  FileText,
  Wrench,
  Receipt,
  ClipboardList,
  Plus,
  AlertTriangle,
  CalendarClock,
  KeyRound,
  LogOut,
} from "lucide-react";

const BILL_STATUS_LABELS = {
  ceka_placanje: "Čeka plaćanje",
  placeno: "Plaćeno",
  prekoraceno: "Prekoračeno",
  djelomicno_placeno: "Djelomično",
  storno: "Storno",
};

const TASK_STATUS_LABELS = {
  novi: "Novi",
  planiran: "Planiran",
  u_tijeku: "U tijeku",
  ceka_dobavljaca: "Čeka dobavljača",
  potrebna_odluka: "Potrebna odluka",
  zavrseno: "Završeno",
  arhivirano: "Arhivirano",
};

const PRIORITY_LABELS = {
  kriticno: "Kritično",
  visoko: "Visoko",
  srednje: "Srednje",
  nisko: "Nisko",
};

const CONTRACT_STATUS_LABELS = {
  aktivno: "Aktivno",
  na_isteku: "Na isteku",
  istekao: "Istekao",
  raskinuto: "Raskinuto",
  arhivirano: "Arhivirano",
};

const TenantPortalPage = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [profile, setProfile] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [bills, setBills] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState(null);

  const [requestOpen, setRequestOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestForm, setRequestForm] = useState({
    naziv: "",
    opis: "",
    prioritet: "srednje",
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        summaryRes,
        profileRes,
        contractsRes,
        billsRes,
        tasksRes,
        docsRes,
      ] = await Promise.all([
        api.getSelfSummary(),
        api.getSelfProfile(),
        api.getSelfContracts(),
        api.getSelfBills(),
        api.getSelfMaintenance(),
        api.getSelfDocuments(),
      ]);
      setSummary(summaryRes.data);
      setProfile(profileRes.data);
      setContracts(contractsRes.data || []);
      setBills(billsRes.data || []);
      setTasks(tasksRes.data || []);
      setDocuments(docsRes.data || []);
      setError(null);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Greška pri učitavanju.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSubmitRequest = async () => {
    if (!requestForm.naziv.trim()) {
      toast.error("Naziv prijave je obavezan.");
      return;
    }
    setSubmitting(true);
    try {
      await api.submitSelfMaintenance({
        naziv: requestForm.naziv.trim(),
        opis: requestForm.opis.trim() || null,
        prioritet: requestForm.prioritet,
      });
      toast.success("Prijava poslana upravitelju.");
      setRequestOpen(false);
      setRequestForm({ naziv: "", opis: "", prioritet: "srednje" });
      await loadAll();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(
        typeof detail === "string"
          ? detail
          : "Slanje prijave nije uspjelo.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 md:px-6">
        <Card className="border-2 border-dashed border-destructive/30">
          <CardContent className="pt-10 pb-10 flex flex-col items-center text-center gap-5">
            <div className="rounded-full bg-destructive/10 p-5">
              <AlertTriangle className="h-10 w-10 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                Pristup nije moguć
              </h2>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Dobrodošli, {summary?.zakupnik_naziv || "—"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pregled vašeg ugovora, računa i prijava održavanja.
          </p>
        </div>
        <Button
          onClick={() => setRequestOpen(true)}
          className="shrink-0 min-h-[44px] w-full sm:w-auto"
        >
          <Plus className="mr-2 h-4 w-4" /> Nova prijava
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Aktivni ugovori
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.active_contracts ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              od ukupno {summary?.total_contracts ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card
          className={
            summary?.outstanding_bills_count > 0
              ? "border-amber-300 bg-amber-50/50"
              : ""
          }
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Neplaćeni računi
            </CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary?.outstanding_total || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.outstanding_bills_count || 0} računa
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Sljedeće dospijeće
            </CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.next_due_date
                ? formatDate(summary.next_due_date)
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.next_due_date ? "datum plaćanja" : "nema dospijeća"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Otvorene prijave
            </CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.open_maintenance ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">naloga u tijeku</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="ugovori">
        {/* On phones the 5 tabs overflow horizontally — let them scroll
            instead of squeezing. min-h keeps each tab a comfortable
            touch target (>= 44 px). */}
        <TabsList className="w-full overflow-x-auto flex sm:inline-flex">
          <TabsTrigger value="ugovori" className="min-h-[40px] flex-shrink-0">
            Ugovori
          </TabsTrigger>
          <TabsTrigger value="racuni" className="min-h-[40px] flex-shrink-0">
            Računi
          </TabsTrigger>
          <TabsTrigger
            value="odrzavanje"
            className="min-h-[40px] flex-shrink-0"
          >
            Prijave
          </TabsTrigger>
          <TabsTrigger
            value="dokumenti"
            className="min-h-[40px] flex-shrink-0"
          >
            Dokumenti
          </TabsTrigger>
          <TabsTrigger value="profil" className="min-h-[40px] flex-shrink-0">
            Profil
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ugovori" className="space-y-3">
          {contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nemate aktivnih ugovora.
            </p>
          ) : (
            contracts.map((c) => (
              <Card key={c.id}>
                <CardContent className="pt-4 pb-4 flex justify-between items-start gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-semibold truncate">
                      {c.interna_oznaka || "—"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(c.datum_pocetka)} —{" "}
                      {formatDate(c.datum_zavrsetka)}
                    </p>
                    {Array.isArray(c.property_unit_ids) &&
                      c.property_unit_ids.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {c.property_unit_ids.length} jedinic
                          {c.property_unit_ids.length === 1 ? "a" : "a"}
                        </p>
                      )}
                  </div>
                  <div className="text-right space-y-1 shrink-0">
                    <Badge
                      variant="outline"
                      className={
                        c.status === "aktivno"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : c.status === "na_isteku"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-50 text-slate-600"
                      }
                    >
                      {CONTRACT_STATUS_LABELS[c.status] || c.status}
                    </Badge>
                    <p className="text-sm font-medium whitespace-nowrap">
                      {formatCurrency(c.osnovna_zakupnina || 0)} / mj.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="racuni" className="space-y-3">
          {bills.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nemate izdane račune.
            </p>
          ) : (
            bills.map((r) => (
              <Card key={r.id}>
                <CardContent className="pt-4 pb-4 flex justify-between items-start gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-semibold truncate">
                      Račun {r.broj_racuna || r.id?.slice(0, 8)}
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Izdan: {formatDate(r.datum_racuna)}
                      {r.datum_dospijeca && (
                        <> · Dospijeće: {formatDate(r.datum_dospijeca)}</>
                      )}
                    </p>
                    {r.opis && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {r.opis}
                      </p>
                    )}
                  </div>
                  <div className="text-right space-y-1 shrink-0">
                    <Badge
                      variant="outline"
                      className={
                        r.status_placanja === "placeno"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : r.status_placanja === "prekoraceno"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                      }
                    >
                      {BILL_STATUS_LABELS[r.status_placanja] ||
                        r.status_placanja}
                    </Badge>
                    <p className="text-sm font-medium whitespace-nowrap">
                      {formatCurrency(r.iznos || 0)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="odrzavanje" className="space-y-3">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nemate prijavljenih naloga. Kliknite "Nova prijava održavanja"
              gore.
            </p>
          ) : (
            tasks.map((t) => (
              <Card key={t.id}>
                <CardContent className="pt-4 pb-4 flex justify-between items-start gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-semibold truncate">{t.naziv}</p>
                    {t.opis && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {t.opis}
                      </p>
                    )}
                    {t.rok && (
                      <p className="text-xs text-muted-foreground">
                        Rok: {formatDate(t.rok)}
                      </p>
                    )}
                  </div>
                  <div className="text-right space-y-1 shrink-0">
                    <Badge variant="outline" className="whitespace-nowrap">
                      {TASK_STATUS_LABELS[t.status] || t.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {PRIORITY_LABELS[t.prioritet] || t.prioritet}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="dokumenti" className="space-y-3">
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nemate dokumenata.
            </p>
          ) : (
            documents.map((d) => (
              <Card key={d.id}>
                <CardContent className="pt-3 pb-3 flex items-center gap-3">
                  <ClipboardList className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{d.naziv || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.tip || "dokument"} ·{" "}
                      {d.datum_dokumenta
                        ? formatDate(d.datum_dokumenta)
                        : formatDate(d.created_at)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="profil" className="space-y-3">
          {profile && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vaši kontakt podaci</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Naziv: </span>
                  <span className="font-medium">
                    {profile.naziv_firme || profile.ime_prezime || "—"}
                  </span>
                </div>
                {profile.oib && (
                  <div>
                    <span className="text-muted-foreground">OIB: </span>
                    <span className="font-medium">{profile.oib}</span>
                  </div>
                )}
                {profile.kontakt_email && (
                  <div>
                    <span className="text-muted-foreground">Email: </span>
                    <span className="font-medium">
                      {profile.kontakt_email}
                    </span>
                  </div>
                )}
                {profile.kontakt_telefon && (
                  <div>
                    <span className="text-muted-foreground">Telefon: </span>
                    <span className="font-medium">
                      {profile.kontakt_telefon}
                    </span>
                  </div>
                )}
                {profile.adresa && (
                  <div>
                    <span className="text-muted-foreground">Adresa: </span>
                    <span className="font-medium">{profile.adresa}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground pt-3">
                  Za izmjenu kontakt podataka obratite se upravitelju.
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sigurnost i sesija</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start min-h-[44px]"
                onClick={() => navigate("/postavke/lozinka")}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Promijeni lozinku
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start min-h-[44px] text-destructive hover:text-destructive"
                onClick={async () => {
                  await logout();
                  navigate("/login", { replace: true });
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Odjavi se
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova prijava održavanja</DialogTitle>
            <DialogDescription>
              Opišite problem koji treba popraviti. Upravitelj će dobiti
              obavijest i kreirati radni nalog.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Naziv</Label>
              <Input
                value={requestForm.naziv}
                onChange={(e) =>
                  setRequestForm((p) => ({ ...p, naziv: e.target.value }))
                }
                placeholder="npr. Curenje u kuhinji"
              />
            </div>
            <div>
              <Label>Opis (opcionalno)</Label>
              <Textarea
                value={requestForm.opis}
                onChange={(e) =>
                  setRequestForm((p) => ({ ...p, opis: e.target.value }))
                }
                placeholder="Detalji koji bi pomogli majstoru..."
                rows={4}
              />
            </div>
            <div>
              <Label>Hitnost</Label>
              <Select
                value={requestForm.prioritet}
                onValueChange={(v) =>
                  setRequestForm((p) => ({ ...p, prioritet: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nisko">Nisko</SelectItem>
                  <SelectItem value="srednje">Srednje</SelectItem>
                  <SelectItem value="visoko">Visoko</SelectItem>
                  <SelectItem value="kriticno">Kritično (hitno)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRequestOpen(false)}
              disabled={submitting}
            >
              Odustani
            </Button>
            <Button onClick={handleSubmitRequest} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Pošalji prijavu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TenantPortalPage;
