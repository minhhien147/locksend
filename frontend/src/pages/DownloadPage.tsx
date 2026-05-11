import { useState } from "react";
import { useDownload, type ChunkDecryptProgress } from "../hooks/useDownload";

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
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Tải & Giải mã File</h1>
      <p className="text-gray-500 text-sm mb-6">
        File được giải mã hoàn toàn trong trình duyệt. Server không bao giờ thấy nội dung gốc.
        Hỗ trợ cả single-shot và chunked encryption.
      </p>

      <div className="bg-white rounded-xl shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            SAS Link <span className="text-red-500">*</span>
          </label>
          <textarea
            value={sasUrl}
            onChange={(e) => setSasUrl(e.target.value)}
            placeholder="Dán SAS Link nhận được từ người gửi..."
            rows={4}
            disabled={isBusy}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none disabled:bg-gray-50"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <strong>Lỗi:</strong> {error}
          </div>
        )}

        {/* Chunk decrypt progress */}
        {stage === "decrypting" && isChunkedFile && chunkProgress && (
          <ChunkDecryptProgressBar progress={chunkProgress} />
        )}

        {/* Simple decrypting indicator for single-shot */}
        {stage === "decrypting" && !isChunkedFile && (
          <div className="bg-indigo-50 rounded-lg p-3 text-sm text-indigo-700 animate-pulse">
            Đang giải mã (Ed25519 verify + AES-256-GCM decrypt)...
          </div>
        )}

        {stage === "done" && (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-semibold text-sm">Giải mã thành công!</p>
              <p className="text-green-600 text-xs mt-1">
                File <strong>{fileName}</strong> đã được tải về máy của bạn.
              </p>
              <ul className="mt-2 text-xs text-green-600 space-y-1">
                {isChunkedFile ? (
                  <>
                    <li>✓ Manifest Ed25519 signature hợp lệ</li>
                    <li>✓ Tất cả chunk AES-256-GCM auth tag hợp lệ</li>
                    <li>✓ SHA-256 từng chunk plaintext khớp manifest</li>
                    <li>✓ Số chunk và baseNonce khớp metadata</li>
                    <li>✓ File toàn vẹn, không bị sửa đổi hoặc nhiễm mã độc</li>
                  </>
                ) : (
                  <>
                    <li>✓ Chữ ký Ed25519 hợp lệ</li>
                    <li>✓ AES-256-GCM tag hợp lệ</li>
                    {verifiedMeta?.plaintextChecksum && (
                      <li>✓ SHA-256 plaintext khớp — nội dung file nguyên vẹn</li>
                    )}
                    <li>✓ File toàn vẹn, không bị sửa đổi hoặc nhiễm mã độc</li>
                  </>
                )}
              </ul>
            </div>

            {/* Checksum display */}
            {verifiedMeta?.plaintextChecksum && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                  SHA-256 Plaintext đã xác minh
                </p>
                <p className="text-xs font-mono text-blue-800 break-all leading-relaxed">
                  {verifiedMeta.plaintextChecksum}
                </p>
                <p className="text-xs text-blue-500">
                  So sánh với hash mà người gửi cung cấp để xác nhận file không bị thay thế.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => downloadAndDecrypt(sasUrl)}
            disabled={isBusy}
            className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {stage === "downloading"
              ? "Đang tải ciphertext từ Azure..."
              : stage === "decrypting"
              ? isChunkedFile
                ? "Đang giải mã từng chunk..."
                : "Đang giải mã (Ed25519 + AES-256-GCM)..."
              : "Tải & Giải mã"}
          </button>
          {stage === "done" && (
            <button
              onClick={() => {
                setSasUrl("");
                reset();
              }}
              className="px-4 border border-gray-300 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition"
            >
              Mới
            </button>
          )}
        </div>
      </div>

      <FlowInfo />
    </div>
  );
}

function ChunkDecryptProgressBar({ progress }: { progress: ChunkDecryptProgress }) {
  const { done, total } = progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between text-xs text-amber-700">
        <span className="font-medium">Giải mã chunk {done}/{total}</span>
        <span className="font-semibold">{pct}%</span>
      </div>
      <div className="w-full bg-amber-100 rounded-full h-2.5 overflow-hidden">
        <div
          className="bg-amber-500 h-2.5 rounded-full transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-amber-600">
        Xác thực AES-256-GCM auth tag mỗi chunk trước khi ghép lại plaintext...
      </p>
    </div>
  );
}

function FlowInfo() {
  const steps = [
    "Nhập SAS Link nhận được từ người gửi",
    "Tải ciphertext + metadata từ Azure Blob Storage",
    "Phát hiện loại file: single-shot hay chunked",
    "Chunked: Xác thực manifest Ed25519 signature (bao gồm chunkChecksums)",
    "X25519 Key Exchange + HKDF-SHA256 → AES-256 Key",
    "Giải mã từng chunk (AES-256-GCM) → verify SHA-256 per chunk",
    "Single-shot: giải mã xong → verify SHA-256 toàn bộ plaintext",
    "Ghép plaintext + lưu file — cảnh báo nếu SHA-256 không khớp",
  ];
  return (
    <div className="mt-4 bg-gray-50 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">
        Quy trình giải mã (Chunked)
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
