import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import UploadPage from "./pages/UploadPage";
import DownloadPage from "./pages/DownloadPage";
import KeyManagement from "./pages/KeyManagement";
import StressTestPage from "./pages/StressTestPage";
import AdminPage from "./pages/AdminPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected routes — wrapped in shell */}
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

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  owner:     { label: "Owner",     color: "bg-indigo-100 text-indigo-700" },
  recipient: { label: "Recipient", color: "bg-emerald-100 text-emerald-700" },
  admin:     { label: "Admin",     color: "bg-rose-100 text-rose-700" },
};

function AppShell() {
  const { user, logout } = useAuth();
  const role = user?.role ?? "owner";
  const roleCfg = ROLE_CONFIG[role] ?? ROLE_CONFIG.owner;
  const isRecipient = role === "recipient";
  const isAdmin = role === "admin";

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-slate-100">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-indigo-700 tracking-tight">
              SecureShare
            </h1>
            <p className="text-xs text-gray-400">
              X25519 + AES-256-GCM + Ed25519 · Chunked
            </p>
          </div>

          <nav className="flex items-center gap-1">
            {/* Upload chỉ owner + admin */}
            {!isRecipient && <NavItem to="/" label="Upload" />}
            <NavItem to="/download" label="Download" />
            <NavItem to="/keys" label="Keys" />
            {!isRecipient && <NavItem to="/stress-test" label="Stress Test" highlight />}
            {/* Admin panel */}
            {isAdmin && <NavItem to="/admin" label="Admin" admin />}

            {/* User menu */}
            <div className="ml-3 flex items-center gap-2 pl-3 border-l border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-semibold">
                  {(user?.display_name || user?.email || "U")[0].toUpperCase()}
                </div>
                <div className="hidden sm:flex flex-col">
                  <span className="text-sm text-gray-700 max-w-[120px] truncate leading-tight">
                    {user?.display_name || user?.email}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full w-fit ${roleCfg.color}`}>
                    {roleCfg.label}
                  </span>
                </div>
              </div>
              <button
                onClick={() => void logout()}
                title="Đăng xuất"
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={isRecipient ? <DownloadPage /> : <UploadPage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/keys" element={<KeyManagement />} />
          <Route path="/stress-test" element={<StressTestPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="text-center py-6 text-xs text-gray-400">
        FPT University — An toàn Thông tin · Client-side Chunked Encryption · Azure Block Blob
      </footer>
    </div>
  );
}

function NavItem({
  to,
  label,
  highlight,
  admin,
}: {
  to: string;
  label: string;
  highlight?: boolean;
  admin?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `px-4 py-2 rounded-lg text-sm font-medium transition ${
          isActive
            ? admin
              ? "bg-rose-500 text-white"
              : highlight
              ? "bg-orange-500 text-white"
              : "bg-indigo-600 text-white"
            : admin
            ? "text-rose-600 hover:bg-rose-50 border border-rose-200"
            : highlight
            ? "text-orange-600 hover:bg-orange-50 border border-orange-200"
            : "text-gray-600 hover:bg-gray-100"
        }`
      }
    >
      {label}
    </NavLink>
  );
}
