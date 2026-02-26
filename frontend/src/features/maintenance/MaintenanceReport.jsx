import React, { useEffect, useState, useRef, useCallback } from "react";
import { api } from "../../shared/api";
import {
  formatDate,
  formatCurrency,
  pdfDateStamp,
} from "../../shared/formatters";
import {
  Loader2,
  Printer,
  Download,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "../../components/ui/sonner";

const STATUS_LABELS = {
  novi: "Novi",
  ceka_dobavljaca: "Čeka dobavljača",
  u_tijeku: "U tijeku",
  zavrseno: "Završeno",
  arhivirano: "Arhivirano",
};

const STATUS_DOT = {
  novi: "#0ea5e9",
  ceka_dobavljaca: "#a855f7",
  u_tijeku: "#3b82f6",
  zavrseno: "#10b981",
  arhivirano: "#94a3b8",
};

const PRIORITY_LABELS = {
  kriticno: "Kritični",
  visoko: "Visoki",
  srednje: "Srednji",
  nisko: "Niski",
};

const PRIORITY_DOT = {
  kriticno: "#dc2626",
  visoko: "#ea580c",
  srednje: "#d97706",
  nisko: "#16a34a",
};

const PRIORITY_ORDER = { kriticno: 0, visoko: 1, srednje: 2, nisko: 3 };

const MaintenanceReport = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reportRef = useRef(null);

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

        const enrichedTasks = tasksRes.data
          .map((t) => {
            const property = propertiesMap.get(String(t.nekretnina_id));
            const assigneeUser = usersMap.get(String(t.dodijeljeno_user_id));
            const assigneeName =
              t.dodijeljeno ||
              (assigneeUser
                ? assigneeUser.full_name || assigneeUser.email || "—"
                : "—");
            return {
              ...t,
              nekretnina_naziv: property ? property.naziv : "—",
              dodijeljeno_naziv: assigneeName,
            };
          })
          .sort((a, b) => {
            const pa = PRIORITY_ORDER[a.prioritet] ?? 99;
            const pb = PRIORITY_ORDER[b.prioritet] ?? 99;
            if (pa !== pb) return pa - pb;
            return (a.rok || "").localeCompare(b.rok || "");
          });

        setTasks(enrichedTasks);
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
    const element = reportRef.current;
    if (!element) return;
    try {
      toast.info("Generiranje PDF-a...");
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: element.scrollWidth,
      });
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = 297,
        pageHeight = 210,
        margin = 8;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2 - 6;
      const imgWidth = usableWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= usableHeight) {
        pdf.addImage(
          canvas.toDataURL("image/png"),
          "PNG",
          margin,
          margin,
          imgWidth,
          imgHeight,
        );
        pdf.setFontSize(7);
        pdf.setTextColor(160);
        pdf.text("Stranica 1 od 1", pageWidth / 2, pageHeight - 4, {
          align: "center",
        });
      } else {
        let yOffset = 0,
          page = 0;
        const totalPages = Math.ceil(imgHeight / usableHeight);
        while (yOffset < imgHeight) {
          if (page > 0) pdf.addPage();
          const sourceY = (yOffset / imgHeight) * canvas.height;
          const sourceHeight = Math.min(
            (usableHeight / imgHeight) * canvas.height,
            canvas.height - sourceY,
          );
          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = canvas.width;
          pageCanvas.height = sourceHeight;
          const ctx = pageCanvas.getContext("2d");
          ctx.drawImage(
            canvas,
            0,
            sourceY,
            canvas.width,
            sourceHeight,
            0,
            0,
            canvas.width,
            sourceHeight,
          );
          const renderHeight = Math.min(usableHeight, imgHeight - yOffset);
          pdf.addImage(
            pageCanvas.toDataURL("image/png"),
            "PNG",
            margin,
            margin,
            imgWidth,
            renderHeight,
          );
          pdf.setFontSize(7);
          pdf.setTextColor(160);
          pdf.text(
            `Stranica ${page + 1} od ${totalPages}`,
            pageWidth / 2,
            pageHeight - 4,
            { align: "center" },
          );
          yOffset += usableHeight;
          page++;
        }
      }
      pdf.save(`Izvjestaj_Odrzavanje_${pdfDateStamp()}.pdf`);
      toast.success("PDF uspješno generiran");
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error("Greška pri generiranju PDF-a");
    }
  }, []);

  // --- Metrics ---
  const totalTasks = tasks.length;
  const openTasks = tasks.filter(
    (t) => !["zavrseno", "arhivirano"].includes(t.status),
  );
  const overdueTasks = tasks.filter((t) => {
    if (["zavrseno", "arhivirano"].includes(t.status)) return false;
    if (!t.rok) return false;
    return new Date(t.rok) < new Date();
  });
  const completedTasks = tasks.filter((t) => t.status === "zavrseno");
  const criticalTasks = tasks.filter(
    (t) =>
      t.prioritet === "kriticno" &&
      !["zavrseno", "arhivirano"].includes(t.status),
  );

  const totalMaterialCost = tasks.reduce(
    (sum, t) => sum + (Number(t.trosak_materijal) || 0),
    0,
  );
  const totalLaborCost = tasks.reduce(
    (sum, t) => sum + (Number(t.trosak_rad) || 0),
    0,
  );
  const totalCost = totalMaterialCost + totalLaborCost;

  const statusSummary = {};
  tasks.forEach((t) => {
    statusSummary[t.status || "nepoznato"] =
      (statusSummary[t.status || "nepoznato"] || 0) + 1;
  });

  const prioritySummary = {};
  tasks.forEach((t) => {
    prioritySummary[t.prioritet || "nepoznato"] =
      (prioritySummary[t.prioritet || "nepoznato"] || 0) + 1;
  });

  const tasksByProperty = {};
  tasks.forEach((t) => {
    const key = t.nekretnina_naziv || "Nepovezano";
    tasksByProperty[key] = (tasksByProperty[key] || 0) + 1;
  });

  const costByProperty = {};
  tasks.forEach((t) => {
    const key = t.nekretnina_naziv || "Nepovezano";
    costByProperty[key] =
      (costByProperty[key] || 0) +
      (Number(t.trosak_materijal) || 0) +
      (Number(t.trosak_rad) || 0);
  });

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toolbar */}
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
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
            <Download className="mr-1 h-4 w-4" /> PDF
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Ispis
          </Button>
        </div>
      </div>

      {/* ═══════════════════ REPORT CONTENT ═══════════════════ */}
      <div
        ref={reportRef}
        className="max-w-[1100px] mx-auto bg-white"
        style={{
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Header band */}
        <div className="bg-slate-800 text-white px-10 py-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300 mb-1">
                Riforma
              </p>
              <h1 className="text-[22px] font-bold tracking-tight">
                Izvještaj održavanja
              </h1>
            </div>
            <div className="text-right text-sm text-slate-300">
              <p>Datum izvještaja</p>
              <p className="text-white font-semibold">{reportDate}</p>
            </div>
          </div>
        </div>

        <div className="px-10 py-8">
          {/* KPI row */}
          <div className="grid grid-cols-6 gap-3 mb-8">
            {[
              {
                label: "Ukupno zadataka",
                value: totalTasks,
                color: "text-slate-900",
              },
              {
                label: "Otvorenih",
                value: openTasks.length,
                color: "text-blue-700",
              },
              {
                label: "Kritičnih",
                value: criticalTasks.length,
                color: "text-red-700",
              },
              {
                label: "Prekoračen rok",
                value: overdueTasks.length,
                color: "text-red-700",
              },
              {
                label: "Završenih",
                value: completedTasks.length,
                color: "text-emerald-700",
              },
              {
                label: "Ukupni troškovi",
                value: formatCurrency(totalCost),
                color: "text-slate-900",
              },
            ].map((kpi, i) => (
              <div key={i} className="border border-slate-200 rounded p-3">
                <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">
                  {kpi.label}
                </p>
                <p className={`text-lg font-bold mt-0.5 ${kpi.color}`}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          {/* Cost breakdown */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-slate-50 border border-slate-100 rounded p-4">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">
                Troškovi materijala
              </p>
              <p className="text-xl font-bold mt-1">
                {formatCurrency(totalMaterialCost)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {totalCost > 0
                  ? `${Math.round((totalMaterialCost / totalCost) * 100)}% ukupnih troškova`
                  : "—"}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded p-4">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">
                Troškovi rada
              </p>
              <p className="text-xl font-bold mt-1">
                {formatCurrency(totalLaborCost)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {totalCost > 0
                  ? `${Math.round((totalLaborCost / totalCost) * 100)}% ukupnih troškova`
                  : "—"}
              </p>
            </div>
            <div className="bg-slate-800 text-white rounded p-4">
              <p className="text-[10px] text-slate-300 uppercase font-semibold">
                Ukupni troškovi
              </p>
              <p className="text-xl font-bold mt-1">
                {formatCurrency(totalCost)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Materijal + rad
              </p>
            </div>
          </div>

          {/* Two-column: Status + Priority */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
                Raspodjela po statusu
              </h3>
              <div className="space-y-2">
                {Object.entries(statusSummary).map(([status, count]) => {
                  const pct =
                    totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0;
                  return (
                    <div
                      key={status}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: STATUS_DOT[status] || "#94a3b8",
                        }}
                      />
                      <span className="w-28">
                        {STATUS_LABELS[status] || status}
                      </span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: STATUS_DOT[status] || "#94a3b8",
                          }}
                        />
                      </div>
                      <span className="font-semibold w-8 text-right">
                        {count}
                      </span>
                      <span className="text-slate-400 w-10 text-right">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
                Raspodjela po prioritetu
              </h3>
              <div className="space-y-2">
                {Object.entries(prioritySummary)
                  .sort(
                    ([a], [b]) =>
                      (PRIORITY_ORDER[a] ?? 99) - (PRIORITY_ORDER[b] ?? 99),
                  )
                  .map(([priority, count]) => {
                    const pct =
                      totalTasks > 0
                        ? Math.round((count / totalTasks) * 100)
                        : 0;
                    return (
                      <div
                        key={priority}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              PRIORITY_DOT[priority] || "#94a3b8",
                          }}
                        />
                        <span className="w-28">
                          {PRIORITY_LABELS[priority] || priority}
                        </span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor:
                                PRIORITY_DOT[priority] || "#94a3b8",
                            }}
                          />
                        </div>
                        <span className="font-semibold w-8 text-right">
                          {count}
                        </span>
                        <span className="text-slate-400 w-10 text-right">
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Tasks & Costs by property */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
                Zadaci po nekretnini
              </h3>
              <div className="space-y-1.5">
                {Object.entries(tasksByProperty)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, count]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="truncate flex-1 min-w-0">{name}</span>
                      <span className="font-semibold shrink-0 ml-2">
                        {count}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
            <div>
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
                Troškovi po nekretnini
              </h3>
              <div className="space-y-1.5">
                {Object.entries(costByProperty)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, cost]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="truncate flex-1 min-w-0">{name}</span>
                      <span className="font-semibold shrink-0 ml-2">
                        {formatCurrency(cost)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Overdue warning */}
          {overdueTasks.length > 0 && (
            <div className="border-l-4 border-red-400 bg-red-50 rounded-r p-4 mb-8">
              <h3 className="text-xs font-bold text-red-800 flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Zadaci s prekoračenim rokom ({overdueTasks.length})
              </h3>
              <div className="space-y-1">
                {overdueTasks.slice(0, 5).map((t) => (
                  <p key={t.id} className="text-[11px] text-red-900">
                    <span className="font-semibold">{t.naziv}</span> —{" "}
                    {t.nekretnina_naziv} — rok: {formatDate(t.rok)}
                  </p>
                ))}
                {overdueTasks.length > 5 && (
                  <p className="text-[11px] text-red-600 italic">
                    ...i još {overdueTasks.length - 5} zadataka
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Main table */}
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 border-b border-slate-200 pb-1">
            Detaljan pregled zadataka
          </h3>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="text-left py-2 px-2 font-semibold">Naziv</th>
                <th className="text-left py-2 px-2 font-semibold">
                  Nekretnina
                </th>
                <th className="text-center py-2 px-2 font-semibold">
                  Prioritet
                </th>
                <th className="text-center py-2 px-2 font-semibold">Status</th>
                <th className="text-left py-2 px-2 font-semibold">Rok</th>
                <th className="text-right py-2 px-2 font-semibold">
                  Materijal
                </th>
                <th className="text-right py-2 px-2 font-semibold">Rad</th>
                <th className="text-left py-2 px-2 font-semibold">
                  Dodijeljeno
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t, i) => {
                const dueDate = t.rok ? new Date(t.rok) : null;
                const isOverdue =
                  dueDate &&
                  !Number.isNaN(dueDate.getTime()) &&
                  dueDate < new Date() &&
                  !["zavrseno", "arhivirano"].includes(t.status);
                return (
                  <tr
                    key={t.id}
                    className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                    style={{ pageBreakInside: "avoid" }}
                  >
                    <td className="py-1.5 px-2">
                      <div className="font-medium">{t.naziv || "—"}</div>
                      {t.opis && (
                        <div className="text-slate-400 text-[9px] truncate max-w-[200px]">
                          {t.opis}
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-slate-600">
                      {t.nekretnina_naziv}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{
                            backgroundColor:
                              PRIORITY_DOT[t.prioritet] || "#94a3b8",
                          }}
                        />
                        <span className="text-[10px] font-medium">
                          {PRIORITY_LABELS[t.prioritet] || t.prioritet || "—"}
                        </span>
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: STATUS_DOT[t.status] || "#94a3b8",
                          }}
                        />
                        <span className="text-[10px] font-medium">
                          {STATUS_LABELS[t.status] || t.status || "—"}
                        </span>
                      </span>
                    </td>
                    <td className="py-1.5 px-2">
                      <span
                        className={
                          isOverdue
                            ? "text-red-600 font-semibold"
                            : "text-slate-600"
                        }
                      >
                        {formatDate(t.rok)}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      {t.trosak_materijal != null
                        ? formatCurrency(t.trosak_materijal)
                        : "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      {t.trosak_rad != null
                        ? formatCurrency(t.trosak_rad)
                        : "—"}
                    </td>
                    <td className="py-1.5 px-2 text-slate-600">
                      {t.dodijeljeno_naziv}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-800 text-white font-semibold">
                <td colSpan={5} className="py-2 px-2 text-right">
                  UKUPNO:
                </td>
                <td className="py-2 px-2 text-right">
                  {formatCurrency(totalMaterialCost)}
                </td>
                <td className="py-2 px-2 text-right">
                  {formatCurrency(totalLaborCost)}
                </td>
                <td className="py-2 px-2" />
              </tr>
            </tfoot>
          </table>

          {/* Footer */}
          <div className="mt-8 pt-3 border-t border-slate-200 flex justify-between text-[10px] text-slate-400">
            <span>Riforma — Sustav za upravljanje nekretninama</span>
            <span>Generirano: {new Date().toLocaleString("hr-HR")}</span>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          table { width: 100%; }
          tr { page-break-inside: avoid; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
};

export default MaintenanceReport;
