/**
 * StressTestPage.tsx — Công cụ Stress Test Hiệu Năng Mã Hóa File Lớn
 *
 * Mục đích:
 *   - Đánh giá giới hạn thực tế của Web Crypto API (AES-256-GCM) theo dung lượng file.
 *   - So sánh single-shot vs chunked encryption (64MB/chunk).
 *   - Xác định ngưỡng file tối đa trình duyệt hỗ trợ không gặp OOM.
 *   - Đề xuất chiến lược cải tiến dựa trên kết quả thực đo.
 *
 * Phương pháp:
 *   - Sinh plaintext tổng hợp (zero-filled) tránh tốn thêm RAM cho PRNG.
 *   - Dùng AES-256-GCM trực tiếp qua WebCrypto API (không qua X25519 flow).
 *   - Đo thời gian wall-clock và heap memory (Chrome Performance API).
 *   - Chunked test: xử lý từng chunk 64MB tuần tự, discard ngay sau encrypt.
 *   - Phát hiện OOM qua RangeError / DOMException / tab crash guard.
 */

import { useState, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHUNK_SIZE_MB = 64;
const CHUNK_SIZE = CHUNK_SIZE_MB * 1024 * 1024;

/** Các kích thước test mặc định (bytes) */
const DEFAULT_SIZES_MB = [10, 100, 256, 512];
/** Kích thước mở rộng — cảnh báo người dùng trước khi chạy */
const EXTENDED_SIZES_MB = [1024, 2048, 4096];

import { surfaceCard, btn } from "../styles/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type TestStatus = "pending" | "running" | "pass" | "oom" | "error" | "skipped";

interface SingleShotResult {
  sizeMB: number;
  status: TestStatus;
  encryptMs?: number;
  throughputMBps?: number;
  heapDeltaMB?: number;
  errorMsg?: string;
}

interface ChunkedResult {
  sizeMB: number;
  status: TestStatus;
  totalEncryptMs?: number;
  throughputMBps?: number;
  peakChunkHeapMB?: number;
  chunkCount?: number;
  errorMsg?: string;
}

interface TestRow {
  sizeMB: number;
  singleShot: SingleShotResult;
  chunked: ChunkedResult;
}

// ─── Memory Helper ────────────────────────────────────────────────────────────

declare global {
  interface Performance {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  }
}

function getHeapMB(): number | undefined {
  return performance.memory
    ? performance.memory.usedJSHeapSize / (1024 * 1024)
    : undefined;
}

// ─── Core Test Functions ──────────────────────────────────────────────────────

async function generateTestAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Single-shot test: allocate toàn bộ buffer rồi mã hóa một lần.
 * Đây là hành vi hiện tại của hệ thống (trước khi có chunked).
 */
async function runSingleShotTest(sizeMB: number): Promise<SingleShotResult> {
  const sizeBytes = sizeMB * 1024 * 1024;
  const heapBefore = getHeapMB();

  try {
    // Cấp phát buffer (plaintext)
    let plaintext: Uint8Array;
    try {
      plaintext = new Uint8Array(sizeBytes);
    } catch (e) {
      return {
        sizeMB,
        status: "oom",
        errorMsg: `Không thể cấp phát ${sizeMB}MB: ${(e as Error).message}`,
      };
    }

    const aesKey = await generateTestAesKey();
    const nonceBuf = new ArrayBuffer(12);
    crypto.getRandomValues(new Uint8Array(nonceBuf));

    const t0 = performance.now();
    let ciphertext: ArrayBuffer;
    try {
      ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonceBuf },
        aesKey,
        plaintext.buffer as ArrayBuffer
      );
    } catch (e) {
      return {
        sizeMB,
        status: "oom",
        errorMsg: `AES-GCM encrypt thất bại tại ${sizeMB}MB: ${(e as Error).message}`,
      };
    }
    const encryptMs = performance.now() - t0;

    const heapAfter = getHeapMB();
    const heapDeltaMB =
      heapBefore !== undefined && heapAfter !== undefined
        ? Math.round(heapAfter - heapBefore)
        : undefined;

    // Giải phóng ngay để không ảnh hưởng test tiếp theo
    (plaintext as unknown as null) = null;
    (ciphertext as unknown as null) = null;

    return {
      sizeMB,
      status: "pass",
      encryptMs: Math.round(encryptMs),
      throughputMBps: parseFloat(((sizeMB / encryptMs) * 1000).toFixed(1)),
      heapDeltaMB,
    };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    const isOom =
      msg.includes("allocation") ||
      msg.includes("memory") ||
      msg.includes("ArrayBuffer") ||
      msg.includes("out of memory");
    return {
      sizeMB,
      status: isOom ? "oom" : "error",
      errorMsg: msg,
    };
  }
}

/**
 * Chunked test: xử lý file theo từng khối 64MB.
 * Peak memory ≈ 2 × CHUNK_SIZE (plaintext chunk + ciphertext chunk).
 * Sau mỗi chunk, bộ nhớ được giải phóng trước khi xử lý chunk tiếp theo.
 */
async function runChunkedTest(
  sizeMB: number,
  onChunkDone?: (done: number, total: number) => void
): Promise<ChunkedResult> {
  const sizeBytes = sizeMB * 1024 * 1024;
  const chunkCount = Math.ceil(sizeBytes / CHUNK_SIZE);

    const aesKey = await generateTestAesKey();
    const baseNonceBuf = new ArrayBuffer(8);
    crypto.getRandomValues(new Uint8Array(baseNonceBuf));
    const baseNonce = new Uint8Array(baseNonceBuf);

    let totalEncryptMs = 0;
  let peakChunkHeapMB: number | undefined = undefined;

  try {
    for (let i = 0; i < chunkCount; i++) {
      const chunkStart = i * CHUNK_SIZE;
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, sizeBytes);
      const chunkBytes = chunkEnd - chunkStart;

      const heapBefore = getHeapMB();

      // Cấp phát chunk plaintext
      let chunkPlaintext: Uint8Array;
      try {
        chunkPlaintext = new Uint8Array(chunkBytes);
      } catch (e) {
        return {
          sizeMB,
          status: "oom",
          chunkCount,
          totalEncryptMs: Math.round(totalEncryptMs),
          errorMsg: `OOM tại chunk ${i}/${chunkCount}: ${(e as Error).message}`,
        };
      }

      // Per-chunk nonce: baseNonce[0:8] || uint32_BE(i)
      const nonceBuf = new ArrayBuffer(12);
      const nonceView = new Uint8Array(nonceBuf);
      nonceView.set(baseNonce, 0);
      new DataView(nonceBuf).setUint32(8, i, false);

      const t0 = performance.now();
      let encryptedChunk: ArrayBuffer;
      try {
        encryptedChunk = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: nonceBuf },
          aesKey,
          chunkPlaintext.buffer as ArrayBuffer
        );
      } catch (e) {
        return {
          sizeMB,
          status: "oom",
          chunkCount,
          totalEncryptMs: Math.round(totalEncryptMs),
          errorMsg: `Encrypt chunk ${i} thất bại: ${(e as Error).message}`,
        };
      }
      totalEncryptMs += performance.now() - t0;

      const heapAfter = getHeapMB();
      if (heapBefore !== undefined && heapAfter !== undefined) {
        const delta = heapAfter - heapBefore;
        if (peakChunkHeapMB === undefined || delta > peakChunkHeapMB) {
          peakChunkHeapMB = delta;
        }
      }

      // Giải phóng ngay — đây là lợi thế chính của chunked approach
      (chunkPlaintext as unknown as null) = null;
      (encryptedChunk as unknown as null) = null;

      onChunkDone?.(i + 1, chunkCount);

      // Yield để UI cập nhật
      await new Promise((r) => setTimeout(r, 0));
    }
  } catch (e) {
    const msg = (e as Error).message || String(e);
    const isOom =
      msg.includes("allocation") ||
      msg.includes("memory") ||
      msg.includes("out of memory");
    return {
      sizeMB,
      status: isOom ? "oom" : "error",
      chunkCount,
      totalEncryptMs: Math.round(totalEncryptMs),
      errorMsg: msg,
    };
  }

  return {
    sizeMB,
    status: "pass",
    totalEncryptMs: Math.round(totalEncryptMs),
    throughputMBps: parseFloat(
      ((sizeMB / totalEncryptMs) * 1000).toFixed(1)
    ),
    peakChunkHeapMB:
      peakChunkHeapMB !== undefined
        ? parseFloat(peakChunkHeapMB.toFixed(1))
        : undefined,
    chunkCount,
  };
}

// ─── UI Components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TestStatus }) {
  const cfg: Record<TestStatus, { label: string; cls: string }> = {
    pending: { label: "Chờ", cls: "bg-white/[0.06] text-white/40" },
    running: { label: "Đang chạy", cls: "bg-indigo-500/25 text-indigo-300 animate-pulse" },
    pass: { label: "PASS", cls: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" },
    oom: { label: "OOM", cls: "bg-rose-500/20 text-rose-300 border border-rose-500/35" },
    error: { label: "LỖI", cls: "bg-amber-500/15 text-amber-300 border border-amber-500/25" },
    skipped: { label: "Bỏ qua", cls: "bg-white/[0.05] text-white/30" },
  };
  const { label, cls } = cfg[status];
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function formatMs(ms?: number): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatMBps(v?: number): string {
  return v !== undefined ? `${v} MB/s` : "—";
}

function formatHeap(v?: number): string {
  return v !== undefined ? `+${v.toFixed(0)} MB` : "—";
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StressTestPage() {
  const [rows, setRows] = useState<TestRow[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState("");
  const [chunkProgress, setChunkProgress] = useState<{ done: number; total: number } | null>(null);
  const [includedSizesMB, setIncludedSizesMB] = useState<number[]>(DEFAULT_SIZES_MB);
  const [showExtended, setShowExtended] = useState(false);
  const [summary, setSummary] = useState<{
    maxSafeShot: number | null;
    maxSafeChunked: number | null;
  } | null>(null);
  const abortRef = useRef(false);

  const toggleSize = (mb: number) => {
    setIncludedSizesMB((prev) =>
      prev.includes(mb) ? prev.filter((x) => x !== mb) : [...prev, mb].sort((a, b) => a - b)
    );
  };

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    abortRef.current = false;
    setIsRunning(true);
    setSummary(null);

    const sortedSizes = [...includedSizesMB].sort((a, b) => a - b);

    // Khởi tạo rows
    const initialRows: TestRow[] = sortedSizes.map((mb) => ({
      sizeMB: mb,
      singleShot: { sizeMB: mb, status: "pending" },
      chunked: { sizeMB: mb, status: "pending" },
    }));
    setRows(initialRows);

    const updatedRows = [...initialRows];
    let maxSafeShot: number | null = null;
    let maxSafeChunked: number | null = null;

    for (let idx = 0; idx < sortedSizes.length; idx++) {
      if (abortRef.current) break;
      const mb = sortedSizes[idx];

      // ── Single-shot test ──
      setCurrentTest(`Single-shot ${mb}MB`);
      setChunkProgress(null);
      updatedRows[idx] = {
        ...updatedRows[idx],
        singleShot: { sizeMB: mb, status: "running" },
      };
      setRows([...updatedRows]);

      const ssResult = await runSingleShotTest(mb);
      updatedRows[idx] = { ...updatedRows[idx], singleShot: ssResult };
      setRows([...updatedRows]);
      if (ssResult.status === "pass") maxSafeShot = mb;

      // Nếu single-shot OOM ở kích thước này, skip các kích thước lớn hơn
      if (ssResult.status === "oom") {
        for (let j = idx + 1; j < sortedSizes.length; j++) {
          updatedRows[j] = {
            ...updatedRows[j],
            singleShot: { sizeMB: sortedSizes[j], status: "skipped" },
          };
        }
        setRows([...updatedRows]);
      }

      await new Promise((r) => setTimeout(r, 200));
      if (abortRef.current) break;

      // ── Chunked test ──
      setCurrentTest(`Chunked ${mb}MB (${Math.ceil((mb * 1024 * 1024) / CHUNK_SIZE)} chunks × ${CHUNK_SIZE_MB}MB)`);
      setChunkProgress({ done: 0, total: Math.ceil((mb * 1024 * 1024) / CHUNK_SIZE) });
      updatedRows[idx] = {
        ...updatedRows[idx],
        chunked: { sizeMB: mb, status: "running" },
      };
      setRows([...updatedRows]);

      const chunkedResult = await runChunkedTest(mb, (done, total) => {
        setChunkProgress({ done, total });
      });
      updatedRows[idx] = { ...updatedRows[idx], chunked: chunkedResult };
      setRows([...updatedRows]);
      if (chunkedResult.status === "pass") maxSafeChunked = mb;

      setChunkProgress(null);
      await new Promise((r) => setTimeout(r, 300));
    }

    setSummary({ maxSafeShot, maxSafeChunked });
    setCurrentTest("");
    setIsRunning(false);
  }, [includedSizesMB, isRunning]);

  const hasMemoryApi = typeof performance !== "undefined" && !!performance.memory;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white tracking-tight mb-1">
          Stress Test Hiệu Năng — File Lớn
        </h1>
        <p className="text-sm text-white/45 leading-relaxed">
          Đánh giá giới hạn RAM của Web Crypto API (AES-256-GCM) và so sánh single-shot vs chunked encryption.
        </p>
      </header>

      {!hasMemoryApi && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-200/95">
          <strong className="text-amber-300">Lưu ý:</strong>{" "}
          <code className="text-amber-100/90 bg-black/30 px-1 rounded">performance.memory</code> chỉ đầy đủ trên Chrome (có thể cần flag). Cột Heap Delta hiển thị "—" trên Firefox/Safari.
        </div>
      )}

      <div className={`${surfaceCard} p-5 sm:p-6 space-y-4`}>
        <p className="text-sm font-medium text-white/75">Chọn kích thước file để test</p>

        <div className="flex flex-wrap gap-2">
          {DEFAULT_SIZES_MB.map((mb) => (
            <button
              key={mb}
              type="button"
              onClick={() => !isRunning && toggleSize(mb)}
              disabled={isRunning}
              className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                includedSizesMB.includes(mb)
                  ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-900/30"
                  : "border-white/12 text-white/55 hover:bg-white/[0.06] hover:text-white/85"
              } disabled:opacity-50`}
            >
              {mb} MB
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowExtended((v) => !v)}
            disabled={isRunning}
            className="px-3 py-2 rounded-xl text-sm font-medium border border-dashed border-amber-500/40 text-amber-400/90 hover:bg-amber-500/10 disabled:opacity-50"
          >
            {showExtended ? "Ẩn" : "+ Kích thước lớn (1–4GB ⚠️)"}
          </button>
        </div>

        {showExtended && (
          <div className="flex flex-wrap gap-2 pt-1">
            {EXTENDED_SIZES_MB.map((mb) => (
              <button
                key={mb}
                type="button"
                onClick={() => !isRunning && toggleSize(mb)}
                disabled={isRunning}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                  includedSizesMB.includes(mb)
                    ? "bg-orange-600/90 text-white border-orange-500"
                    : "border-orange-500/30 text-orange-300/90 hover:bg-orange-500/10"
                } disabled:opacity-50`}
              >
                {mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`}
              </button>
            ))}
            <p className="w-full text-[11px] text-amber-400/80 mt-1">
              File &gt;1GB có thể làm tab crash (OOM). Lưu công việc trước khi test.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning || includedSizesMB.length === 0}
            className={`px-6 ${btn.primary} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isRunning ? "Đang chạy…" : "Chạy Stress Test"}
          </button>
          {isRunning && (
            <button
              type="button"
              onClick={() => {
                abortRef.current = true;
              }}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-rose-500/35 text-rose-300 hover:bg-rose-500/10 transition"
            >
              Dừng
            </button>
          )}
        </div>

        {isRunning && currentTest && (
          <div className="rounded-xl border border-indigo-500/25 bg-indigo-950/40 px-4 py-3 text-sm text-indigo-200/95">
            <span className="font-semibold text-indigo-300">Đang test:</span> {currentTest}
            {chunkProgress && (
              <div className="mt-2">
                <div className="flex justify-between text-xs mb-1 text-white/50">
                  <span>
                    Chunk {chunkProgress.done}/{chunkProgress.total}
                  </span>
                  <span>{Math.round((chunkProgress.done / chunkProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-black/40 rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${(chunkProgress.done / chunkProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className={`${surfaceCard} overflow-hidden`}>
          <div className="px-4 sm:px-5 py-3 border-b border-white/[0.08] bg-black/20">
            <p className="text-sm font-semibold text-white/80">Kết quả đo thực tế</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-white/40">
                  <th className="px-4 py-3 text-left font-semibold">Kích thước</th>
                  <th className="px-3 py-3 text-center border-l border-white/[0.08] font-semibold" colSpan={4}>
                    <span className="text-rose-400/95">Single-shot</span>
                    <span className="text-white/25 font-normal normal-case ml-1">(một lần)</span>
                  </th>
                  <th className="px-3 py-3 text-center border-l border-white/[0.08] font-semibold" colSpan={4}>
                    <span className="text-emerald-400/95">Chunked {CHUNK_SIZE_MB}MB</span>
                    <span className="text-white/25 font-normal normal-case ml-1">(theo chunk)</span>
                  </th>
                </tr>
                <tr className="text-[10px] text-white/35 border-b border-white/[0.06] bg-black/15">
                  <th className="px-4 py-2 text-left" />
                  <th className="px-2 py-2 text-center font-medium">TT</th>
                  <th className="px-2 py-2 text-center font-medium">Thời gian</th>
                  <th className="px-2 py-2 text-center font-medium">MB/s</th>
                  <th className="px-2 py-2 text-center font-medium border-r border-white/[0.08]">Heap</th>
                  <th className="px-2 py-2 text-center font-medium">TT</th>
                  <th className="px-2 py-2 text-center font-medium">Thời gian</th>
                  <th className="px-2 py-2 text-center font-medium">MB/s</th>
                  <th className="px-2 py-2 text-center font-medium">Peak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {rows.map((row) => (
                  <tr key={row.sizeMB} className="hover:bg-white/[0.02] transition">
                    <td className="px-4 py-3 font-semibold text-white/90 tabular-nums">
                      {row.sizeMB >= 1024 ? `${row.sizeMB / 1024} GB` : `${row.sizeMB} MB`}
                    </td>
                    <td className="px-2 py-3 text-center border-l border-white/[0.06]">
                      <StatusBadge status={row.singleShot.status} />
                    </td>
                    <td className="px-2 py-3 text-center font-mono text-xs text-white/65">
                      {formatMs(row.singleShot.encryptMs)}
                    </td>
                    <td className="px-2 py-3 text-center text-xs text-white/60 tabular-nums">
                      {formatMBps(row.singleShot.throughputMBps)}
                    </td>
                    <td className="px-2 py-3 text-center text-xs text-white/45 border-r border-white/[0.06] tabular-nums">
                      {row.singleShot.status === "pass" ? formatHeap(row.singleShot.heapDeltaMB) : "—"}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <StatusBadge status={row.chunked.status} />
                    </td>
                    <td className="px-2 py-3 text-center font-mono text-xs text-white/65">
                      {formatMs(row.chunked.totalEncryptMs)}
                    </td>
                    <td className="px-2 py-3 text-center text-xs text-white/60 tabular-nums">
                      {formatMBps(row.chunked.throughputMBps)}
                    </td>
                    <td className="px-2 py-3 text-center text-xs text-white/45 tabular-nums">
                      {row.chunked.status === "pass" ? formatHeap(row.chunked.peakChunkHeapMB) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.some(
            (r) =>
              (r.singleShot.status === "oom" || r.singleShot.status === "error") ||
              (r.chunked.status === "oom" || r.chunked.status === "error")
          ) && (
            <div className="px-4 sm:px-5 py-4 border-t border-white/[0.08] space-y-2 bg-black/20">
              <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wide">Chi tiết lỗi</p>
              {rows.map((row) => (
                <div key={`errs-${row.sizeMB}`} className="space-y-1.5">
                  {row.singleShot.errorMsg && (
                    <p className="text-xs text-rose-300/95 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                      <strong>Single-shot {row.sizeMB}MB:</strong> {row.singleShot.errorMsg}
                    </p>
                  )}
                  {row.chunked.errorMsg && (
                    <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      <strong>Chunked {row.sizeMB}MB:</strong> {row.chunked.errorMsg}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {summary && (
        <SummaryPanel summary={summary} />
      )}

      {/* Methodology */}
      <MethodologyCard />
    </div>
  );
}

function SummaryPanel({
  summary,
}: {
  summary: { maxSafeShot: number | null; maxSafeChunked: number | null };
}) {
  const fmtSize = (mb: number | null) => {
    if (mb === null) return "< 10 MB";
    if (mb >= 1024) return `${mb / 1024} GB`;
    return `${mb} MB`;
  };

  const improvementFactor =
    summary.maxSafeChunked !== null && summary.maxSafeShot !== null && summary.maxSafeShot > 0
      ? (summary.maxSafeChunked / summary.maxSafeShot).toFixed(1)
      : null;

  return (
    <div className={`${surfaceCard} p-5 sm:p-6 space-y-5`}>
      <h2 className="text-base font-bold text-white">Kết luận và khuyến nghị</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-rose-500/25 bg-rose-950/25 p-4">
          <p className="text-[10px] text-rose-400/90 font-bold uppercase tracking-wider mb-1">Single-shot</p>
          <p className="text-2xl font-bold text-rose-200 tabular-nums">{fmtSize(summary.maxSafeShot)}</p>
          <p className="text-xs text-white/45 mt-2 leading-relaxed">
            Ngưỡng an toàn tối đa. Vượt quá: trình duyệt dễ OOM vì plaintext + ciphertext trong RAM.
          </p>
        </div>

        <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-4">
          <p className="text-[10px] text-emerald-400/90 font-bold uppercase tracking-wider mb-1">
            Chunked {CHUNK_SIZE_MB}MB
          </p>
          <p className="text-2xl font-bold text-emerald-200 tabular-nums">{fmtSize(summary.maxSafeChunked)}</p>
          <p className="text-xs text-white/45 mt-2 leading-relaxed">
            Peak RAM ≈ 2 × {CHUNK_SIZE_MB}MB. Phù hợp file rất lớn (GB).
          </p>
        </div>
      </div>

      {improvementFactor && (
        <div className="rounded-xl border border-indigo-500/25 bg-indigo-950/30 p-4 text-center">
          <p className="text-[10px] text-indigo-300/90 font-bold uppercase tracking-wider mb-1">Cải thiện dung lượng tối đa</p>
          <p className="text-3xl font-bold text-indigo-200 tabular-nums">{improvementFactor}×</p>
          <p className="text-xs text-white/40 mt-1">Chunked hỗ trợ file lớn hơn ~{improvementFactor}× so với single-shot trên máy bạn</p>
        </div>
      )}

      <div className="rounded-xl border border-white/[0.08] bg-black/25 p-4 space-y-2">
        <p className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Đã triển khai trong LockSend</p>
        <ul className="space-y-2 text-xs text-white/55 leading-relaxed">
          <li className="flex gap-2">
            <span className="text-emerald-400 shrink-0">✓</span>
            <span>
              <strong className="text-white/70">Chunked:</strong> {CHUNK_SIZE_MB}MB/chunk, nonce theo chunk.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-400 shrink-0">✓</span>
            <span>
              <strong className="text-white/70">Multipart upload</strong> Azure — không giữ toàn bộ ciphertext trong RAM.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-400 shrink-0">✓</span>
            <span>
              <strong className="text-white/70">Ed25519 manifest</strong> — ký metadata thay vì toàn bộ blob.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-sky-400/80 shrink-0">→</span>
            <span className="text-white/40">
              <strong className="text-white/55">[Tương lai]</strong> Streaming download + decrypt.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function MethodologyCard() {
  return (
    <div className={`${surfaceCard} p-5 sm:p-6`}>
      <h3 className="text-sm font-semibold text-white/80 mb-3">Phương pháp kiểm thử</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs text-white/45 leading-relaxed">
        <div className="space-y-2">
          <p className="font-semibold text-white/60 text-[11px] uppercase tracking-wide">Dữ liệu test</p>
          <p>
            Plaintext = <code className="text-indigo-300/90 bg-black/40 px-1 rounded">new Uint8Array(N)</code> (zero-filled),
            không dùng PRNG.
          </p>
          <p>
            AES = <code className="text-indigo-300/90 bg-black/40 px-1 rounded">generateKey(AES-GCM 256)</code> mỗi lần.
          </p>
          <p>Nonce: 12 byte ngẫu nhiên (single-shot) / baseNonce + index chunk (chunked).</p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-white/60 text-[11px] uppercase tracking-wide">Đo lường</p>
          <p>
            <strong className="text-white/55">Thời gian:</strong>{" "}
            <code className="text-indigo-300/90 bg-black/40 px-1 rounded">performance.now()</code> quanh{" "}
            <code className="text-indigo-300/90 bg-black/40 px-1 rounded">encrypt</code>.
          </p>
          <p>
            <strong className="text-white/55">Heap:</strong>{" "}
            <code className="text-indigo-300/90 bg-black/40 px-1 rounded">performance.memory</code> (chủ yếu Chrome).
          </p>
          <p>
            <strong className="text-white/55">OOM:</strong> <code className="text-indigo-300/90 bg-black/40 px-1 rounded">RangeError</code>{" "}
            hoặc lỗi WebCrypto.
          </p>
        </div>
      </div>
      <p className="mt-4 text-[11px] text-white/30">
        Kết quả phụ thuộc RAM, CPU, trình duyệt và tab đang mở. Nên chạy trong tab riêng.
      </p>
    </div>
  );
}
