import { useState } from "react";
import { Link } from "react-router-dom";
import {
  hasKeysInStorage,
  isEncryptedKeyStorage,
  isKeysUnlocked,
  unlockKeysFromStorage,
} from "../utils/crypto";
import Alert from "./ui/Alert";
import Button from "./ui/Button";
import { inputBase, text, linkAccent } from "../styles/theme";

interface KeyUnlockBannerProps {
  onUnlocked?: () => void;
}

/** Hiện khi có key đã mã hóa nhưng chưa nhập passphrase trong session. */
export default function KeyUnlockBanner({ onUnlocked }: KeyUnlockBannerProps) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!hasKeysInStorage() || !isEncryptedKeyStorage() || isKeysUnlocked()) {
    return null;
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await unlockKeysFromStorage(passphrase);
      setPassphrase("");
      onUnlocked?.();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "WRONG_PASSPHRASE") {
        setError("Passphrase không đúng.");
      } else {
        setError("Không mở khóa được keypair. Thử lại.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Alert tone="warning" className="space-y-3">
      <p>Keypair đã được mã hóa. Nhập passphrase để upload / giải mã file.</p>
      <form onSubmit={handleUnlock} className="flex flex-col sm:flex-row gap-2">
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder="Passphrase"
          autoComplete="current-password"
          disabled={loading}
          className={`flex-1 ${inputBase}`}
        />
        <Button type="submit" variant="secondary" loading={loading} disabled={!passphrase}>
          Mở khóa
        </Button>
      </form>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <p className={`text-xs ${text.muted}`}>
        Quên passphrase?{" "}
        <Link to="/keys" className={linkAccent}>
          Quản lý Keys
        </Link>
      </p>
    </Alert>
  );
}
