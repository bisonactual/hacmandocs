import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { PermissionLevel } from "@hacmandocs/shared";
import { apiFetch } from "../lib/api";

interface AuthUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  permissionLevel: PermissionLevel;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  loginWithMember: (username: string, password: string) => Promise<void>;
  loginWithOAuth: (provider?: "github" | "google") => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "session_token";
const USER_KEY = "session_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? (JSON.parse(stored) as AuthUser) : null;
  });
  const [loading, setLoading] = useState(false);

  // Validate session on mount
  useEffect(() => {
    if (!token) return;

    apiFetch<Record<string, unknown>>("/api/users/me")
      .then((raw) => {
        const u: AuthUser = {
          id: raw.id as string,
          name: raw.name as string,
          email: raw.email as string,
          username: (raw.username as string | null) ?? null,
          permissionLevel: raw.permission_level as PermissionLevel ?? raw.permissionLevel as PermissionLevel,
        };
        setUser(u);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
      })
      .catch(() => {
        // Session invalid/expired — clear
        setToken(null);
        setUser(null);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      });
  }, [token]);

  const loginWithMember = useCallback(
    async (username: string, password: string) => {
      setLoading(true);
      try {
        const data = await apiFetch<{ token: string; expiresAt: number }>(
          "/auth/member/login",
          {
            method: "POST",
            body: JSON.stringify({ username, password }),
          },
        );
        localStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loginWithOAuth = useCallback((provider: "github" | "google" = "github") => {
    const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
    window.location.href = `${apiUrl}/auth/oauth/login?provider=${provider}`;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, loginWithMember, loginWithOAuth, logout }),
    [user, token, loading, loginWithMember, loginWithOAuth, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
