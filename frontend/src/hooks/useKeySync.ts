import { useEffect, useRef } from "react";
import { isKeysUnlocked } from "../utils/crypto";
import { KEY_SYNC_INTERVAL_MS, syncPublicKeysToServer } from "../utils/keySync";

/**
 * Tự động đồng bộ public key lên server mỗi 30 phút khi đã đăng nhập và đã mở khóa key.
 */
export function useKeySync(enabled: boolean): void {
  const ranOnce = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      if (!isKeysUnlocked()) return;
      void syncPublicKeysToServer();
    };

    if (!ranOnce.current) {
      ranOnce.current = true;
      run();
    }

    const id = window.setInterval(run, KEY_SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled]);
}
