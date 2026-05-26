import { NavLink, Outlet } from "react-router-dom";
import { surfaceCardAdmin as surfaceCard, text, nav } from "../styles/theme";

export default function AdminLayout() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <header>
        <h1 className={`text-2xl font-bold ${text.primary} tracking-tight`}>Admin</h1>
      </header>

      <nav className={`${surfaceCard} p-1.5 inline-flex flex-wrap gap-1`}>
        <NavLink
          to="/admin/users"
          className={({ isActive }) =>
            `px-4 py-2 rounded-xl text-[13px] font-medium transition ${
              isActive
                ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30 shadow-sm"
                : `${nav.inactive} hover:bg-slate-300/35 dark:hover:bg-white/[0.05]`
            }`
          }
        >
          Người dùng
        </NavLink>
        <NavLink
          to="/admin/token-security"
          className={({ isActive }) =>
            `px-4 py-2 rounded-xl text-[13px] font-medium transition ${
              isActive
                ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/30 shadow-sm"
                : `${nav.inactive} hover:bg-slate-300/35 dark:hover:bg-white/[0.05]`
            }`
          }
        >
          Token Security
        </NavLink>
        <NavLink
          to="/admin/stress"
          className={({ isActive }) =>
            `px-4 py-2 rounded-xl text-[13px] font-medium transition ${
              isActive
                ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30 shadow-sm"
                : `${nav.inactive} hover:bg-slate-300/35 dark:hover:bg-white/[0.05]`
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
