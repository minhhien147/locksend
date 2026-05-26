/**
 * KeyUnlockBanner — banner inline hiển thị khi vault chưa unlock.
 * Tự fetch encrypted blob từ server, cho phép nhập passphrase ngay tại chỗ.
 */
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { decryptKeyBlob, validatePassphrase } from "../utils/crypto";
import { setKeys, isUnlocked } from "../utils/keyVault";
import { fetchMyEncryptedKeyBlob } from "../utils/api";
import Alert from "./ui/Alert";
import Button from "./ui/Button";
import { inputBase, text, linkAccent } from "../styles/theme";

interface KeyUnlockBannerProps {
  onUnlocked?: () => void;
}

type BannerState = "checking" | "no_keys" | "locked" | "unlocked";

export default function KeyUnlockBanner({ onUnlocked }: KeyUnlockBannerProps) {
  const [bannerState, setBannerState] = useState<BannerState>("checking");
  const [blob, setBlob] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isUnlocked()) {
      setBannerState("unlocked");
      return;
    }
    fetchMyEncryptedKeyBlob()
      .then((data) => {
        if (!data.has_keys || !data.encrypted_key_blob) {
          setBannerState("no_keys");
        } else {
          setBlob(data.encrypted_key_blob);
          setBannerState("locked");
        }
      })
      .catch(() => setBannerState("no_keys"));
  }, []);

  if (bannerState === "unlocked" || bannerState === "checking") return null;

  if (bannerState === "no_keys") {
    return (
      <Alert tone="warning">
        Chưa có keypair. Hãy vào trang{" "}
        <Link to="/keys" className={linkAccent}>Quản lý Keys</Link>{" "}
        để tạo keypair đầu tiên.
      </Alert>
    );
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!blob) return;
    const err = validatePassphrase(passphrase);
    if (err) { setError(err); return; }

    setLoading(true);
    setError(null);
    try {
      const keys = await decryptKeyBlob(blob, passphrase);
      await setKeys(keys);
      setPassphrase("");
      setBannerState("unlocked");
      onUnlocked?.();
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        code === "WRONG_PASSPHRASE"
          ? "Passphrase không đúng."
          : "Không mở khóa được keypair. Thử lại."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Alert tone="warning" className="space-y-3">
      <p>Keypair đã được mã hóa. Nhập passphrase để upload / giải mã file.</p>
      <form onSubmit={(e) => void handleUnlock(e)} className="flex flex-col sm:flex-row gap-2">
        <input
          type="password"
          value={passphrase}
          onChange={(e) => { setPassphrase(e.target.value); setError(null); }}
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
