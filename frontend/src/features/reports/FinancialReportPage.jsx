import React, { useEffect, useState, useMemo } from "react";
import { api } from "../../shared/api";
import { formatCurrency } from "../../shared/formatters";
import { Loader2, ArrowLeft, TrendingUp, Receipt, Wallet } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useNavigate } from "react-router-dom";
import { toast } from "../../components/ui/sonner";

const UTILITY_LABELS = {
  struja: "Struja",
  voda: "Voda",
  plin: "Plin",
  komunalije: "Komunalije",
  internet: "Internet",
  ostalo: "Ostalo",
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

  // Derive income from active contracts (monthly rent * 12 or proportional)
  const totalIncome = useMemo(() => {
    return contracts.reduce((sum, c) => {
      const mjesecnaRenta = parseFloat(c.osnovna_zakupnina || 0);
      // Assume yearly income = monthly rent * 12
      return sum + mjesecnaRenta * 12;
    }, 0);
  }, [contracts]);

  // Compute monthly breakdown from racuni
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

  // Expenses by type with percentages
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/racuni")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Natrag
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Financijski izvještaj
            </h1>
            <p className="text-sm text-muted-foreground">
              Pregled prihoda, rashoda i neto dobiti/gubitka
            </p>
          </div>
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

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prihodi (ugovori)
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">
              {formatCurrency(totalIncome)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {contracts.length} aktivnih ugovora
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rashodi (računi)
            </CardTitle>
            <Receipt className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-700">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data?.ukupno_racuna || 0} računa u {selectedYear}.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Neto dobit/gubitak
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${netPL >= 0 ? "text-emerald-700" : "text-red-700"}`}
            >
              {formatCurrency(netPL)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <Badge variant={netPL >= 0 ? "success" : "destructive"}>
                {netPL >= 0 ? "Dobit" : "Gubitak"}
              </Badge>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Expenses breakdown and monthly summary */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Expenses by type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rashodi po tipu utroška</CardTitle>
          </CardHeader>
          <CardContent>
            {expensesByType.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nema podataka</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tip</TableHead>
                    <TableHead className="text-right">Iznos</TableHead>
                    <TableHead className="text-right">Postotak</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expensesByType.map((row) => (
                    <TableRow key={row.tip}>
                      <TableCell className="font-medium">
                        {UTILITY_LABELS[row.tip] || row.tip}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.iznos)}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.postotak.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Status breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pregled po statusu</CardTitle>
          </CardHeader>
          <CardContent>
            {!data?.po_statusu || Object.keys(data.po_statusu).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nema podataka</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Broj računa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.po_statusu)
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count]) => (
                      <TableRow key={status}>
                        <TableCell className="font-medium">
                          <Badge variant="outline">
                            {status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{count}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Mjesečni pregled - {selectedYear}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mjesec</TableHead>
                <TableHead className="text-right">Prihodi</TableHead>
                <TableHead className="text-right">Rashodi</TableHead>
                <TableHead className="text-right">Neto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlyData.map((row) => {
                const monthKey = row.month.substring(5, 7);
                return (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">
                      {MONTH_NAMES[monthKey] || row.month}
                    </TableCell>
                    <TableCell className="text-right text-emerald-700">
                      {formatCurrency(row.prihodi)}
                    </TableCell>
                    <TableCell className="text-right text-red-700">
                      {formatCurrency(row.rashodi)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${row.neto >= 0 ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {formatCurrency(row.neto)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancialReportPage;
