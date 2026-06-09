import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { LockSendMark } from "../components/LockSendLogo";
import Card from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import { LoadingSpinner } from "../components/LoadingSpinner";
import ThemeToggle from "../components/ThemeToggle";
import LanguageToggle from "../components/LanguageToggle";
import AuthPageLayout from "../components/AuthPageLayout";
import { useT, translateError } from "../i18n/context";
import { authApi, fetchVerificationStatus } from "../utils/api";
import { shell, inputBase, text, brand, label, btn } from "../styles/theme";

export default function VerifyEmailPage() {
  const t = useT();
  const navigate = useNavigate();
  const { user, isLoading, applyTokenResponse, logout } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchVerificationStatus();
      if (s.email_verified) {
        navigate("/", { replace: true });
        return;
      }
      setCooldown(s.resend_cooldown_sec);
    } catch {
      /* ignore */
    }
  }, [navigate]);

  useEffect(() => {
    if (!isLoading && !user) return;
    void loadStatus();
  }, [isLoading, user, loadStatus]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus(null);
    const trimmed = code.replace(/\D/g, "");
    if (trimmed.length < 6) {
      setError(t("verifyEmail.codeInvalid"));
      return;
    }
    setBusy(true);
    try {
      const res = await authApi.verifyEmail(trimmed);
      applyTokenResponse(res);
      navigate("/", { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t("verifyEmail.verifyFailed");
      setError(translateError(t, typeof msg === "string" ? msg : t("verifyEmail.verifyFailed")));
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      await authApi.resendVerification();
      setStatus(t("verifyEmail.resent"));
      setCooldown(60);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t("verifyEmail.resendFailed");
      setError(translateError(t, typeof msg === "string" ? msg : t("verifyEmail.resendFailed")));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner size="lg" />;
  }

  return (
    <AuthPageLayout>
      <div className={`ls-auth-panel ${shell.authPanel} min-h-screen`}>
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <div className="w-full max-w-[400px] space-y-6">
          <div className="flex items-center gap-3">
            <LockSendMark className="h-10 w-auto" />
            <span className={`font-semibold ${text.primary}`}>
              Lock<span className={brand.send}>Send</span>
            </span>
          </div>

          <Card className="space-y-5" padding="md">
            <div>
              <h1 className={`text-lg font-semibold ${text.primary}`}>
                {t("verifyEmail.title")}
              </h1>
              <p className={`text-sm mt-2 ${text.muted}`}>
                {t("verifyEmail.subtitle", { email: user?.email ?? "" })}
              </p>
            </div>

            {error && <Alert tone="error">{error}</Alert>}
            {status && !error && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">{status}</p>
            )}

            <form onSubmit={(e) => void handleVerify(e)} className="space-y-4">
              <div className="space-y-1.5">
                <label className={label}>{t("verifyEmail.codeLabel")}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className={`w-full text-center text-2xl tracking-[0.4em] font-mono ${inputBase}`}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={busy || code.replace(/\D/g, "").length < 6}
                className={`w-full flex items-center justify-center gap-2 ${btn.primary}`}
              >
                {busy && <LoadingSpinner size="sm" />}
                {t("verifyEmail.submit")}
              </button>
            </form>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                disabled={busy || cooldown > 0}
                onClick={() => void handleResend()}
                className={`flex-1 text-sm ${btn.secondary}`}
              >
                {cooldown > 0
                  ? t("verifyEmail.resendIn", { sec: cooldown })
                  : t("verifyEmail.resend")}
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className={`flex-1 text-sm ${btn.ghost}`}
              >
                {t("common.signOut")}
              </button>
            </div>
          </Card>
        </div>
      </div>
    </AuthPageLayout>
  );
}
