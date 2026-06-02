import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useClearPageDraft, useDraftState } from "../hooks/useDraftState";
import { clearPageDraft } from "../utils/pageDraft";

const LOGIN_PAGE_KEY = "auth-login";
import { LockSendLogoHero, LockSendMark } from "../components/LockSendLogo";
import { LoadingSpinner } from "../components/LoadingSpinner";
import ThemeToggle from "../components/ThemeToggle";
import Card from "../components/ui/Card";
import Alert from "../components/ui/Alert";
import AuthPageLayout from "../components/AuthPageLayout";
import AuthHero from "../components/AuthHero";
import { shell, inputBase, text, brand, label, btn, linkAccent } from "../styles/theme";

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || "/";

  const clearLoginDraft = useClearPageDraft(LOGIN_PAGE_KEY);
  const [username, setUsername] = useDraftState(LOGIN_PAGE_KEY, "username", "");
  const [password, setPassword] = useDraftState(LOGIN_PAGE_KEY, "password", "", "memory");
  const [showPassword, setShowPassword] = useDraftState(LOGIN_PAGE_KEY, "showPassword", false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
      clearLoginDraft();
      clearPageDraft("auth-register");
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Đăng nhập thất bại. Kiểm tra lại email/mật khẩu.";
      setError(msg);
    }
  };

  return (
    <AuthPageLayout>
      <div className={`ls-auth-aside ${shell.authAside}`}>
        <LockSendLogoHero />
        <AuthHero variant="login" />
        <p className={`text-[11px] ${text.faint}`}>FPT University · Information Security</p>
      </div>

      <div className={`ls-auth-panel ${shell.authPanel}`}>
        <div className="absolute top-4 right-4 z-20">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-[380px] space-y-7">
          <div className="flex items-center gap-3 lg:hidden">
            <LockSendMark className="h-10 w-auto" />
            <span className={`font-semibold ${text.primary}`}>
              Lock<span className={brand.send}>Send</span>
            </span>
          </div>

          <Card className="space-y-6" padding="md">
            <h1 className={`text-lg font-semibold ${text.primary}`}>Đăng nhập</h1>

            {error && <Alert tone="error">{error}</Alert>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className={label}>Email hoặc tên đăng nhập</label>
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="you@example.com"
                  className={`w-full rounded-lg px-3.5 py-2.5 text-sm ${inputBase}`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={label}>Mật khẩu</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`w-full rounded-lg px-3.5 py-2.5 pr-10 text-sm ${inputBase}`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((p) => !p)}
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 ${text.faint} hover:opacity-80 transition`}
                  >
                    {showPassword ? (
                      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full flex items-center justify-center gap-2 mt-1 ${btn.primary}`}
              >
                {isLoading && <LoadingSpinner size="sm" />}
                {isLoading ? "Đang đăng nhập..." : "Đăng nhập"}
              </button>
            </form>

            <p className={`text-center text-[13px] pt-1 ${text.faint}`}>
              Chưa có tài khoản?{" "}
              <Link to="/register" className={linkAccent}>
                Đăng ký
              </Link>
            </p>
          </Card>
        </div>
      </div>
    </AuthPageLayout>
  );
}
