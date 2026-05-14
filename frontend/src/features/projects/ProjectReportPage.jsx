import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../shared/api";
import {
  downloadPdfFromResponse,
  extractBlobErrorDetail,
} from "../../shared/downloadBlob";
import { formatCurrency, formatDate } from "../../shared/formatters";
import {
  Loader2,
  Printer,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { toast } from "../../components/ui/sonner";
import {
  ReportHeader,
  SectionTitle,
  KpiGrid,
  KpiCard,
  DataTable,
  DataTableHead,
  StatusPill,
  DownloadPdfButton,
  REPORT_COLORS,
} from "../../shared/reportUI";

const STATUS_LABELS = {
  planning: "Planiranje",
  in_progress: "U tijeku",
  completed: "Završeno",
  on_hold: "Na čekanju",
  cancelled: "Otkazano",
};

const STATUS_TONE = {
  planning: "info",
  in_progress: "info",
  completed: "positive",
  on_hold: "warn",
  cancelled: "danger",
};

const PHASE_TONE = {
  pending: "neutral",
  in_progress: "info",
  completed: "positive",
  delayed: "danger",
};

const PHASE_LABEL = {
  pending: "Čeka",
  in_progress: "U tijeku",
  completed: "Završeno",
  delayed: "Kasni",
};

export default function ProjectReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

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
    if (!id) return;
    setDownloading(true);
    try {
      const res = await api.exportProjectReportPdf(id);
      const safeName = (project?.name || "projekt").replace(
        /[^a-zA-Z0-9_-]/g,
        "_",
      );
      downloadPdfFromResponse(res, `riforma-projekt-${safeName}.pdf`);
      toast.success("PDF preuzet.");
    } catch (err) {
      const detail = await extractBlobErrorDetail(err);
      toast.error(detail);
    } finally {
      setDownloading(false);
    }
  }, [id, project]);

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
  const netAmount = totalIncome - totalExpense;

  const documents = project.documents || [];

  const reportDate = new Date().toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  // Boja progress bara prema iskorištenosti
  const barGradient =
    budgetPct > 90
      ? "linear-gradient(90deg, #b42318, #dc2626)"
      : budgetPct > 70
        ? "linear-gradient(90deg, #d97706, #f59e0b)"
        : `linear-gradient(90deg, ${REPORT_COLORS.primary}, ${REPORT_COLORS.accent})`;

  return (
    <div className="min-h-screen bg-gray-50">
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
          <DownloadPdfButton onClick={handleDownloadPdf} downloading={downloading} />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Ispis
          </Button>
        </div>
      </div>

      <div className="max-w-[1000px] mx-auto p-6 space-y-2">
        <ReportHeader
          eyebrow="Izvještaj projekta"
          title={project.name}
          subtitle={
            <span className="inline-flex items-center gap-2">
              <StatusPill tone={STATUS_TONE[project.status] || "neutral"}>
                {STATUS_LABELS[project.status] || project.status}
              </StatusPill>
            </span>
          }
          metaLabel="Datum izvještaja"
          metaValue={reportDate}
        />

        <SectionTitle>Budžet i potrošnja</SectionTitle>
        <KpiGrid>
          <KpiCard label="Budžet" value={formatCurrency(budget)} />
          <KpiCard
            variant={budgetPct > 90 ? "default" : "info"}
            label="Potrošeno"
            value={formatCurrency(spent)}
            sub={`${budgetPct} % budžeta`}
          />
          <KpiCard
            variant={remaining < 0 ? "default" : "accent"}
            label="Preostalo"
            value={formatCurrency(remaining)}
          />
          <KpiCard
            label="Faze"
            value={`${completedPhases} / ${phases.length || 0}`}
            sub={`${phasePct} % završeno`}
          />
        </KpiGrid>

        <div className="mt-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Iskorištenost budžeta
            </span>
            <span className="text-sm font-bold">{budgetPct} %</span>
          </div>
          <div className="h-3 bg-[#0F5E4D]/10 rounded-sm overflow-hidden">
            <div
              className="h-full"
              style={{
                width: `${Math.min(100, budgetPct)}%`,
                background: barGradient,
              }}
            />
          </div>
        </div>

        {project.description && (
          <>
            <SectionTitle>Opis projekta</SectionTitle>
            <div className="rounded-md bg-[#0F5E4D]/5 border-l-[3px] border-[#00C08B] px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap">
              {project.description}
            </div>
          </>
        )}

        {phases.length > 0 && (
          <>
            <SectionTitle
              hint={`${completedPhases}/${phases.length} završeno (${phasePct} %)`}
            >
              Faze realizacije
            </SectionTitle>
            <div className="h-2 bg-[#0F5E4D]/10 rounded-sm overflow-hidden mb-3">
              <div
                className="h-full"
                style={{
                  width: `${phasePct}%`,
                  background: `linear-gradient(90deg, ${REPORT_COLORS.primary}, ${REPORT_COLORS.accent})`,
                }}
              />
            </div>
            <DataTable>
              <DataTableHead>
                <tr>
                  <th className="text-left px-3 py-2">Faza</th>
                  <th className="text-left px-3 py-2">Početak</th>
                  <th className="text-left px-3 py-2">Završetak</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </DataTableHead>
              <tbody>
                {phases.map((p, i) => (
                  <tr
                    key={p.id || i}
                    className={`border-t border-[#0F5E4D]/10 ${i % 2 === 1 ? "bg-[#0F5E4D]/[0.02]" : ""}`}
                  >
                    <td className="px-3 py-2 font-semibold">{p.name}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatDate(p.start_date)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatDate(p.end_date)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill tone={PHASE_TONE[p.status] || "neutral"}>
                        {PHASE_LABEL[p.status] || p.status}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </>
        )}

        {transactions.length > 0 && (
          <>
            <SectionTitle>Financijski pregled</SectionTitle>
            <KpiGrid>
              <KpiCard
                variant="positive"
                label="Ukupni prihodi"
                value={formatCurrency(totalIncome)}
              />
              <KpiCard
                label="Ukupni rashodi"
                value={formatCurrency(totalExpense)}
              />
              <KpiCard
                variant={netAmount < 0 ? "default" : "accent"}
                label="Neto"
                value={formatCurrency(netAmount)}
              />
              <KpiCard
                label="Transakcija"
                value={transactions.length}
                sub="ukupno"
              />
            </KpiGrid>

            <div className="mt-4">
              <DataTable>
                <DataTableHead>
                  <tr>
                    <th className="text-left px-3 py-2">Datum</th>
                    <th className="text-left px-3 py-2">Kategorija</th>
                    <th className="text-left px-3 py-2">Opis</th>
                    <th className="text-right px-3 py-2">Iznos</th>
                  </tr>
                </DataTableHead>
                <tbody>
                  {transactions.map((t, i) => (
                    <tr
                      key={t.id || i}
                      className={`border-t border-[#0F5E4D]/10 ${i % 2 === 1 ? "bg-[#0F5E4D]/[0.02]" : ""}`}
                    >
                      <td className="px-3 py-2 tabular-nums">
                        {formatDate(t.date)}
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {t.category || "—"}
                      </td>
                      <td className="px-3 py-2">{t.description || "—"}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-semibold ${
                          t.type === "income"
                            ? "text-[#0f6a44]"
                            : "text-[#b42318]"
                        }`}
                      >
                        {t.type === "income" ? "+" : "−"}
                        {formatCurrency(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          </>
        )}

        {documents.length > 0 && (
          <>
            <SectionTitle>Pravna dokumentacija</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {documents.map((doc, i) => (
                <div
                  key={doc.id || i}
                  className="flex items-center justify-between bg-white border border-[#0F5E4D]/15 rounded-md px-4 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{doc.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {doc.type || "—"}
                    </div>
                  </div>
                  <StatusPill
                    tone={doc.status === "approved" ? "positive" : "neutral"}
                  >
                    {doc.status || "—"}
                  </StatusPill>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="pt-4 mt-6 border-t border-[#0F5E4D]/10 flex justify-between text-[10px] text-muted-foreground">
          <span>Riforma — Sustav za upravljanje nekretninama</span>
          <span>Generirano: {new Date().toLocaleString("hr-HR")}</span>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>
    </div>
  );
}
