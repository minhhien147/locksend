/**
 * crypto.ts — Client-side Cryptography Module
 *
 * Toàn bộ mã hóa/giải mã diễn ra tại đây, hoàn toàn ở trình duyệt.
 * Server/Azure KHÔNG BAO GIỜ nhận plaintext.
 *
 * Stack: X25519 (Key Exchange) + HKDF-SHA256 (KDF) + AES-256-GCM (Encrypt) + Ed25519 (Sign)
 *
 * Chunked mode: chia file thành các khối ~64MB, mã hóa độc lập với nonce tăng dần.
 * Nonce mỗi chunk = baseNonce[0:8] || uint32_big_endian(chunkIndex)
 * Signature bảo vệ manifest metadata (không cần load toàn bộ ciphertext vào RAM).
 */

import { x25519, ed25519 } from "@noble/curves/ed25519.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KeyPair {
  privateKey: Uint8Array; // 32 bytes
  publicKey: Uint8Array;  // 32 bytes
}

export interface EncryptionMetadata {
  ephemeralPublicKey: string; // base64 — X25519 ephemeral pubkey
  nonce: string;              // base64 — 12 bytes AES-GCM nonce (single-shot) hoặc baseNonce (chunked)
  signature: string;          // base64 — Ed25519 sig
  signerPublicKey: string;    // base64 — Ed25519 pubkey của sender
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** SHA-256 hex của plaintext gốc — dùng để verify toàn vẹn sau khi giải mã */
  plaintextChecksum?: string;
}

/** Metadata mở rộng cho chunked encryption */
export interface ChunkedEncryptionMetadata extends EncryptionMetadata {
  isChunked: true;
  chunkSize: number;   // bytes mỗi chunk (thường 64MB)
  chunkCount: number;  // tổng số chunk
  baseNonce: string;   // base64 — 8 bytes, dùng để sinh per-chunk nonce
  /** SHA-256 hex của từng plaintext chunk — được ký bởi Ed25519 manifest */
  chunkChecksums?: string[];
}

export interface EncryptResult {
  ciphertext: Uint8Array;
  metadata: EncryptionMetadata;
}

// ─── Key Generation ───────────────────────────────────────────────────────────

/** Tạo X25519 keypair để trao đổi khóa */
export function generateX25519KeyPair(): KeyPair {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

/** Tạo Ed25519 keypair để ký/xác thực */
export function generateEd25519KeyPair(): KeyPair {
  const privateKey = ed25519.utils.randomSecretKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

// ─── HKDF Key Derivation ──────────────────────────────────────────────────────

/** Helper: copy Uint8Array vào ArrayBuffer riêng (tránh shared backing buffer issues) */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

/**
 * Dùng HKDF-SHA256 để biến shared secret (32 bytes) thành:
 * - AES-256 key (32 bytes)
 * - Nonce (12 bytes)
 * Dùng cho single-shot encryption.
 */
async function deriveKeyAndNonce(
  sharedSecret: Uint8Array,
  salt: Uint8Array,
  info: string = "secure-file-sharing"
): Promise<{ aesKey: CryptoKey; nonce: Uint8Array }> {
  const infoBytes = new TextEncoder().encode(info);

  const rawKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(sharedSecret),
    { name: "HKDF" },
    false,
    ["deriveKey", "deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(infoBytes),
    },
    rawKey,
    (32 + 12) * 8
  );

  const derivedBytes = new Uint8Array(derived);
  const keyBytes = derivedBytes.slice(0, 32);
  const nonce = derivedBytes.slice(32, 44);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return { aesKey, nonce };
}

/**
 * Dùng HKDF-SHA256 để dẫn xuất chỉ AES-256 key (32 bytes).
 * Dùng cho chunked encryption — nonce được sinh per-chunk.
 */
async function deriveAesKeyOnly(
  sharedSecret: Uint8Array,
  salt: Uint8Array,
  info: string = "secure-file-sharing-chunked"
): Promise<CryptoKey> {
  const infoBytes = new TextEncoder().encode(info);
  const rawKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(sharedSecret),
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(infoBytes),
    },
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ─── Encryption (Upload) ──────────────────────────────────────────────────────

/**
 * Mã hóa file hoàn toàn ở client-side.
 *
 * Quy trình:
 * 1. Tạo ephemeral X25519 keypair (mới mỗi file → Forward Secrecy)
 * 2. Tính shared secret với recipientPublicKey
 * 3. HKDF → AES-256 key + nonce
 * 4. AES-256-GCM encrypt
 * 5. Ed25519 sign ciphertext
 */
export async function encryptFile(
  file: File,
  recipientX25519PublicKey: Uint8Array,
  senderEd25519PrivateKey: Uint8Array,
  senderEd25519PublicKey: Uint8Array
): Promise<EncryptResult> {
  // 1. Ephemeral keypair — tạo mới cho mỗi file
  const ephemeral = generateX25519KeyPair();

  // 2. Shared secret = X25519(ephemeral_private, recipient_public)
  const sharedSecret = x25519.getSharedSecret(
    ephemeral.privateKey,
    recipientX25519PublicKey
  );

  // 3. Salt = ephemeral public key (public, không cần bí mật)
  const salt = ephemeral.publicKey;

  // 4. HKDF → AES key + nonce
  const { aesKey, nonce } = await deriveKeyAndNonce(sharedSecret, salt);

  // 5. Đọc file thành ArrayBuffer
  const plaintext = await file.arrayBuffer();

  // 6. Tính SHA-256 của plaintext trước khi mã hóa (checksum anti-malware)
  const plaintextChecksum = await computeSHA256Hex(plaintext);

  // 7. AES-256-GCM encrypt
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce) },
    aesKey,
    plaintext
  );
  const ciphertext = new Uint8Array(ciphertextBuffer);

  // 8. Ed25519 sign ciphertext (đảm bảo integrity)
  const signature = ed25519.sign(ciphertext, senderEd25519PrivateKey);

  const metadata: EncryptionMetadata = {
    ephemeralPublicKey: toBase64(ephemeral.publicKey),
    nonce: toBase64(nonce),
    signature: toBase64(signature),
    signerPublicKey: toBase64(senderEd25519PublicKey),
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
    plaintextChecksum,
  };

  return { ciphertext, metadata };
}

// ─── Decryption (Download) ────────────────────────────────────────────────────

/**
 * Giải mã file hoàn toàn ở client-side.
 *
 * Quy trình:
 * 1. Tải ciphertext + metadata
 * 2. Xác thực chữ ký Ed25519
 * 3. Tính shared secret với private key của mình
 * 4. HKDF → AES key + nonce
 * 5. AES-256-GCM decrypt + kiểm tra GCM tag
 */
export async function decryptFile(
  ciphertext: Uint8Array,
  metadata: EncryptionMetadata,
  recipientX25519PrivateKey: Uint8Array
): Promise<Uint8Array> {
  // 1. Xác thực chữ ký Ed25519
  const signerPublicKey = fromBase64(metadata.signerPublicKey);
  const signature = fromBase64(metadata.signature);
  const isValid = ed25519.verify(signature, ciphertext, signerPublicKey);
  if (!isValid) {
    throw new Error("Chữ ký Ed25519 không hợp lệ — file có thể bị giả mạo!");
  }

  // 2. Tính shared secret
  const ephemeralPublicKey = fromBase64(metadata.ephemeralPublicKey);
  const sharedSecret = x25519.getSharedSecret(
    recipientX25519PrivateKey,
    ephemeralPublicKey
  );

  // 3. HKDF → AES key + nonce (dùng ephemeral public key làm salt)
  const { aesKey, nonce: derivedNonce } = await deriveKeyAndNonce(
    sharedSecret,
    ephemeralPublicKey
  );

  const storedNonce = fromBase64(metadata.nonce);
  // Kiểm tra nonce khớp (đảm bảo HKDF deterministic)
  if (!timingSafeEqual(derivedNonce, storedNonce)) {
    throw new Error("Nonce không khớp — metadata bị sửa đổi!");
  }

  // 4. AES-256-GCM decrypt (GCM tag tự động kiểm tra)
  let plaintextBuffer: ArrayBuffer;
  try {
    plaintextBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(storedNonce) },
      aesKey,
      toArrayBuffer(ciphertext)
    );
  } catch {
    throw new Error("Giải mã thất bại — sai khóa hoặc dữ liệu bị hỏng!");
  }

  // 5. Verify SHA-256 plaintext checksum (phát hiện thay thế nội dung / mã độc)
  if (metadata.plaintextChecksum) {
    const computed = await computeSHA256Hex(plaintextBuffer);
    if (computed !== metadata.plaintextChecksum) {
      throw new Error(
        `SHA-256 không khớp — file có thể bị thay nội dung hoặc nhiễm mã độc!\n` +
        `Mong đợi: ${metadata.plaintextChecksum}\nThực tế: ${computed}`
      );
    }
  }

  return new Uint8Array(plaintextBuffer);
}

// ─── Chunked Encryption ───────────────────────────────────────────────────────

/**
 * Kích thước mặc định mỗi chunk: 64MB.
 * Đủ lớn để tối ưu I/O, đủ nhỏ để không gây OOM.
 */
export const DEFAULT_CHUNK_SIZE = 64 * 1024 * 1024;

/**
 * Ngưỡng tự động chuyển sang chế độ chunked.
 * File > 64MB → dùng chunked encryption + multipart upload.
 */
export const CHUNKED_THRESHOLD = 64 * 1024 * 1024;

/**
 * Sinh nonce 12-byte cho chunk thứ i:
 *   nonce[0:8]  = baseNonce (8 bytes ngẫu nhiên, cố định cho toàn session)
 *   nonce[8:12] = chunkIndex (uint32 big-endian)
 *
 * Mỗi chunk dùng nonce riêng biệt → không có nonce reuse giữa các chunk.
 */
export function buildChunkNonce(baseNonce: Uint8Array, chunkIndex: number): Uint8Array {
  const nonce = new Uint8Array(12);
  nonce.set(baseNonce.slice(0, 8), 0);
  new DataView(nonce.buffer).setUint32(8, chunkIndex, false);
  return nonce;
}

/** Sinh base nonce ngẫu nhiên 8 bytes cho một session chunked encryption */
export function generateBaseNonce(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(8));
}

/**
 * Chuẩn bị session chunked encryption: Key Exchange + HKDF → AES key.
 * Trả về aesKey, ephemeralPublicKey và baseNonce để upload page dùng.
 */
export async function prepareChunkedEncryption(
  recipientX25519PublicKey: Uint8Array
): Promise<{
  aesKey: CryptoKey;
  ephemeralPublicKey: Uint8Array;
  baseNonce: Uint8Array;
}> {
  const ephemeral = generateX25519KeyPair();
  const sharedSecret = x25519.getSharedSecret(ephemeral.privateKey, recipientX25519PublicKey);
  const aesKey = await deriveAesKeyOnly(sharedSecret, ephemeral.publicKey);
  const baseNonce = generateBaseNonce();
  return { aesKey, ephemeralPublicKey: ephemeral.publicKey, baseNonce };
}

/** Mã hóa một chunk với AES-256-GCM. Peak memory = 2 × chunkSize. */
export async function encryptChunk(
  aesKey: CryptoKey,
  chunkBuffer: ArrayBuffer,
  baseNonce: Uint8Array,
  chunkIndex: number
): Promise<Uint8Array> {
  const nonce = buildChunkNonce(baseNonce, chunkIndex);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(nonce) },
    aesKey,
    chunkBuffer
  );
  return new Uint8Array(encrypted);
}

/** Giải mã một chunk với AES-256-GCM (bao gồm kiểm tra GCM auth tag). */
export async function decryptChunk(
  aesKey: CryptoKey,
  encryptedChunk: Uint8Array,
  baseNonce: Uint8Array,
  chunkIndex: number
): Promise<Uint8Array> {
  const nonce = buildChunkNonce(baseNonce, chunkIndex);
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(nonce) },
      aesKey,
      toArrayBuffer(encryptedChunk)
    );
    return new Uint8Array(decrypted);
  } catch {
    throw new Error(`Chunk ${chunkIndex}: GCM auth tag sai — dữ liệu bị hỏng hoặc sai khóa!`);
  }
}

/**
 * Xây dựng manifest string để ký/xác thực với Ed25519.
 * Manifest bao gồm tất cả các trường quan trọng (trừ signature).
 * JSON.stringify với key cố định → string deterministic.
 */
export function buildChunkedManifest(m: {
  ephemeralPublicKey: string;
  baseNonce: string;
  chunkCount: number;
  chunkSize: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkChecksums?: string[];
}): string {
  return JSON.stringify({
    ephemeralPublicKey: m.ephemeralPublicKey,
    baseNonce: m.baseNonce,
    chunkCount: m.chunkCount,
    chunkSize: m.chunkSize,
    fileName: m.fileName,
    fileSize: m.fileSize,
    mimeType: m.mimeType,
    ...(m.chunkChecksums ? { chunkChecksums: m.chunkChecksums } : {}),
  });
}

/** Ký manifest bằng Ed25519 private key của sender */
export function signManifest(manifest: string, edPrivKey: Uint8Array): Uint8Array {
  return ed25519.sign(new TextEncoder().encode(manifest), edPrivKey);
}

/** Xác thực chữ ký manifest — trả false nếu invalid */
export function verifyManifest(
  manifest: string,
  signature: Uint8Array,
  edPubKey: Uint8Array
): boolean {
  try {
    return ed25519.verify(signature, new TextEncoder().encode(manifest), edPubKey);
  } catch {
    return false;
  }
}

/**
 * Giải mã file chunked từ packed blob đã tải về.
 *
 * Định dạng packed blob (từ Azure):
 *   [4 bytes: chunkCount big-endian]
 *   foreach chunk: [4 bytes: chunkLen big-endian] + [chunkLen bytes: ciphertext]
 *
 * Quy trình:
 * 1. Xác thực manifest signature (Ed25519)
 * 2. Dẫn xuất AES key từ shared secret
 * 3. Parse packed blob → decrypt từng chunk
 * 4. Ghép các plaintext chunks lại
 */
export async function decryptFileChunked(
  packedBlob: Uint8Array,
  metadata: ChunkedEncryptionMetadata,
  recipientX25519PrivateKey: Uint8Array,
  onProgress?: (done: number, total: number) => void
): Promise<Uint8Array> {
  // 1. Xác thực manifest signature
  const signerPublicKey = fromBase64(metadata.signerPublicKey);
  const signature = fromBase64(metadata.signature);
  const manifest = buildChunkedManifest({
    ephemeralPublicKey: metadata.ephemeralPublicKey,
    baseNonce: metadata.baseNonce,
    chunkCount: metadata.chunkCount,
    chunkSize: metadata.chunkSize,
    fileName: metadata.fileName,
    fileSize: metadata.fileSize,
    mimeType: metadata.mimeType,
    chunkChecksums: metadata.chunkChecksums,
  });

  if (!verifyManifest(manifest, signature, signerPublicKey)) {
    throw new Error("Chữ ký Ed25519 không hợp lệ — metadata bị giả mạo!");
  }

  // 2. Dẫn xuất AES key
  const ephemeralPublicKey = fromBase64(metadata.ephemeralPublicKey);
  const sharedSecret = x25519.getSharedSecret(recipientX25519PrivateKey, ephemeralPublicKey);
  const aesKey = await deriveAesKeyOnly(sharedSecret, ephemeralPublicKey);
  const baseNonce = fromBase64(metadata.baseNonce);

  // 3. Parse packed blob
  const dv = new DataView(packedBlob.buffer, packedBlob.byteOffset);
  const storedChunkCount = dv.getUint32(0, false);
  if (storedChunkCount !== metadata.chunkCount) {
    throw new Error("Số chunk không khớp metadata — dữ liệu bị sửa đổi!");
  }

  const plaintextChunks: Uint8Array[] = [];
  let offset = 4;

  for (let i = 0; i < storedChunkCount; i++) {
    if (offset + 4 > packedBlob.length) {
      throw new Error(`Dữ liệu bị cắt ngắn tại chunk ${i}`);
    }
    const chunkLen = dv.getUint32(offset, false);
    offset += 4;
    const encryptedChunk = packedBlob.slice(offset, offset + chunkLen);
    offset += chunkLen;

    const plaintextChunk = await decryptChunk(aesKey, encryptedChunk, baseNonce, i);

    // Verify per-chunk SHA-256 nếu manifest có chunkChecksums
    if (metadata.chunkChecksums && metadata.chunkChecksums.length > i) {
      const computed = await computeSHA256Hex(plaintextChunk);
      if (computed !== metadata.chunkChecksums[i]) {
        throw new Error(
          `Chunk ${i}: SHA-256 không khớp — dữ liệu bị sửa đổi hoặc nhiễm mã độc!\n` +
          `Mong đợi: ${metadata.chunkChecksums[i]}\nThực tế: ${computed}`
        );
      }
    }

    plaintextChunks.push(plaintextChunk);
    onProgress?.(i + 1, storedChunkCount);
  }

  // 4. Reassemble plaintext
  const totalSize = plaintextChunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const chunk of plaintextChunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

// ─── Key Storage (localStorage) ───────────────────────────────────────────────

export interface StoredKeyPair {
  x25519: { privateKey: string; publicKey: string };
  ed25519: { privateKey: string; publicKey: string };
}

const KEY_STORAGE_KEY = "secure_file_sharing_keys";

export function saveKeysToStorage(
  x25519Keys: KeyPair,
  ed25519Keys: KeyPair
): void {
  const stored: StoredKeyPair = {
    x25519: {
      privateKey: toBase64(x25519Keys.privateKey),
      publicKey: toBase64(x25519Keys.publicKey),
    },
    ed25519: {
      privateKey: toBase64(ed25519Keys.privateKey),
      publicKey: toBase64(ed25519Keys.publicKey),
    },
  };
  localStorage.setItem(KEY_STORAGE_KEY, JSON.stringify(stored));
}

export function loadKeysFromStorage(): {
  x25519: KeyPair;
  ed25519: KeyPair;
} | null {
  const raw = localStorage.getItem(KEY_STORAGE_KEY);
  if (!raw) return null;
  try {
    const stored: StoredKeyPair = JSON.parse(raw);
    return {
      x25519: {
        privateKey: fromBase64(stored.x25519.privateKey),
        publicKey: fromBase64(stored.x25519.publicKey),
      },
      ed25519: {
        privateKey: fromBase64(stored.ed25519.privateKey),
        publicKey: fromBase64(stored.ed25519.publicKey),
      },
    };
  } catch {
    return null;
  }
}

export function clearKeysFromStorage(): void {
  localStorage.removeItem(KEY_STORAGE_KEY);
}

// ─── Checksum ─────────────────────────────────────────────────────────────────

/**
 * Tính SHA-256 của dữ liệu và trả về chuỗi hex.
 * Dùng để tạo fingerprint plaintext trước khi mã hóa và verify sau khi giải mã.
 */
export async function computeSHA256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = data instanceof Uint8Array
    ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    : data;
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function downloadBlob(data: Uint8Array, fileName: string, mimeType: string): void {
  const blob = new Blob([new Uint8Array(data)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
