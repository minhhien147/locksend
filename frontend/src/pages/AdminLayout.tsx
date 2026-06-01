import { NavLink, Outlet } from "react-router-dom";
import { admin, surfaceCardAdmin as surfaceCard, text } from "../styles/theme";

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
                ? admin.navActiveUsers
                : admin.navInactive
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
                ? admin.navActiveToken
                : admin.navInactive
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
                ? admin.navActiveStress
                : admin.navInactive
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
