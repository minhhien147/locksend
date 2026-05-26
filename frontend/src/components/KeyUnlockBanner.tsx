import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { decryptKeyBlob, validatePassphrase } from "../utils/crypto";
import { setKeys, isUnlocked } from "../utils/keyVault";
import { fetchMyEncryptedKeyBlob } from "../utils/api";
import Button from "./ui/Button";
import { inputBase } from "../styles/theme";

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
      <p className="text-sm text-amber-700 dark:text-amber-300/90">
        <Link to="/keys" className="font-medium underline underline-offset-2">
          Keys
        </Link>
        {" — chưa có keypair"}
      </p>
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
      setError(code === "WRONG_PASSPHRASE" ? "Passphrase không đúng." : "Không mở khóa được.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleUnlock(e)} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
      <input
        type="password"
        value={passphrase}
        onChange={(e) => { setPassphrase(e.target.value); setError(null); }}
        placeholder="Passphrase"
        autoComplete="current-password"
        disabled={loading}
        className={`flex-1 min-w-0 ${inputBase}`}
      />
      <Button type="submit" variant="secondary" loading={loading} disabled={!passphrase}>
        Mở khóa
      </Button>
      {error && <p className="w-full text-xs text-rose-600 dark:text-rose-400 sm:order-last">{error}</p>}
    </form>
  );
}
