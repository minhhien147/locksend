import { useState } from "react";

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
      <div className="relative w-full max-w-md rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-[#12141c] to-[#0b0d12] shadow-2xl shadow-indigo-950/40 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">Đổi mật khẩu</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-40"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label className="block text-xs text-white/50 mb-1">Mật khẩu hiện tại</label>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={busy}
              className="w-full rounded-xl border border-indigo-500/20 bg-[#0b0d12] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/35"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Mật khẩu mới (≥ 8 ký tự)</label>
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={busy}
              className="w-full rounded-xl border border-indigo-500/20 bg-[#0b0d12] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/35"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Nhập lại mật khẩu mới</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
              className="w-full rounded-xl border border-indigo-500/20 bg-[#0b0d12] px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/35"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-white/15 text-white/60 hover:bg-white/[0.06] disabled:opacity-40"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={busy || !current || !next || !confirm}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
