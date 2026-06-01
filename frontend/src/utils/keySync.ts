import { toBase64 } from "./crypto";
import { getKeys } from "./keyVault";
import { fetchMyEncryptedKeyBlob, getAccessToken, parseJwtPayload, storeMyPublicKey } from "./api";

/** Đẩy public key hiện tại (đã mở khóa) lên server. */
export async function syncPublicKeysToServer(): Promise<{ ok: true } | { ok: false; error: string }> {
  const keys = getKeys();
  if (!keys) {
    return { ok: false, error: "Chưa mở khóa keypair" };
  }
  const token = getAccessToken();
  if (!token) {
    return { ok: false, error: "Chưa đăng nhập" };
  }
  const payload = parseJwtPayload(token);
  const externalId = payload?.sub as string | undefined;
  if (!externalId) {
    return { ok: false, error: "Không đọc được user id" };
  }
  try {
    let encryptedKeyBlob: string | undefined;
    try {
      const server = await fetchMyEncryptedKeyBlob();
      encryptedKeyBlob = server.encrypted_key_blob ?? undefined;
    } catch {
      /* keep sync best-effort if blob fetch fails */
    }
    await storeMyPublicKey({
      externalId,
      publicKeyX25519: toBase64(keys.x25519.publicKey),
      publicKeyEd25519: toBase64(keys.ed25519.publicKey),
      ...(encryptedKeyBlob ? { encryptedKeyBlob } : {}),
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Đồng bộ thất bại" };
  }
}

export const KEY_SYNC_INTERVAL_MS = 30 * 60 * 1000;

/** Giữ encrypted blob khi chỉ đồng bộ public key (tránh xóa blob trên server). */
export async function fetchServerEncryptedBlob(): Promise<string | undefined> {
  try {
    const data = await fetchMyEncryptedKeyBlob();
    return data.encrypted_key_blob ?? undefined;
  } catch {
    return undefined;
  }
}
