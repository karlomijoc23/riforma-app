import React, { useState, useRef, useCallback } from "react";
import { api } from "../../shared/api";
import { formatCurrency, pdfDateStamp } from "../../shared/formatters";
import {
  Loader2,
  Download,
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Wrench,
  FileText,
  Lightbulb,
  Cpu,
  BarChart3,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { toast } from "../../components/ui/sonner";

const MONTH_NAMES = [
  "Siječanj",
  "Veljača",
  "Ožujak",
  "Travanj",
  "Svibanj",
  "Lipanj",
  "Srpanj",
  "Kolovoz",
  "Rujan",
  "Listopad",
  "Studeni",
  "Prosinac",
];

const PRIORITY_STYLES = {
  visoko: "bg-red-100 text-red-800 border-red-200",
  srednje: "bg-amber-100 text-amber-800 border-amber-200",
  nisko: "bg-green-100 text-green-800 border-green-200",
};

const PRIORITY_LABELS = {
  visoko: "Visoko",
  srednje: "Srednje",
  nisko: "Nisko",
};

const MjesecniIzvjestajPage = () => {
  const now = new Date();
  const [mjesec, setMjesec] = useState(String(now.getMonth() + 1));
  const [godina, setGodina] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const reportRef = useRef(null);

  const handleGenerate = async () => {
    setLoading(true);
    setReport(null);
    setMetadata(null);
    try {
      const res = await api.generateMonthlyReport({
        mjesec: parseInt(mjesec, 10),
        godina: parseInt(godina, 10),
      });
      const payload = res.data;
      if (payload.success && payload.data) {
        setReport(payload.data);
        setMetadata(payload.metadata || null);
        toast.success("Izvještaj uspješno generiran");
      } else {
        toast.error("Neuspješno generiranje izvještaja");
      }
    } catch (err) {
      console.error("Monthly report generation failed", err);
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.detail ||
        "Greška pri generiranju izvještaja";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = useCallback(async () => {
    const element = reportRef.current;
    if (!element) return;
    try {
      toast.info("Generiranje PDF-a...");
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

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
      pdf.save(`mjesecni-izvjestaj-${mjesec}-${godina}-${pdfDateStamp()}.pdf`);
      toast.success("PDF uspješno generiran");
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error("Greška pri generiranju PDF-a");
    }
  }, [mjesec, godina]);

  const fin = report?.financijski_pregled;
  const occ = report?.popunjenost;
  const maint = report?.odrzavanje;

  const reportDate = new Date().toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-6 py-3 no-print">
        <div className="flex items-center justify-between max-w-[1100px] mx-auto">
          <h1 className="text-lg font-semibold">AI Mjesečni Izvještaj</h1>
          <div className="flex items-center gap-3">
            <Select value={mjesec} onValueChange={setMjesec}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Mjesec" />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={godina} onValueChange={setGodina}>
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Godina" />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {loading ? "Generiranje..." : "Generiraj izvještaj"}
            </Button>
            {report && (
              <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                <Download className="mr-1 h-4 w-4" /> PDF
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {!report && !loading && (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <BarChart3 className="h-16 w-16 text-slate-300 mb-4" />
          <h2 className="text-xl font-semibold text-slate-600 mb-2">
            Generirajte mjesečni izvještaj
          </h2>
          <p className="text-sm text-slate-400 max-w-md">
            Odaberite mjesec i godinu, zatim kliknite "Generiraj izvještaj" za
            AI analizu vašeg portfelja nekretnina.
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-32">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-sm text-slate-500">
            AI analizira podatke portfelja...
          </p>
        </div>
      )}

      {/* Report content */}
      {report && !loading && (
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
                  Mjesečni izvještaj portfelja
                </h1>
                <p className="text-sm text-slate-300 mt-1">
                  {MONTH_NAMES[parseInt(mjesec, 10) - 1]} {godina}.
                </p>
              </div>
              <div className="text-right text-sm text-slate-300">
                <p>Datum izvještaja</p>
                <p className="text-white font-semibold">{reportDate}</p>
                {metadata?.source && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Izvor: {metadata.source === "anthropic" ? "AI" : "Podaci"}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="px-10 py-8 space-y-8">
            {/* Sažetak */}
            {report.sazetak && (
              <div className="border-l-4 border-blue-500 bg-blue-50 rounded-r-lg p-5">
                <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Sažetak
                </h3>
                <p className="text-sm text-blue-900 leading-relaxed">
                  {report.sazetak}
                </p>
              </div>
            )}

            {/* KPI Cards */}
            {fin && (
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-[10px] text-emerald-600 uppercase font-semibold tracking-wide">
                    Mjesečni prihod
                  </p>
                  <p className="text-2xl font-bold text-emerald-800 mt-1">
                    {formatCurrency(fin.mjesecni_prihod)}
                  </p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-[10px] text-emerald-600 uppercase font-semibold tracking-wide">
                    Godišnji prihod
                  </p>
                  <p className="text-2xl font-bold text-emerald-800 mt-1">
                    {formatCurrency(fin.godisnji_prihod)}
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-[10px] text-blue-600 uppercase font-semibold tracking-wide">
                    Popunjenost
                  </p>
                  <p className="text-2xl font-bold text-blue-800 mt-1">
                    {occ ? `${occ.postotak}%` : "—"}
                  </p>
                  {occ && (
                    <p className="text-[10px] text-blue-600 mt-0.5">
                      {occ.iznajmljeno} / {occ.ukupno} jedinica
                    </p>
                  )}
                </div>
                <div className="bg-slate-800 rounded-lg p-4 text-white">
                  <p className="text-[10px] text-slate-300 uppercase font-semibold tracking-wide">
                    Neto prihod
                  </p>
                  <p className="text-2xl font-bold mt-1">
                    {formatCurrency(fin.neto_prihod)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Troškovi: {formatCurrency(fin.ukupni_troskovi)}
                  </p>
                </div>
              </div>
            )}

            {/* Financijski pregled */}
            {fin && (
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
                  Financijski pregled
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Ukupni prihod</span>
                      <span className="font-semibold text-emerald-700">
                        {formatCurrency(fin.mjesecni_prihod)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Ukupni troškovi</span>
                      <span className="font-semibold text-red-600">
                        {formatCurrency(fin.ukupni_troskovi)}
                      </span>
                    </div>
                    <div className="border-t border-slate-200 pt-2 flex justify-between text-sm">
                      <span className="text-slate-800 font-semibold">
                        Neto prihod
                      </span>
                      <span className="font-bold text-slate-800">
                        {formatCurrency(fin.neto_prihod)}
                      </span>
                    </div>
                    {fin.neplaceni_racuni > 0 && (
                      <div className="flex justify-between text-sm bg-amber-50 rounded p-2 border border-amber-100">
                        <span className="text-amber-700 flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Neplaćeni računi
                        </span>
                        <span className="font-semibold text-amber-700">
                          {formatCurrency(fin.neplaceni_racuni)}
                        </span>
                      </div>
                    )}
                  </div>
                  {fin.komentar && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">
                        AI komentar
                      </p>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {fin.komentar}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Popunjenost */}
            {occ && (
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
                  Popunjenost
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-700">
                          {occ.postotak}%
                        </span>
                        <span className="text-xs text-slate-500">
                          {occ.iznajmljeno} / {occ.ukupno} jedinica
                        </span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            occ.postotak >= 80
                              ? "bg-emerald-500"
                              : occ.postotak >= 50
                                ? "bg-amber-500"
                                : "bg-red-500"
                          }`}
                          style={{ width: `${Math.min(occ.postotak, 100)}%` }}
                        />
                      </div>
                    </div>
                    {occ.trend && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500">Trend:</span>
                        <span
                          className={`flex items-center gap-1 font-medium ${
                            occ.trend.toLowerCase().includes("rast") ||
                            occ.trend.toLowerCase().includes("pozitiv")
                              ? "text-emerald-600"
                              : occ.trend.toLowerCase().includes("pad") ||
                                  occ.trend.toLowerCase().includes("negativ")
                                ? "text-red-600"
                                : "text-slate-600"
                          }`}
                        >
                          {occ.trend.toLowerCase().includes("rast") ||
                          occ.trend.toLowerCase().includes("pozitiv") ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : occ.trend.toLowerCase().includes("pad") ||
                            occ.trend.toLowerCase().includes("negativ") ? (
                            <TrendingDown className="h-4 w-4" />
                          ) : null}
                          {occ.trend}
                        </span>
                      </div>
                    )}
                  </div>
                  {occ.komentar && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">
                        AI komentar
                      </p>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {occ.komentar}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Održavanje */}
            {maint && (
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" />
                  Održavanje
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="border border-slate-200 rounded-lg p-4">
                    <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">
                      Otvoreni nalozi
                    </p>
                    <p className="text-2xl font-bold text-slate-800 mt-1">
                      {maint.otvoreni_nalozi}
                    </p>
                  </div>
                  <div
                    className={`border rounded-lg p-4 ${
                      maint.kriticni_nalozi > 0
                        ? "border-red-200 bg-red-50"
                        : "border-slate-200"
                    }`}
                  >
                    <p
                      className={`text-[10px] uppercase font-semibold tracking-wide ${
                        maint.kriticni_nalozi > 0
                          ? "text-red-600"
                          : "text-slate-500"
                      }`}
                    >
                      Kritični nalozi
                    </p>
                    <p
                      className={`text-2xl font-bold mt-1 ${
                        maint.kriticni_nalozi > 0
                          ? "text-red-700"
                          : "text-slate-800"
                      }`}
                    >
                      {maint.kriticni_nalozi}
                    </p>
                  </div>
                  {maint.preporuka && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">
                        AI preporuka
                      </p>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {maint.preporuka}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Ugovorni rizici */}
            {report.ugovorni_rizici && report.ugovorni_rizici.length > 0 && (
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Ugovorni rizici
                </h3>
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="text-left py-2.5 px-3 font-semibold">
                        Tip
                      </th>
                      <th className="text-left py-2.5 px-3 font-semibold">
                        Opis
                      </th>
                      <th className="text-center py-2.5 px-3 font-semibold">
                        Prioritet
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.ugovorni_rizici.map((rizik, i) => (
                      <tr
                        key={i}
                        className={`border-b border-slate-100 ${
                          i % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                        }`}
                      >
                        <td className="py-2 px-3 font-medium text-slate-700">
                          {rizik.tip}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {rizik.opis}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <Badge
                            variant="outline"
                            className={PRIORITY_STYLES[rizik.prioritet] || ""}
                          >
                            {PRIORITY_LABELS[rizik.prioritet] ||
                              rizik.prioritet}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Preporuke */}
            {report.preporuke && report.preporuke.length > 0 && (
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Preporuke
                </h3>
                <ol className="space-y-2">
                  {report.preporuke.map((preporuka, i) => (
                    <li
                      key={i}
                      className="flex gap-3 items-start text-sm bg-slate-50 border border-slate-200 rounded-lg p-3"
                    >
                      <span className="flex-shrink-0 w-6 h-6 bg-slate-800 text-white rounded-full flex items-center justify-center text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="text-slate-700 leading-relaxed">
                        {preporuka}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Tehnološki prijedlozi */}
            {report.tech_prijedlozi && report.tech_prijedlozi.length > 0 && (
              <div>
                <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5" />
                  Tehnološki prijedlozi
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {report.tech_prijedlozi.map((prijedlog, i) => (
                    <div
                      key={i}
                      className="border border-slate-200 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-800">
                          {prijedlog.naziv}
                        </span>
                        <Badge
                          variant="outline"
                          className={PRIORITY_STYLES[prijedlog.prioritet] || ""}
                        >
                          {PRIORITY_LABELS[prijedlog.prioritet] ||
                            prijedlog.prioritet}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {prijedlog.opis}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="pt-4 border-t border-slate-200 flex justify-between text-[10px] text-slate-400">
              <span>Riforma — Sustav za upravljanje nekretninama</span>
              <span>Generirano: {new Date().toLocaleString("hr-HR")}</span>
            </div>
          </div>
        </div>
      )}

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

export default MjesecniIzvjestajPage;
