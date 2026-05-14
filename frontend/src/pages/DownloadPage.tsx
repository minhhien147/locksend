import { useState } from "react";
import { useDownload, type ChunkDecryptProgress } from "../hooks/useDownload";
import { LoadingSpinner } from "../components/LoadingSpinner";

const surfaceCard =
  "rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/50 via-[#0c0e14]/95 to-violet-950/25 shadow-xl shadow-indigo-950/30";
const inputBase =
  "bg-[#12141c] border border-indigo-500/20 text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-indigo-500/35 focus:border-indigo-400/50 transition disabled:opacity-50";

export default function DownloadPage() {
  const [sasUrl, setSasUrl] = useState("");
  const {
    stage,
    error,
    fileName,
    chunkProgress,
    isChunkedFile,
    verifiedMeta,
    downloadAndDecrypt,
    reset,
  } = useDownload();

  const isBusy = stage === "downloading" || stage === "decrypting";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Tải & Giải mã</h1>
      </div>

      {/* Input card */}
      <div className={`${surfaceCard} p-5 space-y-4`}>
        <div>
          <label className="block text-[12px] font-medium text-white/50 mb-2">
            SAS Link <span className="text-rose-400">*</span>
          </label>
          <textarea
            value={sasUrl}
            onChange={(e) => setSasUrl(e.target.value)}
            placeholder="Dán SAS Link nhận được từ người gửi..."
            rows={4}
            disabled={isBusy}
            className={`w-full rounded-xl px-4 py-3 text-sm font-mono text-white/75 resize-none ${inputBase}`}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-400">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Chunk progress */}
        {stage === "decrypting" && isChunkedFile && chunkProgress && (
          <ChunkDecryptProgressBar progress={chunkProgress} />
        )}

        {/* Single-shot indicator */}
        {stage === "decrypting" && !isChunkedFile && (
          <div className="flex items-center gap-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3 text-sm text-indigo-400">
            <LoadingSpinner size="sm" className="shrink-0" />
            Đang giải mã (Ed25519 verify + AES-256-GCM decrypt)...
          </div>
        )}

        {/* Downloading indicator */}
        {stage === "downloading" && (
          <div className="flex items-center gap-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-4 py-3 text-sm text-indigo-400">
            <LoadingSpinner size="sm" className="shrink-0" />
            Đang tải ciphertext từ Azure Blob Storage...
          </div>
        )}

        {/* Done result */}
        {stage === "done" && (
          <div className="space-y-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-emerald-400 text-sm">Giải mã thành công!</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    <span className="text-white/60">{fileName}</span> đã được lưu về máy.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(isChunkedFile
                  ? [
                      "Manifest Ed25519 signature hợp lệ",
                      "AES-256-GCM auth tag mỗi chunk OK",
                      "SHA-256 từng chunk khớp manifest",
                      "File toàn vẹn, không bị sửa đổi",
                    ]
                  : [
                      "Chữ ký Ed25519 hợp lệ",
                      "AES-256-GCM tag hợp lệ",
                      ...(verifiedMeta?.plaintextChecksum ? ["SHA-256 plaintext khớp"] : []),
                      "File toàn vẹn, không bị sửa đổi",
                    ]
                ).map((check) => (
                  <div key={check} className="flex items-center gap-1.5 text-[11px] text-emerald-400/70">
                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {check}
                  </div>
                ))}
              </div>
            </div>

            {verifiedMeta?.plaintextChecksum && (
              <div className="bg-indigo-500/8 border border-indigo-500/15 rounded-xl p-3 space-y-1">
                <p className="text-[11px] font-bold text-indigo-400/70 uppercase tracking-wider">SHA-256 đã xác minh</p>
                <p className="text-[11px] font-mono text-white/40 break-all leading-relaxed">{verifiedMeta.plaintextChecksum}</p>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => downloadAndDecrypt(sasUrl)}
            disabled={isBusy || !sasUrl.trim()}
            className={`flex-1 py-3 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2
              ${isBusy || !sasUrl.trim()
                ? "bg-white/[0.06] text-white/25 cursor-not-allowed"
                : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/20"
              }`}
          >
            {isBusy ? (
              <>
                <LoadingSpinner size="sm" />
                {stage === "downloading" ? "Đang tải..." : "Đang giải mã..."}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Tải & Giải mã
              </>
            )}
          </button>
          {stage === "done" && (
            <button
              onClick={() => { setSasUrl(""); reset(); }}
              className="px-5 border border-white/[0.10] text-white/40 hover:text-white/70 hover:border-white/[0.20] rounded-xl text-sm transition"
            >
              Mới
            </button>
          )}
        </div>
      </div>

    </div>
  );
}

function ChunkDecryptProgressBar({ progress }: { progress: ChunkDecryptProgress }) {
  const { done, total } = progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/50 via-[#0c0e14]/95 to-violet-950/25 shadow-lg shadow-indigo-950/30 p-4 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-amber-400">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Giải mã chunk {done}/{total}
        </div>
        <span className="font-bold text-amber-400">{pct}%</span>
      </div>
      <div className="w-full bg-indigo-950/60 rounded-full h-1.5 overflow-hidden">
        <div className="bg-amber-500 h-1.5 rounded-full transition-all duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

