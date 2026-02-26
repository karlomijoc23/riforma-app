import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { Badge } from "../../components/ui/badge";
import ParkingTab from "./ParkingTab";
import {
  Building,
  MapPin,
  Ruler,
  Euro,
  Calendar,
  FileText,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
} from "lucide-react";
import {
  formatCurrency,
  formatArea,
  formatDate,
  parseSmartNumber,
} from "../../shared/formatters";
import { api } from "../../shared/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Button } from "../../components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "../../components/ui/sonner";
import { useEntityStore } from "../../shared/entityStore";

const NekretninaDetails = ({ nekretnina }) => {
  if (!nekretnina) return null;

  const navigate = useNavigate();
  const { ugovori, zakupnici, ensureUgovori, ensureZakupnici } =
    useEntityStore();

  useEffect(() => {
    ensureUgovori();
    ensureZakupnici();
  }, [ensureUgovori, ensureZakupnici]);

  const [units, setUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  useEffect(() => {
    const fetchUnits = async () => {
      if (!nekretnina?.id) return;
      setLoadingUnits(true);
      try {
        const response = await api.getUnitsForProperty(nekretnina.id);
        setUnits(response.data || []);
      } catch (error) {
        console.error("Failed to fetch units", error);
        toast.error("Greška pri učitavanju jedinica nekretnine");
      } finally {
        setLoadingUnits(false);
      }
    };

    fetchUnits();
  }, [nekretnina?.id]);

  // Use real financial history if available, otherwise mock
  const currentYear = new Date().getFullYear();
  let financialHistory = [];

  if (
    nekretnina.financijska_povijest &&
    nekretnina.financijska_povijest.length > 0
  ) {
    financialHistory = nekretnina.financijska_povijest
      .sort((a, b) => b.godina - a.godina)
      .map((item) => {
        const prihodi = parseSmartNumber(item.prihodi);
        const rashodi = parseSmartNumber(item.rashodi);
        const amortizacija = parseSmartNumber(item.amortizacija);
        return {
          year: item.godina,
          prihodi,
          rashodi,
          amortizacija, // Include so we can display if needed or debug
          neto: prihodi - rashodi + amortizacija,
        };
      });
  } else {
    // Mock data fallback
    financialHistory = [
      {
        year: currentYear - 1,
        prihodi: nekretnina.prosllogodisnji_prihodi || 0,
        rashodi: nekretnina.prosllogodisnji_rashodi || 0,
        neto: nekretnina.neto_prihod || 0,
      },
      {
        year: currentYear - 2,
        prihodi: (nekretnina.prosllogodisnji_prihodi || 0) * 0.9,
        rashodi: (nekretnina.prosllogodisnji_rashodi || 0) * 0.95,
        neto:
          (nekretnina.prosllogodisnji_prihodi || 0) * 0.9 -
          (nekretnina.prosllogodisnji_rashodi || 0) * 0.95,
      },
      {
        year: currentYear - 3,
        prihodi: (nekretnina.prosllogodisnji_prihodi || 0) * 0.8,
        rashodi: (nekretnina.prosllogodisnji_rashodi || 0) * 0.9,
        neto:
          (nekretnina.prosllogodisnji_prihodi || 0) * 0.8 -
          (nekretnina.prosllogodisnji_rashodi || 0) * 0.9,
      },
    ];
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">
              {nekretnina.naziv}
            </h2>
            <Badge variant="outline" className="capitalize">
              {nekretnina.vrsta?.replace("_", " ") || "Nekretnina"}
            </Badge>
          </div>
          <div className="flex items-center text-muted-foreground mt-1">
            <MapPin className="mr-1 h-4 w-4" />
            {nekretnina.adresa}
          </div>
        </div>
      </div>

      <Tabs defaultValue="pregled" className="w-full">
        <TabsList className="flex flex-wrap h-auto p-1 gap-1 w-full justify-start">
          <TabsTrigger value="pregled" className="flex-1 min-w-[100px]">
            Pregled
          </TabsTrigger>
          <TabsTrigger value="financije" className="flex-1 min-w-[100px]">
            Financije
          </TabsTrigger>
          <TabsTrigger value="units" className="flex-1 min-w-[120px]">
            Jedinice ({units.length})
          </TabsTrigger>
          <TabsTrigger value="tehnicki" className="flex-1 min-w-[100px]">
            Tehnički
          </TabsTrigger>
          <TabsTrigger value="rizici" className="flex-1 min-w-[100px]">
            Napomene
          </TabsTrigger>
          {nekretnina.has_parking && (
            <TabsTrigger value="parking" className="flex-1 min-w-[100px]">
              Parking
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="pregled" className="space-y-4 mt-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Ukupna površina
                </CardTitle>
                <Ruler className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatArea(nekretnina.povrsina)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Tržišna vrijednost
                </CardTitle>
                <Euro className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(
                    nekretnina.trzisna_vrijednost || nekretnina.nabavna_cijena,
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Godina izgradnje
                </CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {nekretnina.godina_izgradnje || "-"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Vlasništvo
                </CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {nekretnina.udio_vlasnistva || "-"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {nekretnina.vlasnik}
                </p>
              </CardContent>
            </Card>

            {/* Occupancy & Revenue Cards */}
            {(() => {
              // Build set of unit IDs that have an active contract
              const activeContracts = (ugovori || []).filter(
                (c) =>
                  c.nekretnina_id === nekretnina.id &&
                  (c.status === "aktivno" || c.status === "na_isteku"),
              );
              const activeUnitIds = new Set(
                activeContracts.map((c) => c.property_unit_id).filter(Boolean),
              );

              const calculateOccupancy = (allUnits) => {
                if (allUnits.length === 0)
                  return {
                    percent: 0,
                    occupied: 0,
                    total: 0,
                    occupiedCount: 0,
                    totalCount: 0,
                  };

                const totalArea = allUnits.reduce(
                  (sum, u) => sum + (parseFloat(u.povrsina_m2) || 0),
                  0,
                );
                // Consider unit occupied if status is iznajmljeno OR has an active contract
                const occupiedUnits = allUnits.filter(
                  (u) => u.status === "iznajmljeno" || activeUnitIds.has(u.id),
                );
                const occupiedArea = occupiedUnits.reduce(
                  (sum, u) => sum + (parseFloat(u.povrsina_m2) || 0),
                  0,
                );

                if (totalArea === 0)
                  return {
                    percent: 0,
                    occupied: 0,
                    total: 0,
                    occupiedCount: 0,
                    totalCount: allUnits.length,
                  };

                return {
                  percent: Math.round((occupiedArea / totalArea) * 100),
                  occupied: occupiedArea,
                  total: totalArea,
                  occupiedCount: occupiedUnits.length,
                  totalCount: allUnits.length,
                };
              };

              const monthlyIncome = activeContracts.reduce(
                (sum, c) => sum + (parseFloat(c.osnovna_zakupnina) || 0),
                0,
              );

              const occupancy = calculateOccupancy(units);

              return (
                <>
                  <Card className="sm:col-span-1">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        Mjesečni prihod
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-2">
                        <div className="text-2xl font-bold text-emerald-600">
                          {formatCurrency(monthlyIncome)}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {activeContracts.length}{" "}
                        {activeContracts.length === 1
                          ? "aktivan ugovor"
                          : "aktivnih ugovora"}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="sm:col-span-1">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        Zakupljenost prostora
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl font-bold">
                          {occupancy.percent}%
                        </span>
                        {occupancy.totalCount > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {occupancy.occupiedCount}/{occupancy.totalCount}{" "}
                            jedinica
                          </span>
                        )}
                      </div>
                      <div className="h-4 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ease-in-out ${
                            occupancy.percent >= 75
                              ? "bg-emerald-500"
                              : occupancy.percent >= 40
                                ? "bg-amber-500"
                                : occupancy.percent > 0
                                  ? "bg-red-400"
                                  : "bg-secondary"
                          }`}
                          style={{ width: `${occupancy.percent}%` }}
                        />
                      </div>
                      {occupancy.total > 0 && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {formatArea(occupancy.occupied)} od{" "}
                          {formatArea(occupancy.total)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </>
              );
            })()}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Osnovne informacije</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              <div className="space-y-1">
                <span className="text-sm font-medium text-muted-foreground">
                  Katastarska općina
                </span>
                <p>{nekretnina.katastarska_opcina || "-"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-sm font-medium text-muted-foreground">
                  Broj katastarske čestice
                </span>
                <p>{nekretnina.broj_kat_cestice || "-"}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financije" className="space-y-4 mt-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Nabavna cijena
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(nekretnina.nabavna_cijena)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Amortizacija
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(nekretnina.amortizacija)}
                </div>
              </CardContent>
            </Card>
            <Card className="sm:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Troškovi održavanja
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(nekretnina.troskovi_odrzavanja)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Active contract revenue breakdown */}
          {(() => {
            const propContracts = (ugovori || []).filter(
              (c) =>
                c.nekretnina_id === nekretnina.id &&
                (c.status === "aktivno" || c.status === "na_isteku"),
            );
            if (propContracts.length === 0) return null;

            const totalMonthly = propContracts.reduce(
              (sum, c) => sum + (parseFloat(c.osnovna_zakupnina) || 0),
              0,
            );

            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-emerald-600" />
                    Prihod iz aktivnih ugovora
                  </CardTitle>
                  <CardDescription>
                    Pregled mjesečnog prihoda po ugovorima.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ugovor</TableHead>
                        <TableHead>Zakupnik</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">
                          Mjesečna zakupnina
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {propContracts.map((c) => {
                        const tenant = (zakupnici || []).find(
                          (z) => z.id === c.zakupnik_id,
                        );
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">
                              {c.interna_oznaka || "—"}
                            </TableCell>
                            <TableCell>
                              {tenant?.naziv || c.zakupnik_naziv || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={
                                  c.status === "aktivno"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-amber-100 text-amber-700"
                                }
                              >
                                {c.status === "aktivno"
                                  ? "Aktivan"
                                  : "Na isteku"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium text-emerald-600">
                              {formatCurrency(c.osnovna_zakupnina)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="border-t-2">
                        <TableCell colSpan={3} className="font-bold text-right">
                          Ukupno mjesečno:
                        </TableCell>
                        <TableCell className="text-right font-bold text-emerald-600">
                          {formatCurrency(totalMonthly)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="font-medium text-right text-muted-foreground"
                        >
                          Godišnji prihod (projekcija):
                        </TableCell>
                        <TableCell className="text-right font-medium text-muted-foreground">
                          {formatCurrency(totalMonthly * 12)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })()}

          <Card>
            <CardHeader>
              <CardTitle>Financijski pregled (Zadnje 3 godine)</CardTitle>
              <CardDescription>
                Prikaz prihoda, rashoda i neto dobiti kroz godine.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Godina</TableHead>
                    <TableHead className="text-right">Prihodi</TableHead>
                    <TableHead className="text-right">Rashodi</TableHead>
                    <TableHead className="text-right">Neto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {financialHistory.map((item) => (
                    <TableRow key={item.year}>
                      <TableCell className="font-medium">
                        {item.year}.
                      </TableCell>
                      <TableCell className="text-right text-emerald-600">
                        {formatCurrency(item.prihodi)}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {formatCurrency(item.rashodi)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-bold ${item.neto >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {formatCurrency(item.neto)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="units" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Jedinice</CardTitle>
              <CardDescription>
                Popis svih jedinica unutar nekretnine.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingUnits ? (
                <div className="text-center py-4 text-muted-foreground">
                  Učitavanje jedinica...
                </div>
              ) : units.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  Nema definiranih jedinica.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Oznaka</TableHead>
                      <TableHead>Naziv</TableHead>
                      <TableHead>Površina</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Zakupnik</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {units.map((unit) => {
                      const activeContract = ugovori?.find(
                        (c) =>
                          c.status === "aktivno" &&
                          (c.property_unit_id === unit.id ||
                            c.property_unit_id === unit.localId),
                      );
                      const tenantName = activeContract
                        ? activeContract.zakupnik_naziv || "Nepoznat"
                        : "-";

                      return (
                        <TableRow key={unit.id}>
                          <TableCell className="font-medium">
                            {unit.oznaka}
                          </TableCell>
                          <TableCell>{unit.naziv || "-"}</TableCell>
                          <TableCell>{formatArea(unit.povrsina_m2)}</TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={
                                unit.status === "iznajmljeno"
                                  ? "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200"
                                  : unit.status === "dostupno" ||
                                      unit.status === "slobodno"
                                    ? "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200"
                                    : unit.status === "na_isteku"
                                      ? "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200"
                                      : ""
                              }
                            >
                              {unit.status === "iznajmljeno"
                                ? "Iznajmljeno"
                                : unit.status === "dostupno" ||
                                    unit.status === "slobodno"
                                  ? "Dostupno"
                                  : unit.status === "na_isteku"
                                    ? "Na isteku"
                                    : unit.status || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {activeContract ? (
                              <span className="font-medium text-blue-600">
                                {tenantName}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {activeContract && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    className="h-8 w-8 p-0"
                                  >
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Akcije</DropdownMenuLabel>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      navigate(
                                        `/ugovori?contractId=${activeContract.id}`,
                                      )
                                    }
                                  >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Vidi Ugovor
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tehnicki" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Tehnički podaci</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-sm font-medium text-muted-foreground">
                    Zadnja obnova
                  </span>
                  <p>{formatDate(nekretnina.zadnja_obnova) || "-"}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-medium text-muted-foreground">
                    Osiguranje
                  </span>
                  <p>{nekretnina.osiguranje || "-"}</p>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-sm font-medium text-muted-foreground">
                  Potrebna ulaganja
                </span>
                <p className="text-sm whitespace-pre-wrap">
                  {nekretnina.potrebna_ulaganja ||
                    "Nema zabilježenih potrebnih ulaganja."}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rizici" className="space-y-4 mt-4">
          <div className="grid gap-4 grid-cols-1">
            <Card>
              <CardHeader className="flex flex-row items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <CardTitle className="text-base">Sudski sporovi</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">
                  {nekretnina.sudski_sporovi ||
                    "Nema aktivnih sudskih sporova."}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center space-x-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <CardTitle className="text-base">Hipoteke i tereti</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">
                  {nekretnina.hipoteke ||
                    "Nema zabilježenih hipoteka ili tereta."}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Napomene</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">
                  {nekretnina.napomene || "Nema dodatnih napomena."}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {nekretnina.has_parking && (
          <TabsContent value="parking" className="mt-4">
            <ParkingTab nekretninaId={nekretnina.id} zakupnici={zakupnici} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default NekretninaDetails;
