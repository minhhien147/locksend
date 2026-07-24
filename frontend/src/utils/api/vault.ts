/** vault.ts — Vault (personal storage) API: folders, files, quota, share. */

import { api } from "./client";
import type { RecipientPayload } from "./files";

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── API ───────────────────────────────────────────────────────────────────────

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
