import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../shared/api";
import {
  formatCurrency,
  formatDate,
  pdfDateStamp,
} from "../../shared/formatters";
import {
  Loader2,
  Printer,
  Download,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { toast } from "../../components/ui/sonner";

const STATUS_LABELS = {
  planning: "Planiranje",
  in_progress: "U tijeku",
  completed: "Završeno",
  on_hold: "Na čekanju",
  cancelled: "Otkazano",
};

const STATUS_DOT = {
  planning: "#6366f1",
  in_progress: "#3b82f6",
  completed: "#10b981",
  on_hold: "#d97706",
  cancelled: "#dc2626",
};

const PHASE_STATUS_DOT = {
  pending: "#94a3b8",
  in_progress: "#3b82f6",
  completed: "#10b981",
  delayed: "#dc2626",
};

export default function ProjectReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const reportRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.getProject(id);
        setProject(res.data);
      } catch (err) {
        console.error("Failed to load project", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

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
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = 210,
        pageHeight = 297,
        margin = 10;
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
        pdf.text("Stranica 1 od 1", pageWidth / 2, pageHeight - 5, {
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
            pageHeight - 5,
            { align: "center" },
          );
          yOffset += usableHeight;
          page++;
        }
      }

      const safeName = (project?.name || "projekt").replace(
        /[^a-zA-Z0-9_-]/g,
        "_",
      );
      pdf.save(`Izvjestaj_Projekt_${safeName}_${pdfDateStamp()}.pdf`);
      toast.success("PDF uspješno generiran");
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error("Greška pri generiranju PDF-a");
    }
  }, [project]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <p className="text-lg text-muted-foreground">Projekt nije pronađen.</p>
        <Button variant="outline" onClick={() => navigate("/projekti")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Natrag
        </Button>
      </div>
    );
  }

  // Computed
  const budget = Number(project.budget) || 0;
  const spent = Number(project.spent) || 0;
  const remaining = budget - spent;
  const budgetPct = budget > 0 ? Math.round((spent / budget) * 100) : 0;

  const phases = project.phases || [];
  const completedPhases = phases.filter((p) => p.status === "completed").length;
  const phasePct =
    phases.length > 0 ? Math.round((completedPhases / phases.length) * 100) : 0;

  const transactions = project.transactions || [];
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalExpense = transactions
    .filter((t) => t.type !== "income")
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const documents = project.documents || [];

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
            onClick={() => navigate(`/projekti/${id}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Natrag
          </Button>
          <h1 className="text-lg font-semibold">Izvještaj projekta</h1>
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
        className="max-w-[800px] mx-auto bg-white"
        style={{
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Header band */}
        <div className="bg-slate-800 text-white px-8 py-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-300 mb-1">
                Riforma — Izvještaj projekta
              </p>
              <h1 className="text-[22px] font-bold tracking-tight">
                {project.name}
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: STATUS_DOT[project.status] || "#94a3b8",
                  }}
                />
                <span className="text-sm font-medium">
                  {STATUS_LABELS[project.status] || project.status}
                </span>
              </div>
            </div>
            <div className="text-right text-sm text-slate-300">
              <p>Datum izvještaja</p>
              <p className="text-white font-semibold">{reportDate}</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-8">
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="border border-slate-200 rounded p-4">
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">
                Budžet
              </p>
              <p className="text-xl font-bold mt-1">{formatCurrency(budget)}</p>
            </div>
            <div className="border border-slate-200 rounded p-4">
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">
                Potrošeno
              </p>
              <p
                className={`text-xl font-bold mt-1 ${budgetPct > 90 ? "text-red-700" : budgetPct > 70 ? "text-amber-700" : "text-slate-900"}`}
              >
                {formatCurrency(spent)}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {budgetPct}% budžeta
              </p>
            </div>
            <div className="border border-slate-200 rounded p-4">
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">
                Preostalo
              </p>
              <p
                className={`text-xl font-bold mt-1 ${remaining < 0 ? "text-red-700" : "text-emerald-700"}`}
              >
                {formatCurrency(remaining)}
              </p>
            </div>
          </div>

          {/* Budget bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-500 font-semibold">
                Iskorištenost budžeta
              </span>
              <span className="font-bold">{budgetPct}%</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${budgetPct > 90 ? "bg-red-500" : budgetPct > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
            </div>
          </div>

          {/* Description */}
          {project.description && (
            <div className="mb-8">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 border-b border-slate-200 pb-1">
                Opis projekta
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                {project.description}
              </p>
            </div>
          )}

          {/* Phases */}
          {phases.length > 0 && (
            <div className="mb-8">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
                Faze realizacije ({completedPhases}/{phases.length} završeno —{" "}
                {phasePct}%)
              </h3>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${phasePct}%` }}
                />
              </div>
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="text-left py-2 px-3 font-semibold">Faza</th>
                    <th className="text-left py-2 px-3 font-semibold">
                      Početak
                    </th>
                    <th className="text-left py-2 px-3 font-semibold">
                      Završetak
                    </th>
                    <th className="text-center py-2 px-3 font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {phases.map((phase, idx) => (
                    <tr
                      key={phase.id || idx}
                      className={`border-b border-slate-100 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                    >
                      <td className="py-2 px-3 font-medium">{phase.name}</td>
                      <td className="py-2 px-3 text-slate-600">
                        {formatDate(phase.start_date)}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {formatDate(phase.end_date)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-flex items-center gap-1">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{
                              backgroundColor:
                                PHASE_STATUS_DOT[phase.status] || "#94a3b8",
                            }}
                          />
                          <span className="text-[10px] font-medium capitalize">
                            {phase.status}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Transactions */}
          {transactions.length > 0 && (
            <div className="mb-8">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
                Financijski pregled
              </h3>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded p-3">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">
                    Ukupni prihodi
                  </p>
                  <p className="text-sm font-bold text-emerald-700 mt-0.5">
                    {formatCurrency(totalIncome)}
                  </p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded p-3">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">
                    Ukupni rashodi
                  </p>
                  <p className="text-sm font-bold text-red-700 mt-0.5">
                    {formatCurrency(totalExpense)}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded p-3">
                  <p className="text-[10px] text-slate-500 uppercase font-semibold">
                    Neto
                  </p>
                  <p
                    className={`text-sm font-bold mt-0.5 ${totalIncome - totalExpense >= 0 ? "text-emerald-700" : "text-red-700"}`}
                  >
                    {formatCurrency(totalIncome - totalExpense)}
                  </p>
                </div>
              </div>
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="text-left py-2 px-3 font-semibold">Datum</th>
                    <th className="text-left py-2 px-3 font-semibold">
                      Kategorija
                    </th>
                    <th className="text-left py-2 px-3 font-semibold">Opis</th>
                    <th className="text-right py-2 px-3 font-semibold">
                      Iznos
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx, idx) => (
                    <tr
                      key={idx}
                      className={`border-b border-slate-100 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                    >
                      <td className="py-1.5 px-3 text-slate-600">
                        {formatDate(tx.date)}
                      </td>
                      <td className="py-1.5 px-3 capitalize">{tx.category}</td>
                      <td className="py-1.5 px-3 text-slate-600">
                        {tx.description}
                      </td>
                      <td
                        className={`py-1.5 px-3 text-right font-semibold ${tx.type === "income" ? "text-emerald-700" : "text-red-700"}`}
                      >
                        {tx.type === "income" ? "+" : "−"}
                        {formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Documents */}
          {documents.length > 0 && (
            <div className="mb-8">
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
                Pravna dokumentacija
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {documents.map((doc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between border border-slate-200 rounded p-2.5 text-[11px]"
                  >
                    <span className="font-medium truncate">
                      {doc.name}{" "}
                      <span className="text-slate-400">({doc.type})</span>
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-medium ${doc.status === "approved" ? "text-emerald-700" : "text-slate-500"}`}
                    >
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${doc.status === "approved" ? "bg-emerald-500" : "bg-slate-300"}`}
                      />
                      {doc.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
          @page { size: A4; margin: 15mm; }
        }
      `}</style>
    </div>
  );
}
