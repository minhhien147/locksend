/**
 * KeyUnlockModal — Modal nhập passphrase để unlock private key.
 *
 * Hiển thị khi:
 *   - User đã đăng nhập nhưng vault chưa unlock (F5, hết inactivity timeout…)
 *   - SessionStorage wrapper không còn (tab reload sau thời gian dài)
 *
 * Flow:
 *   1. Fetch encrypted_key_blob từ server (GET /keys/my-encrypted-blob)
 *   2. User nhập passphrase
 *   3. decryptKeyBlob(blob, passphrase) → UnlockedKeyPairs
 *   4. keyVault.setKeys(keys) → lưu vào RAM + sessionStorage wrapper
 *   5. gọi onUnlocked()
 */

import { useState, useEffect, useCallback } from "react";
import { decryptKeyBlob, validatePassphrase } from "../utils/crypto";
import { setKeys } from "../utils/keyVault";
import { fetchMyEncryptedKeyBlob } from "../utils/api";
import { inputBase, btn, text, surfaceCard } from "../styles/theme";

interface KeyUnlockModalProps {
  /** Gọi khi unlock thành công hoặc user bấm "Bỏ qua" */
  onUnlocked: () => void;
  /** Gọi khi user bấm "Bỏ qua" (không unlock) */
  onDismiss?: () => void;
}

type ModalState =
  | { phase: "loading" }
  | { phase: "no_keys" }
  | { phase: "unlock"; blob: string }
  | { phase: "error"; message: string };

export default function KeyUnlockModal({ onUnlocked, onDismiss }: KeyUnlockModalProps) {
  const [modalState, setModalState] = useState<ModalState>({ phase: "loading" });
  const [passphrase, setPassphrase] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchMyEncryptedKeyBlob();
      if (!data.has_keys || !data.encrypted_key_blob) {
        setModalState({ phase: "no_keys" });
      } else {
        setModalState({ phase: "unlock", blob: data.encrypted_key_blob });
      }
    } catch {
      setModalState({ phase: "error", message: "Không thể kết nối server. Thử lại sau." });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (modalState.phase !== "unlock") return;
    const err = validatePassphrase(passphrase);
    if (err) { setUnlockError(err); return; }

    setUnlocking(true);
    setUnlockError(null);
    try {
      const keys = await decryptKeyBlob(modalState.blob, passphrase);
      await setKeys(keys);
      setPassphrase("");
      onUnlocked();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setUnlockError(
        msg === "WRONG_PASSPHRASE"
          ? "Passphrase không đúng. Vui lòng thử lại."
          : "Không mở khóa được. Passphrase sai hoặc dữ liệu bị hỏng."
      );
    } finally {
      setUnlocking(false);
    }
  }

  return (
    /* Overlay */
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className={`w-full max-w-md ${surfaceCard} p-6 sm:p-8 shadow-2xl space-y-5`}>

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className={`text-base font-semibold ${text.primary}`}>Mở khóa Private Key</h2>
          </div>
          <p className={`text-sm ${text.muted} pl-12`}>
            Nhập passphrase để khôi phục phiên làm việc. Passphrase không được gửi lên server.
          </p>
        </div>

        {/* Loading */}
        {modalState.phase === "loading" && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* No keys */}
        {modalState.phase === "no_keys" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200/90">
              Chưa có keypair trên server. Hãy vào trang <strong>Keys</strong> để tạo và tải lên.
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className={`w-full ${btn.primary}`}
            >
              Đến trang Keys
            </button>
          </div>
        )}

        {/* Unlock form */}
        {modalState.phase === "unlock" && (
          <form onSubmit={(e) => void handleUnlock(e)} className="space-y-4">
            <div>
              <label className={`block mb-1.5 text-sm font-medium ${text.secondary}`}>
                Passphrase
              </label>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => { setPassphrase(e.target.value); setUnlockError(null); }}
                placeholder="Nhập passphrase của keypair"
                autoComplete="current-password"
                autoFocus
                disabled={unlocking}
                className={inputBase}
              />
              {unlockError && (
                <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{unlockError}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={unlocking || !passphrase}
                className={`flex-1 ${btn.primary} disabled:opacity-40`}
              >
                {unlocking ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang giải mã…
                  </span>
                ) : "Mở khóa"}
              </button>
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  disabled={unlocking}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium border transition
                    border-slate-300 text-slate-600 hover:bg-slate-100
                    dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60`}
                >
                  Bỏ qua
                </button>
              )}
            </div>
            <p className={`text-xs ${text.muted}`}>
              Private key được giải mã ngay trên trình duyệt, không bao giờ gửi lên server.
            </p>
          </form>
        )}

        {/* Error */}
        {modalState.phase === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-rose-600 dark:text-rose-400">{modalState.message}</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setModalState({ phase: "loading" }); void load(); }}
                className={`flex-1 ${btn.primary}`}>
                Thử lại
              </button>
              {onDismiss && (
                <button type="button" onClick={onDismiss}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60">
                  Bỏ qua
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
