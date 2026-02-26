import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../shared/api";
import {
  formatCurrency,
  formatArea,
  formatPercentage,
  formatDeltaPercentage,
  pdfDateStamp,
} from "../../shared/formatters";
import {
  Loader2,
  Download,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Building,
  DollarSign,
  Target,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { toast } from "../../components/ui/sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Cell,
} from "recharts";

const COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

const STATUS_COLORS = {
  ok: "bg-emerald-100 text-emerald-800 border-emerald-200",
  high: "bg-red-100 text-red-800 border-red-200",
  low: "bg-amber-100 text-amber-800 border-amber-200",
};

const STATUS_DOT = {
  ok: "bg-emerald-500",
  high: "bg-red-500",
  low: "bg-amber-500",
};

// ── Benchmark Tab ──────────────────────────────────────────────────────
const BenchmarkTab = ({ benchmarks }) => {
  const [expanded, setExpanded] = useState({});

  const chartData = benchmarks.map((b) => ({
    name:
      b.nekretnina_naziv.length > 18
        ? b.nekretnina_naziv.slice(0, 16) + "..."
        : b.nekretnina_naziv,
    fullName: b.nekretnina_naziv,
    avg: b.property_avg_m2,
  }));

  const toggleExpand = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-6">
      {/* Bar chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prosječna cijena po m² — po nekretnini
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={chartData.length > 6 ? -25 : 0}
                    textAnchor={chartData.length > 6 ? "end" : "middle"}
                    height={chartData.length > 6 ? 60 : 30}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v} €`}
                  />
                  <RechartsTooltip
                    formatter={(value) => [
                      `${value.toFixed(2)} €/m²`,
                      "Prosjek",
                    ]}
                    labelFormatter={(_, payload) =>
                      payload?.[0]?.payload?.fullName || ""
                    }
                  />
                  <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expandable rows */}
      <div className="space-y-2">
        {benchmarks.map((b) => (
          <Card key={b.nekretnina_id}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              onClick={() => toggleExpand(b.nekretnina_id)}
            >
              <div className="flex items-center gap-3">
                <Building className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{b.nekretnina_naziv}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.vrsta} — Prosjek: {b.property_avg_m2.toFixed(2)} €/m²
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-primary">
                  {b.property_avg_m2.toFixed(2)} €/m²
                </span>
                {expanded[b.nekretnina_id] ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            </button>
            {expanded[b.nekretnina_id] && (
              <div className="border-t px-4 pb-3">
                {b.groups.map((g) => (
                  <div key={g.key} className="mt-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-muted-foreground uppercase">
                        {g.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({g.count} ugovora)
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-2">
                      <div className="text-xs">
                        <span className="text-muted-foreground">Min:</span>{" "}
                        <span className="font-medium">
                          {g.min_cijena_m2.toFixed(2)} €
                        </span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Prosjek:</span>{" "}
                        <span className="font-medium">
                          {g.avg_cijena_m2.toFixed(2)} €
                        </span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Max:</span>{" "}
                        <span className="font-medium">
                          {g.max_cijena_m2.toFixed(2)} €
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {g.contracts.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/30"
                        >
                          <span className="text-muted-foreground">
                            {c.interna_oznaka} — {c.zakupnik_naziv}
                          </span>
                          <span className="font-medium">
                            {c.cijena_m2.toFixed(2)} €/m²
                            {c.povrsina_m2 > 0 && (
                              <span className="text-muted-foreground ml-1">
                                ({formatArea(c.povrsina_m2)})
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
        {benchmarks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nema podataka za benchmarking.
          </p>
        )}
      </div>
    </div>
  );
};

// ── Heat Map Tab ───────────────────────────────────────────────────────
const HeatMapTab = ({ heatMap }) => {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-emerald-500" /> OK
            (unutar 20%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-red-500" />{" "}
            Previsoko (&gt;+20%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-amber-500" />{" "}
            Prenisko (&lt;-20%)
          </span>
        </div>

        {heatMap.map((prop) => (
          <Card key={prop.nekretnina_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building className="h-4 w-4 text-muted-foreground" />
                {prop.nekretnina_naziv}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {prop.units.map((u, i) => (
                  <Tooltip key={u.unit_id || i}>
                    <TooltipTrigger asChild>
                      <div
                        className={`flex flex-col items-center justify-center rounded-md border px-3 py-2 min-w-[80px] cursor-default transition-colors ${STATUS_COLORS[u.status]}`}
                      >
                        <span className="text-xs font-semibold">
                          {u.oznaka}
                        </span>
                        <span className="text-[10px] mt-0.5">
                          {u.cijena_m2.toFixed(1)} €/m²
                        </span>
                        <span className="text-[10px]">
                          {formatDeltaPercentage(u.deviation_pct)}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="bg-slate-900 text-white p-3 max-w-xs"
                    >
                      <div className="space-y-1 text-xs">
                        <p className="font-semibold">{u.oznaka}</p>
                        {u.kat != null && <p>Kat: {u.kat}</p>}
                        <p>Cijena: {u.cijena_m2.toFixed(2)} €/m²</p>
                        <p>Prosjek grupe: {u.group_avg.toFixed(2)} €/m²</p>
                        <p>
                          Odstupanje: {formatDeltaPercentage(u.deviation_pct)}
                        </p>
                        <p>Zakupnik: {u.zakupnik_naziv}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {heatMap.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nema podataka za heat mapu.
          </p>
        )}
      </div>
    </TooltipProvider>
  );
};

// ── Free Units Tab ─────────────────────────────────────────────────────
const FreeUnitsTab = ({ freeUnits }) => {
  return (
    <div className="space-y-4">
      {freeUnits.length === 0 ? (
        <div className="text-center py-12">
          <Target className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Sve jedinice su trenutno zauzete.
          </p>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">
                    Nekretnina
                  </th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">
                    Oznaka
                  </th>
                  <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">
                    Kat
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">
                    Površina
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">
                    Cijena/m²
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">
                    Ukupno
                  </th>
                </tr>
              </thead>
              <tbody>
                {freeUnits.map((u) => (
                  <tr key={u.unit_id} className="border-b last:border-b-0">
                    <td className="py-2.5 px-3">
                      <span className="font-medium">{u.nekretnina_naziv}</span>
                    </td>
                    <td className="py-2.5 px-3">{u.oznaka}</td>
                    <td className="py-2.5 px-3 text-center">
                      {u.kat != null ? u.kat : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {formatArea(u.povrsina_m2)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div>
                        <span className="font-semibold text-primary">
                          {u.suggested_price_m2.toFixed(2)} €
                        </span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {u.basis}
                        </p>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">
                      {formatCurrency(u.suggested_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

// ── Executive Report Tab (PDF) ─────────────────────────────────────────
const ExecutiveReportTab = ({ data }) => {
  const reportRef = useRef(null);
  const { benchmarks, heat_map, free_units, portfolio_summary } = data;

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
      const pageWidth = 297;
      const pageHeight = 210;
      const margin = 8;
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
        let yOffset = 0;
        let page = 0;
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
      pdf.save(`Analiza_Cijena_Portfelja_${pdfDateStamp()}.pdf`);
      toast.success("PDF uspješno generiran");
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error("Greška pri generiranju PDF-a");
    }
  }, []);

  const reportDate = new Date().toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const s = portfolio_summary;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleDownloadPdf}>
          <Download className="mr-1.5 h-4 w-4" /> Generiraj PDF
        </Button>
      </div>

      {/* Report preview */}
      <div
        ref={reportRef}
        className="max-w-[1100px] mx-auto bg-white border rounded-lg overflow-hidden"
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
                Analiza cijena portfelja
              </h1>
            </div>
            <div className="text-right text-sm text-slate-300">
              <p>Datum izvještaja</p>
              <p className="text-white font-semibold">{reportDate}</p>
            </div>
          </div>
        </div>

        <div className="px-10 py-8">
          {/* KPI summary cards */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Ukupno jedinica", value: s.total_units },
              { label: "Zauzeto", value: s.occupied_units },
              { label: "Slobodno", value: s.free_units },
              {
                label: "Prosj. cijena/m²",
                value: `${s.avg_cijena_m2.toFixed(2)} €`,
              },
            ].map((kpi, i) => (
              <div key={i} className="border border-slate-200 rounded p-3">
                <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">
                  {kpi.label}
                </p>
                <p className="text-lg font-bold mt-0.5">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Financial */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="bg-emerald-50 border border-emerald-100 rounded p-3">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">
                Mjesečni prihod
              </p>
              <p className="text-lg font-bold text-emerald-700 mt-0.5">
                {formatCurrency(s.total_monthly_income)}
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded p-3">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">
                Potencijalni prihod (slobodne)
              </p>
              <p className="text-lg font-bold text-blue-700 mt-0.5">
                {formatCurrency(s.potential_monthly_income)}
              </p>
            </div>
            <div
              className={`border rounded p-3 ${s.outlier_count > 0 ? "bg-red-50 border-red-100" : "bg-slate-50 border-slate-100"}`}
            >
              <p className="text-[10px] text-slate-500 uppercase font-semibold">
                Cjenovni outlieri
              </p>
              <p
                className={`text-lg font-bold mt-0.5 ${s.outlier_count > 0 ? "text-red-700" : "text-slate-700"}`}
              >
                {s.outlier_count}
              </p>
            </div>
          </div>

          {/* Benchmark summary */}
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
            Benchmark cijena po nekretnini
          </h3>
          <table className="w-full border-collapse text-[11px] mb-8">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="text-left py-2 px-2 font-semibold">
                  Nekretnina
                </th>
                <th className="text-center py-2 px-2 font-semibold">
                  Broj ugovora
                </th>
                <th className="text-right py-2 px-2 font-semibold">
                  Prosj. €/m²
                </th>
                <th className="text-right py-2 px-2 font-semibold">Min €/m²</th>
                <th className="text-right py-2 px-2 font-semibold">Max €/m²</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.map((b, i) => {
                const allPrices = b.groups.flatMap((g) =>
                  g.contracts.map((c) => c.cijena_m2),
                );
                const minP = allPrices.length > 0 ? Math.min(...allPrices) : 0;
                const maxP = allPrices.length > 0 ? Math.max(...allPrices) : 0;
                const totalCount = b.groups.reduce((s, g) => s + g.count, 0);
                return (
                  <tr
                    key={b.nekretnina_id}
                    className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                  >
                    <td className="py-1.5 px-2 font-medium">
                      {b.nekretnina_naziv}
                    </td>
                    <td className="py-1.5 px-2 text-center">{totalCount}</td>
                    <td className="py-1.5 px-2 text-right font-medium">
                      {b.property_avg_m2.toFixed(2)} €
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      {minP.toFixed(2)} €
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      {maxP.toFixed(2)} €
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Heat map outliers */}
          {(() => {
            const outliers = heat_map.flatMap((p) =>
              p.units
                .filter((u) => u.status !== "ok")
                .map((u) => ({ ...u, nekretnina_naziv: p.nekretnina_naziv })),
            );
            if (outliers.length === 0) return null;
            return (
              <>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
                  Cjenovni outlieri
                </h3>
                <table className="w-full border-collapse text-[11px] mb-8">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="text-left py-2 px-2 font-semibold">
                        Nekretnina
                      </th>
                      <th className="text-left py-2 px-2 font-semibold">
                        Jedinica
                      </th>
                      <th className="text-right py-2 px-2 font-semibold">
                        Cijena/m²
                      </th>
                      <th className="text-right py-2 px-2 font-semibold">
                        Prosjek grupe
                      </th>
                      <th className="text-right py-2 px-2 font-semibold">
                        Odstupanje
                      </th>
                      <th className="text-left py-2 px-2 font-semibold">
                        Zakupnik
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {outliers.map((o, i) => (
                      <tr
                        key={`${o.unit_id}-${i}`}
                        className={`border-b border-slate-100 ${o.status === "high" ? "bg-red-50" : "bg-amber-50"}`}
                      >
                        <td className="py-1.5 px-2">{o.nekretnina_naziv}</td>
                        <td className="py-1.5 px-2 font-medium">{o.oznaka}</td>
                        <td className="py-1.5 px-2 text-right font-medium">
                          {o.cijena_m2.toFixed(2)} €
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {o.group_avg.toFixed(2)} €
                        </td>
                        <td
                          className={`py-1.5 px-2 text-right font-semibold ${o.status === "high" ? "text-red-700" : "text-amber-700"}`}
                        >
                          {formatDeltaPercentage(o.deviation_pct)}
                        </td>
                        <td className="py-1.5 px-2">{o.zakupnik_naziv}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            );
          })()}

          {/* Free units table */}
          {free_units.length > 0 && (
            <>
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
                Slobodne jedinice — prijedlog cijena
              </h3>
              <table className="w-full border-collapse text-[11px] mb-8">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="text-left py-2 px-2 font-semibold">
                      Nekretnina
                    </th>
                    <th className="text-left py-2 px-2 font-semibold">
                      Oznaka
                    </th>
                    <th className="text-center py-2 px-2 font-semibold">Kat</th>
                    <th className="text-right py-2 px-2 font-semibold">
                      Površina
                    </th>
                    <th className="text-right py-2 px-2 font-semibold">
                      Predl. €/m²
                    </th>
                    <th className="text-right py-2 px-2 font-semibold">
                      Predl. ukupno
                    </th>
                    <th className="text-left py-2 px-2 font-semibold">
                      Temelj prijedloga
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {free_units.map((u, i) => (
                    <tr
                      key={u.unit_id}
                      className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                    >
                      <td className="py-1.5 px-2">{u.nekretnina_naziv}</td>
                      <td className="py-1.5 px-2 font-medium">{u.oznaka}</td>
                      <td className="py-1.5 px-2 text-center">
                        {u.kat != null ? u.kat : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {formatArea(u.povrsina_m2)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-medium">
                        {u.suggested_price_m2.toFixed(2)} €
                      </td>
                      <td className="py-1.5 px-2 text-right font-semibold text-emerald-700">
                        {formatCurrency(u.suggested_total)}
                      </td>
                      <td className="py-1.5 px-2 text-[10px] text-slate-500">
                        {u.basis}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* Signature line */}
          <div className="mt-12 pt-4 border-t border-slate-200 grid grid-cols-2 gap-16">
            <div>
              <div className="border-b border-slate-400 mb-1 h-8" />
              <p className="text-[10px] text-slate-500">
                Potpis odgovorne osobe
              </p>
            </div>
            <div>
              <div className="border-b border-slate-400 mb-1 h-8" />
              <p className="text-[10px] text-slate-500">Datum</p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-3 border-t border-slate-200 flex justify-between text-[10px] text-slate-400">
            <span>Riforma — Sustav za upravljanje nekretninama</span>
            <span>Generirano: {new Date().toLocaleString("hr-HR")}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────
const PricingPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await api.getPricingAnalytics();
        setData(res.data);
      } catch (err) {
        console.error("Failed to fetch pricing analytics", err);
        setError("Greška pri učitavanju podataka analize cijena.");
        toast.error("Greška pri učitavanju podataka");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  const { benchmarks, heat_map, free_units, portfolio_summary } = data;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Analiza cijena</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Benchmarking, konzistentnost portfelja i prijedlozi cijena
          </p>
        </div>
        {/* Summary pills */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs bg-muted/50 rounded-full px-3 py-1.5">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Prosj:</span>
            <span className="font-semibold">
              {portfolio_summary.avg_cijena_m2.toFixed(2)} €/m²
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs bg-muted/50 rounded-full px-3 py-1.5">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Slobodno:</span>
            <span className="font-semibold">
              {portfolio_summary.free_units}
            </span>
          </div>
          {portfolio_summary.outlier_count > 0 && (
            <div className="flex items-center gap-1.5 text-xs bg-red-50 text-red-700 rounded-full px-3 py-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Outlieri:</span>
              <span className="font-semibold">
                {portfolio_summary.outlier_count}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="benchmark" className="space-y-4">
        <TabsList>
          <TabsTrigger value="benchmark">Benchmark</TabsTrigger>
          <TabsTrigger value="heatmap">Heat mapa</TabsTrigger>
          <TabsTrigger value="free">Slobodne jedinice</TabsTrigger>
          <TabsTrigger value="report">Prijedlog za direktora</TabsTrigger>
        </TabsList>

        <TabsContent value="benchmark">
          <BenchmarkTab benchmarks={benchmarks} />
        </TabsContent>

        <TabsContent value="heatmap">
          <HeatMapTab heatMap={heat_map} />
        </TabsContent>

        <TabsContent value="free">
          <FreeUnitsTab freeUnits={free_units} />
        </TabsContent>

        <TabsContent value="report">
          <ExecutiveReportTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PricingPage;
