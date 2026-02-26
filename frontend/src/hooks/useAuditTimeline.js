import { useState, useCallback, useEffect } from "react";
import { api } from "../shared/api";

export const useAuditTimeline = (
  entityType,
  entityId,
  { parentId, limit = 20, enabled = true } = {},
) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const shouldFetch = enabled && Boolean(entityType || entityId || parentId);

  const fetchLogs = useCallback(
    async (options = {}) => {
      if (!shouldFetch) {
        setLogs([]);
        setError(null);
        if (!options.silent) {
          setLoading(false);
        }
        return;
      }

      if (!options.silent) {
        setLoading(true);
      }

      try {
        const params = { limit };
        if (entityType) {
          params.entity_type = entityType;
        }
        if (entityId) {
          params.entity_id = entityId;
        }
        if (parentId) {
          params.parent_id = parentId;
        }
        const response = await api.getAuditLogs(params);
        setLogs(response.data || []);
        setError(null);
      } catch (err) {
        console.error("Greška pri dohvaćanju audit zapisa:", err);
        setError("Audit zapis nije moguće učitati");
        setLogs([]);
      } finally {
        if (!options.silent) {
          setLoading(false);
        }
      }
    },
    [shouldFetch, entityType, entityId, parentId, limit],
  );

  useEffect(() => {
    let cancelled = false;

    if (!shouldFetch) {
      setLogs([]);
      setError(null);
      setLoading(false);
      return;
    }

    const run = async () => {
      setLoading(true);
      try {
        const params = { limit };
        if (entityType) {
          params.entity_type = entityType;
        }
        if (entityId) {
          params.entity_id = entityId;
        }
        if (parentId) {
          params.parent_id = parentId;
        }
        const response = await api.getAuditLogs(params);
        if (!cancelled) {
          setLogs(response.data || []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Greška pri dohvaćanju audit zapisa:", err);
          setError("Audit zapis nije moguće učitati");
          setLogs([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [shouldFetch, entityType, entityId, parentId, limit]);

  return {
    logs,
    loading,
    error,
    refresh: fetchLogs,
  };
};
