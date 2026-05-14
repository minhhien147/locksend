import { NavLink, Outlet } from "react-router-dom";

const surfaceCard =
  "rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/40 via-[#0c0e14]/80 to-violet-950/20 shadow-lg shadow-black/20";

export default function AdminLayout() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-white tracking-tight">Admin</h1>
        <p className="text-sm text-white/45">Quản lý tài khoản và công cụ kỹ thuật chỉ dành cho admin</p>
      </header>

      <nav className={`${surfaceCard} p-1.5 inline-flex flex-wrap gap-1`}>
        <NavLink
          to="/admin/users"
          className={({ isActive }) =>
            `px-4 py-2 rounded-xl text-[13px] font-medium transition ${
              isActive
                ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30 shadow-sm"
                : "text-white/45 hover:text-white/80 hover:bg-white/[0.05]"
            }`
          }
        >
          Người dùng
        </NavLink>
        <NavLink
          to="/admin/stress"
          className={({ isActive }) =>
            `px-4 py-2 rounded-xl text-[13px] font-medium transition ${
              isActive
                ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30 shadow-sm"
                : "text-white/45 hover:text-white/80 hover:bg-white/[0.05]"
            }`
          }
        >
          Stress test
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
}
