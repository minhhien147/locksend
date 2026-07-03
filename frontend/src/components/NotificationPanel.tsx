/**
 * NotificationPanel — dropdown that shows received & sent file notifications.
 * Rendered inside a `relative` wrapper in AppShell header.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n/context";
import { text, badge as badgeCls } from "../styles/theme";
import type { SharedFileItem, FileHistoryItem } from "../hooks/useInboxNotifications";

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function InboxRow({
  item,
  isNew,
}: {
  item: SharedFileItem;
  isNew: boolean;
}) {
  const sender = item.sender_name || item.sender_email || "Unknown";
  const firstLetter = sender[0]?.toUpperCase() ?? "?";

  return (
    <Link
      to="/profile?tab=history"
      className="flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-white/[0.03] border-b border-slate-100 dark:border-white/[0.05] last:border-0"
    >
      {/* Avatar */}
      <div className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center text-violet-700 dark:text-violet-300 text-[12px] font-semibold">
        {firstLetter}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[13px] font-medium truncate max-w-[160px] ${text.primary}`}>
            {item.original_filename}
          </span>
          {isNew && (
            <span className={`${badgeCls.success} shrink-0`}>New</span>
          )}
        </div>
        <p className={`text-[11px] mt-0.5 ${text.faint}`}>
          From: {sender}
        </p>
        <p className={`text-[11px] mt-0.5 flex items-center gap-2 ${text.faint}`}>
          <span>{formatSize(item.file_size_bytes)}</span>
          <span>·</span>
          <span>{relativeTime(item.granted_at)}</span>
        </p>
      </div>

      {/* Download icon */}
      <svg className="shrink-0 mt-1 w-3.5 h-3.5 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

function SentRow({ item }: { item: FileHistoryItem }) {
  const recipientCount = item.recipients?.length ?? 0;
  const firstRecipient = item.recipients?.[0];
  const recipientLabel =
    recipientCount === 0
      ? "Vault"
      : recipientCount === 1
        ? firstRecipient?.display_name || firstRecipient?.email || "1 recipient"
        : `${recipientCount} recipients`;
  const firstLetter = (recipientLabel[0] ?? "?").toUpperCase();

  return (
    <Link
      to="/profile?tab=history"
      className="flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-white/[0.03] border-b border-slate-100 dark:border-white/[0.05] last:border-0"
    >
      {/* Avatar */}
      <div className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center text-blue-700 dark:text-blue-300 text-[12px] font-semibold">
        {firstLetter}
      </div>

      <div className="flex-1 min-w-0">
        <span className={`text-[13px] font-medium truncate block max-w-[190px] ${text.primary}`}>
          {item.original_filename}
        </span>
        <p className={`text-[11px] mt-0.5 ${text.faint}`}>
          To: {recipientLabel}
        </p>
        <p className={`text-[11px] mt-0.5 flex items-center gap-2 ${text.faint}`}>
          <span>{formatSize(item.file_size_bytes)}</span>
          <span>·</span>
          <span>{relativeTime(item.created_at)}</span>
        </p>
      </div>

      <svg className="shrink-0 mt-1 w-3.5 h-3.5 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

type TabKey = "received" | "sent";

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  inboxItems: SharedFileItem[];
  sentItems: FileHistoryItem[];
  newInboxItems: SharedFileItem[];
  unreadCount: number;
  loading: boolean;
  onMarkAllSeen: () => void;
  onRefresh: () => void;
  permissionState: NotificationPermission | "unsupported";
  onRequestPermission: () => Promise<void>;
}

export default function NotificationPanel({
  open,
  onClose,
  inboxItems,
  sentItems,
  newInboxItems,
  unreadCount,
  loading,
  onMarkAllSeen,
  onRefresh,
  permissionState,
  onRequestPermission,
}: NotificationPanelProps) {
  const t = useT();
  const [activeTab, setActiveTab] = useState<TabKey>("received");
  const panelRef = useRef<HTMLDivElement>(null);
  const newIds = new Set(newInboxItems.map((f) => f.file_id));

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const currentItems =
    activeTab === "received" ? inboxItems : sentItems;
  const isEmpty = currentItems.length === 0;

  return (
    <div
      ref={panelRef}
      className={`absolute right-0 top-full mt-2 w-[340px] z-[200] rounded-xl shadow-xl overflow-hidden
        border border-slate-200 bg-white dark:border-white/[0.1] dark:bg-[#0f1318]`}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className={`text-[13px] font-semibold ${text.primary}`}>
            {t("notifications.panelTitle")}
          </span>
          {unreadCount > 0 && (
            <span className="min-w-[18px] h-4.5 px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Refresh */}
          <button
            type="button"
            onClick={onRefresh}
            title={t("common.refresh")}
            className={`p-1.5 rounded-md transition ${text.faint} hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05]`}
          >
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Mark all read */}
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllSeen}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${text.faint} hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05]`}
            >
              {t("notifications.markAllRead")}
            </button>
          )}

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-md transition ${text.faint} hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05]`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Browser permission prompt ── */}
      {permissionState === "default" && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-violet-50 dark:bg-violet-500/10 border-b border-violet-100 dark:border-violet-500/20">
          <svg className="w-3.5 h-3.5 shrink-0 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="flex-1 text-[11px] text-violet-800 dark:text-violet-200">
            {t("notifications.enablePrompt")}
          </p>
          <button
            type="button"
            onClick={() => void onRequestPermission()}
            className="shrink-0 px-2.5 py-1 rounded-md bg-violet-600 text-white text-[11px] font-medium hover:bg-violet-700 transition"
          >
            {t("notifications.enable")}
          </button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 px-3 pt-2.5 pb-1">
        {(["received", "sent"] as TabKey[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              activeTab === tab
                ? "bg-slate-100 text-slate-900 dark:bg-white/[0.08] dark:text-slate-100"
                : `${text.faint} hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:text-slate-700 dark:hover:text-slate-300`
            }`}
          >
            {tab === "received" ? (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
            {tab === "received"
              ? t("notifications.tabReceived")
              : t("notifications.tabSent")}
            {tab === "received" && unreadCount > 0 && (
              <span className="ml-0.5 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-bold leading-none">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Item list ── */}
      <div className="max-h-[360px] overflow-y-auto">
        {loading && currentItems.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <svg className="w-5 h-5 animate-spin text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-2 py-10 px-4">
            <svg className="w-8 h-8 text-slate-200 dark:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className={`text-[12px] ${text.faint}`}>
              {activeTab === "received"
                ? t("notifications.emptyReceived")
                : t("notifications.emptySent")}
            </p>
          </div>
        ) : activeTab === "received" ? (
          inboxItems.map((item) => (
            <InboxRow
              key={item.file_id}
              item={item}
              isNew={newIds.has(item.file_id)}
            />
          ))
        ) : (
          sentItems.map((item) => (
            <SentRow key={item.file_id} item={item} />
          ))
        )}
      </div>

      {/* ── Footer ── */}
      {!isEmpty && (
        <div className="border-t border-slate-100 dark:border-white/[0.05] px-4 py-2.5 flex items-center justify-between">
          <Link
            to="/profile?tab=history"
            onClick={onClose}
            className="text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:underline"
          >
            {t("notifications.viewAll")} →
          </Link>
          <span className={`text-[11px] ${text.faint}`}>
            {currentItems.length} {t("notifications.items")}
          </span>
        </div>
      )}
    </div>
  );
}
