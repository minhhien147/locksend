import { useState, useRef, useCallback, useEffect } from "react";
import {
  CHUNKED_THRESHOLD,
  DEFAULT_CHUNK_SIZE,
  fromBase64,
} from "../utils/crypto";
import { isUnlocked } from "../utils/keyVault";
import { useUpload, type ChunkProgress, type RecipientUser } from "../hooks/useUpload";
import { LoadingSpinner } from "../components/LoadingSpinner";
import KeyUnlockBanner from "../components/KeyUnlockBanner";
import { searchUsers, getUserPublicKey, type UserSearchResult } from "../utils/api";
import { syncPublicKeysToServer } from "../utils/keySync";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import Badge from "../components/ui/Badge";
import SegmentedControl from "../components/ui/SegmentedControl";
import {
  dropzone,
  inputBase,
  text,
  label,
  sectionTitle,
  surfaceInset,
  panel,
  btn,
} from "../styles/theme";

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const CHUNK_MB = DEFAULT_CHUNK_SIZE / (1024 * 1024);

type RecipientMode = "search" | "manual";

export default function UploadPage() {
  const [keysReady, setKeysReady] = useState(() => isUnlocked());
  const canUseKeys = keysReady;
  const [file, setFile] = useState<File | null>(null);
  const [recipientPublicKey, setRecipientPublicKey] = useState("");
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState<RecipientUser[]>([]);
  const [keyLoading, setKeyLoading] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<number | null>(null);

  const {
    stage,
    sasUrl,
    error,
    chunkProgress,
    uploadPercent,
    plaintextChecksum,
    recipientCount,
    isChunkedMode,
    encryptAndUpload,
    reset,
  } = useUpload();

  const onKeysUnlocked = () => {
    setKeysReady(isUnlocked());
    void syncPublicKeysToServer();
  };

  useEffect(() => {
    if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await searchUsers(searchQuery.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => { if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  async function handleAddRecipient(user: UserSearchResult) {
    if (selectedRecipients.some((r) => r.userId === user.id)) {
      setKeyError("Người này đã có trong danh sách.");
      return;
    }
    if (!user.has_public_key) {
      setKeyError("Người dùng này chưa đăng ký public key lên server.");
      return;
    }
    setKeyError(null);
    setKeyLoading(true);
    try {
      const pk = await getUserPublicKey(user.id);
      fromBase64(pk.public_key_x25519);
      setSelectedRecipients((prev) => [
        ...prev,
        {
          userId: user.id,
          email: user.email,
          displayName: user.display_name,
          publicKeyX25519: pk.public_key_x25519,
          keyVersion: pk.key_version,
        },
      ]);
      setSearchQuery("");
      setSearchResults([]);
    } catch {
      setKeyError("Không lấy được public key. Thử lại sau.");
    } finally {
      setKeyLoading(false);
    }
  }

  function handleRemoveRecipient(userId: string) {
    setSelectedRecipients((prev) => prev.filter((r) => r.userId !== userId));
    setKeyError(null);
  }

  function handleClearRecipients() {
    setSelectedRecipients([]);
    setSearchQuery("");
    setSearchResults([]);
    setKeyError(null);
  }

  function handleCopySasUrl() {
    navigator.clipboard.writeText(sasUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    setFile(null);
    setCopied(false);
    reset();
    handleClearRecipients();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const isBusy = stage === "encrypting" || stage === "uploading";
  const isLargeFile = file ? file.size >= CHUNKED_THRESHOLD : false;

  if (stage === "done") {
    return (
      <div className="max-w-2xl mx-auto">
        <DoneCard
          sasUrl={sasUrl}
          copied={copied}
          onCopy={handleCopySasUrl}
          onReset={handleReset}
          plaintextChecksum={plaintextChecksum}
          recipientCount={recipientCount}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <PageHeader
        title="Mã hóa & Upload"
        description="Chọn file, chỉ định người nhận, mã hóa client-side rồi upload lên Azure."
      />

      <KeyUnlockBanner onUnlocked={onKeysUnlocked} />

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isBusy && fileInputRef.current?.click()}
        className={`relative p-10 text-center transition-colors ${isBusy ? "cursor-not-allowed opacity-70" : "cursor-pointer"} ${
          dragging ? dropzone.active : file ? dropzone.filled : dropzone.base
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          disabled={isBusy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        {file ? (
          <div className="space-y-2">
            <p className={`font-medium text-sm truncate max-w-xs mx-auto ${text.primary}`}>{file.name}</p>
            <div className="flex items-center justify-center gap-2">
              <span className={`text-xs ${text.muted}`}>{formatFileSize(file.size)}</span>
              {isLargeFile && (
                <Badge tone="warning">Chunked · {CHUNK_MB}MB/chunk</Badge>
              )}
            </div>
            {!isBusy && <p className={`text-xs ${text.faint}`}>Nhấp để đổi file</p>}
          </div>
        ) : (
          <div className="space-y-1">
            <p className={`text-sm font-medium ${text.secondary}`}>Kéo thả file vào đây</p>
            <p className={`text-xs ${text.muted}`}>hoặc nhấp để chọn · mọi định dạng</p>
          </div>
        )}
      </div>

      <Card className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className={sectionTitle}>Người nhận</h2>
          <SegmentedControl
            value={recipientMode}
            onChange={setRecipientMode}
            disabled={isBusy}
            options={[
              { value: "search", label: "Tìm user" },
              { value: "manual", label: "Dán key" },
            ]}
          />
        </div>

        {recipientMode === "search" ? (
          <div className="space-y-3">
            {selectedRecipients.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className={`text-xs ${text.muted}`}>{selectedRecipients.length} người nhận</p>
                  <button
                    type="button"
                    onClick={handleClearRecipients}
                    disabled={isBusy}
                    className={`text-xs ${text.muted} hover:text-rose-600 dark:hover:text-rose-400`}
                  >
                    Xóa tất cả
                  </button>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {selectedRecipients.map((r) => (
                    <li
                      key={r.userId}
                      className={`flex items-center gap-2 pl-3 pr-1 py-1.5 rounded-md text-sm ${surfaceInset}`}
                    >
                      <span className={`truncate max-w-[180px] ${text.primary}`}>
                        {r.displayName || r.email || r.userId.slice(0, 8)}
                      </span>
                      <Badge tone="neutral">v{r.keyVersion}</Badge>
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient(r.userId)}
                        disabled={isBusy}
                        className={`p-1 rounded ${text.faint} hover:text-slate-700 dark:hover:text-slate-200`}
                        aria-label="Xóa"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm theo email — thêm nhiều người nhận…"
                disabled={isBusy}
                className={`w-full pr-10 ${inputBase}`}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {searchLoading || keyLoading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <svg className={`w-4 h-4 ${text.faint}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )}
              </div>
              {searchResults.length > 0 && (
                <div className={`absolute top-full mt-1 left-0 right-0 z-20 overflow-hidden ${panel.dropdown}`}>
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => void handleAddRecipient(u)}
                      disabled={selectedRecipients.some((r) => r.userId === u.id) || !u.has_public_key}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition text-left disabled:opacity-40"
                    >
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${text.primary}`}>{u.email}</p>
                        {u.display_name && (
                          <p className={`text-xs ${text.muted}`}>{u.display_name}</p>
                        )}
                      </div>
                      {u.has_public_key ? (
                        <Badge tone="success">Thêm</Badge>
                      ) : (
                        <Badge tone="warning">Chưa có key</Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {keyError && <p className="text-xs text-rose-600 dark:text-rose-400">{keyError}</p>}
            <p className={`text-xs ${text.muted}`}>
              Chọn từng người nhận — file xuất hiện trong lịch sử của họ.
              {file && file.size >= CHUNKED_THRESHOLD && (
                <span className="text-amber-700 dark:text-amber-300"> File lớn: chỉ gửi được cho một người.</span>
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Alert tone="warning">
              Chế độ dán key không tạo bản ghi inbox. Dùng <strong>Tìm user</strong> để người nhận thấy file trong lịch sử.
            </Alert>
            <div>
              <label className={label}>X25519 Public Key (base64)</label>
              <textarea
                value={recipientPublicKey}
                onChange={(e) => setRecipientPublicKey(e.target.value)}
                placeholder="Dán public key của người nhận…"
                rows={3}
                disabled={isBusy}
                className={`w-full mt-1.5 font-mono text-sm resize-none ${inputBase}`}
              />
            </div>
          </div>
        )}
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {isBusy && chunkProgress && <ChunkProgressBar progress={chunkProgress} />}
      {isBusy && !chunkProgress && uploadPercent > 0 && (
        <Card padding="sm" className="space-y-2">
          <div className={`flex justify-between text-xs ${text.muted}`}>
            <span>Upload ciphertext</span>
            <span className="font-medium text-indigo-600 dark:text-indigo-400">{uploadPercent}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5">
            <div className="bg-indigo-600 dark:bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadPercent}%` }} />
          </div>
        </Card>
      )}

      <Button
        fullWidth
        loading={isBusy}
        disabled={
          isBusy ||
          !canUseKeys ||
          !file ||
          (recipientMode === "search" && (selectedRecipients.length === 0 || keyLoading)) ||
          (recipientMode === "manual" && !recipientPublicKey.trim())
        }
        onClick={() =>
          encryptAndUpload(
            file,
            recipientMode === "search" ? selectedRecipients : [],
            recipientMode === "manual" ? recipientPublicKey : undefined
          )
        }
      >
        {stage === "encrypting"
          ? isChunkedMode
            ? `Mã hóa chunk (${CHUNK_MB}MB)…`
            : "Đang mã hóa…"
          : stage === "uploading"
            ? isChunkedMode
              ? "Multipart upload…"
              : "Đang upload…"
            : "Mã hóa & Upload"}
      </Button>

    </div>
  );
}

function ChunkProgressBar({ progress }: { progress: ChunkProgress }) {
  const { phase, done, total, currentMB } = progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isEncrypt = phase === "encrypt";

  return (
    <Card padding="sm" className="space-y-2">
      <div className={`flex items-center justify-between text-xs ${text.muted}`}>
        <span>
          {isEncrypt ? "Mã hóa" : "Upload"} chunk {done + (isEncrypt ? 1 : 0)}/{total}
          {currentMB > 0 && ` · ${currentMB}MB`}
        </span>
        <span className="font-medium text-indigo-600 dark:text-indigo-400">{pct}%</span>
      </div>
      <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${isEncrypt ? "bg-amber-500" : "bg-indigo-600 dark:bg-indigo-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Card>
  );
}

function DoneCard({
  sasUrl, copied, onCopy, onReset, plaintextChecksum, recipientCount,
}: {
  sasUrl: string;
  copied: boolean;
  onCopy: () => void;
  onReset: () => void;
  plaintextChecksum: string;
  recipientCount: number;
}) {
  const [checksumCopied, setChecksumCopied] = useState(false);

  function handleCopyChecksum() {
    navigator.clipboard.writeText(plaintextChecksum);
    setChecksumCopied(true);
    setTimeout(() => setChecksumCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Mã hóa & Upload" />

      <Alert tone="success">
        <p className="font-medium">Upload thành công</p>
        <p className={`text-xs mt-1 ${text.muted}`}>
          File đã mã hóa và lưu trên Azure.
          {recipientCount > 1 && ` Đã chia sẻ cho ${recipientCount} người nhận.`}
        </p>
      </Alert>

      {plaintextChecksum && (
        <Card padding="sm" className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={label}>SHA-256 checksum</span>
            <button type="button" onClick={handleCopyChecksum} className={`text-xs ${btn.ghost}`}>
              {checksumCopied ? "Đã copy" : "Copy"}
            </button>
          </div>
          <p className={`text-xs font-mono break-all ${text.muted}`}>{plaintextChecksum}</p>
        </Card>
      )}

      <Card className="space-y-3">
        <label className={label}>SAS link chia sẻ</label>
        <div className="flex gap-2">
          <input readOnly value={sasUrl} className={`flex-1 text-xs font-mono ${inputBase}`} />
          <Button variant="secondary" onClick={onCopy}>
            {copied ? "Đã copy" : "Copy"}
          </Button>
        </div>
      </Card>

      <Button variant="secondary" fullWidth onClick={onReset}>
        Upload file khác
      </Button>
    </div>
  );
}

