import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { LockSendLogoHero, LockSendMark } from "../components/LockSendLogo";
import FloatingCryptoIcons from "../components/FloatingCryptoIcons";
import { LoadingSpinner } from "../components/LoadingSpinner";

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || "/";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Đăng nhập thất bại. Kiểm tra lại email/mật khẩu.";
      setError(msg);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0b0d12]">
      <div className="hidden lg:flex lg:w-[48%] xl:w-[44%] flex-col justify-between min-h-screen p-10 xl:p-14 bg-gradient-to-b from-[#141829] to-[#0b0d12] border-r border-white/[0.04] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-90">
          <div className="absolute top-0 right-0 w-[420px] h-[420px] rounded-full bg-indigo-600/[0.07] blur-[100px]" />
          <div className="absolute bottom-0 left-0 w-[320px] h-[320px] rounded-full bg-violet-600/[0.06] blur-[90px]" />
        </div>

        <FloatingCryptoIcons containerClassName="absolute inset-0 pointer-events-none overflow-hidden" />

        <div className="relative">
          <LockSendLogoHero />
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl xl:text-4xl font-bold text-white leading-[1.15] tracking-tight">
            Only you
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
              hold the key.
            </span>
          </h2>
        </div>

        <div className="relative">
          <p className="text-[11px] text-white/25">FPT University · Information Security</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-[#0b0d12] relative overflow-hidden">
        {/* Background decoration — right panel */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-15%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-600/[0.12] blur-[110px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-violet-700/[0.10] blur-[100px]" />
          <div className="absolute top-[40%] left-[20%] w-[260px] h-[260px] rounded-full bg-sky-600/[0.06] blur-[80px]" />
        </div>
        <div className="w-full max-w-[380px] space-y-7">
          <div className="flex items-center gap-3 lg:hidden">
            <LockSendMark className="h-8 w-auto" />
            <span className="font-semibold text-white">
              Lock<span className="text-indigo-400">Send</span>
            </span>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 sm:p-9 space-y-6">
            <div>
              <h1 className="text-xl font-semibold text-white">Welcome back</h1>
              <p className="mt-1 text-sm text-white/35">Đăng nhập để tiếp tục</p>
            </div>

            {error && (
              <div className="flex items-center gap-2.5 bg-rose-500/[0.08] border border-rose-500/20 rounded-lg px-3.5 py-2.5 text-sm text-rose-400/95">
                <svg className="w-4 h-4 shrink-0 opacity-90" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-white/45">Tên đăng nhập</label>
              <input
                type="text"
                required
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="john_doe"
                  className="w-full bg-[#12141c] border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-white/25
                         focus:outline-none focus:ring-1 focus:ring-indigo-500/60 focus:border-indigo-500/40 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-white/45">Mật khẩu</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#12141c] border border-white/[0.08] rounded-lg px-3.5 py-2.5 pr-10 text-sm text-white placeholder:text-white/25
                               focus:outline-none focus:ring-1 focus:ring-indigo-500/60 focus:border-indigo-500/40 transition"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-white/30 hover:text-white/55 transition"
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
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition
                           disabled:opacity-45 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
              >
                {isLoading && <LoadingSpinner size="sm" />}
                {isLoading ? "Đang đăng nhập..." : "Đăng nhập"}
              </button>
            </form>

            <p className="text-center text-[13px] text-white/28 pt-1">
              Chưa có tài khoản?{" "}
              <Link to="/register" className="text-indigo-400/90 hover:text-indigo-300 font-medium">
                Đăng ký
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
