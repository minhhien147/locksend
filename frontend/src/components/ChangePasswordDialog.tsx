import { useState } from "react";
import { surfaceCard, inputBase, text, label, btn } from "../styles/theme";
import Alert from "./ui/Alert";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (current: string, next: string) => Promise<void>;
}

export default function ChangePasswordDialog({ open, onClose, onSubmit }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  function handleClose() {
    if (!busy) {
      reset();
      onClose();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError("Mật khẩu mới cần ít nhất 8 ký tự.");
      return;
    }
    if (next !== confirm) {
      setError("Nhập lại mật khẩu mới không khớp.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit(current, next);
      reset();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof msg === "string" ? msg : "Đổi mật khẩu thất bại.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Đóng"
        onClick={handleClose}
      />
      <div className={`relative w-full max-w-md p-6 space-y-4 ${surfaceCard}`}>
        <div className="flex items-start justify-between gap-3">
          <h2 className={`text-lg font-semibold ${text.primary}`}>Đổi mật khẩu</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className={`p-1 rounded-md ${text.faint} hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label className={label}>Mật khẩu hiện tại</label>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={busy}
              className={`w-full mt-1 ${inputBase}`}
            />
          </div>
          <div>
            <label className={label}>Mật khẩu mới (≥ 8 ký tự)</label>
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={busy}
              className={`w-full mt-1 ${inputBase}`}
            />
          </div>
          <div>
            <label className={label}>Nhập lại mật khẩu mới</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
              className={`w-full mt-1 ${inputBase}`}
            />
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className={`flex-1 ${btn.secondary} disabled:opacity-40`}
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={busy || !current || !next || !confirm}
              className={`flex-1 ${btn.primary} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {busy ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
