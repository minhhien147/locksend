import React, { useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import UploadPage from "./pages/UploadPage";
import DownloadPage from "./pages/DownloadPage";
import KeyManagement from "./pages/KeyManagement";
import StressTestPage from "./pages/StressTestPage";
import AdminLayout from "./pages/AdminLayout";
import AdminUsersPage from "./pages/AdminUsersPage";
import HistoryPage from "./pages/HistoryPage";
import { LockSendMark } from "./components/LockSendLogo";
import ChangePasswordDialog from "./components/ChangePasswordDialog";
import FloatingCryptoIcons from "./components/FloatingCryptoIcons";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

const ROLE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  owner:     { label: "Owner",     color: "text-indigo-400 bg-indigo-400/10 ring-indigo-400/20", dot: "bg-indigo-400" },
  recipient: { label: "Recipient", color: "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20", dot: "bg-emerald-400" },
  admin:     { label: "Admin",     color: "text-rose-400 bg-rose-400/10 ring-rose-400/20", dot: "bg-rose-400" },
};

function AppShell() {
  const { user, logout, changePassword } = useAuth();
  const [pwdOpen, setPwdOpen] = useState(false);
  const role = user?.role ?? "owner";
  const roleCfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.owner;
  const isRecipient = role === "recipient";
  const isAdmin = role === "admin";
  const initials = (user?.display_name || user?.email || "U").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-[#0b0d12] text-white flex flex-col relative overflow-hidden">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-indigo-600/[0.07] blur-[130px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-violet-700/[0.06] blur-[120px]" />
        <div className="absolute top-[45%] left-[35%] w-[350px] h-[350px] rounded-full bg-sky-600/[0.04] blur-[100px]" />
      </div>

      <FloatingCryptoIcons />

      {/* ── Top navigation bar ── */}
      <header className="sticky top-0 z-50 bg-[#0b0d12]/90 backdrop-blur border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between gap-4">

          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <LockSendMark />
            <span className="font-bold text-[15px] tracking-tight">
              <span className="text-white">Lock</span><span className="text-indigo-400">Send</span>
            </span>
          </div>

          {/* Nav links */}
          <nav className="flex items-center gap-0.5 flex-1 justify-center">
            {!isRecipient && <TopNavItem to="/" label="Upload" icon="upload" />}
            <TopNavItem to="/download" label="Download" icon="download" />
            {!isRecipient && <TopNavItem to="/history" label="History" icon="history" />}
            <TopNavItem to="/keys" label="Keys" icon="key" />
            {isAdmin && <TopNavItem to="/admin" label="Admin" icon="admin" danger />}
          </nav>

          {/* User menu */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2.5 pl-3 border-l border-white/[0.08]">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[11px] font-bold text-white shadow-md">
                {initials}
              </div>
              <div className="hidden sm:flex flex-col leading-none">
                <span className="text-[12px] font-medium text-white/80 max-w-[110px] truncate">
                  {user?.display_name || user?.email}
                </span>
                <span className={`text-[10px] font-semibold mt-0.5 px-1.5 py-0.5 rounded-full ring-1 w-fit ${roleCfg.color}`}>
                  {roleCfg.label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPwdOpen(true)}
                title="Đổi mật khẩu"
                className="p-1.5 rounded-lg text-white/30 hover:text-indigo-400 hover:bg-indigo-400/10 transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </button>
              <button
                onClick={() => void logout()}
                title="Sign out"
                className="ml-1 p-1.5 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-400/10 transition"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-5 py-8 relative z-10">
        <Routes>
          <Route path="/" element={isRecipient ? <DownloadPage /> : <UploadPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/keys" element={<KeyManagement />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/stress-test" element={<Navigate to="/admin/stress" replace />} />
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="stress" element={<StressTestPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.05] py-5 text-center">
        <p className="text-[11px] text-white/20">FPT University — Information Security</p>
      </footer>
      <ChangePasswordDialog
        open={pwdOpen}
        onClose={() => setPwdOpen(false)}
        onSubmit={(current, next) => changePassword(current, next)}
      />
    </div>
  );
}

const NAV_ICONS: Record<string, React.ReactElement> = {
  upload: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  ),
  download: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  ),
  history: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  key: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  ),
  admin: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
};

function TopNavItem({
  to, label, icon, danger,
}: {
  to: string; label: string; icon: string; danger?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all duration-150 ${
          isActive
            ? danger
              ? "bg-rose-500/15 text-rose-400"
              : "bg-indigo-500/15 text-indigo-400"
            : danger
            ? "text-white/40 hover:text-rose-400 hover:bg-rose-400/10"
            : "text-white/40 hover:text-white/80 hover:bg-white/[0.06]"
        }`
      }
    >
      {NAV_ICONS[icon]}
      {label}
    </NavLink>
  );
}
