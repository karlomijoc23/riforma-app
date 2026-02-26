import React, { useState, useEffect, useCallback, useMemo, useId } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { toast } from "./ui/sonner";
import { ChevronDown, Check, LogOut, Cog, HelpCircle } from "lucide-react";
import { api } from "../shared/api";
import { useEntityStore } from "../shared/entityStore";
import { canManageTenants } from "../shared/tenantAccess";

const formatRoleLabel = (role) => {
  if (!role) {
    return "";
  }
  const mapping = {
    owner: "Vlasnik",
    admin: "Administrator",
    member: "Član",
    viewer: "Pregled",
    property_manager: "Upravitelj",
    unositelj: "Unositelj",
    accountant: "Financije",
    tenant: "Zakupnik",
    vendor: "Dobavljač",
  };
  return mapping[role] || role;
};

let _tenantCache = null;
let _tenantCacheForTenant = null;

export const clearTenantCache = () => {
  _tenantCache = null;
  _tenantCacheForTenant = null;
};

export const TenantSwitcher = ({ onLogout }) => {
  const { tenantId, changeTenant } = useEntityStore();
  const [tenants, setTenants] = useState([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [tenantsError, setTenantsError] = useState(null);
  const labelId = useId();
  const navigate = useNavigate();

  const loadTenants = useCallback(async () => {
    if (_tenantCache && _tenantCacheForTenant === tenantId) {
      setTenants(_tenantCache);
      return;
    }
    setLoadingTenants(true);
    try {
      const response = await api.getTenants();
      const data = response.data || [];
      _tenantCache = data;
      _tenantCacheForTenant = tenantId;
      setTenants(data);
      setTenantsError(null);
    } catch (err) {
      console.error("Greška pri dohvaćanju portfelja", err);
      setTenantsError(err);
    } finally {
      setLoadingTenants(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  const sortedTenants = useMemo(() => {
    return tenants
      .slice()
      .sort((a, b) => (a.naziv || "").localeCompare(b.naziv || ""));
  }, [tenants]);

  const selectedTenant = useMemo(
    () => sortedTenants.find((tenant) => tenant.id === tenantId),
    [sortedTenants, tenantId],
  );

  const handleSelectTenant = useCallback(
    async (id) => {
      if (!id || id === tenantId) {
        return;
      }
      _tenantCache = null;
      const resolved = changeTenant(id);
      if (resolved) {
        await loadTenants();
      }
    },
    [changeTenant, loadTenants, tenantId],
  );

  const handleNavigateSettings = useCallback(() => {
    navigate("/postavke");
  }, [navigate]);

  const handleNavigateHelp = useCallback(() => {
    navigate("/pomoc");
  }, [navigate]);

  const handleLogout = useCallback(() => {
    onLogout?.();
  }, [onLogout]);

  const buttonLabel =
    selectedTenant?.naziv ||
    (loadingTenants
      ? "Učitavanje portfelja..."
      : tenantsError
        ? "Portfelj nije dostupan"
        : tenants.length
          ? "Odaberite portfelj"
          : "Nema portfelja");

  return (
    <div className="flex flex-col gap-1 sm:w-auto">
      <Label
        id={labelId}
        className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:sr-only"
      >
        Aktivni portfelj
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="flex items-center gap-2 rounded-full border border-border/60 bg-white/80 backdrop-blur-md px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
            aria-labelledby={labelId}
          >
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <span className="text-xs font-bold">
                  {selectedTenant?.naziv?.charAt(0) || "P"}
                </span>
              </div>
              <span
                className="hidden sm:inline-block max-w-[100px] truncate"
                title={selectedTenant?.naziv || "Portfelj"}
              >
                {selectedTenant?.naziv || "Portfelj"}
              </span>
            </div>
            <ChevronDown className="h-3 w-3 text-muted-foreground opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          <DropdownMenuLabel>Moji portfelji</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {loadingTenants && (
            <DropdownMenuItem disabled>Učitavanje...</DropdownMenuItem>
          )}
          {tenantsError && !loadingTenants && (
            <DropdownMenuItem
              className="text-destructive"
              onSelect={(event) => {
                event.preventDefault();
                loadTenants();
              }}
            >
              Nije moguće učitati portfelje — pokušaj ponovo
            </DropdownMenuItem>
          )}
          {!loadingTenants && !tenantsError && sortedTenants.length === 0 && (
            <DropdownMenuItem disabled>Još nema portfelja</DropdownMenuItem>
          )}
          {sortedTenants.map((tenant) => {
            const isActive = tenant.id === tenantId;
            return (
              <DropdownMenuItem
                key={tenant.id}
                onSelect={(event) => {
                  event.preventDefault();
                  handleSelectTenant(tenant.id);
                }}
                className="flex flex-col items-start gap-1 py-2"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {tenant.naziv || "Bez naziva"}
                  </span>
                  {isActive && <Check className="h-4 w-4 text-primary" />}
                </div>
                {tenant.role && (
                  <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    {formatRoleLabel(tenant.role)}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  Status: {tenant.status}
                </span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              handleNavigateSettings();
            }}
          >
            <Cog className="mr-2 h-4 w-4" /> Postavke
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              handleNavigateHelp();
            }}
          >
            <HelpCircle className="mr-2 h-4 w-4" /> Kako koristiti
          </DropdownMenuItem>
          {onLogout && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                handleLogout();
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" /> Odjava
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
