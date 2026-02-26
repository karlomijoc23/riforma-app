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
  aktivno: "Aktivno",
  na_isteku: "Na isteku",
  istekao: "Istekao",
  raskinuto: "Raskinuto",
  arhivirano: "Arhivirano",
};

const STATUS_DOT = {
  aktivno: "#16a34a",
  na_isteku: "#d97706",
  istekao: "#dc2626",
  raskinuto: "#6b7280",
  arhivirano: "#94a3b8",
};

const STATUS_ORDER = {
  aktivno: 0,
  na_isteku: 1,
  istekao: 2,
  raskinuto: 3,
  arhivirano: 4,
};

const ContractReport = () => {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const reportRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [contractsRes, tenantsRes, propertiesRes] = await Promise.all([
          api.getUgovori(),
          api.getZakupnici(),
          api.getNekretnine(),
        ]);

        const tenantsMap = new Map(
          tenantsRes.data.map((t) => [String(t.id), t]),
        );
        const propertiesMap = new Map(
          propertiesRes.data.map((p) => [String(p.id), p]),
        );

        const enrichedContracts = contractsRes.data
          .map((c) => {
            const tenant = tenantsMap.get(String(c.zakupnik_id));
            const property = propertiesMap.get(String(c.nekretnina_id));
            let daysLeft = null;
            if (c.datum_zavrsetka) {
              const today = new Date();
              const end = new Date(c.datum_zavrsetka);
              daysLeft = Math.ceil((end - today) / (1000 * 60 * 60 * 24));
            }
            return {
              ...c,
              zakupnik_naziv: tenant
                ? tenant.naziv_firme || tenant.ime_prezime || "—"
                : "—",
              zakupnik_oib: tenant?.oib || "",
              nekretnina_naziv: property ? property.naziv : "—",
              nekretnina_adresa: property?.adresa || "",
              daysLeft,
            };
          })
          .sort((a, b) => {
            const sa = STATUS_ORDER[a.status] ?? 5;
            const sb = STATUS_ORDER[b.status] ?? 5;
            if (sa !== sb) return sa - sb;
            return (a.datum_zavrsetka || "").localeCompare(
              b.datum_zavrsetka || "",
            );
          });

        setContracts(enrichedContracts);
      } catch (err) {
        console.error("Failed to fetch report data", err);
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
      pdf.save(`Izvjestaj_Ugovori_${pdfDateStamp()}.pdf`);
      toast.success("PDF uspješno generiran");
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error("Greška pri generiranju PDF-a");
    }
  }, []);

  /* ─── Computed metrics ─── */
  const activeContracts = contracts.filter((c) => c.status === "aktivno");
  const expiringContracts = contracts.filter(
    (c) =>
      c.status === "na_isteku" ||
      (c.status === "aktivno" && c.daysLeft > 0 && c.daysLeft <= 90),
  );
  const expiredContracts = contracts.filter((c) => c.status === "istekao");
  const terminatedContracts = contracts.filter((c) => c.status === "raskinuto");

  const totalMonthlyRent = activeContracts.reduce(
    (sum, c) => sum + (Number(c.osnovna_zakupnina) || 0),
    0,
  );
  const totalAnnualRent = totalMonthlyRent * 12;
  const totalCamValue = activeContracts.reduce(
    (sum, c) => sum + (Number(c.cam_troskovi) || 0),
    0,
  );
  const indexationCount = activeContracts.filter(
    (c) => c.indeksacija === true,
  ).length;

  // Average contract duration (months)
  const avgDuration = (() => {
    const durations = contracts
      .filter((c) => c.datum_pocetka && c.datum_zavrsetka)
      .map((c) => {
        const start = new Date(c.datum_pocetka);
        const end = new Date(c.datum_zavrsetka);
        return (end - start) / (1000 * 60 * 60 * 24 * 30);
      });
    return durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
  })();

  // Status summary
  const statusSummary = {};
  contracts.forEach((c) => {
    const s = c.status || "nepoznato";
    statusSummary[s] = (statusSummary[s] || 0) + 1;
  });

  // Revenue by property
  const revenueByProp = {};
  activeContracts.forEach((c) => {
    const key = c.nekretnina_naziv || "Nepoznato";
    revenueByProp[key] =
      (revenueByProp[key] || 0) + (Number(c.osnovna_zakupnina) || 0);
  });

  // Contracts by tenant (top 8)
  const contractsByTenant = {};
  activeContracts.forEach((c) => {
    const key = c.zakupnik_naziv || "Nepoznato";
    if (!contractsByTenant[key]) contractsByTenant[key] = { count: 0, rent: 0 };
    contractsByTenant[key].count++;
    contractsByTenant[key].rent += Number(c.osnovna_zakupnina) || 0;
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
        <Button variant="outline" onClick={() => navigate("/ugovori")}>
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
            onClick={() => navigate("/ugovori")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Natrag
          </Button>
          <h1 className="text-lg font-semibold">Izvještaj o ugovorima</h1>
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
                Izvještaj o ugovorima o zakupu
              </h1>
            </div>
            <div className="text-right text-sm text-slate-300">
              <p>Datum izvještaja</p>
              <p className="text-white font-semibold">{reportDate}</p>
            </div>
          </div>
        </div>

        <div className="px-10 py-8 space-y-8">
          {/* ─── KPI CARDS ─── */}
          <div className="grid grid-cols-3 gap-4">
            {/* Primary financial KPI */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-[10px] text-emerald-600 uppercase font-semibold tracking-wide">
                Mjesečni prihod (aktivni)
              </p>
              <p className="text-2xl font-bold text-emerald-800 mt-1">
                {formatCurrency(totalMonthlyRent)}
              </p>
              <p className="text-[10px] text-emerald-600 mt-0.5">
                Godišnje: {formatCurrency(totalAnnualRent)}
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-[10px] text-blue-600 uppercase font-semibold tracking-wide">
                CAM troškovi (mj.)
              </p>
              <p className="text-2xl font-bold text-blue-800 mt-1">
                {formatCurrency(totalCamValue)}
              </p>
              <p className="text-[10px] text-blue-600 mt-0.5">
                Ukupno mj. s CAM:{" "}
                {formatCurrency(totalMonthlyRent + totalCamValue)}
              </p>
            </div>
            <div className="bg-slate-800 rounded-lg p-4 text-white">
              <p className="text-[10px] text-slate-300 uppercase font-semibold tracking-wide">
                Ukupno ugovora
              </p>
              <p className="text-2xl font-bold mt-1">{contracts.length}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {activeContracts.length} aktivnih
              </p>
            </div>
          </div>

          {/* ─── Secondary KPIs ─── */}
          <div className="grid grid-cols-5 gap-3">
            {[
              {
                label: "Aktivnih",
                value: activeContracts.length,
                color: "text-emerald-700",
              },
              {
                label: "Na isteku (90d)",
                value: expiringContracts.length,
                color:
                  expiringContracts.length > 0
                    ? "text-amber-700"
                    : "text-slate-700",
              },
              {
                label: "Isteklih",
                value: expiredContracts.length,
                color:
                  expiredContracts.length > 0
                    ? "text-red-700"
                    : "text-slate-700",
              },
              {
                label: "Raskinutih",
                value: terminatedContracts.length,
                color: "text-slate-700",
              },
              {
                label: "S indeksacijom",
                value: `${indexationCount} / ${activeContracts.length}`,
                color: "text-slate-700",
              },
            ].map((kpi, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3">
                <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wide">
                  {kpi.label}
                </p>
                <p className={`text-lg font-bold mt-0.5 ${kpi.color}`}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          {/* ─── Average duration stat ─── */}
          <div className="flex items-center gap-3 text-xs text-slate-500 border-b border-slate-200 pb-3">
            <span>
              Prosječno trajanje ugovora:{" "}
              <span className="font-semibold text-slate-700">
                {avgDuration} mj.
              </span>
            </span>
          </div>

          {/* ─── Status + Revenue ─── */}
          <div className="grid grid-cols-2 gap-8">
            {/* Status breakdown */}
            <div>
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
                Raspodjela po statusu
              </h3>
              <div className="space-y-2.5">
                {Object.entries(statusSummary)
                  .sort(
                    ([a], [b]) =>
                      (STATUS_ORDER[a] ?? 99) - (STATUS_ORDER[b] ?? 99),
                  )
                  .map(([status, count]) => {
                    const pct =
                      contracts.length > 0
                        ? Math.round((count / contracts.length) * 100)
                        : 0;
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
                        <span className="w-24 font-medium">
                          {STATUS_LABELS[status] || status}
                        </span>
                        <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: STATUS_DOT[status] || "#94a3b8",
                            }}
                          />
                        </div>
                        <span className="font-bold w-8 text-right tabular-nums">
                          {count}
                        </span>
                        <span className="text-slate-400 w-10 text-right tabular-nums">
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Revenue by property */}
            <div>
              <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
                Prihod po nekretnini (mjesečno)
              </h3>
              <div className="space-y-2">
                {Object.entries(revenueByProp)
                  .sort(([, a], [, b]) => b - a)
                  .map(([name, revenue]) => {
                    const pct =
                      totalMonthlyRent > 0
                        ? Math.round((revenue / totalMonthlyRent) * 100)
                        : 0;
                    return (
                      <div
                        key={name}
                        className="flex items-center gap-3 text-xs"
                      >
                        <span className="truncate flex-1 min-w-0 font-medium">
                          {name}
                        </span>
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden shrink-0">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-bold shrink-0 tabular-nums w-24 text-right">
                          {formatCurrency(revenue)}
                        </span>
                        <span className="text-slate-400 w-10 text-right shrink-0 tabular-nums">
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                {Object.keys(revenueByProp).length === 0 && (
                  <p className="text-xs text-slate-400 py-2">
                    Nema aktivnih ugovora
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ─── Top tenants ─── */}
          <div>
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 border-b border-slate-200 pb-1">
              Aktivni ugovori po zakupniku
            </h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              {Object.entries(contractsByTenant)
                .sort(([, a], [, b]) => b.rent - a.rent)
                .slice(0, 10)
                .map(([name, data]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between text-xs py-1 border-b border-slate-50"
                  >
                    <span className="truncate flex-1 min-w-0 font-medium">
                      {name}
                    </span>
                    <span className="text-slate-500 shrink-0 mx-2 tabular-nums">
                      {data.count} ug.
                    </span>
                    <span className="font-bold shrink-0 tabular-nums text-emerald-700">
                      {formatCurrency(data.rent)}/mj
                    </span>
                  </div>
                ))}
              {Object.keys(contractsByTenant).length === 0 && (
                <p className="text-xs text-slate-400 py-2 col-span-2">
                  Nema aktivnih ugovora
                </p>
              )}
            </div>
          </div>

          {/* ─── Expiring soon warning ─── */}
          {expiringContracts.length > 0 && (
            <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-lg p-4">
              <h3 className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Ugovori koji uskoro istječu ({expiringContracts.length})
              </h3>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-amber-700">
                    <th className="text-left py-1 font-semibold">
                      Br. ugovora
                    </th>
                    <th className="text-left py-1 font-semibold">Zakupnik</th>
                    <th className="text-left py-1 font-semibold">Nekretnina</th>
                    <th className="text-left py-1 font-semibold">Istječe</th>
                    <th className="text-right py-1 font-semibold">Preostalo</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringContracts.slice(0, 8).map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-amber-200/50 text-amber-900"
                    >
                      <td className="py-1 font-mono font-medium">
                        {c.interna_oznaka || "—"}
                      </td>
                      <td className="py-1">{c.zakupnik_naziv}</td>
                      <td className="py-1">{c.nekretnina_naziv}</td>
                      <td className="py-1">{formatDate(c.datum_zavrsetka)}</td>
                      <td className="py-1 text-right font-semibold">
                        {c.daysLeft != null ? `${c.daysLeft} d` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {expiringContracts.length > 8 && (
                <p className="text-[11px] text-amber-600 italic mt-1">
                  ...i još {expiringContracts.length - 8} ugovora
                </p>
              )}
            </div>
          )}

          {/* ─── Main table ─── */}
          <div>
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 border-b border-slate-200 pb-1">
              Detaljan pregled svih ugovora
            </h3>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="text-left py-2.5 px-3 font-semibold">
                    Br. ugovora
                  </th>
                  <th className="text-left py-2.5 px-3 font-semibold">
                    Zakupnik
                  </th>
                  <th className="text-left py-2.5 px-3 font-semibold">
                    Nekretnina
                  </th>
                  <th className="text-left py-2.5 px-3 font-semibold">
                    Početak
                  </th>
                  <th className="text-left py-2.5 px-3 font-semibold">
                    Završetak
                  </th>
                  <th className="text-right py-2.5 px-3 font-semibold">
                    Zakupnina
                  </th>
                  <th className="text-right py-2.5 px-3 font-semibold">CAM</th>
                  <th className="text-center py-2.5 px-3 font-semibold">
                    Indeks.
                  </th>
                  <th className="text-center py-2.5 px-3 font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c, i) => (
                  <tr
                    key={c.id}
                    className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                    style={{ pageBreakInside: "avoid" }}
                  >
                    <td className="py-2 px-3 font-mono font-medium text-slate-700">
                      {c.interna_oznaka || "—"}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-medium leading-tight">
                        {c.zakupnik_naziv}
                      </div>
                      {c.zakupnik_oib && (
                        <div className="text-slate-400 text-[9px] mt-0.5">
                          OIB: {c.zakupnik_oib}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <div className="leading-tight">{c.nekretnina_naziv}</div>
                      {c.nekretnina_adresa && (
                        <div className="text-slate-400 text-[9px] mt-0.5">
                          {c.nekretnina_adresa}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-600 tabular-nums">
                      {formatDate(c.datum_pocetka)}
                    </td>
                    <td className="py-2 px-3 tabular-nums">
                      <span
                        className={
                          c.daysLeft != null &&
                          c.daysLeft <= 90 &&
                          c.daysLeft >= 0
                            ? "text-amber-700 font-semibold"
                            : c.daysLeft != null && c.daysLeft < 0
                              ? "text-red-600 font-semibold"
                              : "text-slate-600"
                        }
                      >
                        {formatDate(c.datum_zavrsetka)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold tabular-nums">
                      {formatCurrency(c.osnovna_zakupnina)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-500 tabular-nums">
                      {c.cam_troskovi ? formatCurrency(c.cam_troskovi) : "—"}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {c.indeksacija ? (
                        <span className="text-emerald-600 font-semibold">
                          Da
                        </span>
                      ) : (
                        <span className="text-slate-400">Ne</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: STATUS_DOT[c.status] || "#94a3b8",
                          }}
                        />
                        <span className="text-[10px] font-medium">
                          {STATUS_LABELS[c.status] || c.status}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800 text-white font-semibold">
                  <td colSpan={5} className="py-2.5 px-3 text-right">
                    UKUPNO (aktivni):
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {formatCurrency(totalMonthlyRent)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {formatCurrency(totalCamValue)}
                  </td>
                  <td colSpan={2} className="py-2.5 px-3" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ─── Footer ─── */}
          <div className="pt-4 border-t border-slate-200 flex justify-between text-[10px] text-slate-400">
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

export default ContractReport;
