/**
 * KeyManagement — Quản lý keypair zero-knowledge.
 *
 * Luồng:
 *  1. Mount: fetch encrypted_key_blob từ server + check vault
 *  2. Nếu chưa có blob: hiện form tạo mới + upload
 *  3. Nếu có blob, vault locked: hiện form nhập passphrase
 *  4. Nếu vault unlocked: hiện info, đổi passphrase, lock session
 *  5. Legacy migration: nếu có key cũ trong localStorage, offer upload lên server
 */

import { useState, useEffect, useRef } from "react";
import {
  generateX25519KeyPair,
  generateEd25519KeyPair,
  encryptKeyBlob,
  decryptKeyBlob,
  decryptLegacyLocalStorage,
  hasLegacyLocalStorageKey,
  clearLegacyLocalStorage,
  validatePassphrase,
  toBase64,
  type UnlockedKeyPairs,
} from "../utils/crypto";
import {
  getKeys,
  setKeys,
  isUnlocked,
  lockKeys,
} from "../utils/keyVault";
import {
  storeMyPublicKey,
  fetchMyEncryptedKeyBlob,
  getAccessToken,
  parseJwtPayload,
} from "../utils/api";
import {
  surfaceCard,
  keyField,
  inputBase,
  text,
  label,
  panel,
  btnGhost,
  btn,
} from "../styles/theme";

type PageState =
  | { phase: "loading" }
  | { phase: "no_keys"; hasLegacy: boolean }
  | { phase: "locked"; blob: string }
  | { phase: "unlocked"; keys: UnlockedKeyPairs };

type DangerStep = null | "replace-keys" | "delete-keys";

export default function KeyManagement() {
  const [pageState, setPageState] = useState<PageState>({ phase: "loading" });
  const [dangerStep, setDangerStep] = useState<DangerStep>(null);
  const [status, setStatus] = useState<{ msg: string; isError: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Form fields
  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [changePassphraseVal, setChangePassphraseVal] = useState("");
  const [changePhraseConfirm, setChangePhraseConfirm] = useState("");
  const [legacyPassphrase, setLegacyPassphrase] = useState("");

  const statusTimerRef = useRef<number | null>(null);

  // ── Load initial state ───────────────────────────────────────────────────────

  async function loadState() {
    setPageState({ phase: "loading" });
    try {
      // Check vault first (F5 already restored)
      if (isUnlocked()) {
        const k = getKeys()!;
        setPageState({ phase: "unlocked", keys: k });
        return;
      }
      // Fetch server blob
      const data = await fetchMyEncryptedKeyBlob();
      if (!data.has_keys || !data.encrypted_key_blob) {
        setPageState({ phase: "no_keys", hasLegacy: hasLegacyLocalStorageKey() });
      } else {
        setPageState({ phase: "locked", blob: data.encrypted_key_blob });
      }
    } catch {
      setPageState({ phase: "no_keys", hasLegacy: hasLegacyLocalStorageKey() });
    }
  }

  useEffect(() => { void loadState(); }, []);

  useEffect(() => () => {
    if (statusTimerRef.current !== null) clearTimeout(statusTimerRef.current);
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function showStatus(msg: string, isError = false) {
    setStatus({ msg, isError });
    if (statusTimerRef.current !== null) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => {
      setStatus(null);
      statusTimerRef.current = null;
    }, 4500);
  }

  function getMyExternalId(): string | null {
    const token = getAccessToken();
    if (!token) return null;
    return (parseJwtPayload(token)?.sub as string) ?? null;
  }

  async function uploadToServer(
    keys: UnlockedKeyPairs,
    encryptedBlob: string
  ): Promise<void> {
    const externalId = getMyExternalId();
    if (!externalId) throw new Error("Không lấy được user id");
    await storeMyPublicKey({
      externalId,
      publicKeyX25519: toBase64(keys.x25519.publicKey),
      publicKeyEd25519: toBase64(keys.ed25519.publicKey),
      encryptedKeyBlob: encryptedBlob,
    });
  }

  function copyToClipboard(value: string, id: string) {
    void navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 2000);
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleGenerate() {
    const err = validatePassphrase(newPassphrase);
    if (err) { showStatus(err, true); return; }
    if (newPassphrase !== confirmPassphrase) {
      showStatus("Passphrase xác nhận không khớp.", true);
      return;
    }
    setBusy(true);
    try {
      const x25519Keys = generateX25519KeyPair();
      const ed25519Keys = generateEd25519KeyPair();
      const blob = await encryptKeyBlob(x25519Keys, ed25519Keys, newPassphrase);
      await uploadToServer({ x25519: x25519Keys, ed25519: ed25519Keys }, blob);
      await setKeys({ x25519: x25519Keys, ed25519: ed25519Keys });
      setNewPassphrase("");
      setConfirmPassphrase("");
      setDangerStep(null);
      setPageState({ phase: "unlocked", keys: { x25519: x25519Keys, ed25519: ed25519Keys } });
      showStatus("Keypair đã được tạo, mã hóa và lưu lên server.");
    } catch (e) {
      showStatus(e instanceof Error ? e.message : "Không tạo được keypair.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    if (pageState.phase !== "locked") return;
    setBusy(true);
    try {
      const keys = await decryptKeyBlob(pageState.blob, unlockPassphrase);
      await setKeys(keys);
      setUnlockPassphrase("");
      setPageState({ phase: "unlocked", keys });
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

  async function handleChangePassphrase() {
    if (pageState.phase !== "unlocked") return;
    const err = validatePassphrase(changePassphraseVal);
    if (err) { showStatus(err, true); return; }
    if (changePassphraseVal !== changePhraseConfirm) {
      showStatus("Passphrase mới xác nhận không khớp.", true);
      return;
    }
    setBusy(true);
    try {
      const blob = await encryptKeyBlob(
        pageState.keys.x25519,
        pageState.keys.ed25519,
        changePassphraseVal
      );
      await uploadToServer(pageState.keys, blob);
      // Re-write session wrapper với passphrase mới (keys không đổi)
      await setKeys(pageState.keys);
      setChangePassphraseVal("");
      setChangePhraseConfirm("");
      showStatus("Đã đổi passphrase và cập nhật lên server.");
    } catch (e) {
      showStatus(e instanceof Error ? e.message : "Đổi passphrase thất bại.", true);
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncToServer() {
    if (pageState.phase !== "unlocked") return;
    setSyncing(true);
    try {
      const externalId = getMyExternalId();
      if (!externalId) throw new Error("Không lấy được user id");
      await storeMyPublicKey({
        externalId,
        publicKeyX25519: toBase64(pageState.keys.x25519.publicKey),
        publicKeyEd25519: toBase64(pageState.keys.ed25519.publicKey),
      });
      showStatus("Public key đã được đồng bộ lên server.");
    } catch {
      showStatus("Đồng bộ thất bại. Kiểm tra kết nối và thử lại.", true);
    } finally {
      setSyncing(false);
    }
  }

  function handleLock() {
    lockKeys();
    showStatus("Đã khóa keypair khỏi bộ nhớ phiên.");
    void loadState();
  }

  function handleClear() {
    setDangerStep(null);
    lockKeys();
    clearLegacyLocalStorage();
    setPageState({ phase: "no_keys", hasLegacy: false });
    showStatus("Đã xóa keypair khỏi phiên. Blob vẫn còn trên server (bảo vệ bằng passphrase).");
  }

  // ── Legacy migration ─────────────────────────────────────────────────────────

  async function handleLegacyMigrate() {
    setBusy(true);
    try {
      const keys = await decryptLegacyLocalStorage(legacyPassphrase);
      const blob = await encryptKeyBlob(keys.x25519, keys.ed25519, legacyPassphrase);
      await uploadToServer(keys, blob);
      await setKeys(keys);
      clearLegacyLocalStorage();
      setLegacyPassphrase("");
      setPageState({ phase: "unlocked", keys });
      showStatus("Đã migrate keypair lên server thành công! localStorage đã được xóa.");
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      showStatus(
        code === "WRONG_PASSPHRASE" ? "Passphrase không đúng." :
        code === "NO_LEGACY" ? "Không tìm thấy key cũ." :
        "Migration thất bại.",
        true
      );
    } finally {
      setBusy(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className={`text-2xl font-bold ${text.primary} tracking-tight`}>Quản lý Keypair</h1>
        <p className={`mt-1 text-sm ${text.muted}`}>
          Private key được mã hóa bằng passphrase (PBKDF2 + AES-256-GCM). Server chỉ lưu bản mã hóa — không bao giờ thấy private key hay passphrase.
        </p>
      </header>

      {/* Loading */}
      {pageState.phase === "loading" && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* No keys */}
      {pageState.phase === "no_keys" && (
        <div className="space-y-4">
          {/* Legacy migration banner */}
          {pageState.hasLegacy && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-100/80 px-4 py-4 space-y-3 dark:border-amber-500/25 dark:bg-amber-500/8">
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Phát hiện keypair cũ trong trình duyệt
                </p>
                <p className="text-xs text-amber-800/80 dark:text-amber-300/70 mt-0.5">
                  Nhập passphrase để migrate lên server (zero-knowledge). Sau đó localStorage sẽ được xóa.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  value={legacyPassphrase}
                  onChange={(e) => setLegacyPassphrase(e.target.value)}
                  placeholder="Passphrase của key cũ"
                  autoComplete="current-password"
                  disabled={busy}
                  className={`flex-1 ${inputBase}`}
                />
                <button
                  type="button"
                  onClick={() => void handleLegacyMigrate()}
                  disabled={busy || !legacyPassphrase}
                  className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-200/80 border border-amber-400/50 text-amber-900 disabled:opacity-40 dark:bg-amber-500/20 dark:border-amber-500/30 dark:text-amber-200"
                >
                  Migrate
                </button>
              </div>
            </div>
          )}

          {/* Generate new keys form */}
          <div className={`${surfaceCard} p-6 sm:p-8 space-y-5`}>
            {!dangerStep ? (
              <>
                <p className={`text-center font-medium ${text.secondary}`}>
                  {pageState.hasLegacy ? "Hoặc tạo keypair hoàn toàn mới:" : "Chưa có keypair — hãy tạo mới:"}
                </p>
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
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Locked — enter passphrase */}
      {pageState.phase === "locked" && (
        <div className={`${surfaceCard} p-6 sm:p-8 space-y-4`}>
          <p className={`font-medium ${text.secondary}`}>Nhập passphrase để mở khóa</p>
          <p className={`text-xs ${text.muted}`}>
            Passphrase giải mã key lưu trên server trực tiếp trong trình duyệt, không gửi lên server.
          </p>
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
            className={`w-full ${btn.primary} disabled:opacity-40`}
          >
            Mở khóa
          </button>

          {/* Legacy migration in locked state */}
          {hasLegacyLocalStorageKey() && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-50 dark:bg-amber-500/8 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-200/80">
              Vẫn còn key cũ trong localStorage.{" "}
              <button
                type="button"
                onClick={() => clearLegacyLocalStorage()}
                className="underline hover:no-underline"
              >
                Xóa
              </button>
            </div>
          )}
        </div>
      )}

      {/* Unlocked — show keys + management */}
      {pageState.phase === "unlocked" && (
        <div className="space-y-5">
          {/* Public Keys */}
          <div className="flex flex-col gap-4">
            <KeyBlock
              title="X25519"
              accent="indigo"
              value={toBase64(pageState.keys.x25519.publicKey)}
              copied={copied === "x25519"}
              onCopy={() => copyToClipboard(toBase64(pageState.keys.x25519.publicKey), "x25519")}
            />
            <KeyBlock
              title="Ed25519"
              accent="violet"
              value={toBase64(pageState.keys.ed25519.publicKey)}
              copied={copied === "ed25519"}
              onCopy={() => copyToClipboard(toBase64(pageState.keys.ed25519.publicKey), "ed25519")}
            />
          </div>

          <PrivateKeysSection keys={pageState.keys} copied={copied} onCopy={copyToClipboard} />

          <div className={`${surfaceCard} p-4 sm:p-5 space-y-4`}>
            {/* Sync public key */}
            <div className="flex items-start gap-3 rounded-xl border border-cyan-400/35 bg-cyan-100/70 px-4 py-3 dark:border-cyan-500/20 dark:bg-cyan-500/8">
              <p className="flex-1 text-xs text-cyan-900 dark:text-cyan-200/85">
                Đồng bộ public key lên server để người khác tìm bạn theo email. Tự động lặp mỗi 30 phút khi đã mở khóa key.
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

            {/* Change passphrase */}
            <div className={`rounded-xl px-4 py-3 space-y-3 ${panel.subtle}`}>
              <p className={`text-xs font-medium ${text.muted}`}>Đổi passphrase</p>
              <PassphraseFields
                passphrase={changePassphraseVal}
                confirm={changePhraseConfirm}
                onPassphraseChange={setChangePassphraseVal}
                onConfirmChange={setChangePhraseConfirm}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => void handleChangePassphrase()}
                disabled={busy || !changePassphraseVal}
                className={`text-xs px-3 py-1.5 rounded-lg disabled:opacity-40 ${btnGhost}`}
              >
                Cập nhật passphrase
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setDangerStep("replace-keys")}
                disabled={dangerStep !== null}
                className={`flex-1 ${btn.primary} disabled:opacity-40`}
              >
                Tạo Keypair mới
              </button>
              <button
                type="button"
                onClick={handleLock}
                className={`sm:w-36 py-3 rounded-xl text-sm font-medium ${btnGhost}`}
              >
                Khóa phiên
              </button>
              <button
                type="button"
                onClick={() => setDangerStep("delete-keys")}
                disabled={dangerStep !== null}
                className="sm:w-36 py-3 rounded-xl text-sm font-medium border border-rose-400/50 text-rose-700 hover:bg-rose-100 disabled:opacity-40 dark:border-rose-500/30 dark:text-rose-400/95 dark:hover:bg-rose-500/10"
              >
                Xóa session…
              </button>
            </div>

            {/* Danger: replace keys */}
            {dangerStep === "replace-keys" && (
              <div className="rounded-xl border border-amber-400/40 bg-amber-100/80 px-4 py-3 space-y-3 dark:border-amber-500/25 dark:bg-amber-500/8">
                <p className="text-sm text-amber-900 dark:text-amber-200/95">
                  Tạo keypair mới sẽ thay thế keypair hiện tại trên server. Nhập passphrase mới:
                </p>
                <PassphraseFields
                  passphrase={newPassphrase}
                  confirm={confirmPassphrase}
                  onPassphraseChange={setNewPassphrase}
                  onConfirmChange={setConfirmPassphrase}
                  disabled={busy}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setDangerStep(null)}
                    className={`px-4 py-2 rounded-lg text-sm ${btnGhost}`}>
                    Huỷ
                  </button>
                  <button type="button" onClick={() => void handleGenerate()}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-200/80 text-amber-900 border border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/35">
                    Xác nhận thay thế
                  </button>
                </div>
              </div>
            )}

            {/* Danger: delete session */}
            {dangerStep === "delete-keys" && (
              <div className="rounded-xl border border-rose-400/40 bg-rose-100/70 px-4 py-3 space-y-3 dark:border-rose-500/25 dark:bg-rose-950/30">
                <p className="text-sm text-rose-800 dark:text-rose-200/95">
                  Xóa keypair khỏi phiên hiện tại? Blob mã hóa vẫn còn trên server (an toàn). Bạn có thể mở khóa lại bằng passphrase bất cứ lúc nào.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setDangerStep(null)}
                    className={`px-4 py-2 rounded-lg text-sm ${btnGhost}`}>
                    Huỷ
                  </button>
                  <button type="button" onClick={handleClear}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-rose-600/90 text-white">
                    Xóa khỏi phiên
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status message */}
      {status && (
        <div role="status"
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            status.isError
              ? "border-rose-400/40 bg-rose-100/80 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/8 dark:text-rose-200/95"
              : "border-emerald-400/40 bg-emerald-100/80 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/8 dark:text-emerald-200/95"
          }`}
        >
          <span>{status.msg}</span>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PrivateKeysSection({
  keys, copied, onCopy,
}: { keys: UnlockedKeyPairs; copied: string | null; onCopy: (v: string, id: string) => void }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="rounded-2xl border border-rose-400/35 bg-rose-100/50 overflow-hidden dark:border-rose-500/20 dark:bg-rose-950/20">
      <button type="button" onClick={() => setRevealed((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-rose-200/40 dark:hover:bg-rose-500/5 transition">
        <span className="text-sm font-medium text-rose-800 dark:text-rose-200/90">
          {revealed ? "Ẩn private key" : "Hiện private key"}
        </span>
        <svg className={`w-4 h-4 text-rose-600/70 dark:text-rose-300/60 shrink-0 transition-transform ${revealed ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {revealed && (
        <div className="px-4 pb-4 space-y-3 border-t border-rose-400/30 dark:border-rose-500/15">
          <p className="text-[11px] text-rose-700 dark:text-rose-300/70 leading-relaxed pt-3">
            Chỉ hiện trong RAM (phiên này). Private key KHÔNG được lưu vào localStorage hay cookie. Không chia sẻ, không chụp màn hình.
          </p>
          <KeyBlock title="X25519" accent="indigo" kind="private"
            value={toBase64(keys.x25519.privateKey)} copied={copied === "x25519-priv"}
            onCopy={() => onCopy(toBase64(keys.x25519.privateKey), "x25519-priv")} />
          <KeyBlock title="Ed25519" accent="violet" kind="private"
            value={toBase64(keys.ed25519.privateKey)} copied={copied === "ed25519-priv"}
            onCopy={() => onCopy(toBase64(keys.ed25519.privateKey), "ed25519-priv")} />
        </div>
      )}
    </div>
  );
}

function PassphraseFields({
  passphrase, confirm, onPassphraseChange, onConfirmChange, disabled, showConfirm = true,
}: {
  passphrase: string; confirm: string;
  onPassphraseChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  disabled?: boolean; showConfirm?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className={`block mb-1 ${label}`}>Passphrase (tối thiểu 8 ký tự)</label>
        <input type="password" value={passphrase} onChange={(e) => onPassphraseChange(e.target.value)}
          disabled={disabled} autoComplete="new-password" className={inputBase} />
      </div>
      {showConfirm && (
        <div>
          <label className={`block mb-1 ${label}`}>Xác nhận passphrase</label>
          <input type="password" value={confirm} onChange={(e) => onConfirmChange(e.target.value)}
            disabled={disabled} autoComplete="new-password" className={inputBase} />
        </div>
      )}
    </div>
  );
}

function KeyBlock({
  title, accent, kind = "public", value, copied, onCopy,
}: {
  title: string; accent: "indigo" | "violet"; kind?: "public" | "private";
  value: string; copied: boolean; onCopy: () => void;
}) {
  const ring = kind === "private" ? "ring-rose-400/20" : accent === "indigo" ? "ring-indigo-400/20" : "ring-violet-400/20";
  const dot = kind === "private" ? "bg-rose-400" : accent === "indigo" ? "bg-indigo-400" : "bg-violet-400";
  const labelColor = kind === "private" ? "text-rose-700 dark:text-rose-300" : accent === "indigo" ? "text-indigo-700 dark:text-indigo-300" : "text-violet-700 dark:text-violet-300";
  return (
    <div className={`${kind === "private" ? "rounded-xl border border-rose-400/35 bg-rose-50/90 dark:border-rose-500/15 dark:bg-[#0c0e14]/80" : surfaceCard} p-4 sm:p-5 ring-1 ${ring}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${labelColor}`}>{title}</span>
          <span className={`text-[10px] font-medium normal-case ${kind === "private" ? "text-rose-600/80 dark:text-rose-400/60" : text.faint}`}>· {kind}</span>
        </div>
        <button type="button" onClick={onCopy}
          className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition ${
            copied
              ? "border-emerald-500/40 text-emerald-700 bg-emerald-100 dark:border-emerald-500/30 dark:text-emerald-400 dark:bg-emerald-500/10"
              : accent === "indigo"
                ? "border-indigo-400/45 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/25 dark:text-indigo-400/90 dark:hover:bg-indigo-500/15"
                : "border-violet-400/45 text-violet-700 hover:bg-violet-100 dark:border-violet-500/25 dark:text-violet-400/90 dark:hover:bg-violet-500/15"
          }`}>
          {copied ? "Đã copy" : "Copy"}
        </button>
      </div>
      <div className={keyField}>{value}</div>
    </div>
  );
}
