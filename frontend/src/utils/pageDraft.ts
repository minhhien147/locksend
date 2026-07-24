/** Bộ nhớ phiên (navigation) + sessionStorage (F5) cho draft form theo trang. */

const memory = new Map<string, unknown>();
const STORAGE_PREFIX = "sfs_page_draft:";

function memKey(pageKey: string, field: string): string {
  return `${pageKey}:${field}`;
}

function storageKey(pageKey: string): string {
  return `${STORAGE_PREFIX}${pageKey}`;
}

export function isJsonSerializable(value: unknown): boolean {
  if (value === undefined || typeof value === "function") return false;
  if (value instanceof File || value instanceof Blob) return false;
  if (Array.isArray(value) && value.some((v) => v instanceof File || v instanceof Blob)) {
    return false;
  }
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

export function readMemory<T>(pageKey: string, field: string): T | undefined {
  return memory.get(memKey(pageKey, field)) as T | undefined;
}

export function writeMemory(pageKey: string, field: string, value: unknown): void {
  memory.set(memKey(pageKey, field), value);
}

export function readStorageBag(pageKey: string): Record<string, unknown> {
  try {
    const raw = sessionStorage.getItem(storageKey(pageKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readStorageField<T>(pageKey: string, field: string): T | undefined {
  const bag = readStorageBag(pageKey);
  if (!(field in bag)) return undefined;
  return bag[field] as T;
}

export function writeStorageField(pageKey: string, field: string, value: unknown): void {
  if (!isJsonSerializable(value)) return;
  const bag = readStorageBag(pageKey);
  bag[field] = value;
  try {
    sessionStorage.setItem(storageKey(pageKey), JSON.stringify(bag));
  } catch {
    /* quota */
  }
}

export function clearPageDraft(pageKey: string): void {
  const prefix = `${pageKey}:`;
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  try {
    sessionStorage.removeItem(storageKey(pageKey));
  } catch {
    /* ignore */
  }
}

/** Đọc legacy key cũ (migration một lần). */
export function migrateLegacyStorage(
  legacyKey: string,
  pageKey: string
): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(legacyKey);
    if (!raw) return null;
    sessionStorage.removeItem(legacyKey);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      try {
        sessionStorage.setItem(storageKey(pageKey), JSON.stringify(parsed));
      } catch {
        /* ignore */
      }
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function migrateLegacyScalar(
  legacyKey: string,
  pageKey: string,
  field: string
): string | null {
  try {
    const raw = sessionStorage.getItem(legacyKey);
    if (!raw) return null;
    sessionStorage.removeItem(legacyKey);
    writeStorageField(pageKey, field, raw);
    return raw;
  } catch {
    return null;
  }
}
