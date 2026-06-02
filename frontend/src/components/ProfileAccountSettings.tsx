import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useDraftState } from "../hooks/useDraftState";

const PROFILE_SETTINGS_KEY = "profile-settings";
import {
  fetchMyDisplayNameHistory,
  type DisplayNameHistoryItem,
} from "../utils/api";
import Alert from "./ui/Alert";
import { btn, inputBase, label, surfaceCard, table, text } from "../styles/theme";

function formatHistoryDate(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function apiErrorDetail(err: unknown): string {
  const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data
    ?.detail;
  return typeof msg === "string" ? msg : "Thao tác thất bại.";
}

export default function ProfileAccountSettings() {
  const { user, updateDisplayName, changePassword } = useAuth();

  const [displayName, setDisplayName] = useDraftState(
    PROFILE_SETTINGS_KEY,
    "displayName",
    user?.display_name ?? ""
  );
  const [nameStatus, setNameStatus] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameBusy, setNameBusy] = useState(false);

  const [currentPwd, setCurrentPwd] = useDraftState(
    PROFILE_SETTINGS_KEY,
    "currentPwd",
    "",
    "memory"
  );
  const [newPwd, setNewPwd] = useDraftState(PROFILE_SETTINGS_KEY, "newPwd", "", "memory");
  const [confirmPwd, setConfirmPwd] = useDraftState(
    PROFILE_SETTINGS_KEY,
    "confirmPwd",
    "",
    "memory"
  );
  const [pwdStatus, setPwdStatus] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  const [nameHistory, setNameHistory] = useState<DisplayNameHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadNameHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setNameHistory(await fetchMyDisplayNameHistory(20));
    } catch {
      setNameHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.display_name && displayName === "") {
      setDisplayName(user.display_name);
    }
  }, [user?.display_name, displayName, setDisplayName]);

  useEffect(() => {
    void loadNameHistory();
  }, [loadNameHistory]);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setNameStatus(null);
    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameError("Tên hiển thị không được để trống.");
      return;
    }
    if (trimmed === (user?.display_name ?? "").trim()) {
      setNameStatus("Tên hiển thị không thay đổi.");
      return;
    }
    setNameBusy(true);
    try {
      await updateDisplayName(trimmed);
      setNameStatus("Đã cập nhật tên hiển thị.");
      void loadNameHistory();
    } catch (err) {
      setNameError(apiErrorDetail(err));
    } finally {
      setNameBusy(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError(null);
    setPwdStatus(null);
    if (newPwd.length < 8) {
      setPwdError("Mật khẩu mới cần ít nhất 8 ký tự.");
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError("Nhập lại mật khẩu mới không khớp.");
      return;
    }
    setPwdBusy(true);
    try {
      await changePassword(currentPwd, newPwd);
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      setPwdStatus("Đã đổi mật khẩu.");
    } catch (err) {
      setPwdError(apiErrorDetail(err));
    } finally {
      setPwdBusy(false);
    }
  }

  const compactInput = `${inputBase} !py-1.5 !px-2.5 !text-xs`;
  const compactBtn = `${btn.primary} !py-1.5 !px-3 !text-xs`;

  return (
    <section className={`${surfaceCard} p-3.5 sm:p-4 space-y-4 max-w-2xl`}>
      <h2 className={`text-[11px] font-semibold uppercase tracking-wide ${text.faint}`}>
        Tài khoản
      </h2>

      <form onSubmit={(e) => void handleSaveName(e)} className="space-y-2">
        <p className={`text-xs font-medium ${text.primary}`}>Tên hiển thị</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setNameError(null);
              setNameStatus(null);
            }}
            maxLength={128}
            autoComplete="name"
            disabled={nameBusy}
            placeholder="Tên của bạn"
            className={`flex-1 ${compactInput}`}
          />
          <button
            type="submit"
            disabled={nameBusy || !displayName.trim()}
            className={`sm:shrink-0 rounded-md font-semibold disabled:opacity-40 ${compactBtn}`}
          >
            {nameBusy ? "Đang lưu…" : "Lưu tên"}
          </button>
        </div>
        {nameError && <Alert tone="error">{nameError}</Alert>}
        {nameStatus && !nameError && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{nameStatus}</p>
        )}

        <div className="space-y-2 pt-1">
          <p className={`text-xs font-medium ${text.faint}`}>Lịch sử đổi tên</p>
          {historyLoading ? (
            <p className={`text-xs ${text.muted}`}>Đang tải…</p>
          ) : nameHistory.length === 0 ? (
            <p className={`text-xs ${text.muted}`}>Chưa có lần đổi tên nào được ghi nhận.</p>
          ) : (
            <div className={table.wrap}>
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className={`${table.head} px-2 py-1 text-[10px]`}>Thời gian</th>
                    <th className={`${table.head} px-2 py-1 text-[10px]`}>Từ</th>
                    <th className={`${table.head} px-2 py-1 text-[10px]`}>Thành</th>
                  </tr>
                </thead>
                <tbody>
                  {nameHistory.map((row) => (
                    <tr key={row.id} className={table.row}>
                      <td className={`${table.cell} px-2 py-1 text-[10px] whitespace-nowrap`}>
                        {formatHistoryDate(row.changed_at)}
                      </td>
                      <td className={`${table.cell} px-2 py-1 text-[10px]`}>
                        {row.old_display_name ?? "—"}
                      </td>
                      <td className={`${table.cell} px-2 py-1 text-[10px] font-medium`}>
                        {row.new_display_name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </form>

      <hr className="border-slate-200 dark:border-slate-800" />

      <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-2">
        <p className={`text-xs font-medium ${text.primary}`}>Đổi mật khẩu</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="sm:col-span-2">
            <label className={`${label} !text-[10px]`}>Mật khẩu hiện tại</label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPwd}
              onChange={(e) => {
                setCurrentPwd(e.target.value);
                setPwdError(null);
              }}
              disabled={pwdBusy}
              className={`w-full mt-0.5 ${compactInput}`}
            />
          </div>
          <div>
            <label className={`${label} !text-[10px]`}>Mật khẩu mới (≥ 8 ký tự)</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPwd}
              onChange={(e) => {
                setNewPwd(e.target.value);
                setPwdError(null);
              }}
              disabled={pwdBusy}
              className={`w-full mt-0.5 ${compactInput}`}
            />
          </div>
          <div>
            <label className={`${label} !text-[10px]`}>Nhập lại mật khẩu mới</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPwd}
              onChange={(e) => {
                setConfirmPwd(e.target.value);
                setPwdError(null);
              }}
              disabled={pwdBusy}
              className={`w-full mt-0.5 ${compactInput}`}
            />
          </div>
        </div>
        {pwdError && <Alert tone="error">{pwdError}</Alert>}
        {pwdStatus && !pwdError && (
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">{pwdStatus}</p>
        )}
        <button
          type="submit"
          disabled={pwdBusy || !currentPwd || !newPwd || !confirmPwd}
          className={`rounded-md font-semibold disabled:opacity-40 ${compactBtn}`}
        >
          {pwdBusy ? "Đang lưu…" : "Đổi mật khẩu"}
        </button>
      </form>
    </section>
  );
}
