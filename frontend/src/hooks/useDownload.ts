import { useState } from "react";
import {
  decryptFile,
  decryptFileChunked,
  decryptChunkedToWritable,
  downloadBlob,
  shouldStreamDecrypt,
  type ChunkedEncryptionMetadata,
  type EncryptionMetadata,
} from "../utils/crypto";
import {
  closeSaveFile,
  pickSaveFile,
  supportsStreamingFileSave,
} from "../utils/fileSave";
import { getKeys } from "../utils/keyVault";
import {
  downloadCiphertext,
  downloadCiphertextChunk,
  downloadVaultCiphertext,
  recordDownloadLog,
  resolveCiphertextInfoBySas,
} from "../utils/api";
import { saveDownloadEntry } from "../utils/downloadHistory";
import { useT } from "../i18n/context";

export type DownloadStage =
  | "idle"
  | "downloading"
  | "decrypting"
  | "done"
  | "error";

export interface ChunkDecryptProgress {
  done: number;
  total: number;
}

interface UseDownloadState {
  stage: DownloadStage;
  error: string;
  fileName: string;
  chunkProgress: ChunkDecryptProgress | null;
  isChunkedFile: boolean;
  verifiedMeta: EncryptionMetadata | null;
  plaintextChecksum: string;
}

export interface UseDownloadReturn extends UseDownloadState {
  downloadAndDecrypt: (
    sasUrl: string,
    fallbackMetadata?: Record<string, unknown>
  ) => Promise<void>;
  downloadVaultFile: (
    fileId: string,
    encryptionMetadata: Record<string, unknown>
  ) => Promise<void>;
  reset: () => void;
}

const initialState: UseDownloadState = {
  stage: "idle",
  error: "",
  fileName: "",
  chunkProgress: null,
  isChunkedFile: false,
  verifiedMeta: null,
  plaintextChecksum: "",
};

function mergeMetadata(
  primary: Record<string, unknown>,
  fallback?: Record<string, unknown>
): EncryptionMetadata {
  return { ...(fallback ?? {}), ...primary } as unknown as EncryptionMetadata;
}

export function useDownload(): UseDownloadReturn {
  const t = useT();
  const [state, setState] = useState<UseDownloadState>(initialState);

  async function finishDownload(
    metadata: EncryptionMetadata,
    fileSizeBytes: number,
    logSasUrl: string,
    serverFileId?: string
  ): Promise<void> {
    const isChunked = (metadata as ChunkedEncryptionMetadata).isChunked ?? false;
    saveDownloadEntry({
      sasUrl: logSasUrl,
      fileName: metadata.fileName,
      mimeType: metadata.mimeType,
      fileSizeBytes,
      checksum: metadata.plaintextChecksum ?? undefined,
      isChunked,
      serverFileId,
    });
    void recordDownloadLog({ sasUrl: logSasUrl, serverFileId });
      setState({
        stage: "done",
        error: "",
        fileName: metadata.fileName,
        chunkProgress: null,
        isChunkedFile: isChunked,
        verifiedMeta: metadata,
        plaintextChecksum: metadata.plaintextChecksum ?? "",
      });
  }

  async function runStreamingDecrypt(
    fileId: string,
    metadata: ChunkedEncryptionMetadata,
    logSasUrl: string
  ): Promise<void> {
    const myKeys = getKeys();
    if (!myKeys) {
      setState((prev) => ({
        ...prev,
        error: t("download.keysLocked"),
      }));
      return;
    }

    if (!supportsStreamingFileSave()) {
      setState((prev) => ({
        ...prev,
        error: t("download.largeFileBrowser"),
        stage: "error",
      }));
      return;
    }

    setState({
      stage: "decrypting",
      error: "",
      fileName: metadata.fileName,
      chunkProgress: { done: 0, total: metadata.chunkCount },
      isChunkedFile: true,
      verifiedMeta: null,
      plaintextChecksum: "",
    });

    let writable: FileSystemWritableFileStream | null = null;
    try {
      writable = await pickSaveFile(metadata.fileName);
      const fileSizeBytes = await decryptChunkedToWritable(
        metadata,
        myKeys.x25519.privateKey,
        (chunkIndex) =>
          downloadCiphertextChunk(
            fileId,
            chunkIndex,
            logSasUrl.startsWith("https://") ? logSasUrl : undefined
          ),
        writable,
        (done, total) =>
          setState((prev) => ({
            ...prev,
            chunkProgress: { done, total },
          }))
      );
      await closeSaveFile(writable);
      writable = null;
      await finishDownload(metadata, fileSizeBytes, logSasUrl, fileId);
    } catch (e) {
      if (writable) {
        try {
          await writable.abort();
        } catch {
          /* ignore */
        }
      }
      setState((prev) => ({
        ...prev,
        error: (e as Error)?.message ?? t("common.unknownError"),
        stage: "error",
        chunkProgress: null,
      }));
    }
  }

  async function runDecryptPipeline(
    load: () => Promise<{
      ciphertext: Uint8Array;
      metadata: EncryptionMetadata;
      serverFileId?: string;
    }>,
    logSasUrl: string
  ): Promise<void> {
    const myKeys = getKeys();
    if (!myKeys) {
      setState((prev) => ({
        ...prev,
        error: t("download.keysLocked"),
      }));
      return;
    }

    setState({
      stage: "downloading",
      error: "",
      fileName: "",
      chunkProgress: null,
      isChunkedFile: false,
      verifiedMeta: null,
      plaintextChecksum: "",
    });

    try {
      const { ciphertext, metadata, serverFileId } = await load();

      setState((prev) => ({
        ...prev,
        stage: "decrypting",
      }));

      let plaintext: Uint8Array;

      if ((metadata as ChunkedEncryptionMetadata).isChunked) {
        const chunkedMeta = metadata as ChunkedEncryptionMetadata;
        setState((prev) => ({
          ...prev,
          isChunkedFile: true,
          chunkProgress: { done: 0, total: chunkedMeta.chunkCount },
        }));

        plaintext = await decryptFileChunked(
          ciphertext,
          chunkedMeta,
          myKeys.x25519.privateKey,
          (done, total) =>
            setState((prev) => ({
              ...prev,
              chunkProgress: { done, total },
            }))
        );
      } else {
        plaintext = await decryptFile(
          ciphertext,
          metadata,
          myKeys.x25519.privateKey
        );
      }

      downloadBlob(plaintext, metadata.fileName, metadata.mimeType);
      await finishDownload(
        metadata,
        plaintext.byteLength,
        logSasUrl,
        serverFileId
      );
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: (e as Error)?.message ?? t("common.unknownError"),
        stage: "error",
        chunkProgress: null,
      }));
    }
  }

  async function downloadAndDecrypt(
    sasUrl: string,
    fallbackMetadata?: Record<string, unknown>
  ): Promise<void> {
    if (!sasUrl.trim()) {
      setState((prev) => ({
        ...prev,
        error: t("download.sasRequired"),
      }));
      return;
    }

    const trimmed = sasUrl.trim();
    try {
      const info = await resolveCiphertextInfoBySas(trimmed);
      const metadata = mergeMetadata(info.metadata, fallbackMetadata);
      if (shouldStreamDecrypt(metadata)) {
        await runStreamingDecrypt(
          info.file_id,
          metadata as ChunkedEncryptionMetadata,
          trimmed
        );
        return;
      }
    } catch {
      /* fallback: file nhỏ hoặc endpoint cũ */
    }

    await runDecryptPipeline(
      () => downloadCiphertext(trimmed, fallbackMetadata),
      trimmed
    );
  }

  async function downloadVaultFile(
    fileId: string,
    encryptionMetadata: Record<string, unknown>
  ): Promise<void> {
    const metadata = encryptionMetadata as unknown as EncryptionMetadata;
    if (shouldStreamDecrypt(metadata)) {
      await runStreamingDecrypt(
        fileId,
        metadata as ChunkedEncryptionMetadata,
        `vault://${fileId}`
      );
      return;
    }

    await runDecryptPipeline(
      () => downloadVaultCiphertext(fileId, encryptionMetadata),
      `vault://${fileId}`
    );
  }

  function reset() {
    setState(initialState);
  }

  return {
    ...state,
    downloadAndDecrypt,
    downloadVaultFile,
    reset,
  };
}
