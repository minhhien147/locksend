import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  clearPageDraft,
  isJsonSerializable,
  readMemory,
  readStorageField,
  writeMemory,
  writeStorageField,
} from "../utils/pageDraft";

/**
 * - persist: RAM khi đổi trang + sessionStorage khi F5 (chỉ JSON-safe)
 * - memory: chỉ RAM (File, mật khẩu đang nhập, v.v.)
 * - none: useState thường (không khuyến nghị — dùng khi cố ý không lưu)
 */
export type DraftMode = "persist" | "memory" | "none";

export function useDraftState<T>(
  pageKey: string,
  field: string,
  initialValue: T,
  mode: DraftMode = "persist"
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (mode === "none") return initialValue;
    const mem = readMemory<T>(pageKey, field);
    if (mem !== undefined) return mem;
    if (mode === "persist") {
      const stored = readStorageField<T>(pageKey, field);
      if (stored !== undefined) return stored;
    }
    return initialValue;
  });

  useEffect(() => {
    if (mode === "none") return;
    writeMemory(pageKey, field, value);
    if (mode === "persist" && isJsonSerializable(value)) {
      writeStorageField(pageKey, field, value);
    }
  }, [pageKey, field, value, mode]);

  return [value, setValue];
}

export function useClearPageDraft(pageKey: string): () => void {
  return () => clearPageDraft(pageKey);
}
