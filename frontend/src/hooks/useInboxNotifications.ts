/**
 * useInboxNotifications — polls inbox (received) + sent files and fires browser
 * push notifications when new files arrive.
 *
 * Exposes both item lists for the notification panel dropdown.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getSharedWithMe, getMyFiles } from "../utils/api";
import type { SharedFileItem, FileHistoryItem } from "../utils/api";
import { useAuth } from "../contexts/AuthContext";

export type { SharedFileItem, FileHistoryItem };

const SEEN_KEY = "locksend_notified_inbox_ids";
const POLL_INTERVAL_MS = 60_000;
const MAX_PANEL_ITEMS = 12;

// ── localStorage helpers ───────────────────────────────────────────────────────

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function persistSeenIds(ids: Set<string>): void {
  try {
    const arr = [...ids].slice(-1000);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch { /* storage full — not critical */ }
}

// ── Public interface ───────────────────────────────────────────────────────────

export interface InboxNotificationState {
  /** Recent received files (up to MAX_PANEL_ITEMS). */
  inboxItems: SharedFileItem[];
  /** Recent sent files (up to MAX_PANEL_ITEMS). */
  sentItems: FileHistoryItem[];
  /** Received files that are new since last seen. */
  newInboxItems: SharedFileItem[];
  /** Total unread badge count. */
  unreadCount: number;
  /** True while the first fetch is in-flight. */
  loading: boolean;
  /** Current browser notification permission state. */
  permissionState: NotificationPermission | "unsupported";
  /** Call after a user gesture (click) to request browser push permission. */
  requestPermission: () => Promise<void>;
  /** Call when the user opens the notification panel / inbox to reset the badge. */
  markAllSeen: () => void;
  /** Manually trigger a refresh of both lists. */
  refresh: () => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useInboxNotifications(): InboxNotificationState {
  const { user } = useAuth();

  const [inboxItems, setInboxItems] = useState<SharedFileItem[]>([]);
  const [sentItems, setSentItems] = useState<FileHistoryItem[]>([]);
  const [newInboxItems, setNewInboxItems] = useState<SharedFileItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [permissionState, setPermissionState] = useState<
    NotificationPermission | "unsupported"
  >(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );

  const seenRef = useRef<Set<string>>(loadSeenIds());
  const initializedRef = useRef(false);
  const userEmailRef = useRef<string | null>(null);

  const poll = useCallback(async (isManual = false) => {
    if (!user) return;

    // Reset on account switch
    if (userEmailRef.current !== user.email) {
      userEmailRef.current = user.email;
      initializedRef.current = false;
      seenRef.current = loadSeenIds();
      setUnreadCount(0);
      setNewInboxItems([]);
    }

    if (isManual) setLoading(true);

    try {
      // Fetch both in parallel; sent may fail for recipient accounts (empty array fallback)
      const [inbox, sent] = await Promise.all([
        getSharedWithMe().catch(() => [] as SharedFileItem[]),
        getMyFiles().catch(() => [] as FileHistoryItem[]),
      ]);

      // Keep most-recent items for the panel
      const recentInbox = [...inbox]
        .sort((a, b) => b.granted_at.localeCompare(a.granted_at))
        .slice(0, MAX_PANEL_ITEMS);

      const recentSent = [...sent]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, MAX_PANEL_ITEMS);

      setInboxItems(recentInbox);
      setSentItems(recentSent);

      // ── First-load logic ───────────────────────────────────────────────────
      if (!initializedRef.current) {
        initializedRef.current = true;
        const isFirstEver = seenRef.current.size === 0;

        if (isFirstEver) {
          for (const f of inbox) seenRef.current.add(f.file_id);
          persistSeenIds(seenRef.current);
          setLoading(false);
          return;
        }

        // Returning visit: count files since last session
        const unseen = inbox.filter((f) => !seenRef.current.has(f.file_id));
        if (unseen.length > 0) {
          setUnreadCount(unseen.length);
          setNewInboxItems(unseen.slice(0, MAX_PANEL_ITEMS));
          for (const f of inbox) seenRef.current.add(f.file_id);
          persistSeenIds(seenRef.current);
        }
        setLoading(false);
        return;
      }

      // ── Ongoing poll: detect truly new files ───────────────────────────────
      const brand_new = inbox.filter((f) => !seenRef.current.has(f.file_id));
      if (brand_new.length > 0) {
        setUnreadCount((prev) => prev + brand_new.length);
        setNewInboxItems((prev) => [...brand_new, ...prev].slice(0, MAX_PANEL_ITEMS));

        // Browser push notifications
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          for (const file of brand_new) {
            const sender = file.sender_name || file.sender_email || "Someone";
            try {
              const notif = new Notification("LockSend — New file received", {
                body: `${sender} shared "${file.original_filename}" with you`,
                icon: "/favicon.ico",
                tag: `locksend-inbox-${file.file_id}`,
              });
              notif.onclick = () => {
                window.focus();
                window.location.href = `${window.location.origin}/profile?tab=history`;
              };
            } catch { /* Notification API unavailable */ }
          }
        }

        for (const f of brand_new) seenRef.current.add(f.file_id);
        persistSeenIds(seenRef.current);
      }
    } catch { /* best-effort */ } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      setInboxItems([]);
      setSentItems([]);
      setNewInboxItems([]);
      initializedRef.current = false;
      setLoading(false);
      return;
    }
    void poll();
    const id = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [user, poll]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    try {
      const result = await Notification.requestPermission();
      setPermissionState(result);
    } catch { /* older browsers throw */ }
  }, []);

  const markAllSeen = useCallback(() => {
    setUnreadCount(0);
    setNewInboxItems([]);
  }, []);

  const refresh = useCallback(() => {
    void poll(true);
  }, [poll]);

  return {
    inboxItems,
    sentItems,
    newInboxItems,
    unreadCount,
    loading,
    permissionState,
    requestPermission,
    markAllSeen,
    refresh,
  };
}
