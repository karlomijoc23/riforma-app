import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Building,
  Users,
  Calendar,
  Wrench,
  Pickaxe,
  TrendingUp,
  Truck,
  Search,
  X,
  Menu,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import logoMain from "../assets/riforma-logo.png";
import { useAuth } from "../shared/auth";
import { useEntityStore } from "../shared/entityStore";
import { api } from "../shared/api";
import { TenantSwitcher } from "./TenantSwitcher";
import { NotificationBell } from "./NotificationBell";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const CATEGORY_META = {
  nekretnine: {
    label: "Nekretnine",
    icon: Building,
    path: "/nekretnine",
    display: (item) => item.naziv || item.adresa || "Nekretnina",
  },
  zakupnici: {
    label: "Zakupnici",
    icon: Users,
    path: "/zakupnici",
    display: (item) =>
      item.naziv_firme || item.ime_prezime || item.kontakt_email || "Zakupnik",
  },
  ugovori: {
    label: "Ugovori",
    icon: Calendar,
    path: "/ugovori",
    display: (item) => item.interna_oznaka || "Ugovor",
  },
};

export const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { ugovori } = useEntityStore();

  // Count ugovori na isteku (status === "na_isteku")
  const ugovoriNaIstekuCount = ugovori
    ? ugovori.filter((u) => u.status === "na_isteku").length
    : 0;

  // Global search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef(null);
  const searchInputRef = useRef(null);
  const debounceRef = useRef(null);

  const handleLogout = useCallback(() => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  // Expand search and focus input
  const handleExpandSearch = useCallback(() => {
    setSearchExpanded(true);
    // Focus after DOM updates
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  // Collapse search if empty and blurred
  const handleSearchBlur = useCallback(() => {
    if (!searchQuery.trim()) {
      // Small delay so click on result doesn't close
      setTimeout(() => {
        if (
          !searchInputRef.current ||
          document.activeElement !== searchInputRef.current
        ) {
          setSearchExpanded(false);
          setSearchOpen(false);
        }
      }, 200);
    }
  }, [searchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults(null);
    setSearchOpen(false);
    setSearchExpanded(false);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.globalSearch(searchQuery.trim());
        setSearchResults(res.data);
        setSearchOpen(true);
      } catch {
        setSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
        if (!searchQuery.trim()) {
          setSearchExpanded(false);
        }
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchQuery]);

  // Close on route change
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchExpanded(false);
  }, [location.pathname]);

  // Keyboard shortcut: Ctrl+K or Cmd+K to open search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        handleExpandSearch();
      }
      if (e.key === "Escape" && searchExpanded) {
        handleClearSearch();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleExpandSearch, handleClearSearch, searchExpanded]);

  const totalResults = searchResults
    ? Object.values(searchResults).reduce(
        (sum, arr) => sum + (arr?.length || 0),
        0,
      )
    : 0;

  const navItems = [
    { path: "/", icon: Home, label: "Dashboard" },
    { path: "/nekretnine", icon: Building, label: "Nekretnine" },
    { path: "/zakupnici", icon: Users, label: "Zakupnici" },
    {
      path: "/ugovori",
      icon: Calendar,
      label: "Ugovori",
      badge: ugovoriNaIstekuCount > 0 ? ugovoriNaIstekuCount : null,
    },
    { path: "/odrzavanje", icon: Wrench, label: "Održavanje" },
    { path: "/projekti", icon: Pickaxe, label: "Projekti" },
    { path: "/analiza-cijena", icon: TrendingUp, label: "Cijene" },
    { path: "/dobavljaci", icon: Truck, label: "Dobavljaci" },
  ];

  const renderSearchDropdown = () => {
    if (!searchOpen || !searchResults) return null;
    return (
      <div className="absolute top-full left-0 right-0 mt-1 min-w-[280px] bg-white rounded-lg border border-border shadow-lg z-50 max-h-80 overflow-y-auto">
        {totalResults === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">
            Nema rezultata za &quot;{searchQuery}&quot;
          </div>
        ) : (
          Object.entries(searchResults).map(([category, items]) => {
            if (!items?.length) return null;
            const meta = CATEGORY_META[category];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <div key={category}>
                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase bg-muted/30">
                  {meta.label}
                </div>
                {items.map((item) => (
                  <button
                    key={item.id}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-primary/5 transition-colors text-left"
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery("");
                      setSearchExpanded(false);
                      navigate(meta.path);
                    }}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{meta.display(item)}</span>
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>
    );
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-border/60 bg-white/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {/* Desktop: Single row — logo | nav links | search + profile */}
        <div className="hidden md:flex items-center justify-between gap-2 h-14">
          {/* Left: Logo */}
          <Link to="/" className="flex items-center shrink-0">
            <img src={logoMain} alt="Riforma" className="h-9 w-auto" />
          </Link>

          {/* Center: Nav links */}
          <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-white/80 px-1.5 py-0.5 shadow-sm">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Right: Search + Profile */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative" ref={searchRef}>
              {searchExpanded ? (
                <div className="relative">
                  {searchLoading ? (
                    <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
                  ) : (
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  )}
                  <Input
                    ref={searchInputRef}
                    placeholder="Pretraži..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => searchResults && setSearchOpen(true)}
                    onBlur={handleSearchBlur}
                    className="w-48 pl-8 pr-8 h-8 text-sm animate-in fade-in slide-in-from-right-2 duration-200"
                  />
                  <button
                    onClick={handleClearSearch}
                    aria-label="Zatvori pretragu"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={handleExpandSearch}
                  title="Pretraži (Ctrl+K)"
                  aria-label="Pretraži (Ctrl+K)"
                >
                  <Search className="h-4 w-4" />
                </Button>
              )}
              {renderSearchDropdown()}
            </div>
            <NotificationBell />
            <TenantSwitcher onLogout={handleLogout} />
          </div>
        </div>

        {/* Mobile: logo + hamburger */}
        <div className="flex md:hidden items-center justify-between py-3">
          <Link to="/" className="flex items-center gap-3">
            <img src={logoMain} alt="Riforma" className="h-10 w-auto" />
          </Link>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <div className="flex flex-col gap-6 py-6">
                <div className="relative" ref={searchRef}>
                  <div className="relative">
                    {searchLoading ? (
                      <Loader2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
                    ) : (
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    )}
                    <Input
                      placeholder="Pretraži..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => searchResults && setSearchOpen(true)}
                      className="pl-8 pr-8 h-8 text-sm"
                    />
                    {searchQuery && (
                      <button
                        onClick={handleClearSearch}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {renderSearchDropdown()}
                </div>
                <div className="flex flex-col gap-2">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
                <div className="border-t pt-6 flex items-center justify-between">
                  <TenantSwitcher onLogout={handleLogout} />
                  <NotificationBell />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
};
