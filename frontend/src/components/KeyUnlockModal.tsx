import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { decryptKeyBlob, validatePassphrase } from "../utils/crypto";
import { setKeys } from "../utils/keyVault";
import { fetchMyEncryptedKeyBlob } from "../utils/api";
import { inputBase, btn, btnGhost, text, surfaceCard } from "../styles/theme";

interface KeyUnlockModalProps {
  onUnlocked: () => void;
  onDismiss?: () => void;
}

type ModalState =
  | { phase: "loading" }
  | { phase: "no_keys" }
  | { phase: "blob_missing" }
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
      if (!data.has_keys) {
        setModalState({ phase: "no_keys" });
      } else if (!data.encrypted_key_blob) {
        setModalState({ phase: "blob_missing" });
      } else {
        setModalState({ phase: "unlock", blob: data.encrypted_key_blob });
      }
    } catch {
      setModalState({ phase: "error", message: "Không kết nối được server." });
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
      setUnlockError(msg === "WRONG_PASSPHRASE" ? "Passphrase không đúng." : "Không mở khóa được.");
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className={`w-full max-w-md ${surfaceCard} p-6 sm:p-8 shadow-2xl space-y-5`}>
        <h2 className={`text-base font-semibold ${text.primary}`}>Passphrase</h2>

        {modalState.phase === "loading" && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {modalState.phase === "no_keys" && (
          <div className="space-y-4">
            <p className={`text-sm ${text.secondary}`}>Chưa có keypair.</p>
            <Link to="/keys" className={`block w-full text-center py-2.5 rounded-lg text-sm font-semibold ${btn.primary}`}>
              Keys
            </Link>
            {onDismiss && (
              <button type="button" onClick={onDismiss} className={`w-full text-sm ${btnGhost}`}>
                Bỏ qua
              </button>
            )}
          </div>
        )}

        {modalState.phase === "blob_missing" && (
          <div className="space-y-4">
            <p className="text-sm text-rose-600 dark:text-rose-400">
              Public key trên server nhưng thiếu blob passphrase (có thể do đồng bộ cũ). Không tạo keypair mới.
            </p>
            <Link to="/keys" className={`block w-full text-center py-2.5 rounded-lg text-sm font-semibold ${btn.primary}`}>
              Keys — Migrate
            </Link>
            {onDismiss && (
              <button type="button" onClick={onDismiss} className={`w-full text-sm ${btnGhost}`}>
                Bỏ qua
              </button>
            )}
          </div>
        )}

        {modalState.phase === "unlock" && (
          <form onSubmit={(e) => void handleUnlock(e)} className="space-y-4">
            <input
              type="password"
              value={passphrase}
              onChange={(e) => { setPassphrase(e.target.value); setUnlockError(null); }}
              placeholder="Passphrase"
              autoComplete="current-password"
              autoFocus
              disabled={unlocking}
              className={inputBase}
            />
            {unlockError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{unlockError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={unlocking || !passphrase}
                className={`flex-1 ${btn.primary} disabled:opacity-40`}
              >
                {unlocking ? "…" : "Mở khóa"}
              </button>
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  disabled={unlocking}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/60"
                >
                  Bỏ qua
                </button>
              )}
            </div>
          </form>
        )}

        {modalState.phase === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-rose-600 dark:text-rose-400">{modalState.message}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setModalState({ phase: "loading" }); void load(); }}
                className={`flex-1 ${btn.primary}`}
              >
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
