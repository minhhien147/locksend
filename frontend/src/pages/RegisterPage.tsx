import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useClearPageDraft, useDraftState } from "../hooks/useDraftState";
import { clearPageDraft } from "../utils/pageDraft";

const REGISTER_PAGE_KEY = "auth-register";
const LOGIN_PAGE_KEY = "auth-login";
import { LockSendLogoHero, LockSendMark } from "../components/LockSendLogo";
import { LoadingSpinner } from "../components/LoadingSpinner";
import ThemeToggle from "../components/ThemeToggle";
import LanguageToggle from "../components/LanguageToggle";
import Card from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import AuthPageLayout from "../components/AuthPageLayout";
import AuthHero from "../components/AuthHero";
import GoogleSignInButton from "../components/GoogleSignInButton";
import { useT, translateError } from "../i18n/context";
import { shell, inputBase, text, brand, label, btn, linkAccent } from "../styles/theme";

export default function RegisterPage() {
  const t = useT();
  const { register, loginWithGoogle, isLoading } = useAuth();
  const navigate = useNavigate();

  const clearRegisterDraft = useClearPageDraft(REGISTER_PAGE_KEY);
  const [displayName, setDisplayName] = useDraftState(REGISTER_PAGE_KEY, "displayName", "");
  const [username, setUsername] = useDraftState(REGISTER_PAGE_KEY, "username", "");
  const [password, setPassword] = useDraftState(REGISTER_PAGE_KEY, "password", "", "memory");
  const [confirmPassword, setConfirmPassword] = useDraftState(
    REGISTER_PAGE_KEY,
    "confirmPassword",
    "",
    "memory"
  );
  const [showPassword, setShowPassword] = useDraftState(REGISTER_PAGE_KEY, "showPassword", false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleLogin = async (credential: string) => {
    setError(null);
    setGoogleLoading(true);
    try {
      const res = await loginWithGoogle(credential);
      clearRegisterDraft();
      clearPageDraft(LOGIN_PAGE_KEY);
      navigate(res.email_verified === false ? "/verify-email" : "/", { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t("auth.googleLoginFailed");
      setError(translateError(t, msg));
    } finally {
      setGoogleLoading(false);
    }
  };

  const passwordStrength = (p: string): { label: string; color: string; width: string } => {
    if (p.length === 0) return { label: "", color: "", width: "0%" };
    if (p.length < 8) return { label: t("auth.strengthWeak"), color: "bg-rose-500", width: "25%" };
    if (!/[A-Z]/.test(p) || !/[0-9]/.test(p))
      return { label: t("auth.strengthFair"), color: "bg-amber-500", width: "60%" };
    if (p.length >= 12 && /[^A-Za-z0-9]/.test(p))
      return { label: t("auth.strengthStrong"), color: "bg-emerald-500", width: "100%" };
    return { label: t("auth.strengthGood"), color: "bg-blue-500", width: "80%" };
  };

  const strength = passwordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("auth.passwordMin"));
      return;
    }

    try {
      const res = await register(username, password, displayName || undefined);
      clearRegisterDraft();
      clearPageDraft(LOGIN_PAGE_KEY);
      navigate(res.email_verified === false ? "/verify-email" : "/", { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t("auth.registerFailed");
      setError(translateError(t, msg));
    }
  };

  return (
    <AuthPageLayout>
      <div className={`ls-auth-aside ${shell.authAside}`}>
        <LockSendLogoHero />
        <AuthHero variant="register" />
        <p className={`text-[11px] ${text.faint}`}>FPT University · Information Security</p>
      </div>

      <div className={`ls-auth-panel ${shell.authPanel}`}>
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <div className="w-full max-w-[400px] space-y-7">
          <div className="flex items-center gap-3 lg:hidden">
            <LockSendMark className="h-10 w-auto" />
            <span className={`font-semibold ${text.primary}`}>
              Lock<span className={brand.send}>Send</span>
            </span>
          </div>

          <Card className="space-y-6" padding="md">
            <h1 className={`text-lg font-semibold ${text.primary}`}>{t("auth.register")}</h1>

            {error && <Alert tone="error">{error}</Alert>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className={label}>
                  {t("auth.displayName")}{" "}
                  <span className={text.faint}>({t("common.optional")})</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t("auth.displayNamePlaceholder")}
                  className={`w-full rounded-lg px-3.5 py-2.5 text-sm ${inputBase}`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={label}>
                  {t("auth.email")} <span className="text-rose-500 dark:text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="you@example.com"
                  className={`w-full rounded-lg px-3.5 py-2.5 text-sm ${inputBase}`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={label}>
                  {t("auth.password")} <span className="text-rose-500 dark:text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("auth.passwordPlaceholder")}
                    className={`w-full rounded-lg px-3.5 py-2.5 pr-10 text-sm ${inputBase}`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((p) => !p)}
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 ${text.faint} hover:opacity-80 transition`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      {showPassword ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      ) : (
                        <>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
                {password.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    <div className="h-1 bg-slate-200 dark:bg-white/[0.08] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-300 ${strength.color}`} style={{ width: strength.width }} />
                    </div>
                    <p className={`text-[11px] ${text.muted}`}>{strength.label}</p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className={label}>
                  {t("auth.confirmPassword")} <span className="text-rose-500 dark:text-rose-400">*</span>
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("auth.confirmPasswordPlaceholder")}
                  className={`w-full rounded-lg px-3.5 py-2.5 text-sm ${inputBase} border ${
                    confirmPassword && confirmPassword !== password
                      ? "border-rose-500/50 focus:ring-rose-500/30"
                      : confirmPassword && confirmPassword === password
                        ? "border-emerald-500/50 focus:ring-emerald-500/30"
                        : ""
                  }`}
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="text-[11px] text-rose-500 dark:text-rose-400 mt-1">{t("auth.passwordMismatch")}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading || googleLoading || password !== confirmPassword}
                className={`w-full flex items-center justify-center gap-2 mt-1 ${btn.primary}`}
              >
                {isLoading && <LoadingSpinner size="sm" />}
                {isLoading ? t("auth.registering") : t("auth.createAccount")}
              </button>
            </form>

            <GoogleSignInButton
              onSuccess={handleGoogleLogin}
              onError={() => setError(t("auth.googleLoginFailed"))}
              disabled={isLoading || googleLoading}
            />

            <p className={`text-center text-[13px] pt-1 ${text.faint}`}>
              {t("auth.hasAccount")}{" "}
              <Link to="/login" className={linkAccent}>
                {t("auth.login")}
              </Link>
            </p>
          </Card>
        </div>
      </div>
    </AuthPageLayout>
  );
}
