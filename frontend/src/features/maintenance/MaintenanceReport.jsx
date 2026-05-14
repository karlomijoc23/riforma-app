import React, { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../../shared/api";
import {
  downloadPdfFromResponse,
  extractBlobErrorDetail,
} from "../../shared/downloadBlob";
import { formatDate, formatCurrency } from "../../shared/formatters";
import {
  Loader2,
  Printer,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "../../components/ui/sonner";
import {
  ReportHeader,
  SectionTitle,
  KpiGrid,
  KpiCard,
  DataTable,
  DataTableHead,
  RankList,
  DownloadPdfButton,
  REPORT_COLORS,
} from "../../shared/reportUI";

const STATUS_LABELS = {
  novi: "Novi",
  ceka_dobavljaca: "Čeka dobavljača",
  u_tijeku: "U tijeku",
  zavrseno: "Završeno",
  arhivirano: "Arhivirano",
};

const PRIORITY_LABELS = {
  kriticno: "Kritični",
  visoki: "Visoki",
  visoko: "Visoki",
  srednji: "Srednji",
  srednje: "Srednji",
  niski: "Niski",
  nisko: "Niski",
};

const PRIORITY_ORDER = {
  kriticno: 0,
  visoki: 1,
  visoko: 1,
  srednji: 2,
  srednje: 2,
  niski: 3,
  nisko: 3,
};

const STATUS_TONE = {
  novi: "info",
  ceka_dobavljaca: "warn",
  u_tijeku: "info",
  zavrseno: "positive",
  arhivirano: "neutral",
};

const PRIORITY_COLOR = {
  kriticno: "#dc2626",
  visoki: "#ea580c",
  visoko: "#ea580c",
  srednji: "#d97706",
  srednje: "#d97706",
  niski: "#16a34a",
  nisko: "#16a34a",
};

const STATUS_COLOR = {
  novi: "#0ea5e9",
  ceka_dobavljaca: "#a855f7",
  u_tijeku: "#3b82f6",
  zavrseno: "#10b981",
  arhivirano: "#94a3b8",
};

const MaintenanceReport = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tasksRes, propertiesRes, usersRes] = await Promise.all([
          api.getMaintenanceTasks(),
          api.getNekretnine(),
          api.getUsers(),
        ]);
        const propertiesMap = new Map(
          propertiesRes.data.map((p) => [String(p.id), p]),
        );
        const usersMap = new Map(usersRes.data.map((u) => [String(u.id), u]));

        const enriched = tasksRes.data
          .map((t) => {
            const property = propertiesMap.get(String(t.nekretnina_id));
            const assigneeUser = usersMap.get(String(t.dodijeljeno_user_id));
            return {
              ...t,
              nekretnina_naziv: property?.naziv || "—",
              dodijeljeno_naziv:
                t.dodijeljeno ||
                (assigneeUser
                  ? assigneeUser.full_name || assigneeUser.email || "—"
                  : "—"),
            };
          })
          .sort((a, b) => {
            const pa = PRIORITY_ORDER[a.prioritet] ?? 99;
            const pb = PRIORITY_ORDER[b.prioritet] ?? 99;
            if (pa !== pb) return pa - pb;
            return (a.rok || "").localeCompare(b.rok || "");
          });

        setTasks(enriched);
      } catch (err) {
        console.error("Failed to fetch maintenance report data", err);
        setError("Greška pri učitavanju podataka izvještaja");
        toast.error("Greška pri učitavanju podataka izvještaja");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleDownloadPdf = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await api.exportMaintenanceReportPdf();
      downloadPdfFromResponse(res, "riforma-izvjestaj-odrzavanja.pdf");
      toast.success("PDF preuzet.");
    } catch (err) {
      const detail = await extractBlobErrorDetail(err);
      toast.error(detail);
    } finally {
      setDownloading(false);
    }
  }, []);

  const metrics = useMemo(() => {
    const total = tasks.length;
    const isClosed = (t) => ["zavrseno", "arhivirano"].includes(t.status);
    const today = new Date();
    const open = tasks.filter((t) => !isClosed(t));
    const overdue = tasks.filter(
      (t) => !isClosed(t) && t.rok && new Date(t.rok) < today,
    );
    const completed = tasks.filter((t) => t.status === "zavrseno");
    const critical = tasks.filter(
      (t) => t.prioritet === "kriticno" && !isClosed(t),
    );
    const materialCost = tasks.reduce(
      (s, t) => s + (Number(t.trosak_materijal) || 0),
      0,
    );
    const laborCost = tasks.reduce(
      (s, t) => s + (Number(t.trosak_rad) || 0),
      0,
    );
    const totalCost = materialCost + laborCost;

    const statusMap = new Map();
    tasks.forEach((t) => {
      const key = t.status || "nepoznato";
      statusMap.set(key, (statusMap.get(key) || 0) + 1);
    });
    const statusSummary = [...statusMap.entries()].map(([key, count]) => ({
      key,
      label: STATUS_LABELS[key] || key,
      count,
      pct: total ? Math.round((count / total) * 100) : 0,
      color: STATUS_COLOR[key] || "#94a3b8",
    }));

    const priorityMap = new Map();
    tasks.forEach((t) => {
      const key = t.prioritet || "nepoznato";
      priorityMap.set(key, (priorityMap.get(key) || 0) + 1);
    });
    const prioritySummary = [...priorityMap.entries()]
      .map(([key, count]) => ({
        key,
        label: PRIORITY_LABELS[key] || key,
        count,
        pct: total ? Math.round((count / total) * 100) : 0,
        color: PRIORITY_COLOR[key] || "#94a3b8",
        order: PRIORITY_ORDER[key] ?? 99,
      }))
      .sort((a, b) => a.order - b.order);

    const byPropCount = new Map();
    const byPropCost = new Map();
    tasks.forEach((t) => {
      const key = t.nekretnina_naziv || "Nepovezano";
      byPropCount.set(key, (byPropCount.get(key) || 0) + 1);
      byPropCost.set(
        key,
        (byPropCost.get(key) || 0) +
          (Number(t.trosak_materijal) || 0) +
          (Number(t.trosak_rad) || 0),
      );
    });
    const countSorted = [...byPropCount.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const costSorted = [...byPropCost.entries()]
      .map(([name, cost]) => ({ name, cost }))
      .sort((a, b) => b.cost - a.cost);

    return {
      total,
      open,
      overdue,
      completed,
      critical,
      materialCost,
      laborCost,
      totalCost,
      statusSummary,
      prioritySummary,
      countSorted,
      countMax: countSorted[0]?.count || 1,
      countOverflow: Math.max(0, countSorted.length - 5),
      costSorted,
      costMax: costSorted[0]?.cost || 1,
      costOverflow: Math.max(0, costSorted.length - 5),
    };
  }, [tasks]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <p className="text-lg text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => navigate("/odrzavanje")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Natrag
        </Button>
      </div>
    );
  }

  const reportDate = new Date().toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const DistRow = ({ row }) => (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: row.color }}
      />
      <span className="w-32 text-foreground">{row.label}</span>
      <div className="flex-1 h-2 bg-[#0F5E4D]/10 rounded-sm overflow-hidden">
        <div
          className="h-full"
          style={{ width: `${row.pct}%`, background: row.color }}
        />
      </div>
      <span className="w-8 text-right font-semibold tabular-nums">
        {row.count}
      </span>
      <span className="w-12 text-right text-muted-foreground tabular-nums text-xs">
        {row.pct} %
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/odrzavanje")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Natrag
          </Button>
          <h1 className="text-lg font-semibold">Izvještaj održavanja</h1>
        </div>
        <div className="flex gap-2">
          <DownloadPdfButton onClick={handleDownloadPdf} downloading={downloading} />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Ispis
          </Button>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto p-6 space-y-2">
        <ReportHeader
          eyebrow="Izvještaj održavanja"
          title="Zadaci održavanja"
          subtitle="Status, prioriteti i troškovi održavanja kroz portfelj."
          metaLabel="Datum izvještaja"
          metaValue={reportDate}
        />

        <SectionTitle>Ključni pokazatelji</SectionTitle>
        <KpiGrid>
          <KpiCard
            label="Ukupno zadataka"
            value={metrics.total}
            sub={`Otvorenih ${metrics.open.length} · Završenih ${metrics.completed.length}`}
          />
          <KpiCard
            variant="info"
            label="Kritičnih"
            value={metrics.critical.length}
            sub="Prioritet visoki"
          />
          <KpiCard
            label="Prekoračen rok"
            value={metrics.overdue.length}
            sub={metrics.overdue.length > 0 ? "Hitno za rješavanje" : "Sve u roku"}
          />
          <KpiCard
            variant="accent"
            label="Ukupni troškovi"
            value={formatCurrency(metrics.totalCost)}
            sub={`Materijal ${formatCurrency(metrics.materialCost)} · Rad ${formatCurrency(metrics.laborCost)}`}
          />
        </KpiGrid>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
          <div>
            <SectionTitle>Raspodjela po statusu</SectionTitle>
            <div className="rounded-md border border-[#0F5E4D]/15 bg-white p-3">
              {metrics.statusSummary.map((row) => (
                <DistRow key={row.key} row={row} />
              ))}
            </div>
          </div>
          <div>
            <SectionTitle>Raspodjela po prioritetu</SectionTitle>
            <div className="rounded-md border border-[#0F5E4D]/15 bg-white p-3">
              {metrics.prioritySummary.map((row) => (
                <DistRow key={row.key} row={row} />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
          {metrics.countSorted.length > 0 && (
            <div>
              <SectionTitle>Top 5 zadataka po nekretnini</SectionTitle>
              <RankList
                items={metrics.countSorted.slice(0, 5).map((r) => ({
                  name: r.name,
                  value: r.count,
                  barWidth: Math.round((r.count / metrics.countMax) * 100),
                }))}
                valueFormatter={(n) => `${n}`}
                overflow={metrics.countOverflow}
              />
            </div>
          )}
          {metrics.costSorted.length > 0 && (
            <div>
              <SectionTitle>Top 5 troškova po nekretnini</SectionTitle>
              <RankList
                items={metrics.costSorted.slice(0, 5).map((r) => ({
                  name: r.name,
                  value: r.cost,
                  barWidth: Math.round((r.cost / metrics.costMax) * 100),
                }))}
                valueFormatter={formatCurrency}
                overflow={metrics.costOverflow}
              />
            </div>
          )}
        </div>

        {metrics.overdue.length > 0 && (
          <>
            <div
              className="mt-6 rounded-md border border-l-4 px-5 py-4"
              style={{
                background: "#fef3c7",
                borderColor: "#f6dba0",
                borderLeftColor: "#8a5a00",
              }}
            >
              <h3 className="text-sm font-bold text-[#8a5a00] mb-2">
                ⚠ Zadaci s prekoračenim rokom ({metrics.overdue.length})
              </h3>
              <ul className="text-sm space-y-1 pl-5 list-disc">
                {metrics.overdue.slice(0, 10).map((t) => (
                  <li key={t.id}>
                    <strong>{t.naziv}</strong> · {t.nekretnina_naziv} · rok{" "}
                    {formatDate(t.rok)}
                  </li>
                ))}
                {metrics.overdue.length > 10 && (
                  <li
                    className="italic text-muted-foreground list-none"
                    style={{ marginLeft: "-1rem" }}
                  >
                    … i još {metrics.overdue.length - 10} zadataka
                  </li>
                )}
              </ul>
            </div>
          </>
        )}

        <SectionTitle>Detaljan pregled zadataka</SectionTitle>
        <DataTable>
          <DataTableHead>
            <tr>
              <th className="text-left px-3 py-2 w-[28%]">Naziv</th>
              <th className="text-left px-3 py-2">Nekretnina</th>
              <th className="text-left px-3 py-2">Prioritet</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Rok</th>
              <th className="text-right px-3 py-2">Materijal</th>
              <th className="text-right px-3 py-2">Rad</th>
              <th className="text-left px-3 py-2">Dodijeljeno</th>
            </tr>
          </DataTableHead>
          <tbody>
            {tasks.map((t, i) => {
              const overdue =
                t.rok &&
                !["zavrseno", "arhivirano"].includes(t.status) &&
                new Date(t.rok) < new Date();
              return (
                <tr
                  key={t.id}
                  className={`border-t border-[#0F5E4D]/10 ${i % 2 === 1 ? "bg-[#0F5E4D]/[0.02]" : ""}`}
                  style={{ pageBreakInside: "avoid" }}
                >
                  <td className="px-3 py-2">
                    <div className="font-semibold">{t.naziv || "—"}</div>
                    {t.opis && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                        {t.opis}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{t.nekretnina_naziv}</td>
                  <td className="px-3 py-2 text-sm">
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                      style={{
                        background:
                          PRIORITY_COLOR[t.prioritet] || "#94a3b8",
                      }}
                    />
                    {PRIORITY_LABELS[t.prioritet] || t.prioritet || "—"}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                      style={{
                        background: STATUS_COLOR[t.status] || "#94a3b8",
                      }}
                    />
                    {STATUS_LABELS[t.status] || t.status || "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <span
                      className={overdue ? "text-[#b42318] font-bold" : ""}
                    >
                      {formatDate(t.rok)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {t.trosak_materijal != null
                      ? formatCurrency(t.trosak_materijal)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {t.trosak_rad != null
                      ? formatCurrency(t.trosak_rad)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm">{t.dodijeljeno_naziv}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#0F5E4D] bg-[#0F5E4D]/5 font-bold text-[#0F5E4D]">
              <td colSpan={5} className="px-3 py-2 text-right">
                UKUPNO
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatCurrency(metrics.materialCost)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatCurrency(metrics.laborCost)}
              </td>
              <td />
            </tr>
          </tfoot>
        </DataTable>

        <div className="pt-4 border-t border-[#0F5E4D]/10 flex justify-between text-[10px] text-muted-foreground">
          <span>Riforma — Sustav za upravljanje nekretninama</span>
          <span>Generirano: {new Date().toLocaleString("hr-HR")}</span>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
};

export default MaintenanceReport;
