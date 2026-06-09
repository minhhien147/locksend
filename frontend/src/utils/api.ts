/**
 * api.ts — HTTP client và Auth helpers.
 *
 * Token strategy:
 *   - Access token: lưu trong bộ nhớ JS (module-level var).
 *                   KHÔNG dùng localStorage → không bị XSS đọc.
 *   - Refresh token: httpOnly cookie set bởi backend.
 *                    Không đọc được từ JS.
 *
 * Silent refresh:
 *   Khi nhận 401, interceptor tự gọi POST /auth/refresh (cookie gửi tự động).
 *   Nếu thành công → cập nhật access token trong memory + retry request gốc.
 *   Nếu thất bại   → redirect về /login.
 */

import axios from "axios";
import type { EncryptionMetadata, ChunkedEncryptionMetadata } from "./crypto";

/** Lấy `detail` từ FastAPI (503/422…) thay vì message axios mặc định. */
export function apiErrorDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response
    ?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (typeof d === "object" && d && "msg" in d ? String(d.msg) : ""))
      .filter(Boolean);
    if (msgs.length) return msgs.join(", ");
  }
  return (err as Error)?.message ?? fallback;
}

/** Dev: .env.local VITE_API_URL=/api. Prod (Railway): bắt buộc set VITE_API_URL trỏ backend. */
function resolveApiBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  // Dev: Vite proxy → backend :8000 (tránh CORS, xem vite.config.ts)
  if (import.meta.env.DEV) return "/api";
  return "";
}

const BASE_URL = resolveApiBaseUrl();

if (import.meta.env.PROD && !BASE_URL) {
  console.error(
    "[LockSend] Thiếu VITE_API_URL. Railway (frontend service) → Variables → " +
      "VITE_API_URL = URL backend (vd. https://locksend-be-production.up.railway.app), rồi Redeploy."
  );
}

// ── In-memory access token ────────────────────────────────────────────────────
// Không export trực tiếp — dùng setAccessToken / getAccessToken
let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

/** Decode JWT payload (không verify signature — chỉ dùng cho display/meta). */
export function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── Axios instance ────────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 300_000,
  withCredentials: true,  // gửi httpOnly cookie kèm mọi request (cho /auth/refresh)
});

// ── Silent refresh state ──────────────────────────────────────────────────────

let _isRefreshing = false;
// Queue các request bị 401 để retry sau khi refresh thành công
let _waitQueue: Array<(token: string) => void> = [];

function _drainQueue(newToken: string) {
  _waitQueue.forEach((resolve) => resolve(newToken));
  _waitQueue = [];
}

function _failQueue() {
  // Chỉ xóa queue; các promise đang chờ sẽ tự được GC khi
  // window.location.href = "/login" ngay sau đó khiến page navigate đi.
  _waitQueue = [];
}

// ── Request interceptor: đính kèm access token ────────────────────────────────

api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

// ── Response interceptor: silent refresh on 401 ───────────────────────────────

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    // Chỉ retry 1 lần; bỏ qua nếu chính là call /auth/refresh (tránh loop)
    if (
      err.response?.status !== 401 ||
      original._retried ||
      original.url?.includes("/auth/refresh")
    ) {
      return Promise.reject(err);
    }

    original._retried = true;

    if (_isRefreshing) {
      // Có refresh đang chạy → xếp hàng
      return new Promise<string>((resolve) => {
        _waitQueue.push(resolve);
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    _isRefreshing = true;

    try {
      const res = await authApi.refresh();
      const newToken = res.access_token;
      setAccessToken(newToken);
      _drainQueue(newToken);
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch {
      setAccessToken(null);
      _failQueue();
      window.location.href = "/login";
      return Promise.reject(err);
    } finally {
      _isRefreshing = false;
    }
  }
);

// ── Auth API ──────────────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  email_verified?: boolean;
}

export interface VerificationStatus {
  email_verified: boolean;
  email: string | null;
  verification_required: boolean;
  resend_cooldown_sec: number;
}

export async function fetchVerificationStatus(): Promise<VerificationStatus> {
  const res = await api.get<VerificationStatus>("/auth/me/verification-status");
  return res.data;
}

/**
 * authApi dùng axios trực tiếp (không qua `api` instance) để tránh interceptor loop.
 * withCredentials: true đảm bảo cookie được gửi/nhận.
 */
export const authApi = {
  async register(
    username: string,
    password: string,
    display_name?: string
  ): Promise<TokenResponse> {
    const res = await axios.post<TokenResponse>(
      `${BASE_URL}/auth/register`,
      { username, password, display_name },
      { withCredentials: true }
    );
    return res.data;
  },

  async login(username: string, password: string): Promise<TokenResponse> {
    const res = await axios.post<TokenResponse>(
      `${BASE_URL}/auth/login`,
      { username, password },
      { withCredentials: true }
    );
    return res.data;
  },

  async loginWithGoogle(credential: string): Promise<TokenResponse> {
    const res = await axios.post<TokenResponse>(
      `${BASE_URL}/auth/google`,
      { credential },
      { withCredentials: true }
    );
    return res.data;
  },

  async refresh(): Promise<TokenResponse> {
    const res = await axios.post<TokenResponse>(
      `${BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true }
    );
    return res.data;
  },

  async verifyEmail(code: string): Promise<TokenResponse> {
    const res = await api.post<TokenResponse>("/auth/verify-email", { code });
    return res.data;
  },

  async resendVerification(): Promise<void> {
    await api.post("/auth/resend-verification", {});
  },

  async logout(): Promise<void> {
    await axios
      .post(`${BASE_URL}/auth/logout`, {}, { withCredentials: true })
      .catch(() => {
        // Best-effort: không fail nếu đã logout / network error
      });
  },
};

/** Cập nhật email nhận cảnh báo bảo mật. */
export async function updateProfileEmailApi(email: string): Promise<TokenResponse> {
  const res = await api.patch<TokenResponse>("/auth/me/email", { email });
  return res.data;
}

/** Đổi mật khẩu (cần access token; dùng instance `api` để gửi Bearer). */
export async function changePasswordApi(
  current_password: string,
  new_password: string
): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>(
    "/auth/change-password",
    { current_password, new_password }
  );
  return res.data;
}

export async function updateProfileApi(display_name: string): Promise<TokenResponse> {
  const res = await api.patch<TokenResponse>("/auth/me", { display_name });
  return res.data;
}

export interface DisplayNameHistoryItem {
  id: string;
  old_display_name: string | null;
  new_display_name: string;
  changed_at: string;
  ip_address: string | null;
}

export async function fetchMyDisplayNameHistory(
  limit = 20
): Promise<DisplayNameHistoryItem[]> {
  const res = await api.get<DisplayNameHistoryItem[]>(
    "/auth/me/display-name-history",
    { params: { limit } }
  );
  return res.data;
}

// ── Upload API ────────────────────────────────────────────────────────────────

export interface UploadResponse {
  sas_url: string;
  blob_name: string;
  expires_at: string;
  file_id?: string | null;
}

export interface UserKeys {
  user_id: string;
  public_key_x25519: string;
  public_key_ed25519: string;
}

export interface MultipartInitResponse {
  blob_name: string;
  upload_id: string;
}

export interface RecipientPayload {
  recipient_id: string;
  wrapped_file_key: string;
  wrapped_key_alg?: string;
  key_id?: string | null;
  wrapped_key_version?: number;
}

/** Upload ciphertext + metadata lên backend (single-shot, dành cho file nhỏ) */
export type StorageMode = "share" | "vault";

export async function uploadEncryptedFile(
  ciphertext: Uint8Array,
  metadata: EncryptionMetadata,
  fileName: string,
  onProgress?: (percent: number) => void,
  recipients?: RecipientPayload[],
  options?: { storageMode?: StorageMode; folderId?: string | null }
): Promise<UploadResponse> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(ciphertext)], {
    type: "application/octet-stream",
  });
  formData.append("file", blob, fileName + ".enc");
  formData.append("metadata_json", JSON.stringify(metadata));
  formData.append("storage_mode", options?.storageMode ?? "share");
  if (options?.storageMode === "vault" && options.folderId) {
    formData.append("folder_id", options.folderId);
  }
  if (recipients && recipients.length > 0) {
    formData.append("recipients_json", JSON.stringify(recipients));
  }

  const response = await api.post<UploadResponse>("/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: onProgress
      ? (e) =>
          onProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
      : undefined,
  });
  return response.data;
}

// ─── Multipart Upload ─────────────────────────────────────────────────────────

export async function initMultipartUpload(
  fileName: string
): Promise<MultipartInitResponse> {
  const formData = new FormData();
  formData.append("filename", fileName);
  const response = await api.post<MultipartInitResponse>(
    "/upload/multipart/init",
    formData
  );
  return response.data;
}

export async function uploadChunk(
  blobName: string,
  chunkIndex: number,
  chunkData: Uint8Array,
  onProgress?: (percent: number) => void
): Promise<void> {
  const formData = new FormData();
  const blob = new Blob([chunkData.buffer as ArrayBuffer], {
    type: "application/octet-stream",
  });
  formData.append("chunk", blob, `chunk_${chunkIndex}`);

  await api.put(
    `/upload/multipart/${encodeURIComponent(blobName)}/chunk/${chunkIndex}`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: onProgress
        ? (e) =>
            onProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0)
        : undefined,
    }
  );
}

export async function finalizeMultipartUpload(
  blobName: string,
  chunkCount: number,
  metadata: ChunkedEncryptionMetadata,
  recipients?: RecipientPayload[],
  options?: { storageMode?: StorageMode; folderId?: string | null }
): Promise<UploadResponse> {
  const response = await api.post<UploadResponse>(
    `/upload/multipart/${encodeURIComponent(blobName)}/finalize`,
    {
      chunk_count: chunkCount,
      metadata_json: JSON.stringify(metadata),
      recipients: recipients ?? [],
      storage_mode: options?.storageMode ?? "share",
      folder_id: options?.storageMode === "vault" ? options.folderId ?? null : null,
    }
  );
  return response.data;
}

/** Lấy blob path (không gồm container) từ SAS URL Azure Blob. */
export function parseBlobNameFromSasUrl(sasUrl: string): string | null {
  try {
    const u = new URL(sasUrl.trim());
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length < 2) return null;
    return segs.slice(1).map((s) => decodeURIComponent(s)).join("/");
  } catch {
    return null;
  }
}

function _headerCi(
  headers: Record<string, unknown>,
  nameLower: string
): string | undefined {
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === nameLower && v != null) {
      return String(v);
    }
  }
  return undefined;
}

/** Ghi download_logs trên server (best-effort, không throw). */
export async function recordDownloadLog(params: {
  sasUrl: string;
  serverFileId?: string | null;
}): Promise<void> {
  const body: { file_id?: string; blob_name?: string } = {};
  if (params.serverFileId) {
    body.file_id = params.serverFileId;
  } else {
    const bn = parseBlobNameFromSasUrl(params.sasUrl);
    if (bn) body.blob_name = bn;
  }
  if (!body.file_id && !body.blob_name) return;
  try {
    await api.post("/files/download-log", body);
  } catch {
    // không làm fail luồng tải file
  }
}

function _parseEncryptionMetadataFromHeaders(
  headers: Record<string, unknown>,
  fallback?: Record<string, unknown>
): EncryptionMetadata {
  const b64Header =
    _headerCi(headers, "x-encryption-metadata-b64") ??
    _headerCi(headers, "x-ms-meta-encryption_metadata_b64");
  const rawHeader = _headerCi(headers, "x-ms-meta-encryption_metadata");

  let metadataJson: string | null = null;
  if (b64Header) {
    metadataJson = atob(b64Header);
  } else if (rawHeader) {
    metadataJson = decodeURIComponent(rawHeader);
  } else if (fallback && Object.keys(fallback).length > 0) {
    return fallback as unknown as EncryptionMetadata;
  }

  if (!metadataJson) {
    throw new Error("Không tìm thấy metadata mã hóa.");
  }
  return JSON.parse(metadataJson) as EncryptionMetadata;
}

/** Metadata + file_id từ SAS URL (không tải blob — dùng cho file lớn). */
export async function resolveCiphertextInfoBySas(sasUrl: string): Promise<{
  file_id: string;
  original_filename: string;
  metadata: Record<string, unknown>;
}> {
  const response = await api.post<{
    file_id: string;
    original_filename: string;
    metadata: Record<string, unknown>;
  }>("/files/ciphertext/info-by-sas", { sas_url: sasUrl });
  return response.data;
}

/** Tải một encrypted chunk (file lớn — peak RAM thấp). */
export async function downloadCiphertextChunk(
  fileId: string,
  chunkIndex: number
): Promise<Uint8Array> {
  const response = await api.get(`/files/${fileId}/ciphertext/chunks/${chunkIndex}`, {
    responseType: "arraybuffer",
  });
  return new Uint8Array(response.data as ArrayBuffer);
}

/** Tải ciphertext từ SAS URL qua backend proxy (tránh CORS Azure). */
export async function downloadCiphertext(
  sasUrl: string,
  fallbackMetadata?: Record<string, unknown>
): Promise<{
  ciphertext: Uint8Array;
  metadata: EncryptionMetadata;
  serverFileId?: string;
}> {
  const response = await api.post(
    "/files/ciphertext/by-sas",
    { sas_url: sasUrl },
    { responseType: "arraybuffer" }
  );
  const headers = response.headers as Record<string, unknown>;
  const metadata =
    fallbackMetadata && Object.keys(fallbackMetadata).length > 0
      ? (fallbackMetadata as unknown as EncryptionMetadata)
      : _parseEncryptionMetadataFromHeaders(headers, fallbackMetadata);
  const ciphertext = new Uint8Array(response.data);
  const serverFileId = _headerCi(headers, "x-file-id");
  return { ciphertext, metadata, serverFileId };
}

/** Tải ciphertext file kho qua backend (tránh CORS Azure). */
export async function downloadVaultCiphertext(
  fileId: string,
  fallbackMetadata?: Record<string, unknown>
): Promise<{
  ciphertext: Uint8Array;
  metadata: EncryptionMetadata;
  serverFileId?: string;
}> {
  const response = await api.get(`/vault/files/${fileId}/ciphertext`, {
    responseType: "arraybuffer",
  });
  const headers = response.headers as Record<string, unknown>;
  const metadata = _parseEncryptionMetadataFromHeaders(headers, fallbackMetadata);
  const ciphertext = new Uint8Array(response.data as ArrayBuffer);
  const serverFileId = _headerCi(headers, "x-file-id") ?? fileId;
  return { ciphertext, metadata, serverFileId };
}

export async function getRecipientKeys(userId: string): Promise<UserKeys> {
  const response = await api.get<UserKeys>(`/keys/${userId}`);
  return response.data;
}

// ── User search & public keys ─────────────────────────────────────────────────

export interface UserSearchResult {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  has_public_key: boolean;
}

export interface PublicKeyResult {
  user_id: string;
  public_key_x25519: string;
  public_key_ed25519: string;
  key_version: number;
}

/** Tìm user theo email (partial match). */
export async function searchUsers(q: string): Promise<UserSearchResult[]> {
  if (q.trim().length < 2) return [];
  const res = await api.get<UserSearchResult[]>("/auth/users/search", { params: { q } });
  return res.data;
}

/** Lấy public key (X25519) của user theo internal UUID từ DB. */
export async function getUserPublicKey(userId: string): Promise<PublicKeyResult> {
  const res = await api.get<PublicKeyResult>(`/auth/users/${userId}/public-key`);
  return res.data;
}

/** Đẩy public key của chính mình lên server (gọi sau khi tạo keypair). */
export async function storeMyPublicKey(params: {
  externalId: string;
  publicKeyX25519: string;
  publicKeyEd25519: string;
  encryptedKeyBlob?: string;
}): Promise<void> {
  await api.post("/keys", {
    user_id: params.externalId,
    public_key_x25519: params.publicKeyX25519,
    public_key_ed25519: params.publicKeyEd25519,
    ...(params.encryptedKeyBlob ? { encrypted_key_blob: params.encryptedKeyBlob } : {}),
  });
}

/** Lấy encrypted blob (zero-knowledge) của user đang đăng nhập từ server. */
export async function fetchMyEncryptedKeyBlob(): Promise<{
  encrypted_key_blob: string | null;
  has_keys: boolean;
  public_key_x25519?: string;
  public_key_ed25519?: string;
  keypair_expires_at?: string | null;
  keypair_days_left?: number | null;
  keypair_expired?: boolean;
  keypair_expiring_soon?: boolean;
  key_version?: number;
}> {
  const res = await api.get<{
    encrypted_key_blob: string | null;
    has_keys: boolean;
    public_key_x25519?: string;
    public_key_ed25519?: string;
    keypair_expires_at?: string | null;
    keypair_days_left?: number | null;
    keypair_expired?: boolean;
    keypair_expiring_soon?: boolean;
    key_version?: number;
  }>("/keys/my-encrypted-blob");
  return res.data;
}

// ── Shared With Me ────────────────────────────────────────────────────────────

export interface SharedFileItem {
  file_id: string;
  blob_name: string;
  original_filename: string;
  content_type: string | null;
  file_size_bytes: number;
  encryption_alg: string;
  granted_at: string;
  wrapped_file_key: string;
  wrapped_key_alg: string;
  key_id: string | null;
  wrapped_key_version: number;
  sender_name: string | null;
  sender_email: string | null;
}

/** Danh sách file được chia sẻ cho user hiện tại. */
export async function getSharedWithMe(): Promise<SharedFileItem[]> {
  const res = await api.get<SharedFileItem[]>("/files/shared-with-me");
  return res.data;
}

/** Lấy SAS URL để tải file được chia sẻ (dành cho recipient). */
export async function getSharedFileSas(fileId: string): Promise<FreshSasResponse> {
  const res = await api.get<FreshSasResponse>(`/files/shared/${fileId}/sas`);
  return res.data;
}

// ── File History ──────────────────────────────────────────────────────────────

export interface RecipientInfo {
  recipient_id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  granted_at: string;
}

export interface FileHistoryItem {
  file_id: string;
  blob_name: string;
  original_filename: string;
  content_type: string | null;
  file_size_bytes: number;
  encryption_alg: string;
  chunk_count: number;
  created_at: string;
  updated_at: string;
  recipients: RecipientInfo[];
  storage_mode?: string;
  folder_id?: string | null;
  shared_count?: number;
}

// ── Vault (personal storage) ──────────────────────────────────────────────────

export interface VaultQuota {
  used_bytes: number;
  quota_bytes: number;
  file_count: number;
}

export interface VaultFolder {
  id: string;
  name: string;
  parent_id: string | null;
  file_count: number;
  created_at: string;
}

export interface VaultFile {
  file_id: string;
  blob_name: string;
  original_filename: string;
  content_type: string | null;
  file_size_bytes: number;
  encryption_alg: string;
  chunk_count: number;
  created_at: string;
  updated_at: string;
  folder_id: string | null;
  shared_count: number;
  can_share: boolean;
  encryption_metadata: Record<string, unknown>;
}

export async function getVaultQuota(): Promise<VaultQuota> {
  const res = await api.get<VaultQuota>("/vault/quota");
  return res.data;
}

export async function getVaultFolders(): Promise<VaultFolder[]> {
  const res = await api.get<VaultFolder[]>("/vault/folders");
  return res.data;
}

export async function createVaultFolder(
  name: string,
  parentId?: string | null
): Promise<VaultFolder> {
  const res = await api.post<VaultFolder>("/vault/folders", {
    name,
    parent_id: parentId ?? null,
  });
  return res.data;
}

export async function deleteVaultFolder(folderId: string): Promise<void> {
  await api.delete(`/vault/folders/${folderId}`);
}

export async function getVaultFiles(params?: {
  folderId?: string | null;
  q?: string;
}): Promise<VaultFile[]> {
  const res = await api.get<VaultFile[]>("/vault/files", {
    params: {
      folder_id: params?.folderId ?? undefined,
      q: params?.q?.trim() || undefined,
    },
  });
  return res.data;
}

export async function patchVaultFile(
  fileId: string,
  body: { folder_id?: string | null; original_filename?: string }
): Promise<VaultFile> {
  const res = await api.patch<VaultFile>(`/vault/files/${fileId}`, body);
  return res.data;
}

export async function deleteVaultFile(fileId: string): Promise<void> {
  await api.delete(`/vault/files/${fileId}`);
}

export async function shareVaultFile(
  fileId: string,
  recipients: RecipientPayload[]
): Promise<{ status: string; recipients_added: number }> {
  const res = await api.post(`/vault/files/${fileId}/share`, { recipients });
  return res.data;
}

export interface FreshSasResponse {
  file_id: string;
  blob_name: string;
  sas_url: string;
  expires_at: string;
}

/** Lấy danh sách file đã upload của user hiện tại */
export async function getMyFiles(): Promise<FileHistoryItem[]> {
  const res = await api.get<FileHistoryItem[]>("/files/my-files");
  return res.data;
}

/** Tạo lại SAS URL mới cho file (khi link cũ hết hạn) */
export async function refreshSasUrl(fileId: string): Promise<FreshSasResponse> {
  const res = await api.get<FreshSasResponse>(`/files/${fileId}/sas`);
  return res.data;
}

/** Revoke quyền truy cập của một recipient */
export async function revokeRecipient(fileId: string, recipientId: string): Promise<void> {
  await api.post(`/files/${fileId}/revoke/${recipientId}`, {});
}

// ── Integrations (VirusTotal + Gemini) ───────────────────────────────────────

export interface IntegrationsStatus {
  virustotal: boolean;
  gemini: boolean;
  gemini_model: string | null;
}

export interface VirusTotalHashResult {
  sha256: string;
  known: boolean;
  reputation: "clean" | "suspicious" | "malicious" | "unknown";
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  total_engines: number;
  message: string;
  permalink: string | null;
}

export async function getIntegrationsStatus(): Promise<IntegrationsStatus> {
  const res = await api.get<IntegrationsStatus>("/integrations/status");
  return res.data;
}

export async function checkHashVirusTotal(sha256: string): Promise<VirusTotalHashResult> {
  const res = await api.post<VirusTotalHashResult>("/integrations/virustotal/hash", {
    sha256,
  });
  return res.data;
}

export async function sendAssistantMessage(
  message: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const res = await api.post<{ reply: string }>("/integrations/assistant/chat", {
    message,
    history,
  });
  return res.data.reply;
}

// ── Security alerts (owner) ───────────────────────────────────────────────────

export interface UserSecurityAlert {
  id: string;
  alert_type: string;
  file_id: string | null;
  file_name: string | null;
  title_vi: string;
  message_vi: string;
  detail_json: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export interface UserSecurityAlertsResponse {
  alerts: UserSecurityAlert[];
  unread_count: number;
}

export async function fetchSecurityAlerts(
  limit = 20,
  unreadOnly = false
): Promise<UserSecurityAlertsResponse> {
  const res = await api.get<UserSecurityAlertsResponse>("/auth/me/security-alerts", {
    params: { limit, unread_only: unreadOnly },
  });
  return res.data;
}

export async function markSecurityAlertsRead(alertIds: string[]): Promise<void> {
  await api.patch("/auth/me/security-alerts/read", { alert_ids: alertIds });
}

export default api;

