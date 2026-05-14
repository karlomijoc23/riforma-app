import React, { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "../../shared/api";
import {
  downloadPdfFromResponse,
  extractBlobErrorDetail,
} from "../../shared/downloadBlob";
import { formatDate, formatCurrency } from "../../shared/formatters";
import { Loader2, Printer, AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "../../components/ui/sonner";
import {
  ReportHeader,
  SectionTitle,
  KpiGrid,
  KpiCard,
  RankCard,
  RankRow,
  RankList,
  DataTable,
  DataTableHead,
  StatusLine,
  VsPortfolio,
  DownloadPdfButton,
} from "../../shared/reportUI";

const STATUS_LABELS = {
  aktivno: "Aktivno",
  na_isteku: "Na isteku",
  istekao: "Istekao",
  raskinuto: "Raskinuto",
  arhivirano: "Arhivirano",
};

const STATUS_ORDER = {
  aktivno: 0,
  na_isteku: 1,
  istekao: 2,
  raskinuto: 3,
  arhivirano: 4,
};

const ACTIVE_STATUSES = new Set(["aktivno", "na_isteku"]);

const ContractReport = () => {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ugovoriRes, zakupniciRes, nekretnineRes, unitsRes] =
          await Promise.all([
            api.getUgovori(),
            api.getZakupnici(),
            api.getNekretnine(),
            api.getUnits(),
          ]);

        const zakupniciMap = new Map(
          zakupniciRes.data.map((z) => [String(z.id), z]),
        );
        const nekretnineMap = new Map(
          nekretnineRes.data.map((n) => [String(n.id), n]),
        );

        const enriched = ugovoriRes.data.map((c) => {
          const z = zakupniciMap.get(String(c.zakupnik_id));
          const n = nekretnineMap.get(String(c.nekretnina_id));
          let daysLeft = null;
          if (c.datum_zavrsetka) {
            const today = new Date();
            const end = new Date(c.datum_zavrsetka);
            daysLeft = Math.ceil((end - today) / 86400000);
          }
          return {
            ...c,
            zakupnik_naziv:
              (z && (z.naziv_firme || z.ime_prezime)) || "—",
            zakupnik_oib: z?.oib,
            nekretnina_naziv: n?.naziv || "—",
            nekretnina_adresa: n?.adresa,
            daysLeft,
          };
        });

        setContracts(enriched);
        setUnits(unitsRes.data || []);
      } catch (err) {
        console.error(err);
        setError("Greška pri učitavanju podataka izvještaja");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleDownloadPdf = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await api.exportContractsReportPdf();
      downloadPdfFromResponse(res, "riforma-izvjestaj-ugovora.pdf");
      toast.success("PDF preuzet.");
    } catch (err) {
      const detail = await extractBlobErrorDetail(err);
      toast.error(detail);
    } finally {
      setDownloading(false);
    }
  }, []);

  /* ─── Metrike ─── */
  const metrics = useMemo(() => {
    const active = contracts.filter((c) => c.status === "aktivno");
    const expiring = contracts.filter(
      (c) =>
        c.status === "na_isteku" ||
        (c.status === "aktivno" && c.daysLeft > 0 && c.daysLeft <= 90),
    );
    const expired = contracts.filter((c) => c.status === "istekao");
    const terminated = contracts.filter((c) => c.status === "raskinuto");
    const monthlyRent = active.reduce(
      (s, c) => s + (Number(c.osnovna_zakupnina) || 0),
      0,
    );
    const camTotal = active.reduce(
      (s, c) => s + (Number(c.cam_troskovi) || 0),
      0,
    );
    const indexationCount = active.filter((c) => c.indeksacija).length;

    // €/m² po ugovoru
    const unitsById = new Map(units.map((u) => [String(u.id), u]));
    const contractUnitIds = (c) => {
      if (Array.isArray(c.property_unit_ids) && c.property_unit_ids.length > 0)
        return c.property_unit_ids.map(String);
      if (c.property_unit_id) return [String(c.property_unit_id)];
      return [];
    };

    const perContractM2 = [];
    const perPropertyAgg = new Map(); // id -> { name, rent, area }
    active.forEach((c) => {
      const rent = Number(c.osnovna_zakupnina) || 0;
      if (rent <= 0) return;
      const ids = contractUnitIds(c);
      const area = ids.reduce((sum, uid) => {
        const u = unitsById.get(uid);
        return sum + (Number(u?.povrsina_m2) || 0);
      }, 0);
      if (area <= 0) return;
      const eurPerM2 = rent / area;
      perContractM2.push({
        id: c.id,
        oznaka: c.interna_oznaka || "—",
        propertyName: c.nekretnina_naziv,
        tenantName: c.zakupnik_naziv,
        area,
        rent,
        eurPerM2,
      });
      const pid = String(c.nekretnina_id || "");
      const existing = perPropertyAgg.get(pid) || {
        name: c.nekretnina_naziv,
        rent: 0,
        area: 0,
      };
      existing.rent += rent;
      existing.area += area;
      perPropertyAgg.set(pid, existing);
    });

    const top3 = [...perContractM2]
      .sort((a, b) => b.eurPerM2 - a.eurPerM2)
      .slice(0, 3);
    const bottom3 = [...perContractM2]
      .sort((a, b) => a.eurPerM2 - b.eurPerM2)
      .slice(0, 3);
    const perProperty = [...perPropertyAgg.values()]
      .filter((p) => p.area > 0)
      .map((p) => ({ ...p, eurPerM2: p.rent / p.area }))
      .sort((a, b) => b.eurPerM2 - a.eurPerM2);
    const totalRentM2 = perProperty.reduce((s, p) => s + p.rent, 0);
    const totalAreaM2 = perProperty.reduce((s, p) => s + p.area, 0);
    const portfolioAvgM2 = totalAreaM2 > 0 ? totalRentM2 / totalAreaM2 : 0;
    const eurPerM2ByContract = new Map(
      perContractM2.map((r) => [String(r.id), r.eurPerM2]),
    );

    // Status summary
    const statusCounts = {};
    contracts.forEach((c) => {
      const s = c.status || "nepoznato";
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    const statusSummary = Object.entries(statusCounts)
      .map(([key, count]) => ({
        key,
        label: STATUS_LABELS[key] || key,
        count,
        pct: contracts.length
          ? Math.round((count / contracts.length) * 100)
          : 0,
      }))
      .sort(
        (a, b) =>
          (STATUS_ORDER[a.key] ?? 99) - (STATUS_ORDER[b.key] ?? 99),
      );

    // Revenue by property (Top 5)
    const revenueMap = new Map();
    active.forEach((c) => {
      const name = c.nekretnina_naziv || "Nepoznato";
      revenueMap.set(name, (revenueMap.get(name) || 0) + (Number(c.osnovna_zakupnina) || 0));
    });
    const revenueSorted = [...revenueMap.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
    const revenueTop5 = revenueSorted.slice(0, 5);
    const revenueMax = revenueTop5[0]?.amount || 1;
    const revenueOverflow = Math.max(0, revenueSorted.length - 5);

    // Top tenants
    const tenantMap = new Map();
    active.forEach((c) => {
      const name = c.zakupnik_naziv || "Nepoznato";
      const b = tenantMap.get(name) || { name, count: 0, rent: 0 };
      b.count += 1;
      b.rent += Number(c.osnovna_zakupnina) || 0;
      tenantMap.set(name, b);
    });
    const tenantsSorted = [...tenantMap.values()].sort(
      (a, b) => b.rent - a.rent,
    );
    const tenantsTop5 = tenantsSorted.slice(0, 5);
    const tenantsMax = tenantsTop5[0]?.rent || 1;
    const tenantsOverflow = Math.max(0, tenantsSorted.length - 5);

    return {
      active,
      expiring,
      expired,
      terminated,
      monthlyRent,
      camTotal,
      indexationCount,
      top3,
      bottom3,
      perProperty,
      portfolioAvgM2,
      eurPerM2ByContract,
      statusSummary,
      revenueTop5,
      revenueMax,
      revenueOverflow,
      tenantsTop5,
      tenantsMax,
      tenantsOverflow,
    };
  }, [contracts, units]);

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
          <Button variant="ghost" size="sm" onClick={() => navigate("/ugovori")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Natrag
          </Button>
          <h1 className="text-lg font-semibold">Izvještaj o ugovorima</h1>
        </div>
        <div className="flex gap-2">
          <DownloadPdfButton onClick={handleDownloadPdf} downloading={downloading} />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Ispis
          </Button>
        </div>
      </div>

      {/* Report */}
      <div className="max-w-[1200px] mx-auto p-6 space-y-2">
        <ReportHeader
          eyebrow="Izvještaj o ugovorima"
          title="Ugovori o zakupu"
          subtitle="Pregled aktivnih, isteklih i nadolazećih ugovora s ukupnim mjesečnim prihodom."
          metaLabel="Datum izvještaja"
          metaValue={reportDate}
        />

        <SectionTitle>Ključni pokazatelji</SectionTitle>
        <KpiGrid>
          <KpiCard
            variant="accent"
            label="Mjesečni prihod"
            value={formatCurrency(metrics.monthlyRent)}
            sub={`Godišnje ${formatCurrency(metrics.monthlyRent * 12)}`}
          />
          <KpiCard
            variant="info"
            label="CAM troškovi (mj.)"
            value={formatCurrency(metrics.camTotal)}
            sub={`Ukupno s CAM-om ${formatCurrency(metrics.monthlyRent + metrics.camTotal)}`}
          />
          <KpiCard
            label="Ukupno ugovora"
            value={contracts.length}
            sub={`Aktivnih ${metrics.active.length} · S indeksacijom ${metrics.indexationCount}`}
          />
          <KpiCard
            label="Pažnja"
            value={metrics.expiring.length}
            sub={`Na isteku <90d · Isteklih ${metrics.expired.length} · Raskinutih ${metrics.terminated.length}`}
          />
        </KpiGrid>

        {metrics.statusSummary.length > 0 && (
          <StatusLine items={metrics.statusSummary} />
        )}

        {(metrics.top3.length > 0 || metrics.bottom3.length > 0) && (
          <>
            <SectionTitle
              hint={
                metrics.portfolioAvgM2 > 0
                  ? `portfelj prosjek ${formatCurrency(metrics.portfolioAvgM2)}/m²`
                  : null
              }
            >
              Analiza zakupnine po m²
            </SectionTitle>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {metrics.top3.length > 0 && (
                <RankCard
                  title="Top 3 najbolje plaćeno"
                  sub="€ / m² · aktivni ugovori"
                  tone="top"
                >
                  {metrics.top3.map((r, i) => (
                    <RankRow
                      key={r.id}
                      rank={i + 1}
                      tone="top"
                      primary={`${r.propertyName} · ${r.tenantName}`}
                      secondary={`Ugovor ${r.oznaka} · ${r.area.toFixed(0)} m² · ${formatCurrency(r.rent)}/mj`}
                      value={formatCurrency(r.eurPerM2)}
                      unit="/m²"
                    />
                  ))}
                </RankCard>
              )}
              {metrics.bottom3.length > 0 && (
                <RankCard
                  title="Top 3 najslabije plaćeno"
                  sub="€ / m² · aktivni ugovori"
                  tone="bottom"
                >
                  {metrics.bottom3.map((r, i) => (
                    <RankRow
                      key={r.id}
                      rank={i + 1}
                      tone="bottom"
                      primary={`${r.propertyName} · ${r.tenantName}`}
                      secondary={`Ugovor ${r.oznaka} · ${r.area.toFixed(0)} m² · ${formatCurrency(r.rent)}/mj`}
                      value={formatCurrency(r.eurPerM2)}
                      unit="/m²"
                    />
                  ))}
                </RankCard>
              )}
            </div>
          </>
        )}

        {metrics.perProperty.length > 0 && (
          <>
            <SectionTitle>Prosjek € / m² po nekretnini</SectionTitle>
            <DataTable>
              <DataTableHead>
                <tr>
                  <th className="text-left px-3 py-2">Nekretnina</th>
                  <th className="text-right px-3 py-2">Površina</th>
                  <th className="text-right px-3 py-2">Mj. zakupnina</th>
                  <th className="text-right px-3 py-2">Prosjek € / m²</th>
                  <th className="text-right px-3 py-2">vs portfelj</th>
                </tr>
              </DataTableHead>
              <tbody>
                {metrics.perProperty.map((p, i) => {
                  const diff =
                    metrics.portfolioAvgM2 > 0
                      ? ((p.eurPerM2 - metrics.portfolioAvgM2) /
                          metrics.portfolioAvgM2) *
                        100
                      : null;
                  return (
                    <tr
                      key={p.name + i}
                      className="border-t border-[#0F5E4D]/10"
                    >
                      <td className="px-3 py-2 font-semibold">{p.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.area.toFixed(0)} m²
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(p.rent)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {formatCurrency(p.eurPerM2)}/m²
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <VsPortfolio pct={diff} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          </>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          {metrics.revenueTop5.length > 0 && (
            <div>
              <SectionTitle>Top 5 prihoda po nekretnini</SectionTitle>
              <RankList
                items={metrics.revenueTop5.map((r) => ({
                  name: r.name,
                  value: r.amount,
                  barWidth: Math.round((r.amount / metrics.revenueMax) * 100),
                }))}
                valueFormatter={formatCurrency}
                overflow={metrics.revenueOverflow}
              />
            </div>
          )}
          {metrics.tenantsTop5.length > 0 && (
            <div>
              <SectionTitle>Top 5 zakupnika (mj. prihod)</SectionTitle>
              <RankList
                items={metrics.tenantsTop5.map((t) => ({
                  name: t.name,
                  value: t.rent,
                  hint: `${t.count} ugovor${t.count === 1 ? "" : "a"}`,
                  barWidth: Math.round((t.rent / metrics.tenantsMax) * 100),
                }))}
                valueFormatter={formatCurrency}
                overflow={metrics.tenantsOverflow}
              />
            </div>
          )}
        </div>

        <SectionTitle>Detaljan pregled ugovora</SectionTitle>
        <DataTable>
          <DataTableHead>
            <tr>
              <th className="text-left px-3 py-2">Oznaka</th>
              <th className="text-left px-3 py-2">Zakupnik</th>
              <th className="text-left px-3 py-2">Nekretnina</th>
              <th className="text-left px-3 py-2">Početak</th>
              <th className="text-left px-3 py-2">Završetak</th>
              <th className="text-right px-3 py-2">Mj. zakupnina</th>
              <th className="text-right px-3 py-2">Prosjek € / m²</th>
              <th className="text-right px-3 py-2">vs portfelj</th>
            </tr>
          </DataTableHead>
          <tbody>
            {contracts.map((c, i) => {
              const eurPerM2 = metrics.eurPerM2ByContract.get(String(c.id));
              const vs =
                eurPerM2 != null && metrics.portfolioAvgM2 > 0
                  ? ((eurPerM2 - metrics.portfolioAvgM2) /
                      metrics.portfolioAvgM2) *
                    100
                  : null;
              return (
                <tr
                  key={c.id}
                  className={`border-t border-[#0F5E4D]/10 ${i % 2 === 1 ? "bg-[#0F5E4D]/[0.02]" : ""}`}
                  style={{ pageBreakInside: "avoid" }}
                >
                  <td className="px-3 py-2 font-semibold">
                    {c.interna_oznaka || "—"}
                  </td>
                  <td className="px-3 py-2">{c.zakupnik_naziv}</td>
                  <td className="px-3 py-2">{c.nekretnina_naziv}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatDate(c.datum_pocetka)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    <span
                      className={
                        c.daysLeft != null && c.daysLeft <= 90 && c.daysLeft >= 0
                          ? "text-amber-700 font-semibold"
                          : c.daysLeft != null && c.daysLeft < 0
                            ? "text-red-700 font-semibold"
                            : ""
                      }
                    >
                      {formatDate(c.datum_zavrsetka)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {formatCurrency(c.osnovna_zakupnina)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {eurPerM2 != null ? `${formatCurrency(eurPerM2)}/m²` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <VsPortfolio pct={vs} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#0F5E4D] bg-[#0F5E4D]/5">
              <td colSpan={5} className="px-3 py-2 text-right font-bold text-[#0F5E4D]">
                UKUPNO (aktivni)
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-bold text-[#0F5E4D]">
                {formatCurrency(metrics.monthlyRent)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-bold text-[#0F5E4D]">
                {metrics.portfolioAvgM2 > 0
                  ? `${formatCurrency(metrics.portfolioAvgM2)}/m²`
                  : "—"}
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

export default ContractReport;
