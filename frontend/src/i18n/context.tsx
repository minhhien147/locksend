import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en, type EnDict } from "./locales/en";
import { vi } from "./locales/vi";

export type Locale = "en" | "vi";

const STORAGE_KEY = "locksend-locale";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  dict: EnDict;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLocale(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "vi") return v;
  } catch {
    /* ignore */
  }
  return "en";
}

function getNested(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return Object.entries(params).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    template
  );
}

const dictionaries: Record<Locale, EnDict> = { en, vi };

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "en" ? "vi" : "en");
  }, [locale, setLocale]);

  const dict = dictionaries[locale];

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const raw = getNested(dict as unknown as Record<string, unknown>, key)
        ?? getNested(en as unknown as Record<string, unknown>, key)
        ?? key;
      return interpolate(raw, params);
    },
    [dict]
  );

  const value = useMemo(
    () => ({ locale, setLocale, toggleLocale, dict, t }),
    [locale, setLocale, toggleLocale, dict, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export function useT() {
  return useLanguage().t;
}

/** Map API / crypto error codes and known backend Vietnamese messages */
export function translateError(t: LanguageContextValue["t"], message: string): string {
  const code = message.trim();
  const fromCode = getNested(
    { errors: dictionaries.en.errors } as unknown as Record<string, unknown>,
    `errors.${code}`
  );
  if (fromCode) return t(`errors.${code}`);

  const apiMap: Record<string, string> = {
    "Thiếu Authorization header": "Missing Authorization header",
    "Tên đăng nhập hoặc mật khẩu không đúng": "auth.loginFailed",
    "Email hoặc mật khẩu không đúng": "auth.loginFailed",
    "Tên đăng nhập đã được sử dụng": "Username already taken",
    "Email đã được sử dụng bởi tài khoản khác": "Email already in use by another account",
    "Email không hợp lệ": "profile.emailInvalid",
    "Owner chưa có email hợp lệ để nhận cảnh báo qua mail. Yêu cầu owner cập nhật email trong trang Hồ sơ.":
      "admin.ownerEmailInvalidHint",
    "Mã xác minh không đúng hoặc đã hết hạn": "verifyEmail.verifyFailed",
    EMAIL_NOT_VERIFIED: "verifyEmail.title",
    "Yêu cầu quyền admin": "Admin access required",
  };
  const mapped = apiMap[code];
  if (mapped?.startsWith("auth.")) return t(mapped);
  if (mapped) return mapped;
  return message;
}
