/**
 * AuthContext — quản lý trạng thái xác thực toàn cục.
 *
 * Access token: chỉ lưu trong memory (module var trong api.ts).
 *               Không còn localStorage → không bị XSS đọc.
 *
 * Refresh token: httpOnly cookie do backend quản lý.
 *               Frontend không đọc được, tự động gửi kèm request đến /auth/*.
 *
 * Silent refresh on mount:
 *   Mỗi lần load trang → gọi POST /auth/refresh.
 *   Nếu cookie còn hợp lệ → nhận access token mới, khôi phục session.
 *   Nếu không → user cần đăng nhập lại.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { authApi, setAccessToken } from "../utils/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // true trong khi đang kiểm tra session lúc đầu (tránh flash redirect về /login)
  const [isLoading, setIsLoading] = useState(true);

  // ── Silent refresh on mount ─────────────────────────────────────────────────
  useEffect(() => {
    authApi
      .refresh()
      .then((res) => {
        setAccessToken(res.access_token);
        setUser({
          user_id: res.user_id,
          email: res.email,
          display_name: res.display_name,
          role: res.role,
        });
      })
      .catch(() => {
        // Cookie không còn hoặc đã expire — cần đăng nhập lại
        setAccessToken(null);
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // ── Login ───────────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setAccessToken(res.access_token);
    setUser({
      user_id: res.user_id,
      email: res.email,
      display_name: res.display_name,
      role: res.role,
    });
  }, []);

  // ── Register ────────────────────────────────────────────────────────────────
  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const res = await authApi.register(email, password, displayName);
      setAccessToken(res.access_token);
      setUser({
        user_id: res.user_id,
        email: res.email,
        display_name: res.display_name,
        role: res.role,
      });
    },
    []
  );

  // ── Logout ──────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await authApi.logout(); // revoke refresh token trên server + xóa cookie
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      register,
      logout,
    }),
    [user, isLoading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải dùng trong <AuthProvider>");
  return ctx;
}
