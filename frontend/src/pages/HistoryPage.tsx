import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getMyFiles,
  refreshSasUrl,
  revokeRecipient,
  getSharedWithMe,
  getSharedFileSas,
  type FileHistoryItem,
  type FreshSasResponse,
  type RecipientInfo,
  type SharedFileItem,
} from "../utils/api";
import { LoadingSpinner as _Spinner } from "../components/LoadingSpinner";
import {
  getDownloadHistory,
  deleteDownloadEntry,
  clearDownloadHistory,
  type DownloadHistoryItem,
} from "../utils/downloadHistory";
import PageLoader, { LoadingSpinner } from "../components/LoadingSpinner";
import PageHeader from "../components/ui/PageHeader";
import { tabs } from "../styles/theme";

type Tab = "upload" | "download" | "inbox";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const TAB_CONFIG: { id: Tab; label: string }[] = [
  { id: "upload", label: "Đã upload" },
  { id: "download", label: "Đã tải" },
  { id: "inbox", label: "Hộp nhận" },
];

export function HistoryPanel({ embedded = false }: { embedded?: boolean }) {
  const [tab, setTab] = useState<Tab>("upload");

  return (
    <div className={embedded ? "space-y-5" : "max-w-4xl mx-auto space-y-5"}>
      {!embedded && <PageHeader title="Lịch sử" />}

      <div className={tabs.wrap}>
        {TAB_CONFIG.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`${tabs.item} ${tab === t.id ? tabs.itemActive : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "upload"   && <UploadHistory />}
      {tab === "download" && <DownloadHistory />}
      {tab === "inbox"    && <InboxHistory />}
    </div>
  );
}

export default function HistoryPage() {
  return <HistoryPanel />;
}

/* ─────────────────────────────── Upload History ─────────────────────────── */

function UploadHistory() {
  const [files, setFiles] = useState<FileHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sasMap, setSasMap] = useState<Record<string, FreshSasResponse>>({});
  const [loadingSas, setLoadingSas] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function loadFiles() {
    setLoading(true);
    setError(null);
    getMyFiles()
      .then(setFiles)
      .catch((e) => setError(e?.response?.data?.detail ?? "Không tải được lịch sử"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadFiles(); }, []);

  async function handleGetSas(fileId: string) {
    setLoadingSas((p) => ({ ...p, [fileId]: true }));
    try {
      const res = await refreshSasUrl(fileId);
      setSasMap((p) => ({ ...p, [fileId]: res }));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Không lấy được SAS URL";
      alert(msg);
    } finally {
      setLoadingSas((p) => ({ ...p, [fileId]: false }));
    }
  }

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (loading) {
    return (
      <PageLoader variant="embedded" title="Đang tải…" />
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-400">
        <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {files.length === 0 ? "Chưa có file nào." : `${files.length} file đã upload`}
        </p>
        <button
          onClick={loadFiles}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-white/70 hover:border-white/[0.15] transition"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Tải lại
        </button>
      </div>

      {files.length === 0 ? (
        <EmptyState icon="upload" message="Bạn chưa upload file nào." />
      ) : (
        files.map((f) => {
          const sas = sasMap[f.file_id];
          const gettingSas = loadingSas[f.file_id];
          return (
            <div key={f.file_id} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 space-y-3 hover:border-white/[0.12] transition">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center shrink-0">
                    <svg className="w-4.5 h-4.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-200 truncate text-sm">{f.original_filename}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {formatBytes(f.file_size_bytes)} · {f.chunk_count > 1 ? `${f.chunk_count} chunks` : "single"} · {f.encryption_alg}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-white/25 shrink-0 mt-1">{formatDate(f.created_at)}</span>
              </div>

              {sas ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2">
                    <input readOnly value={sas.sas_url}
                      className="flex-1 text-xs bg-transparent text-white/50 outline-none truncate font-mono" />
                    <button onClick={() => handleCopy(sas.sas_url, f.file_id + "_sas")}
                      className="text-xs px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition shrink-0">
                      {copiedId === f.file_id + "_sas" ? "Đã copy!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-[11px] text-white/25">Hết hạn: {formatDate(sas.expires_at)} · Chỉ đọc, 24h</p>
                </div>
              ) : (
                <button onClick={() => handleGetSas(f.file_id)} disabled={gettingSas}
                  className="w-full py-2 rounded-xl border border-indigo-500/20 text-indigo-400/70 text-sm font-medium hover:bg-indigo-500/10 hover:text-indigo-400 transition disabled:opacity-40">
                  {gettingSas ? (
                    <span className="flex items-center justify-center gap-2">
                      <LoadingSpinner size="xs" />
                      Đang lấy link...
                    </span>
                  ) : "Lấy SAS Link mới"}
                </button>
              )}

              {f.recipients && f.recipients.length > 0 && (
                <RecipientsSection fileId={f.file_id} recipients={f.recipients} />
              )}

              <div className="flex items-center gap-2 pt-1 border-t border-white/[0.04]">
                <span className="text-[11px] text-white/20 truncate font-mono flex-1">{f.blob_name}</span>
                <button onClick={() => handleCopy(f.blob_name, f.file_id + "_blob")}
                  className="text-[11px] text-white/25 hover:text-white/50 shrink-0 transition">
                  {copiedId === f.file_id + "_blob" ? "✓ Copied" : "Copy blob"}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ─────────────────────────────── Inbox (Shared With Me) ─────────────────── */

function SharedFileCard({ item }: { item: SharedFileItem }) {
  const [sas, setSas] = useState<FreshSasResponse | null>(null);
  const [loadingSas, setLoadingSas] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGetSas() {
    setUrlError(null);
    setLoadingSas(true);
    try {
      const res = await getSharedFileSas(item.file_id);
      setSas(res);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Không lấy được SAS link";
      setUrlError(msg);
    } finally {
      setLoadingSas(false);
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 hover:border-white/[0.12] transition space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/15 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-800 dark:text-slate-200 truncate text-sm">{item.original_filename}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">{formatBytes(item.file_size_bytes)}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Nhận lúc {formatDate(item.granted_at)}</span>
          </div>
          {(item.sender_name || item.sender_email) && (
            <p className="text-[11px] text-violet-300/70 mt-0.5">
              Từ: {item.sender_name || item.sender_email}
            </p>
          )}
        </div>
      </div>

      {urlError && (
        <p className="text-[12px] text-rose-400 bg-rose-500/8 border border-rose-500/15 rounded-xl px-3 py-2">
          {urlError}
        </p>
      )}

      {sas ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2">
            <input
              readOnly
              value={sas.sas_url}
              className="flex-1 text-xs bg-transparent text-white/50 outline-none truncate font-mono"
            />
            <button
              type="button"
              onClick={() => handleCopy(sas.sas_url)}
              className="text-xs px-2.5 py-1 rounded-lg bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 transition shrink-0"
            >
              {copied ? "Đã copy!" : "Copy"}
            </button>
          </div>
          <p className="text-[11px] text-white/25">
            Hết hạn: {formatDate(sas.expires_at)} · Chỉ đọc
          </p>
          <p className="text-[11px] text-white/35">
            Dán link vào trang{" "}
            <Link to="/download" className="text-violet-400/80 hover:text-violet-300 underline underline-offset-2">
              Download
            </Link>{" "}
            để tải và giải mã.
          </p>
          <button
            type="button"
            onClick={handleGetSas}
            disabled={loadingSas}
            className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-white/55 transition disabled:opacity-40"
          >
            {loadingSas ? "Đang làm mới…" : "Làm mới SAS link"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleGetSas}
          disabled={loadingSas}
          className="w-full py-2 rounded-xl border border-violet-500/20 text-violet-400/70 text-sm font-medium hover:bg-violet-500/10 hover:text-violet-400 transition disabled:opacity-40"
        >
          {loadingSas ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner size="xs" />
              Đang lấy link...
            </span>
          ) : (
            "Lấy SAS Link"
          )}
        </button>
      )}
    </div>
  );
}

function InboxHistory() {
  const [files, setFiles] = useState<SharedFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function loadFiles() {
    setLoading(true);
    setError(null);
    getSharedWithMe()
      .then(setFiles)
      .catch((e: unknown) => {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Không tải được";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadFiles(); }, []);

  if (loading) return (
    <div className="flex flex-col items-center gap-3 py-16 text-slate-500 dark:text-slate-400">
      <_Spinner size="lg" />
      <span className="text-sm">Đang tải hộp nhận…</span>
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-400">
      <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      {error}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {files.length === 0 ? "Chưa có file nào được chia sẻ cho bạn." : `${files.length} file được chia sẻ`}
        </p>
        <button
          onClick={loadFiles}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-white/70 hover:border-white/[0.15] transition"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Tải lại
        </button>
      </div>

      {files.length === 0 ? (
        <div className="space-y-3">
          <EmptyState icon="inbox" message="Trống" />
        </div>
      ) : (
        files.map((f) => <SharedFileCard key={f.file_id} item={f} />)
      )}
    </div>
  );
}

/* ─────────────────────────────── Recipients List ────────────────────────── */

function RecipientsSection({
  fileId,
  recipients: initialRecipients,
}: {
  fileId: string;
  recipients: RecipientInfo[];
}) {
  const [recipients, setRecipients] = useState<RecipientInfo[]>(initialRecipients);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (recipients.length === 0) return null;

  const activeCount = recipients.filter((r) => r.status === "active").length;

  async function handleRevoke(recipientId: string) {
    if (!confirm("Revoke quyền truy cập của người dùng này?")) return;
    setRevoking(recipientId);
    try {
      await revokeRecipient(fileId, recipientId);
      setRecipients((prev) =>
        prev.map((r) => r.recipient_id === recipientId ? { ...r, status: "revoked" } : r)
      );
    } catch {
      alert("Không thể revoke. Thử lại sau.");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="border-t border-white/[0.04] pt-2.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-[11px] text-white/35 hover:text-white/60 transition w-full"
      >
        <svg className="w-3 h-3 text-indigo-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span>
          {activeCount} người nhận{activeCount !== recipients.length ? ` (${recipients.length - activeCount} đã revoke)` : ""}
        </span>
        <svg
          className={`w-3 h-3 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {recipients.map((r) => (
            <div
              key={r.recipient_id}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                r.status === "active"
                  ? "border-white/[0.07] bg-white/[0.02]"
                  : "border-white/[0.04] bg-white/[0.01] opacity-50"
              }`}
            >
              <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center shrink-0">
                <svg className="w-3 h-3 text-indigo-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-white/70 truncate">
                  {r.display_name || r.email || r.recipient_id}
                </p>
                {r.display_name && r.email && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{r.email}</p>
                )}
              </div>
              {r.status === "revoked" ? (
                <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400/70 border border-rose-500/15">
                  Revoked
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleRevoke(r.recipient_id)}
                  disabled={revoking === r.recipient_id}
                  className="shrink-0 text-[10px] px-2 py-0.5 rounded-lg border border-rose-500/20 text-rose-400/60 hover:bg-rose-500/10 hover:text-rose-400 transition disabled:opacity-40"
                >
                  {revoking === r.recipient_id ? "…" : "Revoke"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── Download History ───────────────────────── */

function DownloadHistory() {
  const [items, setItems] = useState<DownloadHistoryItem[]>(() => getDownloadHistory());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleCopy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleDelete(id: string) {
    deleteDownloadEntry(id);
    setItems(getDownloadHistory());
  }

  function handleClearAll() {
    if (!confirm("Xóa toàn bộ lịch sử tải xuống?")) return;
    clearDownloadHistory();
    setItems([]);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {items.length > 0 ? `${items.length} mục` : ""}
        </p>
        {items.length > 0 && (
          <button onClick={handleClearAll}
            className="text-xs px-3 py-1.5 rounded-lg border border-rose-500/20 text-rose-400/60 hover:bg-rose-500/10 hover:text-rose-400 transition">
            Xóa tất cả
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon="download" message="Trống" />
      ) : (
        items.map((item) => {
          const isExpanded = expandedId === item.id;
          return (
            <div key={item.id} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 space-y-3 hover:border-white/[0.12] transition">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center shrink-0">
                    <svg className="w-4.5 h-4.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-200 truncate text-sm">{item.fileName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {item.fileSizeBytes != null ? formatBytes(item.fileSizeBytes) : "—"}
                      {" · "}{item.isChunked ? "chunked" : "single"}
                      {item.mimeType ? ` · ${item.mimeType}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-white/25">{formatDate(item.downloadedAt)}</span>
                  <button onClick={() => handleDelete(item.id)} title="Xóa khỏi lịch sử"
                    className="text-white/20 hover:text-rose-400 transition">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {item.checksum && (
                <div className="flex items-center gap-2 bg-indigo-500/8 border border-indigo-500/15 rounded-xl px-3 py-2">
                  <span className="text-[11px] text-indigo-400/70 font-semibold shrink-0">SHA-256</span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate flex-1">{item.checksum}</span>
                  <button onClick={() => handleCopy(item.checksum!, item.id + "_chk")}
                    className="text-[11px] text-indigo-400/60 hover:text-indigo-400 shrink-0 transition">
                    {copiedId === item.id + "_chk" ? "✓" : "Copy"}
                  </button>
                </div>
              )}

              <div>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="text-[12px] text-white/25 hover:text-white/50 transition flex items-center gap-1"
                >
                  <svg className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                  {isExpanded ? "Ẩn SAS URL" : "Xem SAS URL (có thể đã hết hạn)"}
                </button>
                {isExpanded && (
                  <div className="mt-2 flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2">
                    <input readOnly value={item.sasUrl}
                      className="flex-1 text-[11px] bg-transparent text-slate-500 dark:text-slate-400 outline-none truncate font-mono" />
                    <button onClick={() => handleCopy(item.sasUrl, item.id + "_sas")}
                      className="text-[11px] px-2 py-1 rounded-lg bg-white/[0.06] text-slate-500 dark:text-slate-400 hover:bg-white/[0.10] transition shrink-0">
                      {copiedId === item.id + "_sas" ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

    </div>
  );
}

function EmptyState({ icon, message }: { icon: "upload" | "download" | "inbox"; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
        {icon === "upload" ? (
          <svg className="w-7 h-7 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        ) : icon === "download" ? (
          <svg className="w-7 h-7 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        ) : (
          <svg className="w-7 h-7 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        )}
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">{message}</p>
    </div>
  );
}
