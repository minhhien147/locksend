import { useEffect } from "react";
import { isUnlocked } from "../utils/keyVault";
import { KEY_SYNC_INTERVAL_MS, syncPublicKeysToServer } from "../utils/keySync";

/**
 * Tự động đồng bộ public key lên server khi vault mở khóa và mỗi 30 phút.
 */
export function useKeySync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      if (!isUnlocked()) return;
      void syncPublicKeysToServer();
    };

    run();
    window.addEventListener("ls-vault-unlocked", run);
    const id = window.setInterval(run, KEY_SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener("ls-vault-unlocked", run);
      window.clearInterval(id);
    };
  }, [enabled]);
}
