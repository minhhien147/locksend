import { useState, useEffect } from "react";
import {
  generateX25519KeyPair,
  generateEd25519KeyPair,
  saveKeysToStorage,
  loadKeysFromStorage,
  clearKeysFromStorage,
  toBase64,
} from "../utils/crypto";
import { storeMyPublicKeys } from "../utils/api";

export default function KeyManagement() {
  const [userId, setUserId] = useState("");
  const [keys, setKeys] = useState<ReturnType<typeof loadKeysFromStorage>>(null);
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setKeys(loadKeysFromStorage());
  }, []);

  function handleGenerate() {
    const x25519Keys = generateX25519KeyPair();
    const ed25519Keys = generateEd25519KeyPair();
    saveKeysToStorage(x25519Keys, ed25519Keys);
    setKeys(loadKeysFromStorage());
    setStatus("Đã tạo keypair mới và lưu vào trình duyệt.");
  }

  async function handleUploadToVault() {
    if (!keys || !userId.trim()) {
      setStatus("Vui lòng nhập User ID và tạo keypair trước.");
      return;
    }
    try {
      setStatus("Đang upload public key lên Key Vault...");
      await storeMyPublicKeys(
        userId,
        toBase64(keys.x25519.publicKey),
        toBase64(keys.ed25519.publicKey)
      );
      setStatus("Đã lưu public key lên Azure Key Vault thành công!");
    } catch (e) {
      setStatus(`Lỗi: ${(e as Error).message}`);
    }
  }

  function handleClear() {
    clearKeysFromStorage();
    setKeys(null);
    setStatus("Đã xóa keypair khỏi trình duyệt.");
  }

  function copyToClipboard(value: string, label: string) {
    navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Quản lý Keypair</h1>
      <p className="text-gray-500 text-sm mb-6">
        Keypair được tạo và lưu trong trình duyệt của bạn. Private key không bao giờ rời khỏi máy.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-blue-800 text-sm font-medium">
          Mã hóa: X25519 (Key Exchange) + Ed25519 (Signature)
        </p>
      </div>

      {!keys ? (
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <p className="text-gray-500 mb-4">Bạn chưa có keypair nào.</p>
          <button
            onClick={handleGenerate}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition"
          >
            Tạo Keypair mới
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <KeyCard
            label="X25519 Public Key"
            value={toBase64(keys.x25519.publicKey)}
            onCopy={() => copyToClipboard(toBase64(keys.x25519.publicKey), "x25519")}
            copied={copied === "x25519"}
          />
          <KeyCard
            label="Ed25519 Public Key"
            value={toBase64(keys.ed25519.publicKey)}
            onCopy={() => copyToClipboard(toBase64(keys.ed25519.publicKey), "ed25519")}
            copied={copied === "ed25519"}
          />

          <div className="bg-white rounded-xl shadow p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              User ID (để lưu public key lên Key Vault)
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Nhập email hoặc ID của bạn..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleUploadToVault}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium"
            >
              Lưu Public Key lên Key Vault
            </button>
            <button
              onClick={handleGenerate}
              className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
            >
              Tạo Keypair mới
            </button>
            <button
              onClick={handleClear}
              className="flex-1 bg-red-100 text-red-700 py-2 rounded-lg hover:bg-red-200 transition text-sm font-medium"
            >
              Xóa Keys
            </button>
          </div>
        </div>
      )}

      {status && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
          {status}
        </div>
      )}
    </div>
  );
}

function KeyCard({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <button
          onClick={onCopy}
          className="text-xs text-indigo-600 hover:text-indigo-800 transition"
        >
          {copied ? "Đã copy!" : "Copy"}
        </button>
      </div>
      <p className="text-xs font-mono text-gray-500 break-all bg-gray-50 rounded p-2">
        {value}
      </p>
    </div>
  );
}
