import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useContext,
  useRef,
} from "react";
import {
  api,
  getActiveTenantId,
  setActiveTenantId,
  subscribeToTenantChanges,
} from "./api";
import { sortUnitsByPosition } from "./units";

export const EntityStoreContext = React.createContext(null);

export const EntityStoreProvider = ({ children }) => {
  const [tenantId, setTenantId] = useState(() => getActiveTenantId());
  const [state, setState] = useState({
    nekretnine: [],
    zakupnici: [],
    ugovori: [],
    dokumenti: [],
    propertyUnits: [],
    maintenanceTasks: [],
    racuni: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Track which collections have been fetched for current tenant
  const loadedRef = useRef({
    nekretnine: false,
    zakupnici: false,
    ugovori: false,
    dokumenti: false,
    propertyUnits: false,
    maintenanceTasks: false,
    racuni: false,
  });
  // Track in-flight promises to avoid duplicate requests
  const inflightRef = useRef({});

  useEffect(() => {
    const unsubscribe = subscribeToTenantChanges((nextTenantId) => {
      setTenantId(nextTenantId);
    });
    return unsubscribe;
  }, []);

  // Reset on tenant change
  useEffect(() => {
    loadedRef.current = {
      nekretnine: false,
      zakupnici: false,
      ugovori: false,
      dokumenti: false,
      propertyUnits: false,
      maintenanceTasks: false,
      racuni: false,
    };
    inflightRef.current = {};
    setState({
      nekretnine: [],
      zakupnici: [],
      ugovori: [],
      dokumenti: [],
      propertyUnits: [],
      maintenanceTasks: [],
      racuni: [],
    });
  }, [tenantId]);

  const fetchNekretnine = useCallback(async () => {
    try {
      const res = await api.getNekretnine();
      const nekData = res.data || [];
      setState((prev) => ({ ...prev, nekretnine: nekData }));
      const unitsRes = await api.getUnits();
      setState((prev) => ({ ...prev, propertyUnits: unitsRes.data || [] }));
      loadedRef.current.nekretnine = true;
      loadedRef.current.propertyUnits = true;
    } catch (err) {
      console.error("Error fetching properties:", err);
    }
  }, []);

  const fetchZakupnici = useCallback(async () => {
    try {
      const res = await api.getZakupnici();
      setState((prev) => ({ ...prev, zakupnici: res.data || [] }));
      loadedRef.current.zakupnici = true;
    } catch (err) {
      console.error("Error fetching tenants:", err);
    }
  }, []);

  const fetchUgovori = useCallback(async () => {
    try {
      const res = await api.getUgovori();
      const ugovoriData = res.data || [];
      setState((prev) => {
        const enhancedUgovori = ugovoriData.map((ugovor) => {
          const zakupnik = prev.zakupnici.find(
            (z) => z.id === ugovor.zakupnik_id,
          );
          return {
            ...ugovor,
            zakupnik_naziv: zakupnik
              ? zakupnik.naziv_firme || zakupnik.ime_prezime || zakupnik.kontakt_email
              : null,
          };
        });
        return { ...prev, ugovori: enhancedUgovori };
      });
      loadedRef.current.ugovori = true;
    } catch (err) {
      console.error("Error fetching contracts:", err);
    }
  }, []);

  const fetchDokumenti = useCallback(async () => {
    try {
      const res = await api.getDokumenti();
      setState((prev) => ({ ...prev, dokumenti: res.data || [] }));
      loadedRef.current.dokumenti = true;
    } catch (err) {
      console.error("Error fetching documents:", err);
    }
  }, []);

  const fetchMaintenanceTasks = useCallback(async () => {
    try {
      const res = await api.getMaintenanceTasks();
      setState((prev) => ({ ...prev, maintenanceTasks: res.data || [] }));
      loadedRef.current.maintenanceTasks = true;
    } catch (err) {
      console.error("Error fetching maintenance tasks:", err);
    }
  }, []);

  const fetchRacuni = useCallback(async () => {
    try {
      const res = await api.getRacuni();
      setState((prev) => ({ ...prev, racuni: res.data || [] }));
      loadedRef.current.racuni = true;
    } catch (err) {
      console.error("Error fetching bills:", err);
    }
  }, []);

  // Lazy-load helpers: fetch only if not already loaded
  const ensureLoaded = useCallback((key, fetchFn) => {
    if (loadedRef.current[key]) return;
    if (inflightRef.current[key]) return;
    inflightRef.current[key] = true;
    fetchFn().finally(() => {
      inflightRef.current[key] = false;
    });
  }, []);

  const ensureNekretnine = useCallback(
    () => ensureLoaded("nekretnine", fetchNekretnine),
    [ensureLoaded, fetchNekretnine],
  );
  const ensureZakupnici = useCallback(
    () => ensureLoaded("zakupnici", fetchZakupnici),
    [ensureLoaded, fetchZakupnici],
  );
  const ensureUgovori = useCallback(
    () => ensureLoaded("ugovori", fetchUgovori),
    [ensureLoaded, fetchUgovori],
  );
  const ensureDokumenti = useCallback(
    () => ensureLoaded("dokumenti", fetchDokumenti),
    [ensureLoaded, fetchDokumenti],
  );
  const ensureMaintenanceTasks = useCallback(
    () => ensureLoaded("maintenanceTasks", fetchMaintenanceTasks),
    [ensureLoaded, fetchMaintenanceTasks],
  );
  const ensureRacuni = useCallback(
    () => ensureLoaded("racuni", fetchRacuni),
    [ensureLoaded, fetchRacuni],
  );

  // Full refresh — reload everything (used by mutation events and manual refresh)
  const loadEntities = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        api.getNekretnine(),
        api.getZakupnici(),
        api.getUgovori(),
        api.getDokumenti(),
        api.getUnits(),
        api.getMaintenanceTasks(),
        api.getRacuni(),
      ]);

      const extract = (r) =>
        r.status === "fulfilled" ? r.value.data || [] : [];
      const nekData = extract(results[0]);
      const zakupniciData = extract(results[1]);
      const ugData = extract(results[2]);
      const dokData = extract(results[3]);
      const unitData = extract(results[4]);
      const maintenanceData = extract(results[5]);
      const racuniData = extract(results[6]);

      const ugovoriData = ugData.map((ugovor) => {
        const zakupnik = zakupniciData.find((z) => z.id === ugovor.zakupnik_id);
        return {
          ...ugovor,
          zakupnik_naziv: zakupnik
            ? zakupnik.naziv_firme || zakupnik.ime_prezime || zakupnik.kontakt_email
            : null,
        };
      });

      setState({
        nekretnine: nekData,
        zakupnici: zakupniciData,
        ugovori: ugovoriData,
        dokumenti: dokData,
        propertyUnits: unitData,
        maintenanceTasks: maintenanceData,
        racuni: racuniData,
      });

      // Mark all as loaded
      Object.keys(loadedRef.current).forEach((k) => {
        loadedRef.current[k] = true;
      });

      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        console.warn(
          `${failures.length}/${results.length} API poziva nije uspjelo:`,
          failures.map((f) => f.reason),
        );
        setError(
          failures.length === results.length ? failures[0].reason : null,
        );
      } else {
        setError(null);
      }
    } catch (err) {
      console.error("Greška pri učitavanju entiteta:", err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  // Listener for auto-refresh events
  useEffect(() => {
    const handleMutation = (event) => {
      const resource = event.detail?.resource;
      if (!resource) return;

      if (resource === "nekretnine") {
        fetchNekretnine();
      } else if (resource === "zakupnici") {
        fetchZakupnici();
      } else if (resource === "ugovori") {
        fetchUgovori();
      } else if (resource === "dokumenti") {
        fetchDokumenti();
      } else if (resource === "maintenance") {
        fetchMaintenanceTasks();
      } else if (resource === "racuni") {
        fetchRacuni();
      } else if (resource === "tenants") {
        fetchZakupnici();
      }
    };

    window.addEventListener("entity:mutation", handleMutation);
    return () => {
      window.removeEventListener("entity:mutation", handleMutation);
    };
  }, [
    fetchNekretnine,
    fetchZakupnici,
    fetchUgovori,
    fetchDokumenti,
    fetchMaintenanceTasks,
    fetchRacuni,
  ]);

  const refreshMaintenanceTasks = fetchMaintenanceTasks;

  const syncDocument = useCallback((document) => {
    if (!document || !document.id) {
      return;
    }
    setState((prev) => {
      const current = Array.isArray(prev.dokumenti) ? prev.dokumenti : [];
      const index = current.findIndex((item) => item?.id === document.id);
      const nextDocuments =
        index === -1 ? [document, ...current] : [...current];
      if (index !== -1) {
        nextDocuments[index] = { ...current[index], ...document };
      }
      return { ...prev, dokumenti: nextDocuments };
    });
  }, []);

  const syncMaintenanceTask = useCallback((task) => {
    if (!task || !task.id) {
      return;
    }
    setState((prev) => {
      const current = Array.isArray(prev.maintenanceTasks)
        ? prev.maintenanceTasks
        : [];
      let replaced = false;
      const nextTasks = current.map((item) => {
        if (item?.id === task.id) {
          replaced = true;
          return { ...item, ...task };
        }
        return item;
      });

      if (!replaced) {
        nextTasks.unshift(task);
      }

      return { ...prev, maintenanceTasks: nextTasks };
    });
  }, []);

  // NO eager loading on mount — pages call ensure* instead

  const propertyUnitsById = useMemo(() => {
    const map = {};
    for (const unit of state.propertyUnits) {
      if (unit && unit.id) {
        map[unit.id] = unit;
      }
    }
    return map;
  }, [state.propertyUnits]);

  const propertyUnitsByProperty = useMemo(() => {
    const map = {};
    for (const unit of state.propertyUnits) {
      if (!unit || !unit.nekretnina_id) {
        continue;
      }
      if (!map[unit.nekretnina_id]) {
        map[unit.nekretnina_id] = [];
      }
      map[unit.nekretnina_id].push(unit);
    }

    Object.entries(map).forEach(([key, collection]) => {
      map[key] = sortUnitsByPosition(collection);
    });

    return map;
  }, [state.propertyUnits]);

  // Fix #5: changeTenant now triggers reset via tenantId dependency
  const changeTenant = useCallback((nextTenantId) => {
    const resolved = setActiveTenantId(nextTenantId);
    setTenantId(resolved);
    return resolved;
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      propertyUnitsById,
      propertyUnitsByProperty,
      loading,
      error,
      refresh: loadEntities,
      refreshMaintenanceTasks,
      refreshRacuni: fetchRacuni,
      syncDocument,
      syncMaintenanceTask,
      tenantId,
      changeTenant,
      // Lazy-load triggers
      ensureNekretnine,
      ensureZakupnici,
      ensureUgovori,
      ensureDokumenti,
      ensureMaintenanceTasks,
      ensureRacuni,
    }),
    [
      state,
      propertyUnitsById,
      propertyUnitsByProperty,
      loading,
      error,
      loadEntities,
      refreshMaintenanceTasks,
      fetchRacuni,
      syncDocument,
      syncMaintenanceTask,
      tenantId,
      changeTenant,
      ensureNekretnine,
      ensureZakupnici,
      ensureUgovori,
      ensureDokumenti,
      ensureMaintenanceTasks,
      ensureRacuni,
    ],
  );

  return (
    <EntityStoreContext.Provider value={value}>
      {children}
    </EntityStoreContext.Provider>
  );
};

export const useEntityStore = () => {
  const context = useContext(EntityStoreContext);
  if (!context) {
    throw new Error(
      "useEntityStore must be used within an EntityStoreProvider",
    );
  }
  return context;
};
