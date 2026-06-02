import { useState, useEffect, useRef } from "react";
import { useDraftState } from "../hooks/useDraftState";
import { clearPageDraft } from "../utils/pageDraft";

const VAULT_SHARE_KEY = "vault-share";
import {
  searchUsers,
  getUserPublicKey,
  shareVaultFile,
  type VaultFile,
  type RecipientPayload,
} from "../utils/api";
import {
  fromBase64,
  unwrapEnvelopeContentKey,
  wrapEnvelopeForRecipient,
  type EncryptionMetadata,
} from "../utils/crypto";
import { getKeys } from "../utils/keyVault";
import Button from "./ui/Button";
import Alert from "./ui/Alert";
import { inputBase, label, text } from "../styles/theme";

interface Props {
  file: VaultFile;
  onClose: () => void;
  onShared: () => void;
}

type ShareRecipient = {
  userId: string;
  label: string;
  publicKeyX25519: string;
  keyVersion: number;
};

export default function VaultShareDialog({ file, onClose, onShared }: Props) {
  const draftScope = `${VAULT_SHARE_KEY}:${file.file_id}`;
  const [query, setQuery] = useDraftState(draftScope, "query", "");
  const [results, setResults] = useState<
    { id: string; email: string | null; display_name: string | null }[]
  >([]);
  const [selected, setSelected] = useDraftState<ShareRecipient[]>(
    draftScope,
    "selected",
    []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    timerRef.current = window.setTimeout(async () => {
      try {
        const rows = await searchUsers(query);
        setResults(
          rows
            .filter((r) => r.has_public_key)
            .map((r) => ({
              id: r.id,
              email: r.email,
              display_name: r.display_name,
            }))
        );
      } catch {
        setResults([]);
      }
    }, 300);
  }, [query]);

  async function addRecipient(userId: string) {
    if (selected.some((s) => s.userId === userId)) return;
    setError(null);
    try {
      const pk = await getUserPublicKey(userId);
      const label =
        results.find((r) => r.id === userId)?.display_name ||
        results.find((r) => r.id === userId)?.email ||
        userId;
      setSelected((prev) => [
        ...prev,
        {
          userId,
          label,
          publicKeyX25519: pk.public_key_x25519,
          keyVersion: pk.key_version ?? 1,
        },
      ]);
      setQuery("");
      setResults([]);
    } catch {
      setError("Không lấy được public key của user");
    }
  }

  async function handleShare() {
    const keys = getKeys();
    if (!keys) {
      setError("Mở khóa keypair trước khi chia sẻ");
      return;
    }
    if (selected.length === 0) {
      setError("Chọn ít nhất một người nhận");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const baseMeta = file.encryption_metadata as unknown as EncryptionMetadata;
      const { contentSecret, contentNonce } = await unwrapEnvelopeContentKey(
        baseMeta,
        keys.x25519.privateKey
      );
      const payloads: RecipientPayload[] = [];
      for (const r of selected) {
        const wrapped = await wrapEnvelopeForRecipient(
          baseMeta,
          contentSecret,
          contentNonce,
          fromBase64(r.publicKeyX25519)
        );
        payloads.push({
          recipient_id: r.userId,
          wrapped_file_key: JSON.stringify(wrapped),
          wrapped_key_alg: "X25519-HKDF",
          key_id: String(r.keyVersion),
          wrapped_key_version: r.keyVersion,
        });
      }
      await shareVaultFile(file.file_id, payloads);
      clearPageDraft(draftScope);
      onShared();
      onClose();
    } catch (e) {
      setError((e as Error).message ?? "Chia sẻ thất bại");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12141c] p-5 space-y-4 shadow-xl">
        <h3 className={`text-lg font-semibold ${text.primary}`}>
          Chia sẻ từ kho
        </h3>
        <p className={`text-sm ${text.muted} truncate`}>{file.original_filename}</p>
        {!file.can_share && (
          <Alert tone="warning">
            File lớn (chunked) chưa hỗ trợ chia sẻ trực tiếp từ kho.
          </Alert>
        )}

        <div>
          <label className={label}>Tìm người nhận</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`w-full mt-1 ${inputBase}`}
            placeholder="Email hoặc tên…"
            disabled={loading || !file.can_share}
          />
          {results.length > 0 && (
            <ul className="mt-1 max-h-32 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                    onClick={() => void addRecipient(r.id)}
                  >
                    {r.display_name || r.email}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selected.map((s) => (
              <span
                key={s.userId}
                className="text-xs px-2 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/25"
              >
                {s.label}
                <button
                  type="button"
                  className="ml-1 text-white/40 hover:text-white"
                  onClick={() =>
                    setSelected((prev) => prev.filter((x) => x.userId !== s.userId))
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {error && <Alert tone="error">{error}</Alert>}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button
            fullWidth
            loading={loading}
            disabled={!file.can_share || selected.length === 0}
            onClick={() => void handleShare()}
          >
            Chia sẻ
          </Button>
        </div>
      </div>
    </div>
  );
}
