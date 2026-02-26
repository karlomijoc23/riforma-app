import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../shared/auth";
import { useEntityStore } from "../../shared/entityStore";
import { api } from "../../shared/api";
import { toast } from "../../components/ui/sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Switch } from "../../components/ui/switch";
import { Separator } from "../../components/ui/separator";
import { Textarea } from "../../components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { ScrollArea } from "../../components/ui/scroll-area";
import {
  Building2,
  Save,
  Bell,
  FileText,
  Globe,
  Loader2,
  Plus,
  Users,
  Trash2,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { canManageTenants } from "../../shared/tenantAccess";

/* ─── Constants ─── */

const TENANT_TYPE_OPTIONS = [
  { value: "company", label: "Tvrtka" },
  { value: "personal", label: "Osoba" },
];

const TENANT_STATUS_OPTIONS = [
  { value: "active", label: "Aktivan" },
  { value: "archived", label: "Arhiviran" },
];

const emptyForm = {
  naziv: "",
  tip: "company",
  status: "active",
  oib: "",
  iban: "",
};

const emptyCreateForm = {
  naziv: "",
  tip: "company",
  oib: "",
  iban: "",
};

const emptyInviteForm = {
  email: "",
  full_name: "",
  role: "viewer",
  password: "",
  tenantId: "",
};

const formatLabel = (tenant) => {
  if (!tenant) return "Nepoznat portfelj";
  if (tenant.tip === "personal") return tenant.naziv || tenant.ime || tenant.id;
  return tenant.naziv;
};

const ROLE_LABELS = {
  admin: "Admin",
  owner: "Vlasnik",
  property_manager: "Upravitelj",
  unositelj: "Unositelj",
  accountant: "Računovodstvo",
  member: "Član",
  viewer: "Promatrač",
  vendor: "Dobavljač",
};

const displayRole = (role) => ROLE_LABELS[role] || role;

/* ─── Main Component ─── */

const SettingsPage = () => {
  const { user } = useAuth();
  const { tenantId, changeTenant } = useEntityStore();

  /* ── Profile state ── */
  const [tenants, setTenants] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedTenantId, setSelectedTenantId] = useState(tenantId);
  const [detailLoading, setDetailLoading] = useState(false);
  const [formState, setFormState] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [creating, setCreating] = useState(false);

  /* ── Settings state ── */
  const [settings, setSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  /* ── Users state ── */
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState(null);
  const [inviteForm, setInviteForm] = useState(emptyInviteForm);
  const [inviting, setInviting] = useState(false);

  /* ── Delete profile state ── */
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  /* ── Member edit state ── */
  const [memberToEdit, setMemberToEdit] = useState(null);
  const [isMemberEditOpen, setIsMemberEditOpen] = useState(false);
  const [updatingMember, setUpdatingMember] = useState(false);
  const [confirmRemoveMemberOpen, setConfirmRemoveMemberOpen] = useState(false);
  const [confirmDeleteUserOpen, setConfirmDeleteUserOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  /* ── Derived ── */
  const activeSummary = useMemo(
    () => tenants.find((item) => item.id === tenantId),
    [tenants, tenantId],
  );

  const canCreateProfiles = useMemo(() => {
    if (user?.role === "admin" || user?.role === "owner") return true;
    return canManageTenants(activeSummary?.role);
  }, [activeSummary?.role, user?.role]);

  const canManageUsers = canCreateProfiles;

  const sortedTenants = useMemo(
    () =>
      tenants
        .slice()
        .sort((a, b) => (a.naziv || "").localeCompare(b.naziv || "")),
    [tenants],
  );

  const selectedSummary = useMemo(
    () => sortedTenants.find((item) => item.id === selectedTenantId),
    [sortedTenants, selectedTenantId],
  );

  const canEditSelected = useMemo(
    () => canManageTenants(selectedSummary?.role),
    [selectedSummary?.role],
  );

  const detailFieldPrefix = useMemo(
    () => (selectedTenantId ? `tenant-${selectedTenantId}` : "tenant-detail"),
    [selectedTenantId],
  );

  /* ─── Data Loaders ─── */

  const loadTenants = useCallback(async () => {
    setLoadingList(true);
    try {
      const response = await api.getTenants();
      setTenants(response.data || []);
    } catch (err) {
      console.error("Greška pri učitavanju portfelja", err);
      toast.error("Nije moguće učitati portfelje.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadTenantDetail = useCallback(async (id) => {
    if (!id) {
      setFormState(emptyForm);
      return;
    }
    setDetailLoading(true);
    try {
      const response = await api.getTenant(id);
      const data = response.data || {};
      setFormState({
        naziv: data.naziv || "",
        tip: data.tip || "company",
        status: data.status || "active",
        oib: data.oib || "",
        iban: data.iban || "",
      });
    } catch (err) {
      console.error("Greška pri učitavanju portfelja", err);
      toast.error("Portfelj nije moguće učitati.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.getSettings();
      setSettings(res.data);
    } catch (err) {
      console.error("Failed to load settings", err);
      toast.error("Greška pri učitavanju postavki");
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    if (!canManageUsers) {
      setUsers([]);
      setUsersError(null);
      return;
    }
    setLoadingUsers(true);
    try {
      const response = await api.getUsers();
      setUsers(response.data || []);
      setUsersError(null);
    } catch (err) {
      console.error("Greška pri učitavanju korisnika", err);
      setUsers([]);
      setUsersError(err);
    } finally {
      setLoadingUsers(false);
    }
  }, [canManageUsers]);

  /* ── Effects ── */

  useEffect(() => {
    loadTenants();
    loadSettings();
  }, [loadTenants, loadSettings]);

  useEffect(() => {
    if (!selectedTenantId && tenants.length) {
      const fallback =
        tenants.find((item) => item.id === tenantId)?.id || tenants[0].id;
      setSelectedTenantId(fallback);
      return;
    }
    // Only load detail if the selected tenant exists in the user's tenant list
    if (
      selectedTenantId &&
      tenants.length &&
      tenants.some((t) => t.id === selectedTenantId)
    ) {
      loadTenantDetail(selectedTenantId);
    }
  }, [selectedTenantId, tenants, tenantId, loadTenantDetail]);

  useEffect(() => {
    loadUsers();
    const handleUsersUpdate = () => loadUsers();
    window.addEventListener("tenant:users-updated", handleUsersUpdate);
    return () =>
      window.removeEventListener("tenant:users-updated", handleUsersUpdate);
  }, [loadUsers]);

  /* ─── Profile Handlers ─── */

  const handleRefresh = useCallback(async () => {
    await loadTenants();
    if (selectedTenantId) await loadTenantDetail(selectedTenantId);
  }, [loadTenants, loadTenantDetail, selectedTenantId]);

  const handleSelectTenant = (id) => {
    setSelectedTenantId(id);
    setInviteForm((prev) => ({ ...prev, tenantId: id }));
  };

  const handleSetActive = async (id) => {
    const resolved = changeTenant(id);
    if (resolved) {
      toast.success("Aktivni portfelj je promijenjen.");
      setSelectedTenantId(resolved);
      if (typeof window !== "undefined" && window.location?.reload) {
        window.location.reload();
        return;
      }
      await handleRefresh();
    }
  };

  const handleFieldChange = (key, value) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveProfile = async () => {
    if (!selectedTenantId) return;
    if (!canEditSelected) {
      toast.error("Nemate ovlasti za uređivanje ovog portfelja.");
      return;
    }
    if (formState.oib && !/^\d{11}$/.test(formState.oib)) {
      toast.error("OIB mora sadržavati točno 11 znamenki");
      return;
    }
    if (
      formState.iban &&
      !/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(formState.iban.replace(/\s/g, ""))
    ) {
      toast.error("Neispravan IBAN format");
      return;
    }
    setSaving(true);
    try {
      await api.updateTenant(selectedTenantId, {
        naziv: formState.naziv.trim() || null,
        tip: formState.tip,
        status: formState.status,
        oib: formState.oib.trim() || null,
        iban: formState.iban.trim() || null,
      });
      toast.success("Portfelj je ažuriran.");
      await handleRefresh();
    } catch (err) {
      console.error("Greška pri spremanju portfelja", err);
      const msg = err?.response?.data?.detail || "Spremanje nije uspjelo.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.naziv.trim()) {
      toast.error("Naziv portfelja je obavezan.");
      return;
    }
    if (!canCreateProfiles) {
      toast.error("Samo administratori mogu kreirati nove portfelje.");
      return;
    }
    setCreating(true);
    try {
      const response = await api.createTenant({
        naziv: createForm.naziv.trim(),
        tip: createForm.tip,
        oib: createForm.oib.trim() || null,
        iban: createForm.iban.trim() || null,
      });
      const created = response.data;
      toast.success(`Portfelj "${createForm.naziv.trim()}" je kreiran.`);
      setCreateForm(emptyCreateForm);
      setIsCreateOpen(false);
      await loadTenants();
      if (created?.id) {
        changeTenant(created.id);
        setSelectedTenantId(created.id);
      }
    } catch (err) {
      console.error("Greška pri kreiranju portfelja", err);
      const msg =
        err?.response?.data?.detail || "Kreiranje portfelja nije uspjelo.";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTenant = async () => {
    if (deleteConfirmation !== selectedSummary?.naziv) {
      toast.error("Naziv portfelja se ne podudara.");
      return;
    }
    setDeleting(true);
    try {
      await api.deleteTenant(selectedTenantId);
      toast.success("Portfelj je uspješno obrisan.");
      setIsDeleteDialogOpen(false);
      setDeleteConfirmation("");
      setSelectedTenantId(null);
      await loadTenants();
      if (activeSummary?.id === selectedTenantId) {
        window.location.reload();
      }
    } catch (err) {
      console.error("Greška pri brisanju portfelja", err);
      toast.error("Brisanje nije uspjelo.");
    } finally {
      setDeleting(false);
    }
  };

  /* ─── Settings Handlers ─── */

  const updateSettingsField = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const { id, tenant_id, created_at, updated_at, ...data } = settings;
      await api.updateSettings(data);
      toast.success("Postavke su spremljene");
    } catch (err) {
      console.error("Failed to save settings", err);
      if (err?.response?.status === 403) {
        toast.error("Nemate ovlasti za promjenu postavki");
      } else {
        toast.error("Greška pri spremanju postavki");
      }
    } finally {
      setSavingSettings(false);
    }
  };

  /* ─── User Handlers ─── */

  const handleInviteFieldChange = (key, value) => {
    setInviteForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleInvite = async (event) => {
    event.preventDefault();
    if (!inviteForm.email.trim() || !inviteForm.password.trim()) {
      toast.error("Email i lozinka su obavezni.");
      return;
    }
    setInviting(true);
    try {
      const targetTenantId = inviteForm.tenantId || selectedTenantId;
      await api.registerUser({
        email: inviteForm.email.trim(),
        password: inviteForm.password,
        full_name: inviteForm.full_name.trim() || undefined,
        create_tenant: false,
        tenant_id: targetTenantId || undefined,
        tenant_role: inviteForm.role || "viewer",
      });
      const tenantName =
        sortedTenants.find((t) => t.id === targetTenantId)?.naziv ||
        targetTenantId;
      toast.success(`Korisnik dodan u portfelj "${tenantName}".`);
      setInviteForm(emptyInviteForm);
      await loadUsers();
    } catch (err) {
      console.error("Greška pri dodavanju korisnika", err);
      const message =
        err?.response?.data?.detail || "Dodavanje korisnika nije uspjelo.";
      toast.error(message);
    } finally {
      setInviting(false);
    }
  };

  /* ─── Member Handlers ─── */

  const handleMemberClick = (clickedUser, membership) => {
    setMemberToEdit({
      userId: clickedUser.id,
      userName: clickedUser.full_name || clickedUser.email,
      tenantId: membership.tenant_id,
      tenantName: membership.tenant_name,
      role: membership.role,
    });
    setIsMemberEditOpen(true);
  };

  const handleUpdateMemberRole = async (newRole) => {
    if (!memberToEdit) return;
    setUpdatingMember(true);
    try {
      await api.updateTenantMember(memberToEdit.tenantId, memberToEdit.userId, {
        role: newRole,
      });
      toast.success("Uloga ažurirana.");
      setIsMemberEditOpen(false);
      window.dispatchEvent(new CustomEvent("tenant:users-updated"));
    } catch (error) {
      console.error("Update member failed", error);
      toast.error("Ažuriranje nije uspjelo.");
    } finally {
      setUpdatingMember(false);
    }
  };

  const handleRemoveMember = () => setConfirmRemoveMemberOpen(true);

  const handleConfirmRemoveMember = async () => {
    if (!memberToEdit) return;
    setUpdatingMember(true);
    try {
      await api.removeTenantMember(memberToEdit.tenantId, memberToEdit.userId);
      toast.success("Korisnik uklonjen.");
      setIsMemberEditOpen(false);
      window.dispatchEvent(new CustomEvent("tenant:users-updated"));
    } catch (error) {
      console.error("Remove member failed", error);
      toast.error("Uklanjanje nije uspjelo.");
    } finally {
      setUpdatingMember(false);
      setConfirmRemoveMemberOpen(false);
    }
  };

  const handleDeleteUserClick = (u) => {
    setUserToDelete(u);
    setConfirmDeleteUserOpen(true);
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await api.deleteUser(userToDelete.id);
      toast.success("Korisnik je uspješno obrisan.");
      window.dispatchEvent(new CustomEvent("tenant:users-updated"));
    } catch (error) {
      console.error("Brisanje korisnika nije uspjelo", error);
      toast.error("Brisanje nije uspjelo.");
    } finally {
      setConfirmDeleteUserOpen(false);
      setUserToDelete(null);
    }
  };

  /* ─── Render ─── */

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      {/* ══ AKTIVNI PORTFELJ BANNER ══ */}
      <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary/70">
                Trenutno radite pod portfeljem
              </p>
              <p className="text-lg font-bold text-primary leading-tight">
                {activeSummary ? formatLabel(activeSummary) : "—"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeSummary?.role && (
              <Badge variant="outline" className="uppercase text-xs">
                {displayRole(activeSummary.role)}
              </Badge>
            )}
            <Badge
              variant="secondary"
              className="gap-1 bg-emerald-100 text-emerald-800 border-emerald-200"
            >
              <CheckCircle2 className="h-3 w-3" />
              Aktivni
            </Badge>
            {sortedTenants.length > 1 && (
              <p className="text-xs text-muted-foreground">
                Imate {sortedTenants.length} portfelja. Za promjenu koristite
                prekidač u navigaciji.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">
            Postavke
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upravljajte portfeljima, postavkama tvrtke, korisnicima i
            obavijestima.
          </p>
        </div>
      </div>

      <Tabs defaultValue="portfelj" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto">
          <TabsTrigger value="portfelj" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Portfelji</span>
          </TabsTrigger>
          <TabsTrigger value="obavijesti" className="gap-1.5">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Obavijesti</span>
          </TabsTrigger>
          <TabsTrigger value="izvjestaji" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Izvještaji</span>
          </TabsTrigger>
          {canManageUsers && (
            <TabsTrigger value="korisnici" className="gap-1.5">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Korisnici</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* ══════════ TAB: Portfelji ══════════ */}
        <TabsContent value="portfelj" className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {loadingList
                ? "Učitavanje..."
                : `${sortedTenants.length} ${sortedTenants.length === 1 ? "portfelj" : "portfelja"}`}
            </p>
            <Button
              onClick={() => setIsCreateOpen(true)}
              disabled={!canCreateProfiles}
              size="sm"
            >
              <Plus className="mr-2 h-4 w-4" /> Novi portfelj
            </Button>
          </div>

          {!canCreateProfiles && (
            <Alert className="border-amber-300/60 bg-amber-50 text-amber-900">
              <AlertTitle>Pristup samo za čitanje</AlertTitle>
              <AlertDescription>
                Imate pristup portfelju, ali bez administrativnih ovlasti.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
            {/* ── Profile list ── */}
            <Card className="h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <Users className="h-4 w-4" /> Moji portfelji
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 pt-0">
                {sortedTenants.map((tenant) => {
                  const isActive = tenant.id === tenantId;
                  const isSelected = tenant.id === selectedTenantId;
                  return (
                    <div
                      key={tenant.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectTenant(tenant.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleSelectTenant(tenant.id);
                        }
                      }}
                      className={`group flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/8 shadow-sm"
                          : "border-border bg-background hover:border-primary/40 hover:bg-muted/40"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {isActive && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                          )}
                          <span className="truncate text-sm font-medium text-foreground">
                            {formatLabel(tenant)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2">
                          {isActive ? (
                            <span className="text-xs font-medium text-emerald-600">
                              Aktivni
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetActive(tenant.id);
                              }}
                            >
                              Postavi aktivni
                            </button>
                          )}
                          {tenant.role && (
                            <span className="text-xs text-muted-foreground">
                              · {displayRole(tenant.role)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 transition-colors ${
                          isSelected
                            ? "text-primary"
                            : "text-muted-foreground/30 group-hover:text-muted-foreground"
                        }`}
                      />
                    </div>
                  );
                })}
                {!loadingList && sortedTenants.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Još nemate kreiranih portfelja.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── Profile details + Company settings merged ── */}
            {selectedSummary ? (
              <div className="space-y-5">
                {/* Selected profile header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-800">
                      {formatLabel(selectedSummary)}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Uredite podatke portfelja i postavke tvrtke.
                      {selectedSummary.id === tenantId && (
                        <span className="ml-2 font-medium text-emerald-600">
                          (Trenutno aktivni)
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => loadTenantDetail(selectedTenantId)}
                    disabled={detailLoading}
                    title="Osvježi podatke"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${detailLoading ? "animate-spin" : ""}`}
                    />
                  </Button>
                </div>

                {!canEditSelected && (
                  <Alert className="border-amber-200 bg-amber-50/80 py-2.5 text-amber-900">
                    <AlertDescription className="text-xs">
                      Ovaj portfelj je dostupan samo za pregled. Kontaktirajte
                      administratora za izmjene.
                    </AlertDescription>
                  </Alert>
                )}

                {detailLoading ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Učitavanje...
                  </div>
                ) : (
                  <>
                    {/* ── Sekcija: Identifikacija ── */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">
                          Identifikacijski podaci
                        </CardTitle>
                        <CardDescription>
                          Naziv, tip i pravni identifikatori portfelja.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label htmlFor={`${detailFieldPrefix}-name`}>
                              Naziv portfelja / Tvrtke
                            </Label>
                            <Input
                              id={`${detailFieldPrefix}-name`}
                              value={formState.naziv}
                              disabled={!canEditSelected}
                              onChange={(e) =>
                                handleFieldChange("naziv", e.target.value)
                              }
                              placeholder="MK Proptech d.o.o."
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`${detailFieldPrefix}-type`}>
                              Tip
                            </Label>
                            <Select
                              value={formState.tip}
                              disabled={!canEditSelected}
                              onValueChange={(value) =>
                                handleFieldChange("tip", value)
                              }
                            >
                              <SelectTrigger id={`${detailFieldPrefix}-type`}>
                                <SelectValue placeholder="Tip" />
                              </SelectTrigger>
                              <SelectContent>
                                {TENANT_TYPE_OPTIONS.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`${detailFieldPrefix}-oib`}>
                              OIB
                            </Label>
                            <Input
                              id={`${detailFieldPrefix}-oib`}
                              value={formState.oib}
                              disabled={!canEditSelected}
                              onChange={(e) =>
                                handleFieldChange("oib", e.target.value)
                              }
                              placeholder="12345678901"
                              maxLength={11}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`${detailFieldPrefix}-iban`}>
                              IBAN
                            </Label>
                            <Input
                              id={`${detailFieldPrefix}-iban`}
                              value={formState.iban}
                              disabled={!canEditSelected}
                              onChange={(e) =>
                                handleFieldChange("iban", e.target.value)
                              }
                              placeholder="HR1234567890123456789"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`${detailFieldPrefix}-status`}>
                              Status portfelja
                            </Label>
                            <Select
                              value={formState.status}
                              disabled={!canEditSelected}
                              onValueChange={(value) =>
                                handleFieldChange("status", value)
                              }
                            >
                              <SelectTrigger id={`${detailFieldPrefix}-status`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TENANT_STATUS_OPTIONS.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        {canEditSelected && (
                          <div className="flex justify-end pt-2">
                            <Button
                              type="button"
                              onClick={handleSaveProfile}
                              disabled={saving}
                              size="sm"
                            >
                              {saving ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="mr-2 h-4 w-4" />
                              )}
                              Spremi portfelj
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* ── Sekcija: Podaci tvrtke (settings) — samo za aktivni portfelj ── */}
                    {selectedSummary.id === tenantId && (
                      <>
                        {loadingSettings ? (
                          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Učitavanje postavki tvrtke...
                          </div>
                        ) : settings ? (
                          <Card>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-sm">
                                Kontakt i adresa tvrtke
                              </CardTitle>
                              <CardDescription>
                                Koristi se na izvještajima i dokumentima.
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="grid gap-4 sm:grid-cols-2">
                                <div className="sm:col-span-2 space-y-1.5">
                                  <Label htmlFor="adresa">Adresa</Label>
                                  <Input
                                    id="adresa"
                                    value={settings.adresa || ""}
                                    onChange={(e) =>
                                      updateSettingsField(
                                        "adresa",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="Ulica i kućni broj"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor="grad">Grad</Label>
                                  <Input
                                    id="grad"
                                    value={settings.grad || ""}
                                    onChange={(e) =>
                                      updateSettingsField(
                                        "grad",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="Zagreb"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor="postanski_broj">
                                    Poštanski broj
                                  </Label>
                                  <Input
                                    id="postanski_broj"
                                    value={settings.postanski_broj || ""}
                                    onChange={(e) =>
                                      updateSettingsField(
                                        "postanski_broj",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="10000"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor="telefon">Telefon</Label>
                                  <Input
                                    id="telefon"
                                    value={settings.telefon || ""}
                                    onChange={(e) =>
                                      updateSettingsField(
                                        "telefon",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="+385 1 234 5678"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor="email_settings">Email</Label>
                                  <Input
                                    id="email_settings"
                                    type="email"
                                    value={settings.email || ""}
                                    onChange={(e) =>
                                      updateSettingsField(
                                        "email",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="info@tvrtka.hr"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor="web">Web stranica</Label>
                                  <Input
                                    id="web"
                                    value={settings.web || ""}
                                    onChange={(e) =>
                                      updateSettingsField("web", e.target.value)
                                    }
                                    placeholder="https://www.tvrtka.hr"
                                  />
                                </div>
                              </div>

                              <Separator />

                              <div>
                                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Zadane vrijednosti
                                </p>
                                <div className="grid gap-4 sm:grid-cols-3">
                                  <div className="space-y-1.5">
                                    <Label htmlFor="default_valuta">
                                      Valuta
                                    </Label>
                                    <Select
                                      value={settings.default_valuta || "EUR"}
                                      onValueChange={(v) =>
                                        updateSettingsField("default_valuta", v)
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="EUR">
                                          EUR (€)
                                        </SelectItem>
                                        <SelectItem value="HRK">
                                          HRK (kn)
                                        </SelectItem>
                                        <SelectItem value="USD">
                                          USD ($)
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label htmlFor="default_pdv_stopa">
                                      PDV stopa (%)
                                    </Label>
                                    <Input
                                      id="default_pdv_stopa"
                                      type="number"
                                      step="0.5"
                                      value={settings.default_pdv_stopa ?? 25}
                                      onChange={(e) =>
                                        updateSettingsField(
                                          "default_pdv_stopa",
                                          parseFloat(e.target.value) || 0,
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label htmlFor="default_rok_placanja_dani">
                                      Rok plaćanja (dana)
                                    </Label>
                                    <Input
                                      id="default_rok_placanja_dani"
                                      type="number"
                                      value={
                                        settings.default_rok_placanja_dani ?? 15
                                      }
                                      onChange={(e) =>
                                        updateSettingsField(
                                          "default_rok_placanja_dani",
                                          parseInt(e.target.value) || 0,
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="flex justify-end pt-2">
                                <Button
                                  onClick={handleSaveSettings}
                                  disabled={savingSettings}
                                  size="sm"
                                >
                                  {savingSettings ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                  )}
                                  Spremi postavke tvrtke
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ) : null}
                      </>
                    )}

                    {/* ── Opasna zona ── */}
                    {canEditSelected && (
                      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-destructive">
                              Opasna zona
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Brisanje portfelja je nepovratno — obrisat će sve
                              podatke vezane uz ovaj portfelj.
                            </p>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setIsDeleteDialogOpen(true)}
                          >
                            Obriši portfelj
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 py-16 text-center">
                <div>
                  <Building2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    Odaberite portfelj s lijeve strane
                  </p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ══════════ TAB: Obavijesti ══════════ */}
        <TabsContent value="obavijesti" className="space-y-6">
          {loadingSettings ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : !settings ? (
            <p className="text-muted-foreground">
              Nije moguće učitati postavke.
            </p>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-primary" />
                    <CardTitle>Obavijesti</CardTitle>
                  </div>
                  <CardDescription>
                    Postavke automatskih obavijesti i podsjetnika.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">
                        Email obavijesti
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Primajte obavijesti putem emaila
                      </p>
                    </div>
                    <Switch
                      checked={settings.email_obavijesti ?? true}
                      onCheckedChange={(v) =>
                        updateSettingsField("email_obavijesti", v)
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">
                        Podsjetnik za istek ugovora
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Broj dana prije isteka za slanje podsjetnika
                      </p>
                    </div>
                    <Input
                      type="number"
                      className="w-20 text-center"
                      value={settings.obavijest_istek_ugovora_dani ?? 30}
                      onChange={(e) =>
                        updateSettingsField(
                          "obavijest_istek_ugovora_dani",
                          parseInt(e.target.value) || 0,
                        )
                      }
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">
                        Rokovi održavanja
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Obavijesti o rokovima zadataka održavanja
                      </p>
                    </div>
                    <Switch
                      checked={settings.obavijest_rok_odrzavanja ?? true}
                      onCheckedChange={(v) =>
                        updateSettingsField("obavijest_rok_odrzavanja", v)
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  size="lg"
                >
                  {savingSettings ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Spremi obavijesti
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ══════════ TAB: Izvještaji ══════════ */}
        <TabsContent value="izvjestaji" className="space-y-6">
          {loadingSettings ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : !settings ? (
            <p className="text-muted-foreground">
              Nije moguće učitati postavke.
            </p>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle>Izvještaji</CardTitle>
                  </div>
                  <CardDescription>
                    Prilagodite zaglavlje i podnožje izvještaja.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="report_header_text">Tekst zaglavlja</Label>
                    <Textarea
                      id="report_header_text"
                      value={settings.report_header_text || ""}
                      onChange={(e) =>
                        updateSettingsField(
                          "report_header_text",
                          e.target.value,
                        )
                      }
                      placeholder="Tekst koji će se prikazati na vrhu izvještaja..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="report_footer_text">Tekst podnožja</Label>
                    <Textarea
                      id="report_footer_text"
                      value={settings.report_footer_text || ""}
                      onChange={(e) =>
                        updateSettingsField(
                          "report_footer_text",
                          e.target.value,
                        )
                      }
                      placeholder="Tekst za podnožje izvještaja (npr. disclaimer)..."
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  size="lg"
                >
                  {savingSettings ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Spremi izvještaje
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ══════════ TAB: Korisnici ══════════ */}
        {canManageUsers && (
          <TabsContent value="korisnici" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dodavanje korisnika</CardTitle>
                <CardDescription>
                  Dodajte nove korisnike sustava s unaprijed definiranim
                  ovlastima.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-[1.1fr,1fr]">
                <form className="space-y-4" onSubmit={handleInvite}>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-email">Email adresa</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) =>
                        handleInviteFieldChange("email", e.target.value)
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-name">Ime i prezime</Label>
                    <Input
                      id="invite-name"
                      value={inviteForm.full_name}
                      onChange={(e) =>
                        handleInviteFieldChange("full_name", e.target.value)
                      }
                      placeholder="Opcionalno"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-tenant">
                      Portfelj{" "}
                      <span className="text-muted-foreground font-normal">
                        (u koji se dodaje korisnik)
                      </span>
                    </Label>
                    <Select
                      value={inviteForm.tenantId || tenantId || ""}
                      onValueChange={(value) =>
                        handleInviteFieldChange("tenantId", value)
                      }
                    >
                      <SelectTrigger id="invite-tenant">
                        <SelectValue placeholder="Odaberite portfelj" />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedTenants.map((tenant) => (
                          <SelectItem key={tenant.id} value={tenant.id}>
                            {formatLabel(tenant)}
                            {tenant.id === tenantId && " (aktivni)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-password">Privremena lozinka</Label>
                    <Input
                      id="invite-password"
                      type="password"
                      value={inviteForm.password}
                      onChange={(e) =>
                        handleInviteFieldChange("password", e.target.value)
                      }
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-role">Uloga</Label>
                    <Select
                      value={inviteForm.role}
                      onValueChange={(value) =>
                        handleInviteFieldChange("role", value)
                      }
                    >
                      <SelectTrigger id="invite-role">
                        <SelectValue placeholder="Odaberite ulogu" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Administrator</SelectItem>
                        <SelectItem value="property_manager">
                          Upravitelj nekretnina
                        </SelectItem>
                        <SelectItem value="unositelj">Unositelj</SelectItem>
                        <SelectItem value="accountant">
                          Računovodstvo
                        </SelectItem>
                        <SelectItem value="viewer">Promatrač</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={inviting} className="w-full">
                    {inviting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    {inviting ? "Dodajem..." : "Dodaj korisnika"}
                  </Button>
                </form>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground">
                      Trenutni korisnici
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Klikni na badg uloge za promjenu.
                    </p>
                  </div>
                  {loadingUsers ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Učitavanje
                      korisnika...
                    </div>
                  ) : usersError ? (
                    <Alert className="border-destructive/40 bg-destructive/10 text-destructive">
                      <AlertDescription>
                        Nije moguće učitati listu korisnika.
                      </AlertDescription>
                    </Alert>
                  ) : users.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Još nema dodanih korisnika.
                    </p>
                  ) : (
                    <div className="relative">
                      {users.length > 5 && (
                        <p className="text-[10px] text-muted-foreground text-right mb-1">
                          {users.length} korisnika
                        </p>
                      )}
                      <ScrollArea className="max-h-[400px] rounded-lg border border-border/60">
                        <ul className="divide-y divide-border/60">
                          {users.map((u) => (
                            <li key={u.id} className="p-3 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-foreground">
                                    {u.full_name || u.email}
                                  </p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {u.email}
                                  </p>
                                </div>
                                <div className="flex flex-col gap-1 items-end shrink-0">
                                  {u.memberships && u.memberships.length > 0 ? (
                                    u.memberships.map((m) => (
                                      <Badge
                                        key={m.tenant_id}
                                        variant="outline"
                                        className={`uppercase whitespace-nowrap cursor-pointer hover:bg-muted text-xs ${
                                          m.tenant_id === tenantId
                                            ? "border-primary/40 bg-primary/5 text-primary"
                                            : ""
                                        }`}
                                        onClick={() => handleMemberClick(u, m)}
                                        title="Klikni za uređivanje"
                                      >
                                        {m.tenant_name}: {displayRole(m.role)}
                                      </Badge>
                                    ))
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="uppercase text-muted-foreground"
                                    >
                                      Nema portfelja
                                    </Badge>
                                  )}
                                </div>
                                {canCreateProfiles && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDeleteUserClick(u)}
                                    title="Obriši korisnika iz sustava"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Status: {u.active ? "aktivan" : "blokiran"}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* ═══ Dialogs ═══ */}

      {/* Member Edit Dialog */}
      <Dialog open={isMemberEditOpen} onOpenChange={setIsMemberEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upravljanje članstvom</DialogTitle>
            <DialogDescription>
              Uređivanje prava za korisnika{" "}
              <strong>{memberToEdit?.userName}</strong> na portfelju{" "}
              <strong>{memberToEdit?.tenantName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Uloga</label>
              <Select
                value={memberToEdit?.role}
                onValueChange={(val) =>
                  setMemberToEdit((prev) => ({ ...prev, role: val }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="property_manager">
                    Upravitelj nekretnina
                  </SelectItem>
                  <SelectItem value="unositelj">Unositelj</SelectItem>
                  <SelectItem value="accountant">Računovodstvo</SelectItem>
                  <SelectItem value="viewer">Promatrač</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="destructive"
              onClick={handleRemoveMember}
              disabled={updatingMember}
            >
              Ukloni člana
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsMemberEditOpen(false)}
              >
                Odustani
              </Button>
              <Button
                onClick={() => handleUpdateMemberRole(memberToEdit?.role)}
                disabled={updatingMember}
              >
                {updatingMember ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {updatingMember ? "Spremam..." : "Spremi promjene"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Portfolio Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novi portfelj</DialogTitle>
            <DialogDescription>
              Kreirajte novi poslovni portfelj. Podaci (nekretnine, ugovori,
              dokumenti) su odvojeni po portfelju.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-name">
                Naziv portfelja / Tvrtke{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-name"
                value={createForm.naziv}
                placeholder="npr. MK Proptech d.o.o."
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    naziv: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="create-type">Tip</Label>
                <Select
                  value={createForm.tip}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, tip: value }))
                  }
                >
                  <SelectTrigger id="create-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TENANT_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-oib">OIB</Label>
                <Input
                  id="create-oib"
                  value={createForm.oib}
                  placeholder="Opcionalno"
                  onChange={(e) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      oib: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-iban">IBAN</Label>
              <Input
                id="create-iban"
                value={createForm.iban}
                placeholder="Opcionalno"
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    iban: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={creating}
            >
              Odustani
            </Button>
            <Button type="button" onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {creating ? "Kreiram..." : "Kreiraj portfelj"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Portfolio Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Obriši portfelj
            </DialogTitle>
            <DialogDescription>
              Jeste li sigurni da želite obrisati portfelj{" "}
              <strong>{selectedSummary?.naziv}</strong>? Ova radnja je neopoziva
              — svi podaci bit će trajno izgubljeni.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Upišite naziv portfelja za potvrdu:
              </label>
              <Input
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder={selectedSummary?.naziv}
                className="border-destructive/50 focus-visible:ring-destructive"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Odustani
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTenant}
              disabled={
                deleting || deleteConfirmation !== selectedSummary?.naziv
              }
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Brisanje...
                </>
              ) : (
                "Obriši portfelj"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation */}
      <AlertDialog
        open={confirmRemoveMemberOpen}
        onOpenChange={setConfirmRemoveMemberOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ukloni člana?</AlertDialogTitle>
            <AlertDialogDescription>
              Jeste li sigurni da želite ukloniti korisnika{" "}
              <strong>{memberToEdit?.userName}</strong> iz portfelja{" "}
              <strong>{memberToEdit?.tenantName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setConfirmRemoveMemberOpen(false)}
            >
              Odustani
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ukloni
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirmation */}
      <AlertDialog
        open={confirmDeleteUserOpen}
        onOpenChange={setConfirmDeleteUserOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trajno brisanje korisnika</AlertDialogTitle>
            <AlertDialogDescription>
              Jeste li sigurni da želite trajno obrisati korisnika{" "}
              <strong>{userToDelete?.full_name || userToDelete?.email}</strong>{" "}
              iz cijelog sustava? Ovu radnju nije moguće poništiti.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmDeleteUserOpen(false);
                setUserToDelete(null);
              }}
            >
              Odustani
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Obriši trajno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SettingsPage;
