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
import PageBreadcrumbs from "../../components/PageBreadcrumbs";
import InfoRow from "./tabs/InfoRow";
import OverviewTab from "./tabs/OverviewTab";
import ContractsTab from "./tabs/ContractsTab";
import FinanceTab from "./tabs/FinanceTab";
import ContactsTab from "./tabs/ContactsTab";

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
  const [invitingUser, setInvitingUser] = useState(false);

  const handleInviteUser = async () => {
    if (!tenant?.id) return;
    setInvitingUser(true);
    try {
      const res = await api.inviteTenantUser(tenant.id);
      const tempPassword = res.data?.temp_password;
      const email = res.data?.email;
      // Surface the temp password — admin must copy it for the tenant.
      // window.prompt lets the admin select+copy without an extra UI layer.
      window.prompt(
        `Korisnički račun kreiran za ${email}. Kopiraj ovu privremenu lozinku i pošalji je zakupniku sigurnim kanalom:`,
        tempPassword,
      );
      toast.success("Korisnički račun povezan sa zakupnikom.");
      // Refresh tenant data so the button switches state.
      const fresh = await api.getZakupnik(tenant.id);
      setTenant(fresh.data);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        "Neuspješno kreiranje korisničkog računa.";
      toast.error(typeof detail === "string" ? detail : JSON.stringify(detail));
    } finally {
      setInvitingUser(false);
    }
  };

  const handleUnlinkUser = async () => {
    if (!tenant?.id) return;
    if (
      !window.confirm(
        "Sigurno želiš ukloniti vezu korisničkog računa s ovim zakupnikom? Korisnik gubi pristup self-service portalu.",
      )
    ) {
      return;
    }
    setInvitingUser(true);
    try {
      await api.unlinkTenantUser(tenant.id);
      toast.success("Veza korisničkog računa uklonjena.");
      const fresh = await api.getZakupnik(tenant.id);
      setTenant(fresh.data);
    } catch (err) {
      toast.error("Neuspješno odvajanje korisničkog računa.");
    } finally {
      setInvitingUser(false);
    }
  };
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6" ref={printRef}>
      <PageBreadcrumbs
        items={[
          { label: "Zakupnici", to: "/zakupnici" },
          { label: tenant.naziv_firme || tenant.ime_prezime || "Detalji" },
        ]}
      />

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
          {!tenant.user_id ? (
            <Button
              variant="outline"
              onClick={handleInviteUser}
              disabled={invitingUser}
            >
              {invitingUser ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <User className="mr-2 h-4 w-4" />
              )}
              Pozovi korisnika
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleUnlinkUser}
              disabled={invitingUser}
              title="Ukloni povezani korisnički račun"
            >
              <User className="mr-2 h-4 w-4" /> Korisnik povezan
            </Button>
          )}
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
          <OverviewTab
            tenant={tenant}
            primaryContact={primaryContact}
            tenantProperties={tenantProperties}
          />
        </TabsContent>

        {/* Ugovori Tab */}
        <TabsContent value="ugovori" className="space-y-4">
          <ContractsTab
            tenantContracts={tenantContracts}
            nekretnine={nekretnine}
          />
        </TabsContent>

        {/* Financije Tab */}
        <TabsContent value="financije" className="space-y-6">
          <FinanceTab
            tenant={tenant}
            activeContracts={activeContracts}
            totalMonthlyRent={totalMonthlyRent}
          />
        </TabsContent>

        {/* Kontakti Tab */}
        <TabsContent value="kontakti" className="space-y-4">
          <ContactsTab
            tenant={tenant}
            primaryContact={primaryContact}
            otherContacts={otherContacts}
          />
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
