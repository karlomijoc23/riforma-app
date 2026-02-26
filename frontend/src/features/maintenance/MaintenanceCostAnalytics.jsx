import React, { useEffect, useState } from "react";
import { api } from "../../shared/api";
import { formatCurrency } from "../../shared/formatters";
import {
  Loader2,
  ArrowLeft,
  Wrench,
  Hammer,
  Calculator,
  ClipboardList,
} from "lucide-react";
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
import { useNavigate } from "react-router-dom";
import { toast } from "../../components/ui/sonner";

const PRIORITY_LABELS = {
  kriticno: "Kritično",
  visoko: "Visoko",
  srednje: "Srednje",
  nisko: "Nisko",
};

const PRIORITY_VARIANTS = {
  kriticno: "destructive",
  visoko: "warning",
  srednje: "secondary",
  nisko: "success",
};

const MaintenanceCostAnalytics = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.getMaintenanceAnalytics();
        setData(res.data);
      } catch (err) {
        console.error("Failed to fetch maintenance analytics", err);
        toast.error("Greška pri učitavanju analitike održavanja");
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-lg text-muted-foreground">Nema podataka za prikaz</p>
        <Button variant="outline" onClick={() => navigate("/odrzavanje")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Natrag
        </Button>
      </div>
    );
  }

  const avgCostPerTask =
    data.total_tasks > 0 ? data.total_cost / data.total_tasks : 0;

  const propertyEntries = Object.entries(data.by_property || {}).sort(
    ([, a], [, b]) => b.ukupno - a.ukupno,
  );

  const priorityEntries = Object.entries(data.by_priority || {}).sort(
    ([, a], [, b]) => b.ukupno - a.ukupno,
  );

  const monthEntries = Object.entries(data.by_month || {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/odrzavanje")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Natrag
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Analitika troškova održavanja
          </h1>
          <p className="text-sm text-muted-foreground">
            Pregled troškova materijala i rada po nekretninama, prioritetima i
            mjesecima
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ukupni troškovi
            </CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.total_cost)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.total_tasks} zadataka ukupno
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Troškovi materijala
            </CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.total_materijal)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.total_cost > 0
                ? `${((data.total_materijal / data.total_cost) * 100).toFixed(1)}% ukupnih troškova`
                : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Troškovi rada
            </CardTitle>
            <Hammer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.total_rad)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.total_cost > 0
                ? `${((data.total_rad / data.total_cost) * 100).toFixed(1)}% ukupnih troškova`
                : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prosječni trošak po zadatku
            </CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(avgCostPerTask)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Prosjek za {data.total_tasks} zadataka
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tables side by side */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Costs by property */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Troškovi po nekretnini</CardTitle>
          </CardHeader>
          <CardContent>
            {propertyEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nema podataka</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nekretnina</TableHead>
                    <TableHead className="text-right">Materijal</TableHead>
                    <TableHead className="text-right">Rad</TableHead>
                    <TableHead className="text-right">Ukupno</TableHead>
                    <TableHead className="text-right">Zadaci</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {propertyEntries.map(([id, row]) => (
                    <TableRow key={id}>
                      <TableCell className="font-medium">{row.naziv}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.materijal)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.rad)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(row.ukupno)}
                      </TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Costs by priority */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Troškovi po prioritetu</CardTitle>
          </CardHeader>
          <CardContent>
            {priorityEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nema podataka</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prioritet</TableHead>
                    <TableHead className="text-right">Materijal</TableHead>
                    <TableHead className="text-right">Rad</TableHead>
                    <TableHead className="text-right">Ukupno</TableHead>
                    <TableHead className="text-right">Zadaci</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priorityEntries.map(([priority, row]) => (
                    <TableRow key={priority}>
                      <TableCell>
                        <Badge
                          variant={PRIORITY_VARIANTS[priority] || "secondary"}
                        >
                          {PRIORITY_LABELS[priority] || priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.materijal)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(row.rad)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(row.ukupno)}
                      </TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mjesečni trend troškova</CardTitle>
        </CardHeader>
        <CardContent>
          {monthEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nema podataka</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mjesec</TableHead>
                  <TableHead className="text-right">Materijal</TableHead>
                  <TableHead className="text-right">Rad</TableHead>
                  <TableHead className="text-right">Ukupno</TableHead>
                  <TableHead className="text-right">Zadaci</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthEntries.map(([month, row]) => (
                  <TableRow key={month}>
                    <TableCell className="font-medium">{month}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.materijal)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(row.rad)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(row.ukupno)}
                    </TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MaintenanceCostAnalytics;
