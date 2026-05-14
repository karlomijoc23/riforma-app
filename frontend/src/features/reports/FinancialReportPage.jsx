import React, { useEffect, useState, useMemo } from "react";
import { api } from "../../shared/api";
import { formatCurrency } from "../../shared/formatters";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useNavigate } from "react-router-dom";
import { toast } from "../../components/ui/sonner";
import {
  ReportHeader,
  SectionTitle,
  KpiGrid,
  KpiCard,
  DataTable,
  DataTableHead,
  StatusPill,
} from "../../shared/reportUI";

const UTILITY_LABELS = {
  struja: "Struja",
  voda: "Voda",
  plin: "Plin",
  komunalije: "Komunalije",
  internet: "Internet",
  ostalo: "Ostalo",
};

const MONTH_NAMES = {
  "01": "Siječanj",
  "02": "Veljača",
  "03": "Ožujak",
  "04": "Travanj",
  "05": "Svibanj",
  "06": "Lipanj",
  "07": "Srpanj",
  "08": "Kolovoz",
  "09": "Rujan",
  10: "Listopad",
  11: "Studeni",
  12: "Prosinac",
};

const FinancialReportPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [racuni, setRacuni] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(
    String(new Date().getFullYear()),
  );

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => [
      String(currentYear),
      String(currentYear - 1),
      String(currentYear - 2),
    ],
    [currentYear],
  );

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const periodOd = `${selectedYear}-01-01`;
        const periodDo = `${selectedYear}-12-31`;

        const [analyticsRes, contractsRes, racuniRes] = await Promise.all([
          api.getRacuniAnalytics({
            period_od: periodOd,
            period_do: periodDo,
          }),
          api.getUgovori({ status: "aktivno" }),
          api.getRacuni({
            period_od: periodOd,
            period_do: periodDo,
          }),
        ]);

        setData(analyticsRes.data);
        setContracts(contractsRes.data || []);
        setRacuni(racuniRes.data || []);
      } catch (err) {
        console.error("Failed to fetch financial data", err);
        toast.error("Greška pri učitavanju financijskog izvještaja");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedYear]);

  const totalIncome = useMemo(() => {
    return contracts.reduce((sum, c) => {
      const mjesecnaRenta = parseFloat(c.osnovna_zakupnina || 0);
      return sum + mjesecnaRenta * 12;
    }, 0);
  }, [contracts]);

  const monthlyData = useMemo(() => {
    const months = {};
    for (let m = 1; m <= 12; m++) {
      const key = String(m).padStart(2, "0");
      months[key] = { rashodi: 0 };
    }
    racuni.forEach((r) => {
      const datum = r.datum_racuna || "";
      if (datum.length >= 7) {
        const monthKey = datum.substring(5, 7);
        if (months[monthKey] !== undefined) {
          months[monthKey].rashodi += parseFloat(r.iznos || 0);
        }
      }
    });
    const monthlyIncome = contracts.length > 0 ? totalIncome / 12 : 0;
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => ({
        month: `${selectedYear}-${month}`,
        prihodi: monthlyIncome,
        rashodi: vals.rashodi,
        neto: monthlyIncome - vals.rashodi,
      }));
  }, [racuni, contracts, totalIncome, selectedYear]);

  const expensesByType = useMemo(() => {
    if (!data?.po_tipu) return [];
    const total = data.ukupno_iznos || 0;
    return Object.entries(data.po_tipu)
      .map(([tip, iznos]) => ({
        tip,
        iznos,
        postotak: total > 0 ? (iznos / total) * 100 : 0,
      }))
      .sort((a, b) => b.iznos - a.iznos);
  }, [data]);

  const totalExpenses = data?.ukupno_iznos || 0;
  const netPL = totalIncome - totalExpenses;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/racuni")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Natrag
          </Button>
          <h1 className="text-lg font-semibold">Financijski izvještaj</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Godina:</span>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Godina" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto p-6 space-y-2">
        <ReportHeader
          eyebrow="Financijski izvještaj"
          title={`Prihodi i rashodi · ${selectedYear}`}
          subtitle="Pregled godišnjih prihoda iz ugovora, rashoda iz računa i neto rezultata."
          metaLabel="Razdoblje"
          metaValue={`01.01. – 31.12. ${selectedYear}.`}
        />

        <SectionTitle>Ključni pokazatelji</SectionTitle>
        <KpiGrid>
          <KpiCard
            variant="positive"
            label="Prihodi (ugovori)"
            value={formatCurrency(totalIncome)}
            sub={`${contracts.length} aktivnih ugovora`}
          />
          <KpiCard
            label="Rashodi (računi)"
            value={formatCurrency(totalExpenses)}
            sub={`${data?.ukupno_racuna || 0} računa u ${selectedYear}.`}
          />
          <KpiCard
            variant={netPL >= 0 ? "accent" : "default"}
            label="Neto dobit / gubitak"
            value={formatCurrency(netPL)}
            sub={netPL >= 0 ? "Dobit" : "Gubitak"}
          />
          <KpiCard
            variant="info"
            label="Mjesečno (prosjek)"
            value={formatCurrency(netPL / 12)}
            sub="neto po mjesecu"
          />
        </KpiGrid>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          <div>
            <SectionTitle>Rashodi po tipu utroška</SectionTitle>
            {expensesByType.length === 0 ? (
              <div className="text-sm text-muted-foreground p-3 border border-dashed border-[#0F5E4D]/15 rounded-md">
                Nema podataka
              </div>
            ) : (
              <DataTable>
                <DataTableHead>
                  <tr>
                    <th className="text-left px-3 py-2">Tip</th>
                    <th className="text-right px-3 py-2">Iznos</th>
                    <th className="text-right px-3 py-2">Postotak</th>
                  </tr>
                </DataTableHead>
                <tbody>
                  {expensesByType.map((row, i) => (
                    <tr
                      key={row.tip}
                      className={`border-t border-[#0F5E4D]/10 ${i % 2 === 1 ? "bg-[#0F5E4D]/[0.02]" : ""}`}
                    >
                      <td className="px-3 py-2 font-medium">
                        {UTILITY_LABELS[row.tip] || row.tip}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(row.iznos)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {row.postotak.toFixed(1)} %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </div>

          <div>
            <SectionTitle>Pregled po statusu</SectionTitle>
            {!data?.po_statusu || Object.keys(data.po_statusu).length === 0 ? (
              <div className="text-sm text-muted-foreground p-3 border border-dashed border-[#0F5E4D]/15 rounded-md">
                Nema podataka
              </div>
            ) : (
              <DataTable>
                <DataTableHead>
                  <tr>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Broj računa</th>
                  </tr>
                </DataTableHead>
                <tbody>
                  {Object.entries(data.po_statusu)
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count], i) => (
                      <tr
                        key={status}
                        className={`border-t border-[#0F5E4D]/10 ${i % 2 === 1 ? "bg-[#0F5E4D]/[0.02]" : ""}`}
                      >
                        <td className="px-3 py-2">
                          <StatusPill
                            tone={
                              status === "placeno"
                                ? "positive"
                                : status === "ceka_placanje"
                                  ? "info"
                                  : "warn"
                            }
                          >
                            {status.replace(/_/g, " ")}
                          </StatusPill>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {count}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </DataTable>
            )}
          </div>
        </div>

        <SectionTitle>Mjesečni pregled · {selectedYear}</SectionTitle>
        <DataTable>
          <DataTableHead>
            <tr>
              <th className="text-left px-3 py-2">Mjesec</th>
              <th className="text-right px-3 py-2">Prihodi</th>
              <th className="text-right px-3 py-2">Rashodi</th>
              <th className="text-right px-3 py-2">Neto</th>
            </tr>
          </DataTableHead>
          <tbody>
            {monthlyData.map((row, i) => {
              const monthKey = row.month.substring(5, 7);
              return (
                <tr
                  key={row.month}
                  className={`border-t border-[#0F5E4D]/10 ${i % 2 === 1 ? "bg-[#0F5E4D]/[0.02]" : ""}`}
                >
                  <td className="px-3 py-2 font-medium">
                    {MONTH_NAMES[monthKey] || row.month}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#0f6a44]">
                    {formatCurrency(row.prihodi)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#b42318]">
                    {formatCurrency(row.rashodi)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-semibold ${row.neto >= 0 ? "text-[#0f6a44]" : "text-[#b42318]"}`}
                  >
                    {formatCurrency(row.neto)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#0F5E4D] bg-[#0F5E4D]/5 font-bold text-[#0F5E4D]">
              <td className="px-3 py-2">UKUPNO {selectedYear}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatCurrency(totalIncome)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatCurrency(totalExpenses)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatCurrency(netPL)}
              </td>
            </tr>
          </tfoot>
        </DataTable>

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
};

export default FinancialReportPage;
