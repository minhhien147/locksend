import { useState, useRef } from "react";
import { CHUNKED_THRESHOLD, DEFAULT_CHUNK_SIZE } from "../utils/crypto";
import { useUpload, type ChunkProgress } from "../hooks/useUpload";

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [recipientId, setRecipientId] = useState("");
  const [recipientPublicKey, setRecipientPublicKey] = useState("");
  const [copied, setCopied] = useState(false);
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

  const isBusy = stage === "encrypting" || stage === "uploading";

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Mã hóa & Upload File</h1>
      <p className="text-gray-500 text-sm mb-6">
        File được mã hóa hoàn toàn trong trình duyệt trước khi upload. Server chỉ nhận ciphertext.
        File ≥ {DEFAULT_CHUNK_SIZE / (1024 * 1024)}MB tự động dùng Chunked Encryption.
      </p>

      {stage === "done" ? (
        <DoneCard
          sasUrl={sasUrl}
          copied={copied}
          onCopy={handleCopySasUrl}
          onReset={handleReset}
          plaintextChecksum={plaintextChecksum}
        />
      ) : (
        <div className="space-y-4">
          {/* File picker */}
          <div className="bg-white rounded-xl shadow p-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">Chọn File</label>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError("");
              }}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {file && (
              <div className="mt-2 flex items-center gap-3">
                <p className="text-xs text-gray-400">
                  {file.name} — {formatFileSize(file.size)}
                </p>
                {isChunkedMode && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    Chunked ({chunkCount} × {DEFAULT_CHUNK_SIZE / (1024 * 1024)}MB)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Recipient */}
          <div className="bg-white rounded-xl shadow p-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recipient User ID (tuỳ chọn)
            </label>
            <input
              type="text"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              placeholder="Email hoặc ID người nhận..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <label className="block text-sm font-medium text-gray-700 mb-1">
              X25519 Public Key của người nhận <span className="text-red-500">*</span>
            </label>
            <textarea
              value={recipientPublicKey}
              onChange={(e) => setRecipientPublicKey(e.target.value)}
              placeholder="Dán X25519 Public Key (base64) của người nhận..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Chunk progress */}
          {isBusy && chunkProgress && (
            <ChunkProgressBar progress={chunkProgress} />
          )}

          {/* Single-shot upload progress */}
          {isBusy && !chunkProgress && uploadPercent > 0 && (
            <div className="bg-white rounded-xl shadow p-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Upload ciphertext...</span>
                <span>{uploadPercent}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-indigo-500 h-2 rounded-full transition-all"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            </div>
          )}

          <button
            onClick={() => encryptAndUpload(file, recipientPublicKey)}
            disabled={isBusy}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {stage === "encrypting"
              ? isChunkedMode
                ? "Đang mã hóa từng chunk (X25519 + AES-256-GCM)..."
                : "Đang mã hóa (X25519 + AES-256-GCM)..."
              : stage === "uploading"
              ? isChunkedMode
                ? "Đang multipart upload lên Azure Block Blob..."
                : "Đang upload ciphertext lên Azure..."
              : "Mã hóa & Upload"}
          </button>

          <FlowInfo isChunked={isChunkedMode} chunkCount={chunkCount} />
        </div>
      )}
    </div>
  );
}

function ChunkProgressBar({ progress }: { progress: ChunkProgress }) {
  const { phase, done, total, currentMB } = progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isEncrypt = phase === "encrypt";

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span className="font-medium">
          {isEncrypt ? "Mã hóa" : "Upload"} chunk {done + (isEncrypt ? 1 : 0)}/{total}
          {currentMB > 0 && ` (${currentMB}MB)`}
        </span>
        <span className="text-indigo-600 font-semibold">{pct}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-2.5 rounded-full transition-all duration-300 ${
            isEncrypt ? "bg-amber-500" : "bg-indigo-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
          Mã hóa chunk
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
          Upload chunk
        </span>
      </div>
    </div>
  );
}

function DoneCard({
  sasUrl,
  copied,
  onCopy,
  onReset,
  plaintextChecksum,
}: {
  sasUrl: string;
  copied: boolean;
  onCopy: () => void;
  onReset: () => void;
  plaintextChecksum: string;
}) {
  const [checksumCopied, setChecksumCopied] = useState(false);

  function handleCopyChecksum() {
    navigator.clipboard.writeText(plaintextChecksum);
    setChecksumCopied(true);
    setTimeout(() => setChecksumCopied(false), 2000);
  }

  return (
    <div className="bg-white rounded-xl shadow p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
          <span className="text-green-600 text-xl">✓</span>
        </div>
        <div>
          <p className="font-semibold text-gray-800">Upload thành công!</p>
          <p className="text-sm text-gray-500">File đã được mã hóa và lưu trên Azure Blob Storage.</p>
        </div>
      </div>

      {/* Checksum panel */}
      {plaintextChecksum && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
              SHA-256 Plaintext Checksum
            </p>
            <button
              onClick={handleCopyChecksum}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              {checksumCopied ? "Đã copy!" : "Copy"}
            </button>
          </div>
          <p className="text-xs font-mono text-blue-800 break-all leading-relaxed">
            {plaintextChecksum}
          </p>
          <p className="text-xs text-blue-500">
            Gửi hash này cho người nhận để xác minh file gốc — nếu không khớp, file đã bị thay đổi.
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">SAS Link chia sẻ</label>
        <div className="flex gap-2">
          <input
            readOnly
            value={sasUrl}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50"
          />
          <button
            onClick={onCopy}
            className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-200 transition"
          >
            {copied ? "Đã copy!" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Gửi link này cho người nhận. Link có hiệu lực 24h và chỉ đọc được.
        </p>
      </div>
      <button
        onClick={onReset}
        className="w-full border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 transition"
      >
        Upload file khác
      </button>
    </div>
  );
}

function FlowInfo({ isChunked, chunkCount }: { isChunked: boolean; chunkCount: number }) {
  const CHUNK_MB = DEFAULT_CHUNK_SIZE / (1024 * 1024);
  const steps = isChunked
    ? [
        "Chọn file + nhập public key người nhận",
        "X25519 Ephemeral Key Exchange → Shared Secret",
        "HKDF-SHA256 → AES-256 Key (+ base nonce 8 bytes)",
        `Chia file thành ${chunkCount} chunk × ${CHUNK_MB}MB`,
        "Mỗi chunk: tính SHA-256 plaintext → AES-256-GCM encrypt → upload",
        "SHA-256 từng chunk được ký cùng Ed25519 manifest",
        "commit_block_list → SAS Link (người nhận verify SHA-256 per-chunk)",
      ]
    : [
        "Chọn file + nhập public key người nhận",
        "X25519 Ephemeral Key Exchange → Shared Secret",
        "HKDF-SHA256 → AES-256 Key + Nonce",
        "Tính SHA-256 plaintext → AES-256-GCM Encrypt → Ed25519 Sign",
        "Upload ciphertext lên Azure Blob Storage",
        "Nhận SAS Link + SHA-256 checksum để chia sẻ",
      ];

  return (
    <div className={`rounded-xl p-4 ${isChunked ? "bg-amber-50 border border-amber-100" : "bg-gray-50"}`}>
      <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">
        Quy trình {isChunked ? "Chunked Encryption" : "mã hóa"}
      </p>
      <ol className="space-y-1">
        {steps.map((s, i) => (
          <li key={i} className="text-xs text-gray-500 flex gap-2">
            <span className="text-indigo-400 font-bold shrink-0">{i + 1}.</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
