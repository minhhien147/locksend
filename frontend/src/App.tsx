import React, { useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import ThemeToggle from "./components/ThemeToggle";
import { shell, header, nav, text, brand } from "./styles/theme";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import UploadPage from "./pages/UploadPage";
import DownloadPage from "./pages/DownloadPage";
import KeyManagement from "./pages/KeyManagement";
import StressTestPage from "./pages/StressTestPage";
import AdminLayout from "./pages/AdminLayout";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminTokenSecurityPage from "./pages/AdminTokenSecurityPage";
import HistoryPage from "./pages/HistoryPage";
import { LockSendMark } from "./components/LockSendLogo";
import ChangePasswordDialog from "./components/ChangePasswordDialog";
import { useKeySync } from "./hooks/useKeySync";
import FloatingCryptoIcons from "./components/FloatingCryptoIcons";
import { badge } from "./styles/theme";

export default function App() {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
}

const ROLE_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  owner:     { label: "Owner",     badgeClass: badge.info },
  recipient: { label: "Recipient", badgeClass: badge.success },
  admin:     { label: "Admin",     badgeClass: badge.danger },
};

function AppShell() {
  const { user, logout, changePassword } = useAuth();
  useKeySync(!!user && user.role !== "recipient");
  const [pwdOpen, setPwdOpen] = useState(false);
  const role = user?.role ?? "owner";
  const roleCfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.owner;
  const isRecipient = role === "recipient";
  const isAdmin = role === "admin";
  const initials = (user?.display_name || user?.email || "U").slice(0, 2).toUpperCase();

  return (
    <div className={shell.page}>
      <FloatingCryptoIcons />

      {/* ── Top navigation bar ── */}
      <header className={header.bar}>
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between gap-4">

          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <LockSendMark />
            <span className="font-bold text-[15px] tracking-tight">
              <span className={brand.lock}>Lock</span><span className={brand.send}>Send</span>
            </span>
          </div>

          {/* Nav links */}
          <nav className="flex items-center gap-0.5 flex-1 justify-center">
            {!isRecipient && <TopNavItem to="/" label="Upload" icon="upload" />}
            <TopNavItem to="/download" label="Download" icon="download" />
            <TopNavItem to="/history" label="Lịch sử" icon="history" />
            <TopNavItem to="/keys" label="Keys" icon="key" />
            {isAdmin && <TopNavItem to="/admin" label="Admin" icon="admin" danger />}
          </nav>

          {/* User menu */}
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <div className={`flex items-center gap-2.5 pl-3 border-l ${header.divider}`}>
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[11px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                {initials}
              </div>
              <div className="hidden sm:flex flex-col leading-none gap-0.5">
                <span className={`text-[12px] font-medium max-w-[110px] truncate ${text.secondary}`}>
                  {user?.display_name || user?.email}
                </span>
                <span className={`${roleCfg.badgeClass} w-fit`}>
                  {roleCfg.label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPwdOpen(true)}
                title="Đổi mật khẩu"
                className={`p-1.5 rounded-lg transition ${text.faint} hover:text-indigo-600 hover:bg-indigo-200/50 dark:hover:text-indigo-400 dark:hover:bg-indigo-400/10`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </button>
              <button
                onClick={() => void logout()}
                title="Sign out"
                className={`ml-1 p-1.5 rounded-lg transition ${text.faint} hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-400/10`}
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
          <Route path="/shared" element={<Navigate to="/history" replace />} />
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
            <Route path="token-security" element={<AdminTokenSecurityPage />} />
            <Route path="stress" element={<StressTestPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* ── Footer ── */}
      <footer className={header.footer}>
        <p className={`text-[11px] ${text.faint}`}>FPT University — Information Security</p>
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
  inbox: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
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
              ? nav.activeDanger
              : nav.active
            : danger
            ? nav.inactiveDanger
            : nav.inactive
        }`
      }
    >
      {NAV_ICONS[icon]}
      {label}
    </NavLink>
  );
}
