import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api, setActiveTenantId } from "./api";

const AuthContext = createContext(null);

// Check if we have an auth cookie (csrf_token is readable, so we use it as a
// signal that the user has logged in — the httpOnly access_token can't be read
// from JS).
const hasAuthCredential = () => {
  if (typeof document === "undefined") return false;
  return document.cookie.includes("csrf_token=");
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // One-time cleanup of legacy localStorage token from pre-cookie migration
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("authToken");
    }
  }, []);

  const syncUser = useCallback(async () => {
    if (!hasAuthCredential()) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await api.getCurrentUser();
      setUser(response.data || null);
    } catch (error) {
      console.error("Greška pri dohvaćanju korisnika", error);
      if (error.response && error.response.status === 401) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    syncUser();
  }, [syncUser]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setLoading(false);
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, []);

  const login = useCallback(
    async ({ email, password }) => {
      const response = await api.login({ email, password });
      // The backend sets httpOnly access_token + csrf_token cookies
      // automatically via Set-Cookie headers. No token in response body.
      const userData = response.data?.user;
      if (userData) {
        setUser(userData);
        if (userData.tenant_id) {
          setActiveTenantId(userData.tenant_id);
        }
        setLoading(false);
      } else {
        await syncUser();
      }
      return userData;
    },
    [syncUser],
  );

  const logout = useCallback(async () => {
    try {
      // Tell backend to clear httpOnly cookies
      await api.logout();
    } catch {
      // Ignore errors — user is logging out regardless
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      logout,
      refresh: syncUser,
    }),
    [user, loading, login, logout, syncUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
