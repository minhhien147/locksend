import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { CHUNKED_THRESHOLD, DEFAULT_CHUNK_SIZE, loadKeysFromStorage } from "../utils/crypto";
import { useUpload, type ChunkProgress } from "../hooks/useUpload";
import { LoadingSpinner } from "../components/LoadingSpinner";

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const CHUNK_MB = DEFAULT_CHUNK_SIZE / (1024 * 1024);

/** Cards / inputs aligned with App shell indigo–violet */
const surfaceCard =
  "rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/50 via-[#0c0e14]/95 to-violet-950/25 shadow-xl shadow-indigo-950/30";
const inputBase =
  "bg-[#12141c] border border-indigo-500/20 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-indigo-500/35 focus:border-indigo-400/50 transition disabled:opacity-50";

export default function UploadPage() {
  const hasKeys = !!loadKeysFromStorage();
  const [file, setFile] = useState<File | null>(null);
  const [recipientPublicKey, setRecipientPublicKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    stage,
    sasUrl,
    error,
    chunkProgress,
    uploadPercent,
    plaintextChecksum,
    isChunkedMode,
    chunkCount,
    encryptAndUpload,
    reset,
  } = useUpload();

  function handleCopySasUrl() {
    navigator.clipboard.writeText(sasUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    setFile(null);
    setCopied(false);
    reset();
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
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Mã hóa & Upload</h1>

        {/* Banner nhắc tạo key nếu chưa có */}
        {!hasKeys && (
          <div className="mt-4 flex items-center gap-3 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-sm text-amber-300/90">
              Bạn chưa có keypair.{" "}
              <Link to="/keys" className="font-semibold underline underline-offset-2 hover:text-amber-200 transition">
                Vào trang Keys để tạo
              </Link>{" "}
              trước khi upload.
            </p>
          </div>
        )}
      </div>

      {/* ── Drop zone ── */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isBusy && fileInputRef.current?.click()}
        className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer p-10 text-center
          ${dragging
            ? "border-indigo-500 bg-indigo-500/10"
            : file
            ? "border-indigo-400/45 bg-indigo-950/35 hover:bg-indigo-950/45 shadow-lg shadow-indigo-950/20"
            : "border-indigo-400/25 bg-gradient-to-b from-indigo-950/40 to-[#0a0c12]/95 hover:border-indigo-400/40 hover:from-indigo-950/50 shadow-lg shadow-black/30"
          } ${isBusy ? "cursor-not-allowed" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          disabled={isBusy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        {file ? (
          <div className="space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
              <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-white text-sm truncate max-w-xs mx-auto">{file.name}</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <p className="text-xs text-white/40">{formatFileSize(file.size)}</p>
                {isLargeFile && (
                  <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
                    Chunked ({chunkCount} × {CHUNK_MB}MB)
                  </span>
                )}
              </div>
            </div>
            {!isBusy && (
              <p className="text-[11px] text-white/25">Nhấp để đổi file</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/12 border border-indigo-400/25 flex items-center justify-center">
              <svg className="w-7 h-7 text-indigo-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white/75">Kéo thả file vào đây</p>
              <p className="text-xs text-white/40 mt-0.5">hoặc nhấp để chọn file · Mọi định dạng đều được</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Recipient public key ── */}
      <div className={`${surfaceCard} p-5 space-y-4`}>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400/90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <span className="text-sm font-medium text-white/85">Thông tin người nhận</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[12px] text-white/40 mb-1.5">
              X25519 Public Key của người nhận <span className="text-rose-400">*</span>
            </label>
            <textarea
              value={recipientPublicKey}
              onChange={(e) => setRecipientPublicKey(e.target.value)}
              placeholder="Dán X25519 Public Key (base64) của người nhận..."
              rows={3}
              disabled={isBusy}
              className={`w-full rounded-xl px-3.5 py-2.5 text-sm font-mono text-white/85 resize-none ${inputBase}`}
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-400">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Progress bars */}
      {isBusy && chunkProgress && <ChunkProgressBar progress={chunkProgress} />}
      {isBusy && !chunkProgress && uploadPercent > 0 && (
        <div className={`${surfaceCard} p-4 space-y-2`}>
          <div className="flex justify-between text-xs text-white/55">
            <span>Upload ciphertext...</span>
            <span className="text-indigo-400 font-semibold">{uploadPercent}%</span>
          </div>
          <div className="w-full bg-indigo-950/60 rounded-full h-1.5">
            <div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadPercent}%` }} />
          </div>
        </div>
      )}

      {/* Upload button */}
      <button
        onClick={() => encryptAndUpload(file, recipientPublicKey)}
        disabled={isBusy || !file}
        className={`w-full py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2
          ${isBusy || !file
            ? "bg-white/[0.06] text-white/25 cursor-not-allowed"
            : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/20"
          }`}
      >
        {stage === "encrypting" ? (
          <>
            <LoadingSpinner size="sm" />
            {isChunkedMode ? `Mã hóa chunk... (${CHUNK_MB}MB/chunk)` : "Đang mã hóa..."}
          </>
        ) : stage === "uploading" ? (
          <>
            <LoadingSpinner size="sm" />
            {isChunkedMode ? "Multipart upload Azure..." : "Uploading..."}
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Mã hóa & Upload
          </>
        )}
      </button>

    </div>
  );
}

function ChunkProgressBar({ progress }: { progress: ChunkProgress }) {
  const { phase, done, total, currentMB } = progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isEncrypt = phase === "encrypt";

  return (
    <div className={`${surfaceCard} p-4 space-y-3`}>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-white/60">
          <span className={`w-1.5 h-1.5 rounded-full ${isEncrypt ? "bg-amber-400" : "bg-indigo-400"} animate-pulse`} />
          <span>{isEncrypt ? "Mã hóa" : "Upload"} chunk {done + (isEncrypt ? 1 : 0)}/{total}
            {currentMB > 0 && ` (${currentMB}MB)`}
          </span>
        </div>
        <span className={`font-bold ${isEncrypt ? "text-amber-400" : "text-indigo-400"}`}>{pct}%</span>
      </div>
      <div className="w-full bg-indigo-950/60 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${isEncrypt ? "bg-amber-500" : "bg-indigo-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DoneCard({
  sasUrl, copied, onCopy, onReset, plaintextChecksum,
}: {
  sasUrl: string; copied: boolean; onCopy: () => void; onReset: () => void; plaintextChecksum: string;
}) {
  const [checksumCopied, setChecksumCopied] = useState(false);

  function handleCopyChecksum() {
    navigator.clipboard.writeText(plaintextChecksum);
    setChecksumCopied(true);
    setTimeout(() => setChecksumCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Mã hóa & Upload</h1>
      </div>

      {/* Success banner */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-emerald-400 text-sm">Upload thành công!</p>
          <p className="text-xs text-white/40 mt-0.5">File đã được mã hóa và lưu trên Azure Blob Storage.</p>
        </div>
      </div>

      {/* Checksum */}
      {plaintextChecksum && (
        <div className="bg-indigo-500/8 border border-indigo-500/15 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">SHA-256 Checksum</span>
            </div>
            <button onClick={handleCopyChecksum} className="text-[11px] text-indigo-400/70 hover:text-indigo-300 transition">
              {checksumCopied ? "Đã copy!" : "Copy"}
            </button>
          </div>
          <p className="text-[11px] font-mono text-white/50 break-all leading-relaxed">{plaintextChecksum}</p>
        </div>
      )}

      {/* SAS Link */}
      <div className={`${surfaceCard} p-5 space-y-3`}>
        <label className="block text-[12px] font-semibold text-white/50 uppercase tracking-wider">SAS Link chia sẻ</label>
        <div className="flex gap-2">
          <input
            readOnly
            value={sasUrl}
            className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-mono text-white/70 ${inputBase}`}
          />
          <button
            onClick={onCopy}
            className="bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/20 text-indigo-400 px-4 py-2.5 rounded-xl text-xs font-semibold transition whitespace-nowrap"
          >
            {copied ? "Đã copy!" : "Copy link"}
          </button>
        </div>
      </div>

      <button
        onClick={onReset}
        className="w-full border border-white/[0.10] text-white/50 hover:text-white/80 hover:border-white/[0.20] py-3 rounded-xl text-sm transition"
      >
        Upload file khác
      </button>
    </div>
  );
}

