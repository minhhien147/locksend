import { useState } from "react";
import {
  encryptFile,
  loadKeysFromStorage,
  fromBase64,
  toBase64,
  prepareChunkedEncryption,
  encryptChunk,
  buildChunkedManifest,
  signManifest,
  computeSHA256Hex,
  CHUNKED_THRESHOLD,
  DEFAULT_CHUNK_SIZE,
  type ChunkedEncryptionMetadata,
} from "../utils/crypto";
import {
  uploadEncryptedFile,
  initMultipartUpload,
  uploadChunk,
  finalizeMultipartUpload,
} from "../utils/api";

export type UploadStage = "idle" | "encrypting" | "uploading" | "done" | "error";

export interface ChunkProgress {
  phase: "encrypt" | "upload";
  done: number;
  total: number;
  currentMB: number;
}

export interface UseUploadState {
  stage: UploadStage;
  sasUrl: string;
  error: string;
  chunkProgress: ChunkProgress | null;
  uploadPercent: number;
  plaintextChecksum: string;
}

export interface UseUploadReturn extends UseUploadState {
  isChunkedMode: boolean;
  chunkCount: number;
  encryptAndUpload: (file: File | null, recipientPublicKey: string) => Promise<void>;
  reset: () => void;
}

const initialState: UseUploadState = {
  stage: "idle",
  sasUrl: "",
  error: "",
  chunkProgress: null,
  uploadPercent: 0,
  plaintextChecksum: "",
};

export function useUpload(): UseUploadReturn {
  const [state, setState] = useState<UseUploadState>(initialState);
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  const isChunkedMode =
    currentFile !== null && currentFile.size >= CHUNKED_THRESHOLD;
  const chunkCount = currentFile
    ? Math.ceil(currentFile.size / DEFAULT_CHUNK_SIZE)
    : 0;

  async function encryptAndUpload(
    file: File | null,
    recipientPublicKey: string
  ): Promise<void> {
    if (!file) {
      setState((prev) => ({ ...prev, error: "Vui lòng chọn file." }));
      return;
    }
    if (!recipientPublicKey.trim()) {
      setState((prev) => ({
        ...prev,
        error: "Vui lòng nhập X25519 Public Key của người nhận.",
      }));
      return;
    }

    const myKeys = loadKeysFromStorage();
    if (!myKeys) {
      setState((prev) => ({
        ...prev,
        error: "Bạn chưa tạo keypair. Vào trang Quản lý Keys trước.",
      }));
      return;
    }

    setCurrentFile(file);
    setState({
      stage: "encrypting",
      sasUrl: "",
      error: "",
      chunkProgress: null,
      uploadPercent: 0,
      plaintextChecksum: "",
    });

    try {
      const recipientX25519PubKey = fromBase64(recipientPublicKey.trim());

      if (file.size < CHUNKED_THRESHOLD) {
        const { ciphertext, metadata } = await encryptFile(
          file,
          recipientX25519PubKey,
          myKeys.ed25519.privateKey,
          myKeys.ed25519.publicKey
        );

        const checksum = metadata.plaintextChecksum ?? "";

        setState((prev) => ({
          ...prev,
          stage: "uploading",
          plaintextChecksum: checksum,
        }));

        const result = await uploadEncryptedFile(
          ciphertext,
          metadata,
          file.name,
          (pct) =>
            setState((prev) => ({
              ...prev,
              uploadPercent: pct,
            }))
        );

        setState((prev) => ({
          ...prev,
          sasUrl: result.sas_url,
          stage: "done",
        }));
      } else {
        const { aesKey, ephemeralPublicKey, baseNonce } =
          await prepareChunkedEncryption(recipientX25519PubKey);

        const totalChunks = Math.ceil(file.size / DEFAULT_CHUNK_SIZE);
        setState((prev) => ({ ...prev, stage: "uploading" }));

        const { blob_name } = await initMultipartUpload(file.name);

        const chunkChecksums: string[] = [];

        for (let i = 0; i < totalChunks; i++) {
          const start = i * DEFAULT_CHUNK_SIZE;
          const end = Math.min(start + DEFAULT_CHUNK_SIZE, file.size);
          const chunkSizeMB = parseFloat(
            ((end - start) / (1024 * 1024)).toFixed(1)
          );

          setState((prev) => ({
            ...prev,
            chunkProgress: {
              phase: "encrypt",
              done: i,
              total: totalChunks,
              currentMB: chunkSizeMB,
            },
          }));

          const chunkBuffer = await file.slice(start, end).arrayBuffer();
          const chunkChecksum = await computeSHA256Hex(chunkBuffer);
          chunkChecksums.push(chunkChecksum);

          const encryptedChunk = await encryptChunk(
            aesKey,
            chunkBuffer,
            baseNonce,
            i
          );

          setState((prev) => ({
            ...prev,
            chunkProgress: {
              phase: "upload",
              done: i,
              total: totalChunks,
              currentMB: chunkSizeMB,
            },
          }));
          await uploadChunk(blob_name, i, encryptedChunk);
        }

        setState((prev) => ({
          ...prev,
          chunkProgress: {
            phase: "upload",
            done: totalChunks,
            total: totalChunks,
            currentMB: 0,
          },
        }));

        const partialMeta = {
          isChunked: true as const,
          chunkSize: DEFAULT_CHUNK_SIZE,
          chunkCount: totalChunks,
          baseNonce: toBase64(baseNonce),
          ephemeralPublicKey: toBase64(ephemeralPublicKey),
          nonce: toBase64(baseNonce),
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          chunkChecksums,
        };

        const manifest = buildChunkedManifest(partialMeta);
        const sig = signManifest(manifest, myKeys.ed25519.privateKey);

        const metadata: ChunkedEncryptionMetadata = {
          ...partialMeta,
          signature: toBase64(sig),
          signerPublicKey: toBase64(myKeys.ed25519.publicKey),
        };

        setState((prev) => ({
          ...prev,
          plaintextChecksum: `${totalChunks} chunk checksums — xem manifest`,
        }));

        const result = await finalizeMultipartUpload(
          blob_name,
          totalChunks,
          metadata
        );

        setState((prev) => ({
          ...prev,
          sasUrl: result.sas_url,
          chunkProgress: null,
          stage: "done",
        }));
      }
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
    setCurrentFile(null);
    setState(initialState);
  }

  return {
    ...state,
    isChunkedMode,
    chunkCount,
    encryptAndUpload,
    reset,
  };
}

