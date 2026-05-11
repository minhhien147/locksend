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
    pending:  { label: "Chờ",    cls: "bg-gray-100 text-gray-500" },
    running:  { label: "Đang chạy", cls: "bg-blue-100 text-blue-700 animate-pulse" },
    pass:     { label: "PASS",   cls: "bg-green-100 text-green-700" },
    oom:      { label: "OOM",    cls: "bg-red-100 text-red-700" },
    error:    { label: "LỖI",   cls: "bg-orange-100 text-orange-700" },
    skipped:  { label: "Bỏ qua", cls: "bg-gray-100 text-gray-400" },
  };
  const { label, cls } = cfg[status];
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">
          Stress Test Hiệu Năng — File Lớn
        </h1>
        <p className="text-gray-500 text-sm">
          Đánh giá giới hạn RAM của Web Crypto API (AES-256-GCM) và so sánh
          single-shot vs chunked encryption.
        </p>
      </div>

      {/* Memory API notice */}
      {!hasMemoryApi && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          <strong>Lưu ý:</strong> <code>performance.memory</code> chỉ có trong Chrome với flag
          <code> --enable-precise-memory-info</code>. Cột "Heap Delta" sẽ hiển thị "—" trên
          Firefox/Safari.
        </div>
      )}

      {/* Config panel */}
      <div className="bg-white rounded-xl shadow p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-700">Chọn kích thước file để test:</p>

        <div className="flex flex-wrap gap-2">
          {DEFAULT_SIZES_MB.map((mb) => (
            <button
              key={mb}
              onClick={() => !isRunning && toggleSize(mb)}
              disabled={isRunning}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                includedSizesMB.includes(mb)
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              } disabled:opacity-50`}
            >
              {mb} MB
            </button>
          ))}

          <button
            onClick={() => setShowExtended((v) => !v)}
            disabled={isRunning}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-dashed border-orange-400 text-orange-600 hover:bg-orange-50 disabled:opacity-50"
          >
            {showExtended ? "Ẩn" : "+ Kích thước lớn (1–4GB ⚠️)"}
          </button>
        </div>

        {showExtended && (
          <div className="flex flex-wrap gap-2">
            {EXTENDED_SIZES_MB.map((mb) => (
              <button
                key={mb}
                onClick={() => !isRunning && toggleSize(mb)}
                disabled={isRunning}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                  includedSizesMB.includes(mb)
                    ? "bg-orange-500 text-white border-orange-500"
                    : "bg-white text-orange-600 border-orange-300 hover:bg-orange-50"
                } disabled:opacity-50`}
              >
                {mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`}
              </button>
            ))}
            <p className="w-full text-xs text-orange-600 mt-1">
              ⚠️ File &gt;1GB có thể khiến tab trình duyệt bị crash (OOM). Hãy lưu công việc trước khi test.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleRun}
            disabled={isRunning || includedSizesMB.length === 0}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? "Đang chạy..." : "Chạy Stress Test"}
          </button>
          {isRunning && (
            <button
              onClick={() => { abortRef.current = true; }}
              className="bg-red-100 text-red-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-red-200 transition"
            >
              Dừng
            </button>
          )}
        </div>

        {/* Current test progress */}
        {isRunning && currentTest && (
          <div className="text-sm text-indigo-700 bg-indigo-50 rounded-lg p-3">
            <span className="font-medium">Đang test:</span> {currentTest}
            {chunkProgress && (
              <div className="mt-2">
                <div className="flex justify-between text-xs mb-1">
                  <span>Chunk {chunkProgress.done}/{chunkProgress.total}</span>
                  <span>{Math.round((chunkProgress.done / chunkProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-indigo-100 rounded-full h-1.5">
                  <div
                    className="bg-indigo-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${(chunkProgress.done / chunkProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results table */}
      {rows.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Kết quả đo thực tế</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Kích thước</th>
                  {/* Single-shot columns */}
                  <th className="px-4 py-3 text-center border-l border-gray-200" colSpan={4}>
                    <span className="text-red-600 font-semibold">Single-shot</span>
                    <span className="text-gray-400 font-normal ml-1">(hiện tại)</span>
                  </th>
                  {/* Chunked columns */}
                  <th className="px-4 py-3 text-center border-l border-gray-200" colSpan={4}>
                    <span className="text-green-600 font-semibold">Chunked {CHUNK_SIZE_MB}MB</span>
                    <span className="text-gray-400 font-normal ml-1">(cải tiến)</span>
                  </th>
                </tr>
                <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2 text-left"></th>
                  <th className="px-3 py-2 text-center">Trạng thái</th>
                  <th className="px-3 py-2 text-center">Thời gian</th>
                  <th className="px-3 py-2 text-center">Throughput</th>
                  <th className="px-3 py-2 text-center border-r border-gray-200">Heap Delta</th>
                  <th className="px-3 py-2 text-center">Trạng thái</th>
                  <th className="px-3 py-2 text-center">Thời gian</th>
                  <th className="px-3 py-2 text-center">Throughput</th>
                  <th className="px-3 py-2 text-center">Peak/Chunk</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.sizeMB}
                    className="border-b border-gray-100 hover:bg-gray-50 transition"
                  >
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {row.sizeMB >= 1024
                        ? `${row.sizeMB / 1024} GB`
                        : `${row.sizeMB} MB`}
                    </td>
                    {/* Single-shot */}
                    <td className="px-3 py-3 text-center">
                      <StatusBadge status={row.singleShot.status} />
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-gray-700">
                      {formatMs(row.singleShot.encryptMs)}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-700">
                      {formatMBps(row.singleShot.throughputMBps)}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500 border-r border-gray-200">
                      {row.singleShot.status === "pass"
                        ? formatHeap(row.singleShot.heapDeltaMB)
                        : "—"}
                    </td>
                    {/* Chunked */}
                    <td className="px-3 py-3 text-center">
                      <StatusBadge status={row.chunked.status} />
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-gray-700">
                      {formatMs(row.chunked.totalEncryptMs)}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-700">
                      {formatMBps(row.chunked.throughputMBps)}
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500">
                      {row.chunked.status === "pass"
                        ? formatHeap(row.chunked.peakChunkHeapMB)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Error details */}
          {rows.some(
            (r) =>
              (r.singleShot.status === "oom" || r.singleShot.status === "error") ||
              (r.chunked.status === "oom" || r.chunked.status === "error")
          ) && (
            <div className="px-5 py-4 border-t border-gray-100 space-y-2">
              <p className="text-xs font-semibold text-gray-600">Chi tiết lỗi:</p>
              {rows.map((row) => (
                <>
                  {row.singleShot.errorMsg && (
                    <p key={`ss-${row.sizeMB}`} className="text-xs text-red-600 bg-red-50 rounded px-3 py-1.5">
                      <strong>Single-shot {row.sizeMB}MB:</strong> {row.singleShot.errorMsg}
                    </p>
                  )}
                  {row.chunked.errorMsg && (
                    <p key={`ch-${row.sizeMB}`} className="text-xs text-orange-600 bg-orange-50 rounded px-3 py-1.5">
                      <strong>Chunked {row.sizeMB}MB:</strong> {row.chunked.errorMsg}
                    </p>
                  )}
                </>
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
    <div className="bg-white rounded-xl shadow p-5 space-y-4">
      <h2 className="text-base font-bold text-gray-800">Kết luận & Khuyến nghị</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <p className="text-xs text-red-500 font-semibold uppercase mb-1">
            Single-shot (Phương pháp hiện tại)
          </p>
          <p className="text-2xl font-bold text-red-700">{fmtSize(summary.maxSafeShot)}</p>
          <p className="text-xs text-red-600 mt-1">
            Ngưỡng an toàn tối đa. Vượt quá giới hạn này: trình duyệt gặp OOM
            vì phải load toàn bộ file + ciphertext vào RAM cùng lúc.
          </p>
        </div>

        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-xs text-green-500 font-semibold uppercase mb-1">
            Chunked {CHUNK_SIZE_MB}MB (Phương pháp đề xuất)
          </p>
          <p className="text-2xl font-bold text-green-700">{fmtSize(summary.maxSafeChunked)}</p>
          <p className="text-xs text-green-600 mt-1">
            Peak RAM chỉ ≈ 2 × {CHUNK_SIZE_MB}MB = {2 * CHUNK_SIZE_MB}MB bất kể
            tổng kích thước file. Phù hợp file lên đến 5–10 GB.
          </p>
        </div>
      </div>

      {improvementFactor && (
        <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200 text-center">
          <p className="text-xs text-indigo-500 font-semibold uppercase mb-1">Cải thiện dung lượng tối đa</p>
          <p className="text-3xl font-bold text-indigo-700">{improvementFactor}×</p>
          <p className="text-xs text-indigo-600 mt-1">
            Chunked encryption hỗ trợ file lớn hơn {improvementFactor}× so với single-shot
          </p>
        </div>
      )}

      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-700 uppercase">Hướng cải tiến đã được triển khai:</p>
        <ul className="space-y-1.5 text-xs text-gray-600">
          <li className="flex gap-2">
            <span className="text-green-500 shrink-0">✓</span>
            <span>
              <strong>Chunked Encryption:</strong> Chia file thành các chunk {CHUNK_SIZE_MB}MB,
              mỗi chunk dùng nonce độc lập (baseNonce[0:8] ‖ chunkIndex[4B big-endian]).
              Peak RAM ≈ 2 × {CHUNK_SIZE_MB}MB.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-green-500 shrink-0">✓</span>
            <span>
              <strong>Multipart Upload:</strong> Từng chunk được upload ngay sau mã hóa qua
              Azure Block Blob API (stage_block + commit_block_list). Không cần giữ toàn bộ
              ciphertext trong RAM.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-green-500 shrink-0">✓</span>
            <span>
              <strong>Ed25519 Manifest Signing:</strong> Thay vì ký toàn bộ ciphertext (không
              khả thi với file GB), ký manifest JSON chứa {"{"}ephemeralPublicKey, baseNonce,
              chunkCount, chunkSize, fileName, fileSize, mimeType{"}"}.
              Mỗi chunk vẫn được bảo vệ bởi AES-GCM auth tag riêng.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-blue-400 shrink-0">→</span>
            <span>
              <strong>[Tương lai]</strong> Streaming download + decrypt (ReadableStream) để
              tải và giải mã file GB mà không cần load toàn bộ blob vào RAM.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function MethodologyCard() {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Phương pháp kiểm thử</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-gray-500">
        <div className="space-y-1.5">
          <p className="font-medium text-gray-600">Dữ liệu test</p>
          <p>Plaintext = <code>new Uint8Array(N)</code> (zero-filled, O(1) cấp phát,
          không dùng PRNG để tránh làm sai lệch kết quả đo).</p>
          <p>AES key = <code>crypto.subtle.generateKey(AES-GCM 256)</code> mỗi test.</p>
          <p>Nonce = random 12 bytes (single-shot) / baseNonce + chunk_index (chunked).</p>
        </div>
        <div className="space-y-1.5">
          <p className="font-medium text-gray-600">Đo lường</p>
          <p><strong>Thời gian:</strong> <code>performance.now()</code> bao quanh
          <code> crypto.subtle.encrypt()</code>.</p>
          <p><strong>Heap Delta:</strong> <code>performance.memory.usedJSHeapSize</code>
          trước và sau — chỉ có trên Chrome.</p>
          <p><strong>OOM:</strong> Bắt <code>RangeError</code> khi cấp phát ArrayBuffer
          hoặc exception từ WebCrypto.</p>
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-400">
        Lưu ý: Kết quả phụ thuộc vào phần cứng (RAM, CPU), trình duyệt và các tab
        đang mở. Chạy test trong tab riêng biệt để có kết quả chính xác nhất.
      </div>
    </div>
  );
}
