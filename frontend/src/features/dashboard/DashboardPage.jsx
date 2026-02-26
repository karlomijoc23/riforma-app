import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { toast } from "../../components/ui/sonner";
import {
  Building,
  Building2,
  FileText,
  DollarSign,
  Calendar,
  ArrowRight,
  ArrowUpRight,
  Users,
  Wrench,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Plus,
  ChevronRight,
  Clock,
  Sparkles,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { api } from "../../shared/api";
import { useEntityStore } from "../../shared/entityStore";
import { formatPercentage, formatDate } from "../../shared/formatters";

const STATUS_COLORS = {
  aktivno: "#22c55e",
  na_isteku: "#f59e0b",
  istekao: "#ef4444",
  raskinuto: "#6b7280",
  arhivirano: "#94a3b8",
};

const STATUS_LABELS = {
  aktivno: "Aktivno",
  na_isteku: "Na isteku",
  istekao: "Istekao",
  raskinuto: "Raskinuto",
  arhivirano: "Arhivirano",
};

export const Dashboard = () => {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [dashError, setDashError] = useState(null);
  const [expiringDocs, setExpiringDocs] = useState([]);
  const { zakupnici, ugovori, ensureZakupnici, ensureUgovori } =
    useEntityStore();

  // Check if user has any tenants — runs once on mount
  useEffect(() => {
    api
      .getTenants()
      .then((res) => setTenants(res.data || []))
      .catch(() => setTenants([]));
  }, []);

  const hasTenants = tenants !== null && tenants.length > 0;

  useEffect(() => {
    if (!hasTenants) return;
    ensureZakupnici();
    ensureUgovori();
  }, [hasTenants, ensureZakupnici, ensureUgovori]);

  // Ugovori koji uskoro istječu — status na_isteku ili istječe u 60 dana
  const ugovoriNaIsteku = useMemo(() => {
    if (!ugovori?.length) return [];
    const today = new Date();
    const in60days = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
    return ugovori
      .filter((u) => {
        if (
          u.status === "istekao" ||
          u.status === "raskinuto" ||
          u.status === "arhivirano"
        )
          return false;
        if (u.status === "na_isteku") return true;
        // aktivni koji istječu u 60 dana
        if (u.datum_zavrsetka) {
          const end = new Date(u.datum_zavrsetka);
          return end <= in60days && end >= today;
        }
        return false;
      })
      .sort((a, b) => new Date(a.datum_zavrsetka) - new Date(b.datum_zavrsetka))
      .slice(0, 5);
  }, [ugovori]);

  const fetchDashboard = useCallback(async () => {
    setDashError(null);
    try {
      const response = await api.getDashboard();
      setDashboard(response.data);
    } catch (error) {
      console.error("Greška pri dohvaćanju dashboard podataka:", error);
      setDashError(error);
      toast.error(
        `Greška pri učitavanju: ${error?.response?.data?.detail || error.message || "nepoznata greška"}`,
      );
    }
  }, []);

  useEffect(() => {
    if (!hasTenants) return;
    fetchDashboard();
  }, [hasTenants, fetchDashboard]);

  useEffect(() => {
    if (!hasTenants) return;
    api
      .getExpiringDokumenti(30)
      .then((res) => setExpiringDocs(res.data || []))
      .catch(() => setExpiringDocs([]));
  }, [hasTenants]);

  const formatCurrency = useCallback((value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "—";
    return numeric.toLocaleString("hr-HR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, []);

  const formatCompactCurrency = useCallback((value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "—";
    if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(1)}M €`;
    if (numeric >= 1000) return `${(numeric / 1000).toFixed(1)}k €`;
    return `${numeric.toFixed(0)} €`;
  }, []);

  // Chart data
  const statusChartData = useMemo(() => {
    if (!dashboard?.status_breakdown) return [];
    return Object.entries(dashboard.status_breakdown).map(([key, value]) => ({
      name: STATUS_LABELS[key] || key,
      value,
      color: STATUS_COLORS[key] || "#94a3b8",
      statusKey: key,
    }));
  }, [dashboard?.status_breakdown]);

  const revenueChartData = useMemo(() => {
    return dashboard?.revenue_by_property || [];
  }, [dashboard?.revenue_by_property]);

  const occupancyByProperty = useMemo(() => {
    if (!dashboard?.najamni_kapacitet?.by_property) return [];
    return dashboard.najamni_kapacitet.by_property.filter(
      (p) => p.total_units > 0,
    );
  }, [dashboard?.najamni_kapacitet]);

  const rentalCapacity = dashboard?.najamni_kapacitet || null;

  // Action items: things that need attention
  const actionItems = useMemo(() => {
    if (!dashboard) return [];
    const items = [];
    if (dashboard.ugovori_na_isteku > 0) {
      items.push({
        icon: AlertTriangle,
        iconColor: "text-amber-500",
        bgColor: "bg-amber-50 border-amber-200",
        label: `${dashboard.ugovori_na_isteku} ${dashboard.ugovori_na_isteku === 1 ? "ugovor ističe" : "ugovora ističu"} uskoro`,
        action: () => navigate("/ugovori?status=na_isteku"),
      });
    }
    if ((dashboard.odrzavanje_novo || 0) > 0) {
      items.push({
        icon: Wrench,
        iconColor: "text-red-500",
        bgColor: "bg-red-50 border-red-200",
        label: `${dashboard.odrzavanje_novo} ${dashboard.odrzavanje_novo === 1 ? "novi zahtjev" : "novih zahtjeva"} za održavanje`,
        action: () => navigate("/odrzavanje"),
      });
    }
    if ((dashboard.odrzavanje_ceka_dobavljaca || 0) > 0) {
      items.push({
        icon: Clock,
        iconColor: "text-amber-500",
        bgColor: "bg-amber-50 border-amber-200",
        label: `${dashboard.odrzavanje_ceka_dobavljaca} ${dashboard.odrzavanje_ceka_dobavljaca === 1 ? "nalog čeka" : "naloga čekaju"} dobavljača`,
        action: () => navigate("/odrzavanje"),
      });
    }
    if (expiringDocs.length > 0) {
      items.push({
        icon: FileText,
        iconColor: "text-orange-500",
        bgColor: "bg-orange-50 border-orange-200",
        label: `${expiringDocs.length} ${expiringDocs.length === 1 ? "dokument ističe" : "dokumenta ističu"} u sljedećih 30 dana`,
        action: () => navigate("/dokumenti"),
      });
    }
    return items;
  }, [dashboard, navigate, expiringDocs]);

  // Custom tooltip for charts
  const RevenueTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-white px-3 py-2 shadow-md text-sm">
          <p className="font-medium">{payload[0].payload.naziv}</p>
          <p className="text-muted-foreground">
            {formatCurrency(payload[0].value)} €
          </p>
        </div>
      );
    }
    return null;
  };

  // No tenant/portfolio — prompt user to create one
  if (tenants !== null && tenants.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 md:px-6">
        <Card className="border-2 border-dashed border-primary/30 shadow-lg">
          <CardContent className="pt-10 pb-10 flex flex-col items-center text-center gap-5">
            <div className="rounded-full bg-primary/10 p-5">
              <Building2 className="h-10 w-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">
                Kreirajte svoj prvi portfelj
              </h2>
              <p className="text-sm text-muted-foreground max-w-sm">
                Portfelj grupira vaše nekretnine, zakupnike i ugovore.
                Kreirajte ga u postavkama.
              </p>
            </div>
            <Button size="lg" onClick={() => navigate("/postavke")}>
              <Plus className="mr-2 h-5 w-5" />
              Kreiraj portfelj
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (dashError && !dashboard) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 md:px-6">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">
            Greška pri učitavanju dashboard-a
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Nije moguće dohvatiti podatke. Provjerite mrežnu vezu i pokušajte
            ponovo.
          </p>
          <Button onClick={fetchDashboard} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Pokušaj ponovo
          </Button>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="mx-auto max-w-7xl space-y-10 px-4 py-10 md:px-6">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  // Empty state: no properties yet — show getting-started guide
  if (dashboard.ukupno_nekretnina === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-primary">
            Dobrodošli u Riforma
          </h1>
          <p className="mt-2 text-muted-foreground">
            Počnite u tri koraka — dodajte nekretninu, zakupnika i kreirajte
            ugovor.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card
            className="cursor-pointer border-2 border-dashed border-blue-300 bg-blue-50/50 transition-all hover:border-blue-400 hover:shadow-md"
            onClick={() => navigate("/nekretnine")}
          >
            <CardContent className="pt-6 pb-5 flex flex-col items-center text-center gap-3">
              <div className="rounded-full bg-blue-100 p-4">
                <Building className="h-7 w-7 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-blue-800">
                  1. Dodaj nekretninu
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Unesite adresu, tip i jedinice vaše nekretnine.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 border-dashed border-violet-200 bg-violet-50/30 opacity-70">
            <CardContent className="pt-6 pb-5 flex flex-col items-center text-center gap-3">
              <div className="rounded-full bg-violet-100 p-4">
                <Users className="h-7 w-7 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-violet-800">
                  2. Dodaj zakupnika
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Evidentirajte zakupnika s kontakt podacima.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 border-dashed border-green-200 bg-green-50/30 opacity-70">
            <CardContent className="pt-6 pb-5 flex flex-col items-center text-center gap-3">
              <div className="rounded-full bg-green-100 p-4">
                <FileText className="h-7 w-7 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-green-800">
                  3. Kreiraj ugovor
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Povežite zakupnika s jedinicom i definirajte uvjete.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="mt-8 text-center">
          <Button asChild size="lg">
            <Link to="/nekretnine">
              <Plus className="mr-2 h-5 w-5" />
              Dodaj prvu nekretninu
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const maintenanceTotal =
    (dashboard.odrzavanje_novo || 0) +
    (dashboard.odrzavanje_ceka_dobavljaca || 0) +
    (dashboard.odrzavanje_u_tijeku || 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 md:px-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-primary">
            Kontrolni centar
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Pregled portfelja, ugovora, popunjenosti i aktivnosti na jednom
            mjestu.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/ugovori">
              <Plus className="mr-1.5 h-4 w-4" />
              Novi ugovor
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/nekretnine">
              <Plus className="mr-1.5 h-4 w-4" />
              Nova nekretnina
            </Link>
          </Button>
        </div>
      </div>

      {/* Action Items - things that need attention */}
      {actionItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actionItems.map((item, i) => (
            <button
              key={i}
              onClick={item.action}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all hover:shadow-md cursor-pointer ${item.bgColor}`}
            >
              <item.icon className={`h-4 w-4 ${item.iconColor}`} />
              {item.label}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {/* Ugovori koji istječu — upozorenje widget */}
      {ugovoriNaIsteku.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60 shadow-shell">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Ugovori koji uskoro istječu
              <span className="ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                {ugovoriNaIsteku.length}
              </span>
            </CardTitle>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-amber-300 text-amber-800 hover:bg-amber-100"
            >
              <Link to="/ugovori?status=na_isteku">
                Svi <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {ugovoriNaIsteku.map((u) => {
                const daysLeft = u.datum_zavrsetka
                  ? Math.ceil(
                      (new Date(u.datum_zavrsetka) - new Date()) /
                        (1000 * 60 * 60 * 24),
                    )
                  : null;
                const zakupnik = zakupnici?.find((z) => z.id === u.zakupnik_id);
                const zakupnikNaziv =
                  zakupnik?.naziv_firme ||
                  zakupnik?.ime_prezime ||
                  zakupnik?.kontakt_email ||
                  "—";
                return (
                  <button
                    key={u.id}
                    onClick={() => navigate(`/ugovori?contractId=${u.id}`)}
                    className="w-full flex items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-left text-sm transition-all hover:border-amber-400 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      <span className="font-medium truncate">
                        {u.interna_oznaka || zakupnikNaziv}
                      </span>
                      {u.interna_oznaka && zakupnikNaziv !== "—" && (
                        <span className="text-muted-foreground text-xs truncate hidden sm:block">
                          · {zakupnikNaziv}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(u.datum_zavrsetka)}
                      </span>
                      {daysLeft !== null && (
                        <span
                          className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            daysLeft <= 7
                              ? "bg-red-100 text-red-700"
                              : daysLeft <= 30
                                ? "bg-amber-100 text-amber-700"
                                : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {daysLeft <= 0 ? "Istekao" : `${daysLeft}d`}
                        </span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards - Top Row - CLICKABLE */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Card
          data-testid="ukupno-nekretnina-card"
          className="card-hover shadow-shell cursor-pointer transition-all hover:shadow-lg hover:border-blue-300"
          onClick={() => navigate("/nekretnine")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nekretnine
              </span>
              <Building className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-2xl font-bold">{dashboard.ukupno_nekretnina}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-0.5">
              Pogledaj sve <ArrowUpRight className="h-3 w-3" />
            </p>
          </CardContent>
        </Card>

        <Card
          data-testid="aktivni-ugovori-card"
          className="card-hover shadow-shell cursor-pointer transition-all hover:shadow-lg hover:border-green-300"
          onClick={() => navigate("/ugovori?status=aktivno")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Aktivni ugovori
              </span>
              <Calendar className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold">{dashboard.aktivni_ugovori}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-0.5">
              Filtriraj aktivne <ArrowUpRight className="h-3 w-3" />
            </p>
          </CardContent>
        </Card>

        <Card
          className="card-hover shadow-shell cursor-pointer transition-all hover:shadow-lg hover:border-amber-300"
          onClick={() => navigate("/ugovori?status=na_isteku")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Na isteku
              </span>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-amber-600">
              {dashboard.ugovori_na_isteku}
            </p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-0.5">
              Pregledaj <ArrowUpRight className="h-3 w-3" />
            </p>
          </CardContent>
        </Card>

        <Card
          className="card-hover shadow-shell cursor-pointer transition-all hover:shadow-lg hover:border-violet-300"
          onClick={() => navigate("/zakupnici")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Zakupnici
              </span>
              <Users className="h-4 w-4 text-violet-500" />
            </div>
            <p className="text-2xl font-bold">
              {dashboard.ukupno_zakupnika || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-0.5">
              Pogledaj sve <ArrowUpRight className="h-3 w-3" />
            </p>
          </CardContent>
        </Card>

        <Card
          data-testid="mjesecni-prihod-card"
          className="card-hover shadow-shell"
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mjes. prihod
              </span>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold">
              {formatCompactCurrency(dashboard.mjesecni_prihod)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCompactCurrency((dashboard.mjesecni_prihod || 0) * 12)}{" "}
              godišnje
            </p>
          </CardContent>
        </Card>

        <Card
          className="card-hover shadow-shell cursor-pointer transition-all hover:shadow-lg hover:border-orange-300"
          onClick={() => navigate("/odrzavanje")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Održavanje
              </span>
              <Wrench className="h-4 w-4 text-orange-500" />
            </div>
            <p className="text-2xl font-bold">
              {maintenanceTotal}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                otvoreno
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-0.5">
              Kanban ploča <ArrowUpRight className="h-3 w-3" />
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Financial overview cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-0 bg-gradient-to-br from-primary to-primary/80 text-white shadow-xl">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              Vrijednost portfelja
            </p>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(dashboard.ukupna_vrijednost_portfelja || 0)} €
            </p>
            <p className="text-xs text-white/70 mt-1">
              Ukupna tržišna vrijednost
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-emerald-600 to-emerald-500 text-white shadow-xl">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              Godišnji prinos
            </p>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(dashboard.godisnji_prinos || 0)} €
            </p>
            <p className="text-xs text-white/70 mt-1">
              {dashboard.prinos_postotak}% ROI
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-xl">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              Popunjenost
            </p>
            <p className="text-2xl font-bold mt-1">
              {rentalCapacity
                ? formatPercentage(rentalCapacity.occupancy_rate)
                : "—"}
            </p>
            <p className="text-xs text-white/70 mt-1">
              {rentalCapacity
                ? `${rentalCapacity.occupied_units}/${rentalCapacity.total_units} jedinica`
                : "Nema podataka"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue by Property */}
        <Card className="shadow-shell">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Prihod po nekretnini
            </CardTitle>
          </CardHeader>
          <CardContent>
            {revenueChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={revenueChartData}
                  margin={{ top: 5, right: 10, left: 10, bottom: 50 }}
                  onClick={(data) => {
                    if (data?.activePayload?.[0]?.payload?.id) {
                      navigate(
                        `/nekretnine/${data.activePayload[0].payload.id}`,
                      );
                    }
                  }}
                  className="cursor-pointer"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="naziv"
                    tick={{ fontSize: 11 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    height={60}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v
                    }
                  />
                  <Tooltip content={<RevenueTooltip />} />
                  <Bar
                    dataKey="prihod"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={50}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                Nema aktivnih ugovora s prihodima
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contract Status Breakdown */}
        <Card className="shadow-shell">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Status ugovora
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusChartData.length > 0 ? (
              <div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                {/* Clickable legend */}
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                  {statusChartData.map((entry) => (
                    <button
                      key={entry.statusKey}
                      className="flex items-center gap-1.5 text-xs hover:opacity-70 transition-opacity cursor-pointer rounded px-2 py-1 hover:bg-muted"
                      onClick={() =>
                        navigate(`/ugovori?status=${entry.statusKey}`)
                      }
                    >
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span>
                        {entry.name}: {entry.value}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                Nema podataka o ugovorima
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Maintenance & Occupancy Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Maintenance overview */}
        <Card className="shadow-shell">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wrench className="h-4 w-4 text-orange-500" />
              Održavanje
            </CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link to="/odrzavanje">
                Pogledaj sve <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => navigate("/odrzavanje")}
                className="rounded-lg border border-red-200 bg-red-50 p-4 text-center transition-all hover:shadow-md hover:border-red-300 cursor-pointer"
              >
                <p className="text-2xl font-bold text-red-600">
                  {dashboard.odrzavanje_novo || 0}
                </p>
                <p className="text-xs text-red-600/70 mt-1">Novi zahtjevi</p>
              </button>
              <button
                onClick={() => navigate("/odrzavanje")}
                className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center transition-all hover:shadow-md hover:border-amber-300 cursor-pointer"
              >
                <p className="text-2xl font-bold text-amber-600">
                  {dashboard.odrzavanje_ceka_dobavljaca || 0}
                </p>
                <p className="text-xs text-amber-600/70 mt-1">
                  Čeka dobavljača
                </p>
              </button>
              <button
                onClick={() => navigate("/odrzavanje")}
                className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center transition-all hover:shadow-md hover:border-blue-300 cursor-pointer"
              >
                <p className="text-2xl font-bold text-blue-600">
                  {dashboard.odrzavanje_u_tijeku || 0}
                </p>
                <p className="text-xs text-blue-600/70 mt-1">U tijeku</p>
              </button>
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {dashboard.odrzavanje_zavrseno || 0}
                </p>
                <p className="text-xs text-green-600/70 mt-1">Završeno</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Occupancy by property - CLICKABLE */}
        <Card className="shadow-shell">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Building className="h-4 w-4 text-blue-500" />
              Popunjenost po nekretnini
            </CardTitle>
          </CardHeader>
          <CardContent>
            {occupancyByProperty.length > 0 ? (
              <div className="space-y-3">
                {occupancyByProperty.map((prop) => (
                  <button
                    key={prop.id}
                    className="w-full space-y-1 text-left rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-muted cursor-pointer"
                    onClick={() => navigate(`/nekretnine/${prop.id}`)}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium truncate max-w-[60%]">
                        {prop.naziv}
                      </span>
                      <span className="text-muted-foreground">
                        {prop.occupied_units}/{prop.total_units} (
                        {prop.occupancy_rate}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, prop.occupancy_rate)}%`,
                          backgroundColor:
                            prop.occupancy_rate >= 80
                              ? "#22c55e"
                              : prop.occupancy_rate >= 50
                                ? "#f59e0b"
                                : "#ef4444",
                        }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nema nekretnina s jedinicama
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expiring contracts */}
      {dashboard.expiring_soon && dashboard.expiring_soon.length > 0 && (
        <Card className="shadow-shell border-amber-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Ugovori koji uskoro istječu
            </CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link to="/ugovori?status=na_isteku">
                Svi na isteku <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground uppercase">
                    <th className="text-left py-2 px-2">Ugovor</th>
                    <th className="text-left py-2 px-2">Zakupnik</th>
                    <th className="text-left py-2 px-2">Istječe</th>
                    <th className="text-right py-2 px-2">Preostalo</th>
                    <th className="text-right py-2 px-2">Zakupnina</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.expiring_soon.map((c) => {
                    const tenant = zakupnici?.find(
                      (z) => z.id === c.zakupnik_id,
                    );
                    return (
                      <tr
                        key={c.id}
                        className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/ugovori?contractId=${c.id}`)}
                      >
                        <td className="py-2.5 px-2 font-mono text-xs">
                          {c.interna_oznaka}
                        </td>
                        <td className="py-2.5 px-2">
                          {tenant?.naziv_firme || tenant?.ime_prezime || "—"}
                        </td>
                        <td className="py-2.5 px-2">
                          {new Date(c.datum_zavrsetka).toLocaleDateString(
                            "hr-HR",
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <Badge
                            variant={
                              c.days_left <= 30 ? "destructive" : "secondary"
                            }
                          >
                            {c.days_left} dana
                          </Badge>
                        </td>
                        <td className="py-2.5 px-2 text-right font-medium">
                          {formatCurrency(c.osnovna_zakupnina)} €
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick links: AI Report */}
      <Card
        className="card-hover shadow-shell cursor-pointer transition-all hover:shadow-lg hover:border-purple-300 group"
        onClick={() => navigate("/izvjestaji/mjesecni")}
      >
        <CardContent className="pt-5 pb-4 flex items-center gap-4">
          <div className="rounded-xl bg-purple-100 p-3 group-hover:bg-purple-200 transition-colors">
            <Sparkles className="h-6 w-6 text-purple-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">AI Mjesečni Izvještaj</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Generiraj AI analizu portfelja s preporukama
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-purple-600 transition-colors" />
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
