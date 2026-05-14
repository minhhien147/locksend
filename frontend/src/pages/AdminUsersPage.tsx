import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import api from "../utils/api";
import PageLoader, { LoadingSpinner } from "../components/LoadingSpinner";

interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  created_at: string;
}

const ROLE_OPTIONS = ["owner", "recipient", "admin"] as const;
type Role = (typeof ROLE_OPTIONS)[number];

const surfaceCard =
  "rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/50 via-[#0c0e14]/95 to-violet-950/25 shadow-xl shadow-indigo-950/30";

const ROLE_BADGE: Record<Role, string> = {
  owner: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/35",
  recipient: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  admin: "bg-rose-500/15 text-rose-300 border border-rose-500/35",
};

const SELECT_BASE =
  "bg-[#12141c] border border-indigo-500/25 text-white text-xs font-medium rounded-lg px-2.5 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/40";

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get<UserRow[]>("/auth/admin/users");
      setUsers(res.data);
      setError(null);
    } catch {
      setError("Không thể tải danh sách user");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setChanging(userId);
    try {
      const res = await api.patch<UserRow>(`/auth/admin/users/${userId}/role`, {
        role: newRole,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: res.data.role } : u))
      );
    } catch {
      setError("Đổi role thất bại");
    } finally {
      setChanging(null);
    }
  };

  const handleDelete = async (userId: string, email: string | null) => {
    if (!confirm(`Xóa user "${email ?? userId}"? Hành động này không thể hoàn tác.`)) return;
    setChanging(userId);
    try {
      await api.delete(`/auth/admin/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch {
      setError("Xóa user thất bại");
    } finally {
      setChanging(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Quản lý người dùng</h2>
          <p className="text-sm text-white/40 mt-0.5">Đổi role hoặc xóa tài khoản · Chỉ admin</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchUsers()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 self-start px-3 py-2 rounded-xl border border-white/12 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white transition disabled:opacity-40"
        >
          {loading ? <LoadingSpinner size="sm" /> : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Làm mới
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-white/38">
        {ROLE_OPTIONS.map((r) => (
          <div key={r} className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${ROLE_BADGE[r]}`}>
              {r}
            </span>
            <span>
              {r === "owner"
                ? "Upload + chia sẻ"
                : r === "recipient"
                  ? "Chỉ xem / tải được chia sẻ"
                  : "Quản trị + Stress test"}
            </span>
          </div>
        ))}
      </div>

      <div className={`${surfaceCard} overflow-hidden`}>
        {loading ? (
          <PageLoader
            variant="embedded"
            title="Đang tải danh sách người dùng…"
            className="py-12"
          />
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-sm text-white/35">Chưa có user nào</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-white/[0.08] bg-black/25 text-left text-[11px] font-semibold uppercase tracking-wider text-white/40">
                  <th className="px-4 sm:px-5 py-3">Người dùng</th>
                  <th className="px-4 sm:px-5 py-3">Role</th>
                  <th className="px-4 sm:px-5 py-3 whitespace-nowrap">Ngày tạo</th>
                  <th className="px-4 sm:px-5 py-3 w-28">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {users.map((u) => {
                  const isMe = u.id === me?.user_id;
                  const isBusy = changing === u.id;
                  return (
                    <tr
                      key={u.id}
                      className={`transition hover:bg-white/[0.03] ${isMe ? "bg-indigo-500/[0.06]" : ""}`}
                    >
                      <td className="px-4 sm:px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/30 to-violet-600/30 border border-indigo-400/20 flex items-center justify-center text-indigo-200 font-semibold text-sm shrink-0">
                            {(u.display_name || u.email || "U")[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-white/90 flex items-center gap-2 flex-wrap">
                              <span className="truncate">{u.display_name || u.email}</span>
                              {isMe && (
                                <span className="text-[10px] bg-indigo-500/25 text-indigo-300 px-1.5 py-0.5 rounded-md font-semibold shrink-0">
                                  Bạn
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-white/35 truncate">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 sm:px-5 py-3.5">
                        {isMe ? (
                          <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-semibold ${ROLE_BADGE[u.role as Role] ?? ""}`}>
                            {u.role}
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            disabled={isBusy}
                            onChange={(e) => void handleRoleChange(u.id, e.target.value as Role)}
                            className={`${SELECT_BASE} ${isBusy ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r} className="bg-[#12141c]">
                                {r}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>

                      <td className="px-4 sm:px-5 py-3.5 text-xs text-white/40 whitespace-nowrap tabular-nums">
                        {new Date(u.created_at).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </td>

                      <td className="px-4 sm:px-5 py-3.5">
                        {!isMe && (
                          <button
                            type="button"
                            onClick={() => void handleDelete(u.id, u.email)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-400/90 border border-rose-500/25 hover:bg-rose-500/10 transition disabled:opacity-40"
                          >
                            {isBusy ? (
                              <LoadingSpinner size="xs" />
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                            Xóa
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-white/30 tabular-nums">
        Tổng {users.length} tài khoản · {users.filter((u) => u.role === "owner").length} owner ·{" "}
        {users.filter((u) => u.role === "recipient").length} recipient · {users.filter((u) => u.role === "admin").length}{" "}
        admin
      </p>
    </div>
  );
}
