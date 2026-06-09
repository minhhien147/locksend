import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { decryptKeyBlob, validatePassphrase } from "../utils/crypto";
import { setKeys, isUnlocked } from "../utils/keyVault";
import { fetchMyEncryptedKeyBlob } from "../utils/api";
import Button from "./ui/Button";
import { useT } from "../i18n/context";
import { inputBase } from "../styles/theme";

interface KeyUnlockBannerProps {
  onUnlocked?: () => void;
}

type BannerState = "checking" | "no_keys" | "blob_missing" | "locked" | "unlocked";

function translatePassphraseError(t: ReturnType<typeof useT>, code: string): string {
  if (code === "PASSPHRASE_TOO_SHORT") return t("errors.PASSPHRASE_TOO_SHORT");
  if (code === "WRONG_PASSPHRASE") return t("keyUnlock.wrongPassphrase");
  return code;
}

export default function KeyUnlockBanner({ onUnlocked }: KeyUnlockBannerProps) {
  const t = useT();
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
        if (!data.has_keys) {
          setBannerState("no_keys");
        } else if (!data.encrypted_key_blob) {
          setBannerState("blob_missing");
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
          {t("nav.keys")}
        </Link>
        {t("keyUnlock.bannerNoKey")}
      </p>
    );
  }

  if (bannerState === "blob_missing") {
    return (
      <p className="text-sm text-rose-600 dark:text-rose-400">
        <Link to="/keys" className="font-medium underline underline-offset-2">
          {t("nav.keys")}
        </Link>
        {t("keyUnlock.bannerBlobMissing")}
      </p>
    );
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!blob) return;
    const err = validatePassphrase(passphrase);
    if (err) { setError(translatePassphraseError(t, err)); return; }

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
      setError(code === "WRONG_PASSPHRASE" ? t("keyUnlock.wrongPassphrase") : t("keyUnlock.unlockFailed"));
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
        placeholder={t("keyUnlock.passphrase")}
        autoComplete="current-password"
        disabled={loading}
        className={`flex-1 min-w-0 ${inputBase}`}
      />
      <Button type="submit" variant="secondary" loading={loading} disabled={!passphrase}>
        {t("common.unlock")}
      </Button>
      {error && <p className="w-full text-xs text-rose-600 dark:text-rose-400 sm:order-last">{error}</p>}
    </form>
  );
}
