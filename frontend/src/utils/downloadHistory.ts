/**
 * downloadHistory.ts
 * Lưu lịch sử tải file vào localStorage (download xảy ra hoàn toàn client-side,
 * backend không biết → chỉ có thể lưu tại trình duyệt).
 */

const STORAGE_KEY = "sfs_download_history";
const MAX_ENTRIES = 200;

export interface DownloadHistoryItem {
  id: string;
  sasUrl: string;
  fileName: string;
  mimeType: string | undefined;
  fileSizeBytes: number | undefined;
  checksum: string | undefined;   // SHA-256 plaintext
  isChunked: boolean;
  downloadedAt: string;           // ISO 8601
  /** Khớp files.id trên server (nếu blob có metadata file_id) */
  serverFileId?: string;
}

export function getDownloadHistory(): DownloadHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DownloadHistoryItem[];
  } catch {
    return [];
  }
}

export function saveDownloadEntry(entry: Omit<DownloadHistoryItem, "id" | "downloadedAt">): void {
  const history = getDownloadHistory();
  const newEntry: DownloadHistoryItem = {
    ...entry,
    id: crypto.randomUUID(),
    downloadedAt: new Date().toISOString(),
  };
  const updated = [newEntry, ...history].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage đầy hoặc private mode — bỏ qua lỗi
  }
}

export function deleteDownloadEntry(id: string): void {
  const updated = getDownloadHistory().filter((e) => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function clearDownloadHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
