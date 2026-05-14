import React, { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../../shared/api";
import {
  downloadPdfFromResponse,
  extractBlobErrorDetail,
} from "../../shared/downloadBlob";
import {
  formatCurrency,
  formatArea,
  formatPropertyType,
} from "../../shared/formatters";
import {
  Loader2,
  Printer,
  ArrowLeft,
  AlertTriangle,
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
  DownloadPdfButton,
  REPORT_COLORS,
} from "../../shared/reportUI";

const PropertyReport = () => {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

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

        const enriched = (propertiesRes.data || [])
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
            const occupancyPercent =
              totalUnits > 0
                ? Math.round((occupiedUnits / totalUnits) * 100)
                : propContracts.length > 0
                  ? 100
                  : 0;
            const market = parseFloat(p.trzisna_vrijednost) || 0;
            const roi = market > 0 ? (monthlyIncome * 12 * 100) / market : null;
            return {
              ...p,
              monthlyIncome,
              occupancyPercent,
              occupiedUnits,
              totalUnits,
              activeContractCount: propContracts.length,
              trzisnaVrijednost: market,
              povrsina: parseFloat(p.povrsina) || 0,
              roi,
            };
          })
          .sort((a, b) => {
            const v = b.trzisnaVrijednost - a.trzisnaVrijednost;
            return v !== 0 ? v : b.monthlyIncome - a.monthlyIncome;
          });

        setProperties(enriched);
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
    setDownloading(true);
    try {
      const res = await api.exportPortfolioReportPdf();
      downloadPdfFromResponse(res, "riforma-izvjestaj-portfelja.pdf");
      toast.success("PDF preuzet.");
    } catch (err) {
      const detail = await extractBlobErrorDetail(err);
      toast.error(detail);
    } finally {
      setDownloading(false);
    }
  }, []);

  const totals = useMemo(() => {
    const totalArea = properties.reduce((s, p) => s + p.povrsina, 0);
    const totalValue = properties.reduce((s, p) => s + p.trzisnaVrijednost, 0);
    const monthly = properties.reduce((s, p) => s + p.monthlyIncome, 0);
    const totalUnits = properties.reduce((s, p) => s + p.totalUnits, 0);
    const occupiedUnits = properties.reduce((s, p) => s + p.occupiedUnits, 0);
    const totalActive = properties.reduce(
      (s, p) => s + p.activeContractCount,
      0,
    );
    const annual = monthly * 12;
    const portfolioRoi = totalValue > 0 ? (annual * 100) / totalValue : 0;
    const avgOccupancy =
      properties.length > 0
        ? properties.reduce((s, p) => s + p.occupancyPercent, 0) /
          properties.length
        : 0;

    // Vrste portfelja (struktura)
    const typeMap = new Map();
    properties.forEach((p) => {
      const key = p.vrsta || "ostalo";
      const b = typeMap.get(key) || {
        key,
        label: formatPropertyType(key),
        count: 0,
        value: 0,
        income: 0,
      };
      b.count += 1;
      b.value += p.trzisnaVrijednost;
      b.income += p.monthlyIncome;
      typeMap.set(key, b);
    });
    const typeSummary = [...typeMap.values()].sort(
      (a, b) => b.value - a.value,
    );

    return {
      totalArea,
      totalValue,
      monthly,
      annual,
      totalUnits,
      occupiedUnits,
      totalActive,
      avgOccupancy,
      portfolioRoi,
      typeSummary,
    };
  }, [properties]);

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
          <DownloadPdfButton onClick={handleDownloadPdf} downloading={downloading} />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Ispis
          </Button>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto p-6 space-y-2">
        <ReportHeader
          eyebrow="Izvještaj portfelja"
          title="Pregled nekretnina"
          subtitle="Konsolidirani prikaz vrijednosti, popunjenosti i prihoda po objektu."
          metaLabel="Generirano"
          metaValue={reportDate}
        />

        <SectionTitle>Ključni pokazatelji</SectionTitle>
        <KpiGrid>
          <KpiCard
            variant="accent"
            label="Vrijednost portfelja"
            value={formatCurrency(totals.totalValue)}
            sub={`${properties.length} nekretnina · ${formatArea(totals.totalArea)}`}
          />
          <KpiCard
            variant="info"
            label="Mjesečni prihod"
            value={formatCurrency(totals.monthly)}
            sub={`Godišnje ${formatCurrency(totals.annual)}`}
          />
          <KpiCard
            variant="positive"
            label="Sveukupni ROI"
            value={`${totals.portfolioRoi.toFixed(1)} %`}
            sub="godišnji prihod / vrijednost portfelja"
          />
          <KpiCard
            label="Aktivni ugovori"
            value={totals.totalActive}
            sub={`${totals.occupiedUnits} / ${totals.totalUnits} jedinica · zauzeće ${totals.avgOccupancy.toFixed(0)} %`}
          />
        </KpiGrid>

        {totals.typeSummary.length > 0 && (
          <>
            <SectionTitle>Struktura po vrsti</SectionTitle>
            <DataTable>
              <DataTableHead>
                <tr>
                  <th className="text-left px-3 py-2">Vrsta nekretnine</th>
                  <th className="text-right px-3 py-2">Broj objekata</th>
                  <th className="text-right px-3 py-2">Tržišna vrijednost</th>
                  <th className="text-right px-3 py-2">Mjesečni prihod</th>
                </tr>
              </DataTableHead>
              <tbody>
                {totals.typeSummary.map((t) => (
                  <tr key={t.key} className="border-t border-[#0F5E4D]/10">
                    <td className="px-3 py-2 font-semibold">{t.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.count}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {formatCurrency(t.value)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(t.income)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </>
        )}

        <SectionTitle>Pregled po nekretnini</SectionTitle>
        <DataTable>
          <DataTableHead>
            <tr>
              <th className="text-left px-3 py-2">Nekretnina</th>
              <th className="text-left px-3 py-2">Vrsta</th>
              <th className="text-right px-3 py-2">Površina</th>
              <th className="text-right px-3 py-2">Tržišna vrijednost</th>
              <th className="text-right px-3 py-2">Mj. prihod</th>
              <th className="text-left px-3 py-2 w-[160px]">Popunjenost</th>
              <th className="text-right px-3 py-2">ROI</th>
              <th className="text-right px-3 py-2">Ugovori</th>
            </tr>
          </DataTableHead>
          <tbody>
            {properties.map((p, i) => (
              <tr
                key={p.id}
                className={`border-t border-[#0F5E4D]/10 ${i % 2 === 1 ? "bg-[#0F5E4D]/[0.02]" : ""}`}
                style={{ pageBreakInside: "avoid" }}
              >
                <td className="px-3 py-2">
                  <div className="font-semibold">{p.naziv}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {p.adresa}
                  </div>
                </td>
                <td className="px-3 py-2 text-[12px] text-muted-foreground">
                  {formatPropertyType(p.vrsta)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatArea(p.povrsina)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {formatCurrency(p.trzisnaVrijednost)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCurrency(p.monthlyIncome)}
                </td>
                <td className="px-3 py-2">
                  <div className="text-[10px] text-muted-foreground mb-1">
                    {p.occupiedUnits} / {p.totalUnits || "—"} ·{" "}
                    {p.occupancyPercent} %
                  </div>
                  <div className="h-1.5 bg-[#0F5E4D]/10 rounded-sm overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, p.occupancyPercent))}%`,
                        background: `linear-gradient(90deg, ${REPORT_COLORS.primary}, ${REPORT_COLORS.accent})`,
                      }}
                    />
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {p.roi !== null ? `${p.roi.toFixed(1)} %` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {p.activeContractCount}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#0F5E4D] bg-[#0F5E4D]/5 font-bold text-[#0F5E4D]">
              <td className="px-3 py-2">
                Ukupno · {properties.length} nekretnina
              </td>
              <td />
              <td className="px-3 py-2 text-right tabular-nums">
                {formatArea(totals.totalArea)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatCurrency(totals.totalValue)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatCurrency(totals.monthly)}
              </td>
              <td className="px-3 py-2 text-[12px]">
                {totals.avgOccupancy.toFixed(0)} %
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {totals.portfolioRoi.toFixed(1)} %
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {totals.totalActive}
              </td>
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

export default PropertyReport;
