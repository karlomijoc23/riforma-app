import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Users,
  FileText,
  Printer,
  Edit,
  Building,
  Mail,
  Phone,
  MapPin,
  Building2,
  CreditCard,
  Clock,
  StickyNote,
  ExternalLink,
  DollarSign,
  User,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { Separator } from "../../components/ui/separator";
import { api } from "../../shared/api";
import { useEntityStore } from "../../shared/entityStore";
import {
  formatCurrency,
  formatDate,
  formatContractDate,
} from "../../shared/formatters";
import ZakupnikForm from "./ZakupnikForm";
import { toast } from "../../components/ui/sonner";
import { useReactToPrint } from "react-to-print";

const ZakupnikDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    zakupnici,
    ugovori,
    nekretnine,
    refresh,
    loading,
    ensureNekretnine,
    ensureZakupnici,
    ensureUgovori,
  } = useEntityStore();

  useEffect(() => {
    ensureNekretnine();
    ensureZakupnici();
    ensureUgovori();
  }, [ensureNekretnine, ensureZakupnici, ensureUgovori]);

  const [tenant, setTenant] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const printRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: tenant
      ? `Zakupnik_${tenant.naziv_firme || tenant.ime_prezime}`
      : "Zakupnik",
  });

  // Load tenant
  useEffect(() => {
    const loadData = async () => {
      setPageLoading(true);
      try {
        const fromStore = zakupnici.find((z) => String(z.id) === String(id));
        if (fromStore) {
          setTenant(fromStore);
        } else {
          const res = await api.getZakupnici();
          const all = res.data || [];
          const found = all.find((z) => String(z.id) === String(id));
          setTenant(found || null);
        }
      } catch (err) {
        console.error("Failed to load tenant", err);
      } finally {
        setPageLoading(false);
      }
    };
    loadData();
  }, [id, zakupnici]);

  // Tenant contracts
  const tenantContracts = useMemo(
    () => ugovori.filter((u) => u.zakupnik_id === tenant?.id),
    [ugovori, tenant?.id],
  );

  const activeContracts = useMemo(
    () =>
      tenantContracts.filter(
        (c) => c.status === "aktivno" || c.status === "na_isteku",
      ),
    [tenantContracts],
  );

  const totalMonthlyRent = useMemo(
    () =>
      activeContracts.reduce(
        (sum, c) => sum + (Number(c.osnovna_zakupnina) || 0),
        0,
      ),
    [activeContracts],
  );

  // Properties this tenant rents
  const tenantProperties = useMemo(() => {
    const propIds = [
      ...new Set(activeContracts.map((c) => c.nekretnina_id).filter(Boolean)),
    ];
    return propIds
      .map((pid) => nekretnine.find((n) => n.id === pid))
      .filter(Boolean);
  }, [activeContracts, nekretnine]);

  const primaryContact = tenant?.kontakt_osobe?.[0];
  const otherContacts = tenant?.kontakt_osobe?.slice(1) || [];

  // Edit handler
  const handleSubmit = async (data) => {
    setSubmitting(true);
    try {
      await api.updateZakupnik(tenant.id, data);
      toast.success("Zakupnik je ažuriran");
      setIsEditOpen(false);
      await refresh();
    } catch (error) {
      console.error("Greška pri spremanju:", error);
      toast.error("Spremanje nije uspjelo");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading
  if (pageLoading) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not found
  if (!tenant) {
    return (
      <div className="container mx-auto py-16 text-center">
        <Users className="mx-auto h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-semibold">Zakupnik nije pronađen</h2>
        <p className="text-muted-foreground mt-2">
          Zakupnik s traženim ID-em ne postoji ili je obrisan.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/zakupnici">Natrag na zakupnike</Link>
        </Button>
      </div>
    );
  }

  const isActive = !tenant.status || tenant.status === "aktivan";

  const InfoRow = ({ icon: Icon, label, value, className = "" }) => {
    if (!value) return null;
    return (
      <div className={`flex items-start gap-3 ${className}`}>
        {Icon && <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />}
        <div className="grid gap-0.5 w-full min-w-0">
          <span className="text-xs font-medium text-muted-foreground">
            {label}
          </span>
          <span className="text-sm text-foreground break-all">{value}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6" ref={printRef}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild className="mt-1">
            <Link to="/zakupnici">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold tracking-tight">
                {tenant.naziv_firme || tenant.ime_prezime}
              </h1>
              <div
                className={`h-2.5 w-2.5 rounded-full ${isActive ? "bg-green-500" : "bg-red-500"}`}
                title={isActive ? "Aktivan" : "Neaktivan"}
              />
              <Badge variant={isActive ? "default" : "secondary"}>
                {isActive ? "Aktivan" : "Arhiviran"}
              </Badge>
              {tenant.naziv_firme ? (
                <Badge variant="outline" className="text-xs">
                  Tvrtka
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  Fizička osoba
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {tenant.oib && (
                <span className="font-mono">OIB: {tenant.oib}</span>
              )}
              {(tenant.adresa_grad || tenant.sjediste) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {tenant.adresa_grad || tenant.sjediste}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Ispiši
          </Button>
          <Button onClick={() => setIsEditOpen(true)}>
            <Edit className="mr-2 h-4 w-4" /> Uredi
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Aktivni ugovori
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeContracts.length}</div>
            <p className="text-xs text-muted-foreground">
              Ukupno: {tenantContracts.length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Mjesečni prihod
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalMonthlyRent)}
            </div>
            <p className="text-xs text-muted-foreground">
              Godišnje: {formatCurrency(totalMonthlyRent * 12)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nekretnine</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenantProperties.length}</div>
            <p className="text-xs text-muted-foreground">Aktivno iznajmljene</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kontakti</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(tenant.kontakt_osobe?.length || 0) +
                (tenant.kontakt_email ? 1 : 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Kontakt osoba u sustavu
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pregled" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pregled">Pregled</TabsTrigger>
          <TabsTrigger value="ugovori">
            Ugovori
            {tenantContracts.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 text-[10px] px-1.5 py-0 h-4"
              >
                {tenantContracts.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="financije">Financije</TabsTrigger>
          <TabsTrigger value="kontakti">Kontakti</TabsTrigger>
        </TabsList>

        {/* Pregled Tab */}
        <TabsContent value="pregled" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Osnovni podaci
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <InfoRow label="Naziv firme" value={tenant.naziv_firme} />
                <InfoRow label="Ime i prezime" value={tenant.ime_prezime} />
                <InfoRow
                  label="OIB / VAT ID"
                  value={tenant.oib}
                  icon={CreditCard}
                />
                <InfoRow label="IBAN" value={tenant.iban} icon={CreditCard} />
                {tenant.oznake && tenant.oznake.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {tenant.oznake.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Primary Contact */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Primarni kontakt
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <InfoRow
                  icon={User}
                  label="Kontakt osoba"
                  value={
                    tenant.kontakt_ime ||
                    primaryContact?.ime ||
                    tenant.ime_prezime
                  }
                />
                <InfoRow
                  icon={Mail}
                  label="Email"
                  value={tenant.kontakt_email || primaryContact?.email}
                />
                <InfoRow
                  icon={Phone}
                  label="Telefon"
                  value={tenant.kontakt_telefon || primaryContact?.telefon}
                />
                {(tenant.hitnost_odziva_sati ||
                  primaryContact?.hitnost_odziva_sati) && (
                  <InfoRow
                    icon={Clock}
                    label="Hitnost odziva"
                    value={`${tenant.hitnost_odziva_sati || primaryContact?.hitnost_odziva_sati}h`}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Address */}
          {(tenant.adresa_ulica || tenant.adresa_grad || tenant.sjediste) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Adresa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  {tenant.adresa_ulica && (
                    <div>
                      <span className="text-muted-foreground block mb-1">
                        Ulica
                      </span>
                      <span className="font-medium">
                        {tenant.adresa_ulica} {tenant.adresa_kucni_broj}
                      </span>
                    </div>
                  )}
                  {tenant.adresa_postanski_broj && (
                    <div>
                      <span className="text-muted-foreground block mb-1">
                        Poštanski broj
                      </span>
                      <span className="font-medium">
                        {tenant.adresa_postanski_broj}
                      </span>
                    </div>
                  )}
                  {tenant.adresa_grad && (
                    <div>
                      <span className="text-muted-foreground block mb-1">
                        Grad
                      </span>
                      <span className="font-medium">{tenant.adresa_grad}</span>
                    </div>
                  )}
                  {tenant.adresa_drzava && (
                    <div>
                      <span className="text-muted-foreground block mb-1">
                        Država
                      </span>
                      <span className="font-medium">
                        {tenant.adresa_drzava}
                      </span>
                    </div>
                  )}
                  {tenant.sjediste &&
                    !tenant.adresa_ulica &&
                    !tenant.adresa_grad && (
                      <div className="col-span-full">
                        <span className="text-muted-foreground block mb-1">
                          Sjedište
                        </span>
                        <span className="font-medium">{tenant.sjediste}</span>
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Properties this tenant rents */}
          {tenantProperties.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building className="h-4 w-4 text-primary" />
                  Iznajmljene nekretnine
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {tenantProperties.map((prop) => (
                  <Link
                    key={prop.id}
                    to={`/nekretnine/${prop.id}`}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                  >
                    <Building className="h-5 w-5 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{prop.naziv}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {prop.adresa}
                        {prop.grad ? `, ${prop.grad}` : ""}
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Ugovori Tab */}
        <TabsContent value="ugovori" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Ugovori zakupnika
                </CardTitle>
                <Badge variant="outline">{tenantContracts.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {tenantContracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl bg-muted/30">
                  <FileText className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nema ugovora za ovog zakupnika
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Broj ugovora</TableHead>
                      <TableHead>Nekretnina</TableHead>
                      <TableHead>Trajanje</TableHead>
                      <TableHead className="text-right">Iznos</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantContracts.map((c) => {
                      const prop = nekretnine.find(
                        (n) => n.id === c.nekretnina_id,
                      );
                      const isExpiring = (() => {
                        if (!c.datum_zavrsetka) return false;
                        const diff = new Date(c.datum_zavrsetka) - new Date();
                        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                        return days > 0 && days <= 90;
                      })();
                      const status =
                        c.status === "aktivno" && isExpiring
                          ? "Na isteku"
                          : c.status;
                      return (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/ugovori/${c.id}`)}
                        >
                          <TableCell className="font-mono font-medium text-xs">
                            {c.interna_oznaka || "—"}
                          </TableCell>
                          <TableCell>{prop?.naziv || "—"}</TableCell>
                          <TableCell>
                            <div className="flex flex-col text-xs text-muted-foreground">
                              <span>{formatContractDate(c.datum_pocetka)}</span>
                              <span>
                                {formatContractDate(c.datum_zavrsetka)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(c.osnovna_zakupnina)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={
                                status === "Na isteku"
                                  ? "warning"
                                  : status === "aktivno"
                                    ? "default"
                                    : "secondary"
                              }
                              className={`capitalize ${status === "Na isteku" ? "bg-amber-500" : ""}`}
                            >
                              {status?.replace("_", " ")}
                            </Badge>
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

        {/* Financije Tab */}
        <TabsContent value="financije" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                Financijski podaci
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border divide-y">
                <div className="flex justify-between p-3 text-sm">
                  <span className="text-muted-foreground">PDV obveznik</span>
                  <span className="font-medium">
                    {tenant.pdv_obveznik ? "Da" : "Ne"}
                  </span>
                </div>
                {tenant.pdv_id && (
                  <div className="flex justify-between p-3 text-sm">
                    <span className="text-muted-foreground">PDV ID</span>
                    <span className="font-medium font-mono">
                      {tenant.pdv_id}
                    </span>
                  </div>
                )}
                {tenant.maticni_broj && (
                  <div className="flex justify-between p-3 text-sm">
                    <span className="text-muted-foreground">Matični broj</span>
                    <span className="font-medium font-mono">
                      {tenant.maticni_broj}
                    </span>
                  </div>
                )}
                {tenant.registracijski_broj && (
                  <div className="flex justify-between p-3 text-sm">
                    <span className="text-muted-foreground">
                      Registracijski broj
                    </span>
                    <span className="font-medium font-mono">
                      {tenant.registracijski_broj}
                    </span>
                  </div>
                )}
                {tenant.iban && (
                  <div className="flex justify-between p-3 text-sm">
                    <span className="text-muted-foreground">IBAN</span>
                    <span className="font-medium font-mono">{tenant.iban}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {(tenant.eracun_email || tenant.eracun_posrednik) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">eRačun postavke</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border divide-y">
                  {tenant.eracun_email && (
                    <div className="flex justify-between p-3 text-sm">
                      <span className="text-muted-foreground">
                        eRačun email
                      </span>
                      <span className="font-medium">{tenant.eracun_email}</span>
                    </div>
                  )}
                  {tenant.eracun_posrednik && (
                    <div className="flex justify-between p-3 text-sm">
                      <span className="text-muted-foreground">Posrednik</span>
                      <span className="font-medium">
                        {tenant.eracun_posrednik}
                      </span>
                    </div>
                  )}
                  {tenant.eracun_dostava_kanal && (
                    <div className="flex justify-between p-3 text-sm">
                      <span className="text-muted-foreground">
                        Kanal dostave
                      </span>
                      <span className="font-medium">
                        {tenant.eracun_dostava_kanal}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Revenue summary from contracts */}
          {activeContracts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Pregled prihoda od zakupnika
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border divide-y">
                  <div className="flex justify-between p-3 text-sm">
                    <span className="text-muted-foreground">
                      Mjesečni prihod
                    </span>
                    <span className="font-medium text-primary">
                      {formatCurrency(totalMonthlyRent)}
                    </span>
                  </div>
                  <div className="flex justify-between p-3 text-sm">
                    <span className="text-muted-foreground">
                      Godišnji prihod
                    </span>
                    <span className="font-medium">
                      {formatCurrency(totalMonthlyRent * 12)}
                    </span>
                  </div>
                  <div className="flex justify-between p-3 text-sm">
                    <span className="text-muted-foreground">
                      Ukupni depoziti
                    </span>
                    <span className="font-medium">
                      {formatCurrency(
                        activeContracts.reduce(
                          (sum, c) => sum + (Number(c.polog_depozit) || 0),
                          0,
                        ),
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Kontakti Tab */}
        <TabsContent value="kontakti" className="space-y-4">
          {/* Primary contact card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Primarni kontakt
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <InfoRow
                  icon={User}
                  label="Ime i prezime"
                  value={
                    tenant.kontakt_ime ||
                    primaryContact?.ime ||
                    tenant.ime_prezime
                  }
                />
                <InfoRow
                  icon={Mail}
                  label="Email"
                  value={tenant.kontakt_email || primaryContact?.email}
                />
                <InfoRow
                  icon={Phone}
                  label="Telefon"
                  value={tenant.kontakt_telefon || primaryContact?.telefon}
                />
                {primaryContact?.uloga && (
                  <InfoRow label="Uloga" value={primaryContact.uloga} />
                )}
                {primaryContact?.preferirani_kanal && (
                  <InfoRow
                    label="Preferirani kanal"
                    value={primaryContact.preferirani_kanal}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Other contacts */}
          {otherContacts.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Ostali kontakti
                  </CardTitle>
                  <Badge variant="outline">{otherContacts.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {otherContacts.map((contact, index) => (
                    <div
                      key={contact.id || index}
                      className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2"
                    >
                      <div className="font-medium">{contact.ime}</div>
                      {contact.uloga && (
                        <Badge variant="outline" className="text-xs">
                          {contact.uloga}
                        </Badge>
                      )}
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {contact.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3" /> {contact.email}
                          </div>
                        )}
                        {contact.telefon && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3" /> {contact.telefon}
                          </div>
                        )}
                      </div>
                      {contact.napomena && (
                        <p className="text-xs text-muted-foreground italic pt-1 border-t">
                          {contact.napomena}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Additional info */}
          {(tenant.biljeske || tenant.opis_usluge || tenant.radno_vrijeme) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-primary" />
                  Dodatne informacije
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {tenant.radno_vrijeme && (
                  <InfoRow
                    icon={Clock}
                    label="Radno vrijeme"
                    value={tenant.radno_vrijeme}
                  />
                )}
                {tenant.opis_usluge && (
                  <InfoRow label="Opis usluge" value={tenant.opis_usluge} />
                )}
                {tenant.biljeske && (
                  <div className="bg-muted/30 p-4 rounded-lg border text-sm">
                    <span className="font-semibold block mb-1 text-xs text-muted-foreground uppercase">
                      Bilješke
                    </span>
                    <p className="whitespace-pre-wrap">{tenant.biljeske}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Uredi zakupnika</DialogTitle>
            <DialogDescription>
              Izmijenite podatke zakupnika{" "}
              {tenant.naziv_firme || tenant.ime_prezime}.
            </DialogDescription>
          </DialogHeader>
          <ZakupnikForm
            zakupnik={tenant}
            onSubmit={handleSubmit}
            onCancel={() => setIsEditOpen(false)}
            submitting={submitting}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ZakupnikDetailPage;
