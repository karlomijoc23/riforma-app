import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useEntityStore } from "../../shared/entityStore";
import { api } from "../../shared/api";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Badge } from "../../components/ui/badge";
import {
  FileText,
  Download,
  User,
  Building2,
  Receipt,
  Calendar,
} from "lucide-react";
import { toast } from "../../components/ui/sonner";

const MONTHS = [
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

const fmt = (n) => {
  if (n == null || isNaN(n)) return "0,00";
  return Number(n).toLocaleString("hr-HR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export default function TenantStatementPage() {
  const {
    zakupnici = [],
    ugovori = [],
    nekretnine = [],
    ensureZakupnici,
    ensureUgovori,
    ensureNekretnine,
  } = useEntityStore();

  useEffect(() => {
    ensureZakupnici();
    ensureUgovori();
    ensureNekretnine();
  }, [ensureZakupnici, ensureUgovori, ensureNekretnine]);

  const [selectedZakupnik, setSelectedZakupnik] = useState("");
  const [mjesec, setMjesec] = useState(new Date().getMonth());
  const [godina, setGodina] = useState(new Date().getFullYear());
  const [racuni, setRacuni] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const years = useMemo(() => {
    const curr = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => curr - i);
  }, []);

  const selectedZakupnikData = useMemo(
    () => zakupnici.find((z) => z.id === selectedZakupnik),
    [zakupnici, selectedZakupnik],
  );

  const tenantContracts = useMemo(
    () =>
      ugovori.filter(
        (u) =>
          u.zakupnik_id === selectedZakupnik &&
          ["aktivno", "na_isteku"].includes(u.status),
      ),
    [ugovori, selectedZakupnik],
  );

  const generateStatement = useCallback(async () => {
    if (!selectedZakupnik) {
      toast.error("Odaberite zakupnika");
      return;
    }
    setLoading(true);
    try {
      const startDate = `${godina}-${String(mjesec + 1).padStart(2, "0")}-01`;
      const endMonth = mjesec + 1 > 11 ? 0 : mjesec + 1;
      const endYear = mjesec + 1 > 11 ? godina + 1 : godina;
      const endDate = `${endYear}-${String(endMonth + 1).padStart(2, "0")}-01`;

      const res = await api.getRacuni({
        zakupnik_id: selectedZakupnik,
        datum_od: startDate,
        datum_do: endDate,
      });
      setRacuni(res.data || []);
      setGenerated(true);
    } catch (err) {
      toast.error("Greška pri dohvatu podataka");
    } finally {
      setLoading(false);
    }
  }, [selectedZakupnik, mjesec, godina]);

  const totalRent = tenantContracts.reduce(
    (sum, c) => sum + (c.osnovna_zakupnina || 0),
    0,
  );
  const totalBills = racuni.reduce((sum, r) => sum + (r.iznos || 0), 0);
  const totalCAM = tenantContracts.reduce(
    (sum, c) => sum + (c.cam_troskovi || 0),
    0,
  );
  const grandTotal = totalRent + totalBills + totalCAM;

  const exportPdf = useCallback(async () => {
    const el = document.getElementById("statement-content");
    if (!el) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(el, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const w = pdf.internal.pageSize.getWidth();
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, w, h);
      const name =
        selectedZakupnikData?.naziv_firme ||
        selectedZakupnikData?.ime_prezime ||
        "zakupnik";
      pdf.save(`izvod_${name}_${MONTHS[mjesec]}_${godina}.pdf`);
      toast.success("PDF izvoz uspješan");
    } catch (err) {
      toast.error("Greška pri izvozu PDF-a");
    }
  }, [selectedZakupnikData, mjesec, godina]);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" />
            Izvod zakupnika
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Mjesečni pregled troškova i obveza
          </p>
        </div>
        {generated && (
          <Button onClick={exportPdf} variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> PDF izvoz
          </Button>
        )}
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label
                className="text-sm font-medium mb-1.5 block"
                htmlFor="zakupnik-select"
              >
                Zakupnik
              </label>
              <Select
                value={selectedZakupnik}
                onValueChange={setSelectedZakupnik}
              >
                <SelectTrigger id="zakupnik-select">
                  <SelectValue placeholder="Odaberite zakupnika..." />
                </SelectTrigger>
                <SelectContent>
                  {zakupnici.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.naziv_firme || z.ime_prezime || z.oib}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                className="text-sm font-medium mb-1.5 block"
                htmlFor="mjesec-select"
              >
                Mjesec
              </label>
              <Select
                value={String(mjesec)}
                onValueChange={(v) => setMjesec(Number(v))}
              >
                <SelectTrigger id="mjesec-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                className="text-sm font-medium mb-1.5 block"
                htmlFor="godina-select"
              >
                Godina
              </label>
              <Select
                value={String(godina)}
                onValueChange={(v) => setGodina(Number(v))}
              >
                <SelectTrigger id="godina-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={generateStatement}
            disabled={!selectedZakupnik || loading}
            className="mt-4 w-full sm:w-auto"
          >
            {loading ? "Generiranje..." : "Generiraj izvod"}
          </Button>
        </CardContent>
      </Card>

      {/* Statement Content */}
      {generated && (
        <div id="statement-content" className="space-y-6">
          {/* Header */}
          <div className="bg-slate-800 text-white p-6 rounded-t-lg">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">MJESEČNI IZVOD</h2>
                <p className="text-slate-300 mt-1">
                  {MONTHS[mjesec]} {godina}
                </p>
              </div>
              <div className="text-right text-sm text-slate-300">
                <p className="font-semibold text-white">
                  {selectedZakupnikData?.naziv_firme ||
                    selectedZakupnikData?.ime_prezime}
                </p>
                <p>OIB: {selectedZakupnikData?.oib || "N/A"}</p>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" /> Zakupnina
                </div>
                <p className="text-lg font-bold mt-1">
                  {fmt(totalRent)} &euro;
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Receipt className="h-4 w-4" /> Režije
                </div>
                <p className="text-lg font-bold mt-1">
                  {fmt(totalBills)} &euro;
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4" /> CAM troškovi
                </div>
                <p className="text-lg font-bold mt-1">{fmt(totalCAM)} &euro;</p>
              </CardContent>
            </Card>
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Calendar className="h-4 w-4" /> Ukupno
                </div>
                <p className="text-lg font-bold mt-1 text-blue-700">
                  {fmt(grandTotal)} &euro;
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Active Contracts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aktivni ugovori</CardTitle>
            </CardHeader>
            <CardContent>
              {tenantContracts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nema aktivnih ugovora.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" role="table">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="text-left p-2">Oznaka</th>
                        <th className="text-left p-2">Nekretnina</th>
                        <th className="text-right p-2">Zakupnina</th>
                        <th className="text-right p-2">CAM</th>
                        <th className="text-center p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenantContracts.map((c) => {
                        const prop = nekretnine.find(
                          (n) => n.id === c.nekretnina_id,
                        );
                        return (
                          <tr key={c.id} className="border-b">
                            <td className="p-2 font-medium">
                              {c.interna_oznaka}
                            </td>
                            <td className="p-2">{prop?.naziv || "N/A"}</td>
                            <td className="p-2 text-right">
                              {fmt(c.osnovna_zakupnina)} &euro;
                            </td>
                            <td className="p-2 text-right">
                              {fmt(c.cam_troskovi)} &euro;
                            </td>
                            <td className="p-2 text-center">
                              <Badge
                                variant={
                                  c.status === "aktivno"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {c.status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bills */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Računi za {MONTHS[mjesec]} {godina}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {racuni.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nema računa za ovaj period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" role="table">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="text-left p-2">Tip</th>
                        <th className="text-left p-2">Dobavljač</th>
                        <th className="text-left p-2">Broj računa</th>
                        <th className="text-left p-2">Dospijeće</th>
                        <th className="text-right p-2">Iznos</th>
                        <th className="text-center p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {racuni.map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="p-2">{r.tip_utroska}</td>
                          <td className="p-2">{r.dobavljac || "-"}</td>
                          <td className="p-2">{r.broj_racuna || "-"}</td>
                          <td className="p-2">{r.datum_dospijeca || "-"}</td>
                          <td className="p-2 text-right font-medium">
                            {fmt(r.iznos)} &euro;
                          </td>
                          <td className="p-2 text-center">
                            <Badge
                              variant={
                                r.status_placanja === "placeno"
                                  ? "default"
                                  : "destructive"
                              }
                            >
                              {r.status_placanja || "neplaceno"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50 font-bold">
                        <td colSpan={4} className="p-2 text-right">
                          Ukupno režije:
                        </td>
                        <td className="p-2 text-right">
                          {fmt(totalBills)} &euro;
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="border-slate-300">
            <CardContent className="pt-6">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Zakupnina</span>
                  <span className="font-medium">{fmt(totalRent)} &euro;</span>
                </div>
                <div className="flex justify-between">
                  <span>CAM troškovi</span>
                  <span className="font-medium">{fmt(totalCAM)} &euro;</span>
                </div>
                <div className="flex justify-between">
                  <span>Režije (računi)</span>
                  <span className="font-medium">{fmt(totalBills)} &euro;</span>
                </div>
                <hr />
                <div className="flex justify-between text-base font-bold">
                  <span>
                    UKUPNO ZA {MONTHS[mjesec].toUpperCase()} {godina}
                  </span>
                  <span className="text-blue-700">
                    {fmt(grandTotal)} &euro;
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
