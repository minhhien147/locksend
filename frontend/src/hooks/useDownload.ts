import { useState } from "react";
import {
  decryptFile,
  decryptFileChunked,
  loadKeysFromStorage,
  downloadBlob,
  type ChunkedEncryptionMetadata,
  type EncryptionMetadata,
} from "../utils/crypto";
import { downloadCiphertext, recordDownloadLog } from "../utils/api";
import { saveDownloadEntry } from "../utils/downloadHistory";

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
}

export interface UseDownloadReturn extends UseDownloadState {
  downloadAndDecrypt: (sasUrl: string) => Promise<void>;
  reset: () => void;
}

const initialState: UseDownloadState = {
  stage: "idle",
  error: "",
  fileName: "",
  chunkProgress: null,
  isChunkedFile: false,
  verifiedMeta: null,
};

export function useDownload(): UseDownloadReturn {
  const [state, setState] = useState<UseDownloadState>(initialState);

  async function downloadAndDecrypt(sasUrl: string): Promise<void> {
    if (!sasUrl.trim()) {
      setState((prev) => ({
        ...prev,
        error: "Vui lòng nhập SAS Link.",
      }));
      return;
    }

    const myKeys = loadKeysFromStorage();
    if (!myKeys) {
      setState((prev) => ({
        ...prev,
        error:
          "Chưa mở khóa keypair. Vào trang Quản lý Keys, nhập passphrase (hoặc tạo key mới).",
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
    });

    try {
      const { ciphertext, metadata, serverFileId } =
        await downloadCiphertext(sasUrl.trim());

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

      const isChunked = (metadata as ChunkedEncryptionMetadata).isChunked ?? false;
      downloadBlob(plaintext, metadata.fileName, metadata.mimeType);

      saveDownloadEntry({
        sasUrl: sasUrl.trim(),
        fileName: metadata.fileName,
        mimeType: metadata.mimeType,
        fileSizeBytes: plaintext.byteLength,
        checksum: metadata.plaintextChecksum ?? undefined,
        isChunked,
        serverFileId: serverFileId ?? undefined,
      });

      void recordDownloadLog({
        sasUrl: sasUrl.trim(),
        serverFileId,
      });

      setState({
        stage: "done",
        error: "",
        fileName: metadata.fileName,
        chunkProgress: null,
        isChunkedFile: isChunked,
        verifiedMeta: metadata,
      });
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error:
          (e as Error)?.message ??
          "Đã xảy ra lỗi không xác định.",
        stage: "error",
        chunkProgress: null,
      }));
    }
  }

  function reset() {
    setState(initialState);
  }

  return {
    ...state,
    downloadAndDecrypt,
    reset,
  };
}

