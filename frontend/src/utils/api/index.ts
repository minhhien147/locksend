/**
 * utils/api/index.ts — Re-exports toàn bộ API modules.
 *
 * Import từ "@/utils/api" thay vì "@/utils/api.ts" (legacy).
 */

export { api as default, api, apiErrorDetail, setAccessToken, getAccessToken, parseJwtPayload, BASE_URL } from "./client";

export type { TokenResponse, VerificationStatus, DisplayNameHistoryItem, UserSearchResult, PublicKeyResult, UserKeys, UserSecurityAlert, UserSecurityAlertsResponse } from "./auth";
export { authApi, fetchVerificationStatus, updateProfileEmailApi, changePasswordApi, updateProfileApi, fetchMyDisplayNameHistory, searchUsers, getUserPublicKey, getRecipientKeys, storeMyPublicKey, fetchMyEncryptedKeyBlob, fetchSecurityAlerts, markSecurityAlertsRead } from "./auth";

export type { StorageMode, UploadResponse, MultipartInitResponse, RecipientPayload, FreshSasResponse, RecipientInfo, FileHistoryItem, SharedFileItem } from "./files";
export { parseBlobNameFromSasUrl, uploadEncryptedFile, initMultipartUpload, uploadChunk, finalizeMultipartUpload, recordDownloadLog, resolveCiphertextInfoBySas, downloadCiphertextChunk, downloadCiphertext, downloadVaultCiphertext, getMyFiles, refreshSasUrl, revokeRecipient, getSharedWithMe, getSharedFileSas } from "./files";

export type { VaultQuota, VaultFolder, VaultFile } from "./vault";
export { getVaultQuota, getVaultFolders, createVaultFolder, deleteVaultFolder, getVaultFiles, patchVaultFile, deleteVaultFile, shareVaultFile } from "./vault";

export type { IntegrationsStatus, VirusTotalHashResult } from "./integrations";
export { getIntegrationsStatus, checkHashVirusTotal, sendAssistantMessage } from "./integrations";
