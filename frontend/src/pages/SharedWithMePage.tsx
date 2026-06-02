import { useState, useEffect } from "react";
import {
  getSharedWithMe,
  getSharedFileSas,
  type SharedFileItem,
} from "../utils/api";
import { useDownload } from "../hooks/useDownload";
import { LoadingSpinner } from "../components/LoadingSpinner";

import { surfaceCard, btn } from "../styles/theme";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function FileIcon() {
  return (
    <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function DownloadProgress({ stage, fileName }: { stage: string; fileName: string }) {
  if (stage === "idle" || stage === "done") return null;
  const label =
    stage === "downloading" ? "Đang tải…" :
    stage === "decrypting" ? "Đang giải mã…" :
    stage === "error" ? "Lỗi" : "";
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-indigo-300">
      <LoadingSpinner size="sm" />
      {label} {fileName || ""}
    </span>
  );
}

function SharedFileCard({ item }: { item: SharedFileItem }) {
  const { stage, error, fileName, downloadAndDecrypt, reset } = useDownload();
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  async function handleDownload() {
    setUrlError(null);
    setFetchingUrl(true);
    try {
      const sas = await getSharedFileSas(item.file_id);
      let recipientMetadata: Record<string, unknown> | undefined;
      try {
        recipientMetadata = JSON.parse(item.wrapped_file_key) as Record<string, unknown>;
      } catch {
        recipientMetadata = undefined;
      }
      await downloadAndDecrypt(sas.sas_url, recipientMetadata);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Không lấy được link tải";
      setUrlError(msg);
    } finally {
      setFetchingUrl(false);
    }
  }

  const busy = fetchingUrl || stage === "downloading" || stage === "decrypting";

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 hover:border-white/[0.12] transition space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center shrink-0">
          <FileIcon />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white/90 text-sm truncate">{item.original_filename}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            <span className="text-[11px] text-white/35">{formatFileSize(item.file_size_bytes)}</span>
            <span className="text-[11px] text-white/35">
              Nhận lúc {formatDate(item.granted_at)}
            </span>
          </div>
          {(item.sender_name || item.sender_email) && (
            <p className="text-[11px] text-indigo-300/70 mt-0.5">
              Từ: {item.sender_name || item.sender_email}
            </p>
          )}
        </div>
      </div>

      {/* Status */}
      {stage === "done" && (
        <div className="flex items-center gap-2 text-[12px] text-emerald-400 bg-emerald-500/8 border border-emerald-500/15 rounded-xl px-3 py-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Đã tải &amp; giải mã: {fileName}
          <button onClick={reset} className="ml-auto text-white/30 hover:text-white/60 transition">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {(error || urlError) && (
        <div className="text-[12px] text-rose-400 bg-rose-500/8 border border-rose-500/15 rounded-xl px-3 py-2 flex items-start gap-2">
          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error || urlError}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <DownloadProgress stage={stage} fileName={fileName} />
        {stage !== "done" && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy}
            className={`ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition
              ${busy
                ? "bg-white/[0.05] text-white/25 cursor-not-allowed"
                : btn.primary
              }`}
          >
            {busy ? <LoadingSpinner size="sm" /> : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            {busy ? "Đang xử lý…" : "Tải & Giải mã"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SharedWithMePage() {
  const [files, setFiles] = useState<SharedFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function loadFiles() {
    setLoading(true);
    setError(null);
    getSharedWithMe()
      .then(setFiles)
      .catch((e: unknown) => {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Không tải được danh sách file";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadFiles(); }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Hộp nhận</h1>
          <p className="text-sm text-white/40 mt-1">File được chia sẻ cho bạn</p>
        </div>
        <button
          onClick={loadFiles}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] text-white/40 hover:text-white/70 hover:border-white/[0.15] transition disabled:opacity-50"
        >
          {loading ? <LoadingSpinner size="sm" /> : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Tải lại
        </button>
      </div>

      {loading && (
        <div className={`${surfaceCard} p-12 flex flex-col items-center gap-3`}>
          <LoadingSpinner size="lg" />
          <p className="text-sm text-white/40">Đang tải…</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-400">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {!loading && !error && files.length === 0 && (
        <div className={`${surfaceCard} p-12 text-center space-y-3`}>
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center">
            <svg className="w-7 h-7 text-indigo-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-white/50 text-sm">Chưa có file nào được chia sẻ cho bạn.</p>
          <p className="text-white/25 text-[12px]">
            Khi ai đó chia sẻ file với bạn, chúng sẽ xuất hiện tại đây.
          </p>
        </div>
      )}

      {!loading && files.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-white/40">{files.length} file được chia sẻ</p>
          {files.map((f) => (
            <SharedFileCard key={f.file_id} item={f} />
          ))}
        </div>
      )}
    </div>
  );
}
