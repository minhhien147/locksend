import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getVaultQuota,
  getVaultFolders,
  getVaultFiles,
  createVaultFolder,
  deleteVaultFile,
  type VaultFile,
  type VaultFolder,
  type VaultQuota,
} from "../utils/api";
import { useUpload } from "../hooks/useUpload";
import { useDownload } from "../hooks/useDownload";
import VaultShareDialog from "../components/VaultShareDialog";
import KeyUnlockBanner from "../components/KeyUnlockBanner";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import PageLoader, { LoadingSpinner } from "../components/LoadingSpinner";
import { isUnlocked } from "../utils/keyVault";
import { dropzone, inputBase, text } from "../styles/theme";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function VaultFileRow({
  file,
  onRefresh,
  onShare,
}: {
  file: VaultFile;
  onRefresh: () => void;
  onShare: (f: VaultFile) => void;
}) {
  const {
    stage,
    error,
    fileName,
    chunkProgress,
    downloadVaultFile,
    reset,
  } = useDownload();
  const [busy, setBusy] = useState(false);
  const [delBusy, setDelBusy] = useState(false);

  async function handleDownload() {
    setBusy(true);
    reset();
    try {
      await downloadVaultFile(file.file_id, file.encryption_metadata);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? (e as Error).message;
      alert(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Xóa "${file.original_filename}" khỏi kho?`)) return;
    setDelBusy(true);
    try {
      await deleteVaultFile(file.file_id);
      onRefresh();
    } catch {
      alert("Không xóa được file");
    } finally {
      setDelBusy(false);
    }
  }

  const isWorking =
    busy || delBusy || stage === "downloading" || stage === "decrypting";

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate text-white/90">
            {file.original_filename}
          </p>
          <p className="text-xs text-white/35 mt-0.5">
            {formatBytes(file.file_size_bytes)}
            {file.chunk_count > 1 ? ` · ${file.chunk_count} chunks` : ""}
            {" · "}
            {formatDate(file.created_at)}
          </p>
          {file.shared_count > 0 && (
            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
              Đã chia sẻ {file.shared_count} người
            </span>
          )}
        </div>
      </div>

      {stage === "done" && (
        <Alert tone="success">Đã tải: {fileName}</Alert>
      )}
      {(error || stage === "error") && error && (
        <Alert tone="error">{error}</Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={isWorking}
          onClick={() => void handleDownload()}
        >
          {busy || stage === "downloading" || stage === "decrypting" ? (
            <span className="flex items-center gap-1.5">
              <LoadingSpinner size="xs" />
              {stage === "decrypting" && chunkProgress
                ? `Giải mã ${chunkProgress.done}/${chunkProgress.total}…`
                : stage === "downloading"
                  ? "Đang tải file lớn…"
                  : "Đang xử lý…"}
            </span>
          ) : (
            "Tải về"
          )}
        </Button>
        <Button
          variant="secondary"
          disabled={isWorking || !file.can_share}
          onClick={() => onShare(file)}
          title={file.can_share ? undefined : "File chunked chưa hỗ trợ chia sẻ"}
        >
          Chia sẻ
        </Button>
        <button
          type="button"
          disabled={isWorking}
          onClick={() => void handleDelete()}
          className="text-xs px-3 py-2 rounded-xl border border-rose-500/25 text-rose-400 hover:bg-rose-500/10 disabled:opacity-40"
        >
          {delBusy ? "…" : "Xóa"}
        </button>
      </div>
    </div>
  );
}

export function VaultPanel({ embedded = false }: { embedded?: boolean }) {
  const [keysReady, setKeysReady] = useState(() => isUnlocked());
  const [quota, setQuota] = useState<VaultQuota | null>(null);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [shareFile, setShareFile] = useState<VaultFile | null>(null);
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const { encryptAndUpload, stage, error: uploadError, reset: resetUpload } =
    useUpload();
  const uploading = stage === "encrypting" || stage === "uploading";

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [q, f, fl] = await Promise.all([
        getVaultQuota(),
        getVaultFiles({ folderId, q: search || undefined }),
        getVaultFolders(),
      ]);
      setQuota(q);
      setFiles(f);
      setFolders(fl);
    } catch {
      setError("Không tải được kho lưu trữ");
    } finally {
      setLoading(false);
    }
  }, [folderId, search]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      await createVaultFolder(name, folderId);
      setNewFolderName("");
      await loadAll();
    } catch {
      alert("Không tạo được thư mục (tên trùng?)");
    }
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList);
    if (arr.length === 0) return;
    setUploadQueue(arr);
    for (const f of arr) {
      try {
        resetUpload();
        await encryptAndUpload(f, [], undefined, {
          purpose: "vault",
          folderId,
        });
      } catch {
        break;
      }
    }
    setUploadQueue([]);
    await loadAll();
  }

  const quotaPct =
    quota && quota.quota_bytes > 0
      ? Math.min(100, Math.round((quota.used_bytes / quota.quota_bytes) * 100))
      : 0;

  return (
    <div className={embedded ? "space-y-5" : "max-w-5xl mx-auto space-y-5"}>
      {!embedded && (
        <PageHeader
          title="Kho lưu trữ"
          description="Lưu file riêng tư — mã hóa bằng key của bạn, có thể chia sẻ sau"
        />
      )}

      <KeyUnlockBanner onUnlocked={() => setKeysReady(isUnlocked())} />

      {quota && (
        <Card padding="sm" className="space-y-2">
          <div className="flex justify-between text-xs text-white/50">
            <span>
              Đã dùng {formatBytes(quota.used_bytes)} / {formatBytes(quota.quota_bytes)}
            </span>
            <span>{quota.file_count} file</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                quotaPct > 90 ? "bg-rose-500" : "bg-indigo-500"
              }`}
              style={{ width: `${quotaPct}%` }}
            />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
        <aside className="space-y-2">
          <p className={`text-xs font-semibold uppercase tracking-wider ${text.faint}`}>
            Thư mục
          </p>
          <button
            type="button"
            onClick={() => setFolderId(null)}
            className={`w-full text-left px-3 py-2 rounded-xl text-sm transition ${
              folderId === null
                ? "bg-indigo-500/20 text-indigo-300"
                : "hover:bg-white/5 text-white/60"
            }`}
          >
            Tất cả (gốc)
          </button>
          {folders.map((fo) => (
            <button
              key={fo.id}
              type="button"
              onClick={() => setFolderId(fo.id)}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm truncate transition ${
                folderId === fo.id
                  ? "bg-indigo-500/20 text-indigo-300"
                  : "hover:bg-white/5 text-white/60"
              }`}
            >
              {fo.name}
              <span className="text-white/30 ml-1">({fo.file_count})</span>
            </button>
          ))}
          <div className="flex gap-1 pt-2">
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Thư mục mới"
              className={`flex-1 text-xs ${inputBase}`}
            />
            <button
              type="button"
              onClick={() => void handleCreateFolder()}
              className="px-2 py-1 text-xs rounded-lg bg-indigo-500/20 text-indigo-300"
            >
              +
            </button>
          </div>
        </aside>

        <div className="space-y-4">
          <div
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (keysReady && !uploading) void uploadFiles(e.dataTransfer.files);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onClick={() => keysReady && !uploading && fileInputRef.current?.click()}
            className={`p-8 text-center rounded-2xl border-2 border-dashed transition cursor-pointer ${
              dragging ? dropzone.active : dropzone.base
            } ${uploading || !keysReady ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              disabled={!keysReady || uploading}
              onChange={(e) => {
                if (e.target.files) void uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {uploading ? (
              <p className="text-sm text-indigo-300 flex items-center justify-center gap-2">
                <LoadingSpinner size="sm" />
                Đang lưu vào kho…
                {uploadQueue.length > 1 && ` (${uploadQueue.length} file)`}
              </p>
            ) : (
              <p className={`text-sm ${text.secondary}`}>
                Kéo thả hoặc chọn file để lưu vào kho
              </p>
            )}
          </div>

          {uploadError && <Alert tone="error">{uploadError}</Alert>}

          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên file…"
              className={`flex-1 text-sm ${inputBase}`}
            />
            <Button variant="secondary" onClick={() => void loadAll()}>
              Tải lại
            </Button>
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          {loading ? (
            <PageLoader variant="embedded" title="Đang tải kho…" />
          ) : files.length === 0 ? (
            <Card className="text-center py-12">
              <p className={`text-sm ${text.muted}`}>Chưa có file trong thư mục này.</p>
              <p className={`text-xs mt-2 ${text.faint}`}>
                Hoặc dùng{" "}
                <Link to="/" className="text-indigo-400 hover:underline">
                  Upload → Lưu kho
                </Link>
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {files.map((f) => (
                <VaultFileRow
                  key={f.file_id}
                  file={f}
                  onRefresh={() => void loadAll()}
                  onShare={setShareFile}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {shareFile && (
        <VaultShareDialog
          file={shareFile}
          onClose={() => setShareFile(null)}
          onShared={() => void loadAll()}
        />
      )}
    </div>
  );
}

export default function VaultPage() {
  return <VaultPanel />;
}
