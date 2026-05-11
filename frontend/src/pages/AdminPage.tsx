import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import api from "../utils/api";

interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  created_at: string;
}

const ROLE_OPTIONS = ["owner", "recipient", "admin"] as const;
type Role = (typeof ROLE_OPTIONS)[number];

const ROLE_STYLE: Record<Role, string> = {
  owner:     "bg-indigo-100 text-indigo-700",
  recipient: "bg-emerald-100 text-emerald-700",
  admin:     "bg-rose-100 text-rose-700",
};

export default function AdminPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null); // id đang xử lý

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

  useEffect(() => { fetchUsers(); }, []);

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
    if (!confirm(`Xóa user "${email}"? Hành động này không thể hoàn tác.`)) return;
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Quản lý người dùng</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Đổi role hoặc xóa tài khoản · Chỉ admin
          </p>
        </div>
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Làm mới
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Role legend */}
      <div className="flex gap-3 flex-wrap">
        {ROLE_OPTIONS.map((r) => (
          <div key={r} className="flex items-center gap-2 text-sm text-gray-600">
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_STYLE[r]}`}>{r}</span>
            <span className="text-gray-400">
              {r === "owner" ? "Upload + chia sẻ file" : r === "recipient" ? "Chỉ xem/tải file được chia sẻ" : "Full access"}
            </span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center">
            <svg className="animate-spin w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">Chưa có user nào</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-5 py-3 font-medium text-gray-500">Người dùng</th>
                <th className="px-5 py-3 font-medium text-gray-500">Role</th>
                <th className="px-5 py-3 font-medium text-gray-500">Ngày tạo</th>
                <th className="px-5 py-3 font-medium text-gray-500">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((u) => {
                const isMe = u.id === me?.user_id;
                const isBusy = changing === u.id;
                return (
                  <tr key={u.id} className={`hover:bg-gray-50 transition ${isMe ? "bg-indigo-50/40" : ""}`}>
                    {/* User info */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-sm flex-shrink-0">
                          {(u.display_name || u.email || "U")[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-800 flex items-center gap-1.5">
                            {u.display_name || u.email}
                            {isMe && (
                              <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">Bạn</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400">{u.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Role selector */}
                    <td className="px-5 py-3.5">
                      {isMe ? (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_STYLE[u.role as Role] ?? ""}`}>
                          {u.role}
                        </span>
                      ) : (
                        <select
                          value={u.role}
                          disabled={isBusy}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition
                            focus:outline-none focus:ring-2 focus:ring-indigo-400
                            ${isBusy ? "opacity-50 cursor-not-allowed" : ""}
                            ${ROLE_STYLE[u.role as Role] ?? "border-gray-200"}`}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* Created at */}
                    <td className="px-5 py-3.5 text-gray-400 text-xs">
                      {new Date(u.created_at).toLocaleDateString("vi-VN", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                      })}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      {!isMe && (
                        <button
                          onClick={() => handleDelete(u.id, u.email)}
                          disabled={isBusy}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition disabled:opacity-40"
                        >
                          {isBusy ? (
                            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">
        Tổng {users.length} tài khoản ·{" "}
        {users.filter(u => u.role === "owner").length} owner ·{" "}
        {users.filter(u => u.role === "recipient").length} recipient ·{" "}
        {users.filter(u => u.role === "admin").length} admin
      </p>
    </div>
  );
}
