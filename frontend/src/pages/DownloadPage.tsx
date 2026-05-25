import { useState } from "react";
import { useDownload, type ChunkDecryptProgress } from "../hooks/useDownload";
import { LoadingSpinner } from "../components/LoadingSpinner";
import KeyUnlockBanner from "../components/KeyUnlockBanner";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Alert from "../components/ui/Alert";
import Badge from "../components/ui/Badge";
import { inputBase, text, label, surfaceInset } from "../styles/theme";

export default function DownloadPage() {
  const [sasUrl, setSasUrl] = useState("");
  const [, setUnlockTick] = useState(0);
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
    <div className="max-w-2xl mx-auto space-y-5">
      <PageHeader
        title="Tải & Giải mã"
        description="Dán SAS link, xác minh chữ ký và giải mã file trên trình duyệt."
      />

      <KeyUnlockBanner onUnlocked={() => setUnlockTick((n) => n + 1)} />

      <Card className="space-y-4">
        <div>
          <label className={label}>
            SAS link <span className="text-rose-600 dark:text-rose-400">*</span>
          </label>
          <textarea
            value={sasUrl}
            onChange={(e) => setSasUrl(e.target.value)}
            placeholder="Dán SAS link nhận từ người gửi…"
            rows={4}
            disabled={isBusy}
            className={`w-full mt-1.5 font-mono text-sm resize-none ${inputBase}`}
          />
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        {stage === "decrypting" && isChunkedFile && chunkProgress && (
          <ChunkDecryptProgressBar progress={chunkProgress} />
        )}

        {stage === "decrypting" && !isChunkedFile && (
          <Alert tone="info">
            <span className="inline-flex items-center gap-2">
              <LoadingSpinner size="sm" />
              Đang giải mã (Ed25519 + AES-256-GCM)…
            </span>
          </Alert>
        )}

        {stage === "downloading" && (
          <Alert tone="info">
            <span className="inline-flex items-center gap-2">
              <LoadingSpinner size="sm" />
              Đang tải ciphertext từ Azure…
            </span>
          </Alert>
        )}

        {stage === "done" && (
          <div className="space-y-3">
            <Alert tone="success">
              <p className="font-medium">Giải mã thành công</p>
              <p className={`text-xs mt-1 ${text.muted}`}>
                <span className={text.secondary}>{fileName}</span> đã được lưu về máy.
              </p>
            </Alert>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(isChunkedFile
                ? [
                    "Manifest Ed25519 hợp lệ",
                    "AES-GCM tag mỗi chunk OK",
                    "SHA-256 chunk khớp manifest",
                    "File toàn vẹn",
                  ]
                : [
                    "Chữ ký Ed25519 hợp lệ",
                    "AES-GCM tag hợp lệ",
                    ...(verifiedMeta?.plaintextChecksum ? ["SHA-256 plaintext khớp"] : []),
                    "File toàn vẹn",
                  ]
              ).map((check) => (
                <li key={check} className={`flex items-center gap-2 text-xs ${text.muted}`}>
                  <Badge tone="success">✓</Badge>
                  {check}
                </li>
              ))}
            </ul>
            {verifiedMeta?.plaintextChecksum && (
              <div className={`${surfaceInset} p-3 space-y-1`}>
                <p className={label}>SHA-256 đã xác minh</p>
                <p className={`text-xs font-mono break-all ${text.muted}`}>
                  {verifiedMeta.plaintextChecksum}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button
            fullWidth
            loading={isBusy}
            disabled={isBusy || !sasUrl.trim()}
            onClick={() => downloadAndDecrypt(sasUrl)}
          >
            {stage === "downloading" ? "Đang tải…" : stage === "decrypting" ? "Đang giải mã…" : "Tải & Giải mã"}
          </Button>
          {stage === "done" && (
            <Button
              variant="secondary"
              onClick={() => {
                setSasUrl("");
                reset();
              }}
            >
              Mới
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function ChunkDecryptProgressBar({ progress }: { progress: ChunkDecryptProgress }) {
  const { done, total } = progress;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className={`${surfaceInset} p-4 space-y-2`}>
      <div className={`flex items-center justify-between text-xs ${text.muted}`}>
        <span>Giải mã chunk {done}/{total}</span>
        <span className="font-medium text-amber-700 dark:text-amber-400">{pct}%</span>
      </div>
      <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div className="bg-amber-500 h-1.5 rounded-full transition-all duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
