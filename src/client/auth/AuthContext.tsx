import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "../lib/types";

interface ErrorBody { error?: { message?: string } }

async function authRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ErrorBody;
    throw new Error(body.error?.message || `Request failed (${response.status})`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await authRequest<{ user: User }>("/api/auth/me");
      setUser(response.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await authRequest<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    setUser(response.user);
    return response.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authRequest<void>("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
