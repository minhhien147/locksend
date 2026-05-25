import { useState, useEffect, useRef } from "react";
import {
  generateX25519KeyPair,
  generateEd25519KeyPair,
  saveKeysToStorage,
  loadKeysFromStorage,
  clearKeysFromStorage,
  unlockKeysFromStorage,
  migrateLegacyKeysToEncrypted,
  changeKeysPassphrase,
  lockKeysInSession,
  hasKeysInStorage,
  isEncryptedKeyStorage,
  isLegacyPlainKeyStorage,
  isKeysUnlocked,
  validatePassphrase,
  toBase64,
  type UnlockedKeyPairs,
} from "../utils/crypto";
import { syncPublicKeysToServer } from "../utils/keySync";
import { surfaceCard, keyField, inputBase, text, label, panel, btnGhost, btn } from "../styles/theme";

type DangerStep = null | "replace-keys" | "delete-keys";

export default function KeyManagement() {
  const [keys, setKeys] = useState<UnlockedKeyPairs | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [dangerStep, setDangerStep] = useState<DangerStep>(null);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [changePassphrase, setChangePassphrase] = useState("");
  const [changePassphraseConfirm, setChangePassphraseConfirm] = useState("");
  const [migratePassphrase, setMigratePassphrase] = useState("");
  const [migrateConfirm, setMigrateConfirm] = useState("");

  const statusTimerRef = useRef<number | null>(null);
  const stored = hasKeysInStorage();
  const encrypted = isEncryptedKeyStorage();
  const legacy = isLegacyPlainKeyStorage();
  const unlocked = isKeysUnlocked();

  function refreshKeys() {
    setKeys(loadKeysFromStorage());
  }

  useEffect(() => {
    refreshKeys();
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    };
  }, []);

  function showStatus(msg: string, isError = false) {
    setStatus(msg);
    setStatusIsError(isError);
    setDangerStep(null);
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => {
      setStatus(null);
      statusTimerRef.current = null;
    }, 4500);
  }

  async function handleSyncToServer() {
    setSyncing(true);
    const result = await syncPublicKeysToServer();
    if (result.ok) {
      showStatus("Public key đã được đồng bộ lên server.");
    } else {
      showStatus(result.error + ". Kiểm tra kết nối và thử lại.", true);
    }
    setSyncing(false);
  }

  async function handleGenerate() {
    const err = validatePassphrase(newPassphrase);
    if (err) {
      showStatus(err, true);
      return;
    }
    if (newPassphrase !== confirmPassphrase) {
      showStatus("Passphrase xác nhận không khớp.", true);
      return;
    }
    setDangerStep(null);
    setBusy(true);
    try {
      const x25519Keys = generateX25519KeyPair();
      const ed25519Keys = generateEd25519KeyPair();
      await saveKeysToStorage(x25519Keys, ed25519Keys, newPassphrase);
      setNewPassphrase("");
      setConfirmPassphrase("");
      refreshKeys();
      showStatus("Đã tạo keypair và mã hóa bằng passphrase.");
    } catch (e) {
      showStatus(e instanceof Error ? e.message : "Không lưu được keypair.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    setBusy(true);
    try {
      await unlockKeysFromStorage(unlockPassphrase);
      setUnlockPassphrase("");
      refreshKeys();
      showStatus("Đã mở khóa keypair trong phiên này.");
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      showStatus(
        code === "WRONG_PASSPHRASE" ? "Passphrase không đúng." : "Không mở khóa được.",
        true
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleMigrate() {
    const err = validatePassphrase(migratePassphrase);
    if (err) {
      showStatus(err, true);
      return;
    }
    if (migratePassphrase !== migrateConfirm) {
      showStatus("Passphrase xác nhận không khớp.", true);
      return;
    }
    setBusy(true);
    try {
      await migrateLegacyKeysToEncrypted(migratePassphrase);
      setMigratePassphrase("");
      setMigrateConfirm("");
      refreshKeys();
      showStatus("Đã mã hóa keypair bằng passphrase.");
    } catch {
      showStatus("Nâng cấp thất bại.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleChangePassphrase() {
    const err = validatePassphrase(changePassphrase);
    if (err) {
      showStatus(err, true);
      return;
    }
    if (changePassphrase !== changePassphraseConfirm) {
      showStatus("Passphrase mới xác nhận không khớp.", true);
      return;
    }
    setBusy(true);
    try {
      await changeKeysPassphrase(changePassphrase);
      setChangePassphrase("");
      setChangePassphraseConfirm("");
      showStatus("Đã đổi passphrase.");
    } catch {
      showStatus("Đổi passphrase thất bại.", true);
    } finally {
      setBusy(false);
    }
  }

  function handleLock() {
    lockKeysInSession();
    refreshKeys();
    showStatus("Đã khóa keypair khỏi bộ nhớ phiên.");
  }

  function handleClear() {
    setDangerStep(null);
    clearKeysFromStorage();
    setKeys(null);
    setNewPassphrase("");
    setConfirmPassphrase("");
    showStatus("Đã xóa keypair khỏi trình duyệt.");
  }

  function copyToClipboard(value: string, label: string) {
    void navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 2000);
  }

  function requestGenerate() {
    if (!stored) {
      void handleGenerate();
      return;
    }
    setDangerStep("replace-keys");
    setStatus(null);
  }

  function requestDelete() {
    setDangerStep("delete-keys");
    setStatus(null);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className={`text-2xl font-bold ${text.primary} tracking-tight`}>Quản lý Keypair</h1>
        <p className={`mt-1 text-sm ${text.muted}`}>
          Private key được mã hóa bằng passphrase (PBKDF2 + AES-256-GCM) trước khi lưu localStorage.
        </p>
      </header>

      {!stored ? (
        <div className={`${surfaceCard} p-6 sm:p-8 space-y-5`}>
          <p className={`text-center font-medium ${text.secondary}`}>Chưa có keypair</p>
          <PassphraseFields
            passphrase={newPassphrase}
            confirm={confirmPassphrase}
            onPassphraseChange={setNewPassphrase}
            onConfirmChange={setConfirmPassphrase}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={busy || !newPassphrase}
            className={`w-full ${btn.primary} disabled:opacity-40`}
          >
            Tạo Keypair
          </button>
        </div>
      ) : !unlocked && encrypted ? (
        <div className={`${surfaceCard} p-6 sm:p-8 space-y-4`}>
          <p className={`font-medium ${text.secondary}`}>Nhập passphrase để mở khóa</p>
          <PassphraseFields
            passphrase={unlockPassphrase}
            confirm=""
            onPassphraseChange={setUnlockPassphrase}
            onConfirmChange={() => {}}
            showConfirm={false}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => void handleUnlock()}
            disabled={busy || !unlockPassphrase}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-indigo-600 text-white disabled:opacity-40"
          >
            Mở khóa
          </button>
        </div>
      ) : keys ? (
        <div className="space-y-5">
          {legacy && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-100/80 px-4 py-3 space-y-3 dark:border-amber-500/25 dark:bg-amber-500/8">
              <p className="text-sm text-amber-900 dark:text-amber-200/90">
                Key đang lưu dạng cũ (plaintext). Nên mã hóa bằng passphrase.
              </p>
              <PassphraseFields
                passphrase={migratePassphrase}
                confirm={migrateConfirm}
                onPassphraseChange={setMigratePassphrase}
                onConfirmChange={setMigrateConfirm}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => void handleMigrate()}
                disabled={busy || !migratePassphrase}
                className="w-full py-2 rounded-lg text-sm font-semibold bg-amber-200/80 border border-amber-400/50 text-amber-900 disabled:opacity-40 dark:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-200"
              >
                Mã hóa keypair
              </button>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <KeyBlock
              title="X25519"
              accent="indigo"
              value={toBase64(keys.x25519.publicKey)}
              copied={copied === "x25519"}
              onCopy={() => copyToClipboard(toBase64(keys.x25519.publicKey), "x25519")}
            />
            <KeyBlock
              title="Ed25519"
              accent="violet"
              value={toBase64(keys.ed25519.publicKey)}
              copied={copied === "ed25519"}
              onCopy={() => copyToClipboard(toBase64(keys.ed25519.publicKey), "ed25519")}
            />
          </div>

          <PrivateKeysSection keys={keys} copied={copied} onCopy={copyToClipboard} />

          <div className={`${surfaceCard} p-4 sm:p-5 space-y-4`}>
            <div className="flex items-start gap-3 rounded-xl border border-cyan-400/35 bg-cyan-100/70 px-4 py-3 dark:border-cyan-500/20 dark:bg-cyan-500/8">
              <p className="flex-1 text-xs text-cyan-900 dark:text-cyan-200/85">
                Đồng bộ public key lên server để người khác tìm bạn theo email. Tự động lặp mỗi 30 phút khi đã đăng nhập và mở khóa key.
              </p>
              <button
                type="button"
                onClick={() => void handleSyncToServer()}
                disabled={syncing || dangerStep !== null}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-200/70 border border-cyan-400/45 text-cyan-900 disabled:opacity-50 dark:bg-cyan-500/20 dark:border-cyan-500/30 dark:text-cyan-300"
              >
                {syncing ? "Đang đồng bộ…" : "Đồng bộ lên server"}
              </button>
            </div>

            {encrypted && unlocked && (
              <div className={`rounded-xl px-4 py-3 space-y-3 ${panel.subtle}`}>
                <p className={`text-xs font-medium ${text.muted}`}>Đổi passphrase</p>
                <PassphraseFields
                  passphrase={changePassphrase}
                  confirm={changePassphraseConfirm}
                  onPassphraseChange={setChangePassphrase}
                  onConfirmChange={setChangePassphraseConfirm}
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => void handleChangePassphrase()}
                  disabled={busy || !changePassphrase}
                  className={`text-xs px-3 py-1.5 rounded-lg disabled:opacity-40 ${btnGhost}`}
                >
                  Cập nhật passphrase
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={requestGenerate}
                disabled={dangerStep !== null}
                className={`flex-1 ${btn.primary} disabled:opacity-40`}
              >
                Tạo Keypair mới
              </button>
              {encrypted && unlocked && (
                <button
                  type="button"
                  onClick={handleLock}
                  className={`sm:w-36 py-3 rounded-xl text-sm font-medium ${btnGhost}`}
                >
                  Khóa phiên
                </button>
              )}
              <button
                type="button"
                onClick={requestDelete}
                disabled={dangerStep !== null}
                className="sm:w-36 py-3 rounded-xl text-sm font-medium border border-rose-400/50 text-rose-700 hover:bg-rose-100 disabled:opacity-40 dark:border-rose-500/30 dark:text-rose-400/95 dark:hover:bg-rose-500/10"
              >
                Xóa keys…
              </button>
            </div>

            {dangerStep === "replace-keys" && (
              <div className="rounded-xl border border-amber-400/40 bg-amber-100/80 px-4 py-3 space-y-3 dark:border-amber-500/25 dark:bg-amber-500/8">
                <p className="text-sm text-amber-900 dark:text-amber-200/95">Ghi đè keypair? Nhập passphrase mới:</p>
                <PassphraseFields
                  passphrase={newPassphrase}
                  confirm={confirmPassphrase}
                  onPassphraseChange={setNewPassphrase}
                  onConfirmChange={setConfirmPassphrase}
                  disabled={busy}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDangerStep(null)}
                    className={`px-4 py-2 rounded-lg text-sm ${btnGhost}`}
                  >
                    Huỷ
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGenerate()}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-200/80 text-amber-900 border border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/35"
                  >
                    Xác nhận thay thế
                  </button>
                </div>
              </div>
            )}

            {dangerStep === "delete-keys" && (
              <div className="rounded-xl border border-rose-400/40 bg-rose-100/70 px-4 py-3 space-y-3 dark:border-rose-500/25 dark:bg-rose-950/30">
                <p className="text-sm text-rose-800 dark:text-rose-200/95">Xóa key khỏi trình duyệt?</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDangerStep(null)}
                    className={`px-4 py-2 rounded-lg text-sm ${btnGhost}`}
                  >
                    Huỷ
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-rose-600/90 text-white"
                  >
                    Xóa vĩnh viễn
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {status && (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            statusIsError
              ? "border-rose-400/40 bg-rose-100/80 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/8 dark:text-rose-200/95"
              : "border-emerald-400/40 bg-emerald-100/80 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/8 dark:text-emerald-200/95"
          }`}
        >
          <span>{status}</span>
        </div>
      )}
    </div>
  );
}

function PrivateKeysSection({
  keys,
  copied,
  onCopy,
}: {
  keys: UnlockedKeyPairs;
  copied: string | null;
  onCopy: (value: string, label: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="rounded-2xl border border-rose-400/35 bg-rose-100/50 overflow-hidden dark:border-rose-500/20 dark:bg-rose-950/20">
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-rose-200/40 dark:hover:bg-rose-500/5 transition"
      >
        <span className="text-sm font-medium text-rose-800 dark:text-rose-200/90">
          {revealed ? "Ẩn private key" : "Hiện private key"}
        </span>
        <svg
          className={`w-4 h-4 text-rose-600/70 dark:text-rose-300/60 shrink-0 transition-transform ${revealed ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {revealed && (
        <div className="px-4 pb-4 space-y-3 border-t border-rose-400/30 dark:border-rose-500/15">
          <p className="text-[11px] text-rose-700 dark:text-rose-300/70 leading-relaxed pt-3">
            Chỉ hiện sau khi mở khóa. Không chia sẻ, không chụp màn hình. localStorage vẫn chỉ lưu bản mã hóa.
          </p>
          <KeyBlock
            title="X25519"
            accent="indigo"
            kind="private"
            value={toBase64(keys.x25519.privateKey)}
            copied={copied === "x25519-priv"}
            onCopy={() => onCopy(toBase64(keys.x25519.privateKey), "x25519-priv")}
          />
          <KeyBlock
            title="Ed25519"
            accent="violet"
            kind="private"
            value={toBase64(keys.ed25519.privateKey)}
            copied={copied === "ed25519-priv"}
            onCopy={() => onCopy(toBase64(keys.ed25519.privateKey), "ed25519-priv")}
          />
        </div>
      )}
    </div>
  );
}

function PassphraseFields({
  passphrase,
  confirm,
  onPassphraseChange,
  onConfirmChange,
  disabled,
  showConfirm = true,
}: {
  passphrase: string;
  confirm: string;
  onPassphraseChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  disabled?: boolean;
  showConfirm?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className={`block mb-1 ${label}`}>Passphrase (tối thiểu 8 ký tự)</label>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => onPassphraseChange(e.target.value)}
          disabled={disabled}
          autoComplete="new-password"
          className={inputBase}
        />
      </div>
      {showConfirm && (
        <div>
          <label className={`block mb-1 ${label}`}>Xác nhận passphrase</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => onConfirmChange(e.target.value)}
            disabled={disabled}
            autoComplete="new-password"
            className={inputBase}
          />
        </div>
      )}
    </div>
  );
}

function KeyBlock({
  title,
  accent,
  kind = "public",
  value,
  copied,
  onCopy,
}: {
  title: string;
  accent: "indigo" | "violet";
  kind?: "public" | "private";
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const ring =
    kind === "private"
      ? "ring-rose-400/20"
      : accent === "indigo"
        ? "ring-indigo-400/20"
        : "ring-violet-400/20";
  const dot =
    kind === "private"
      ? "bg-rose-400"
      : accent === "indigo"
        ? "bg-indigo-400"
        : "bg-violet-400";
  const labelColor =
    kind === "private"
      ? "text-rose-700 dark:text-rose-300"
      : accent === "indigo"
        ? "text-indigo-700 dark:text-indigo-300"
        : "text-violet-700 dark:text-violet-300";

  return (
    <div
      className={`${kind === "private" ? "rounded-xl border border-rose-400/35 bg-rose-50/90 dark:border-rose-500/15 dark:bg-[#0c0e14]/80" : surfaceCard} p-4 sm:p-5 ring-1 ${ring}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${labelColor}`}>{title}</span>
          <span
            className={`text-[10px] font-medium normal-case ${kind === "private" ? "text-rose-600/80 dark:text-rose-400/60" : text.faint}`}
          >
            · {kind}
          </span>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition
            ${copied
              ? "border-emerald-500/40 text-emerald-700 bg-emerald-100 dark:border-emerald-500/30 dark:text-emerald-400 dark:bg-emerald-500/10"
              : accent === "indigo"
                ? "border-indigo-400/45 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/25 dark:text-indigo-400/90 dark:hover:bg-indigo-500/15"
                : "border-violet-400/45 text-violet-700 hover:bg-violet-100 dark:border-violet-500/25 dark:text-violet-400/90 dark:hover:bg-violet-500/15"
            }`}
        >
          {copied ? "Đã copy" : "Copy"}
        </button>
      </div>
      <div className={keyField}>{value}</div>
    </div>
  );
}
