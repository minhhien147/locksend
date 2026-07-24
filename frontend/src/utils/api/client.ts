/**
 * client.ts — Axios instance, in-memory token management, silent refresh.
 *
 * Token strategy:
 *   - Access token: lưu trong bộ nhớ JS (module-level var).
 *                   KHÔNG dùng localStorage → không bị XSS đọc.
 *   - Refresh token: httpOnly cookie set bởi backend.
 *                    Không đọc được từ JS.
 *
 * Silent refresh:
 *   Khi nhận 401, interceptor tự gọi POST /auth/refresh (cookie gửi tự động).
 *   Nếu thành công → cập nhật access token trong memory + retry request gốc.
 *   Nếu thất bại   → redirect về /login.
 */

import axios from "axios";

/** Lấy `detail` từ FastAPI (503/422…) thay vì message axios mặc định. */
export function apiErrorDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response
    ?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (typeof d === "object" && d && "msg" in d ? String(d.msg) : ""))
      .filter(Boolean);
    if (msgs.length) return msgs.join(", ");
  }
  return (err as Error)?.message ?? fallback;
}

/** Dev: .env.local VITE_API_URL=/api. Prod (Railway): bắt buộc set VITE_API_URL trỏ backend. */
function resolveApiBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.DEV) return "/api";
  return "";
}

export const BASE_URL = resolveApiBaseUrl();

if (import.meta.env.PROD && !BASE_URL) {
  console.error(
    "[LockSend] Thiếu VITE_API_URL. Railway (frontend service) → Variables → " +
      "VITE_API_URL = URL backend (vd. https://locksend-be-production.up.railway.app), rồi Redeploy."
  );
}

// ── In-memory access token ────────────────────────────────────────────────────

let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

/** Decode JWT payload (không verify signature — chỉ dùng cho display/meta). */
export function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── Axios instance ────────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 300_000,
  withCredentials: true,
});

// ── Silent refresh state ──────────────────────────────────────────────────────

let _isRefreshing = false;
let _waitQueue: Array<(token: string) => void> = [];

function _drainQueue(newToken: string) {
  _waitQueue.forEach((resolve) => resolve(newToken));
  _waitQueue = [];
}

function _failQueue() {
  _waitQueue = [];
}

// ── Request interceptor: đính kèm access token ────────────────────────────────

api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

// ── Response interceptor: silent refresh on 401 ───────────────────────────────

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    if (
      err.response?.status !== 401 ||
      original._retried ||
      original.url?.includes("/auth/refresh")
    ) {
      return Promise.reject(err);
    }

    original._retried = true;

    if (_isRefreshing) {
      return new Promise<string>((resolve) => {
        _waitQueue.push(resolve);
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    _isRefreshing = true;

    try {
      // Lazy import để tránh circular dependency
      const { authApi } = await import("./auth");
      const res = await authApi.refresh();
      const newToken = res.access_token;
      setAccessToken(newToken);
      _drainQueue(newToken);
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch {
      setAccessToken(null);
      _failQueue();
      window.location.href = "/login";
      return Promise.reject(err);
    } finally {
      _isRefreshing = false;
    }
  }
);

export default api;
