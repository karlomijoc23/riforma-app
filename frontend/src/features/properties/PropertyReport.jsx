import React, { useEffect, useState, useRef, useCallback } from "react";
import { api } from "../../shared/api";
import {
  formatCurrency,
  formatArea,
  formatPercentage,
  formatPropertyType,
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
import { useNavigate } from "react-router-dom";
import { toast } from "../../components/ui/sonner";

const TYPE_DOT = {
  poslovna_zgrada: "#3b82f6",
  stan: "#a855f7",
  zemljiste: "#10b981",
  ostalo: "#6b7280",
};

const PropertyReport = () => {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reportRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [propertiesRes, contractsRes, unitsRes] = await Promise.all([
          api.getNekretnine(),
          api.getUgovori(),
          api.getUnits(),
        ]);
        const allContracts = contractsRes.data || [];
        const allUnits = unitsRes.data || [];

        const unitsByProperty = new Map();
        allUnits.forEach((u) => {
          const pid = String(u.nekretnina_id);
          if (!unitsByProperty.has(pid)) unitsByProperty.set(pid, []);
          unitsByProperty.get(pid).push(u);
        });

        const activeContracts = allContracts.filter(
          (c) => c.status === "aktivno" || c.status === "na_isteku",
        );
        const contractsByProperty = new Map();
        activeContracts.forEach((c) => {
          const pid = String(c.nekretnina_id);
          if (!contractsByProperty.has(pid)) contractsByProperty.set(pid, []);
          contractsByProperty.get(pid).push(c);
        });

        const enrichedProperties = (propertiesRes.data || [])
          .map((p) => {
            const pid = String(p.id);
            const propUnits = unitsByProperty.get(pid) || [];
            const propContracts = contractsByProperty.get(pid) || [];
            const monthlyIncome = propContracts.reduce(
              (sum, c) => sum + (parseFloat(c.osnovna_zakupnina) || 0),
              0,
            );
            const totalUnits = propUnits.length;
            const occupiedUnits = propUnits.filter(
              (u) => u.status === "iznajmljeno",
            ).length;
            // Nekretnina bez jedinica — popunjenost = ima li aktivan ugovor
            const occupancyPercent =
              totalUnits > 0
                ? Math.round((occupiedUnits / totalUnits) * 100)
                : propContracts.length > 0
                  ? 100
                  : 0;
            return {
              ...p,
              monthlyIncome,
              occupancyPercent,
              occupiedUnits,
              totalUnits,
              activeContractCount: propContracts.length,
              trzisna_vrijednost_num: parseFloat(p.trzisna_vrijednost) || 0,
              povrsina_num: parseFloat(p.povrsina) || 0,
            };
          })
          .sort((a, b) => {
            const valueDiff =
              b.trzisna_vrijednost_num - a.trzisna_vrijednost_num;
            if (valueDiff !== 0) return valueDiff;
            return b.monthlyIncome - a.monthlyIncome;
          });

        setProperties(enrichedProperties);
      } catch (err) {
        console.error("Failed to fetch property report data", err);
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
      pdf.save(`Izvjestaj_Portfelj_Nekretnina_${pdfDateStamp()}.pdf`);
      toast.success("PDF uspješno generiran");
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error("Greška pri generiranju PDF-a");
    }
  }, []);

  // --- Computed metrics ---
  const totalProperties = properties.length;
  const totalArea = properties.reduce((sum, p) => sum + p.povrsina_num, 0);
  const avgOccupancy =
    totalProperties > 0
      ? properties.reduce((sum, p) => sum + p.occupancyPercent, 0) /
        totalProperties
      : 0;
  const totalValue = properties.reduce(
    (sum, p) => sum + p.trzisna_vrijednost_num,
    0,
  );
  const totalMonthlyIncome = properties.reduce(
    (sum, p) => sum + p.monthlyIncome,
    0,
  );
  const totalAnnualIncome = totalMonthlyIncome * 12;
  const avgYield = totalValue > 0 ? (totalAnnualIncome / totalValue) * 100 : 0;
  const totalActiveContracts = properties.reduce(
    (sum, p) => sum + p.activeContractCount,
    0,
  );
  const totalUnitsAll = properties.reduce((sum, p) => sum + p.totalUnits, 0);
  const totalOccupiedAll = properties.reduce(
    (sum, p) => sum + p.occupiedUnits,
    0,
  );

  // By type
  const typeSummary = {};
  properties.forEach((p) => {
    const t = p.vrsta || "ostalo";
    if (!typeSummary[t]) typeSummary[t] = { count: 0, value: 0, income: 0 };
    typeSummary[t].count++;
    typeSummary[t].value += p.trzisna_vrijednost_num;
    typeSummary[t].income += p.monthlyIncome;
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
        <Button variant="outline" onClick={() => navigate("/nekretnine")}>
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
            onClick={() => navigate("/nekretnine")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Natrag
          </Button>
          <h1 className="text-lg font-semibold">Izvještaj portfelja</h1>
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
                Izvještaj portfelja nekretnina
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
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Nekretnina", value: totalProperties },
              { label: "Ukupna površina", value: formatArea(totalArea) },
              { label: "Ukupna vrijednost", value: formatCurrency(totalValue) },
              { label: "Aktivnih ugovora", value: totalActiveContracts },
            ].map((kpi, i) => (
              <div key={i} className="border border-slate-200 rounded p-3">
                <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">
                  {kpi.label}
                </p>
                <p className="text-lg font-bold mt-0.5">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Financial highlights */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            <div className="bg-emerald-50 border border-emerald-100 rounded p-3">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">
                Mjesečni prihod
              </p>
              <p className="text-lg font-bold text-emerald-700 mt-0.5">
                {formatCurrency(totalMonthlyIncome)}
              </p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded p-3">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">
                Godišnji prihod
              </p>
              <p className="text-lg font-bold text-emerald-700 mt-0.5">
                {formatCurrency(totalAnnualIncome)}
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded p-3">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">
                Prosječni prinos
              </p>
              <p className="text-lg font-bold text-blue-700 mt-0.5">
                {formatPercentage(avgYield)}
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded p-3">
              <p className="text-[10px] text-slate-500 uppercase font-semibold">
                Zakupljenost
              </p>
              <p className="text-lg font-bold text-blue-700 mt-0.5">
                {formatPercentage(avgOccupancy)}
                <span className="text-xs font-normal text-slate-500 ml-1">
                  ({totalOccupiedAll}/{totalUnitsAll})
                </span>
              </p>
            </div>
          </div>

          {/* Portfolio by type */}
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
            Portfelj po vrsti nekretnine
          </h3>
          <div className="grid grid-cols-4 gap-3 mb-8">
            {Object.entries(typeSummary).map(([type, data]) => (
              <div key={type} className="border border-slate-200 rounded p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: TYPE_DOT[type] || "#6b7280" }}
                  />
                  <span className="text-xs font-semibold">
                    {formatPropertyType(type)}
                  </span>
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Broj</span>
                    <span className="font-semibold">{data.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Vrijednost</span>
                    <span className="font-semibold">
                      {formatCurrency(data.value)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Mj. prihod</span>
                    <span className="font-semibold text-emerald-700">
                      {formatCurrency(data.income)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Per-property cards */}
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
            Pregled po nekretnini
          </h3>
          <div className="space-y-2 mb-8">
            {properties.map((p) => (
              <div
                key={p.id}
                className="border border-slate-200 rounded p-3 flex items-center gap-4"
                style={{ pageBreakInside: "avoid" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: TYPE_DOT[p.vrsta] || "#6b7280",
                      }}
                    />
                    <span className="font-semibold text-[12px] truncate">
                      {p.naziv}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate pl-4">
                    {p.adresa || "—"}
                  </p>
                </div>
                <div className="grid grid-cols-5 gap-4 text-[11px] shrink-0">
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400 uppercase">
                      Površina
                    </p>
                    <p className="font-semibold">{formatArea(p.povrsina)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400 uppercase">
                      Vrijednost
                    </p>
                    <p className="font-semibold">
                      {formatCurrency(p.trzisna_vrijednost)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400 uppercase">
                      Mj. prihod
                    </p>
                    <p className="font-semibold text-emerald-700">
                      {formatCurrency(p.monthlyIncome)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400 uppercase">
                      Zakupljenost
                    </p>
                    <p
                      className={`font-semibold ${p.occupancyPercent >= 80 ? "text-emerald-700" : p.occupancyPercent >= 50 ? "text-amber-700" : "text-red-600"}`}
                    >
                      {p.occupancyPercent}%{" "}
                      <span className="text-slate-400 font-normal">
                        ({p.occupiedUnits}/{p.totalUnits})
                      </span>
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-slate-400 uppercase">
                      Ugovori
                    </p>
                    <p className="font-semibold">{p.activeContractCount}</p>
                  </div>
                </div>
              </div>
            ))}
            {properties.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">
                Nema nekretnina u portfelju.
              </p>
            )}
          </div>

          {/* Summary table */}
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 border-b border-slate-200 pb-1">
            Detaljna tablica portfelja
          </h3>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="text-left py-2 px-2 font-semibold">
                  Nekretnina
                </th>
                <th className="text-left py-2 px-2 font-semibold">Adresa</th>
                <th className="text-center py-2 px-2 font-semibold">Vrsta</th>
                <th className="text-right py-2 px-2 font-semibold">Površina</th>
                <th className="text-right py-2 px-2 font-semibold">
                  Vrijednost
                </th>
                <th className="text-right py-2 px-2 font-semibold">
                  Mj. prihod
                </th>
                <th className="text-center py-2 px-2 font-semibold">
                  Zakupljenost
                </th>
                <th className="text-center py-2 px-2 font-semibold">Ugovori</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                  style={{ pageBreakInside: "avoid" }}
                >
                  <td className="py-1.5 px-2 font-medium">{p.naziv}</td>
                  <td className="py-1.5 px-2 text-slate-600">
                    {p.adresa || "—"}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: TYPE_DOT[p.vrsta] || "#6b7280",
                        }}
                      />
                      <span className="text-[10px]">
                        {formatPropertyType(p.vrsta)}
                      </span>
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    {formatArea(p.povrsina)}
                  </td>
                  <td className="py-1.5 px-2 text-right font-medium">
                    {formatCurrency(p.trzisna_vrijednost)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-emerald-700 font-medium">
                    {formatCurrency(p.monthlyIncome)}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <span
                      className={
                        p.occupancyPercent >= 80
                          ? "text-emerald-700 font-medium"
                          : p.occupancyPercent >= 50
                            ? "text-amber-700 font-medium"
                            : "text-red-600 font-medium"
                      }
                    >
                      {p.occupancyPercent}%
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {p.activeContractCount}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-800 text-white font-semibold">
                <td className="py-2 px-2">UKUPNO</td>
                <td className="py-2 px-2" />
                <td className="py-2 px-2 text-center text-[10px]">
                  {totalProperties} nekr.
                </td>
                <td className="py-2 px-2 text-right">
                  {formatArea(totalArea)}
                </td>
                <td className="py-2 px-2 text-right">
                  {formatCurrency(totalValue)}
                </td>
                <td className="py-2 px-2 text-right">
                  {formatCurrency(totalMonthlyIncome)}
                </td>
                <td className="py-2 px-2 text-center">
                  {formatPercentage(avgOccupancy)}
                </td>
                <td className="py-2 px-2 text-center">
                  {totalActiveContracts}
                </td>
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

export default PropertyReport;
