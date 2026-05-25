# Hướng Dẫn Chức Năng Và Flow Hoạt Động Web

Tài liệu này mô tả chi tiết nhiệm vụ của từng chức năng trong hệ thống `Secure File Sharing` và luồng hoạt động thực tế theo code hiện tại.

## 1) Mục tiêu hệ thống

- Chia sẻ file an toàn theo mô hình **client-side encryption**.
- Trình duyệt thực hiện mã hóa/giải mã, backend và Azure chỉ xử lý ciphertext.
- Sử dụng bộ kỹ thuật:
  - X25519: trao đổi khóa
  - HKDF-SHA256: dẫn xuất khóa
  - AES-256-GCM: mã hóa file
  - Ed25519: ký/xác thực tính toàn vẹn

---

## 2) Cấu trúc thành phần

## Frontend (`frontend/`)
- React + Vite + TypeScript.
- 3 màn hình chính:
  - `Upload`: mã hóa và upload file.
  - `Download`: tải ciphertext và giải mã.
  - `Keys`: tạo/lưu/xóa keypair và upload public key.
- Module `utils/crypto.ts`: toàn bộ logic cryptography.
- Module `utils/api.ts`: giao tiếp backend + Azure SAS URL.

## Backend (`backend/`)
- FastAPI.
- Endpoint chính:
  - `GET /health`
  - `POST /upload`
  - `GET /sas-token/{blob_name}`
  - `GET /keys/{user_id}`
  - `POST /keys`
- Tích hợp Azure:
  - Blob Storage: lưu file mã hóa
  - Key Vault: lấy/lưu public key

## Azure Services
- Blob Storage: chứa ciphertext + metadata mã hóa.
- Key Vault: lưu public key người dùng.
- App Service: chạy backend.

---

## 3) Nhiệm vụ của từng chức năng (Frontend)

## 3.1 Trang `Keys` (Quản lý keypair)

### Nhiệm vụ
- Tạo keypair mới cho người dùng:
  - X25519 keypair (key exchange)
  - Ed25519 keypair (signature)
- Lưu keypair vào `localStorage` của trình duyệt.
- Hiển thị public keys để người dùng copy/chia sẻ.
- Upload public keys lên backend/Key Vault theo `userId`.
- Xóa keypair khỏi trình duyệt khi cần.

### Input/Output chính
- Input:
  - `userId` (để gắn key trên hệ thống backend/Key Vault).
- Output:
  - Trạng thái thao tác (`đã tạo`, `đã lưu`, `lỗi`...).
  - Public keys dạng base64.

### Lưu ý bảo mật
- Private key không gửi lên server trong flow UI hiện tại.
- Private key chỉ tồn tại trong trình duyệt (localStorage).

---

## 3.2 Trang `Upload` (Mã hóa và upload)

### Nhiệm vụ
- Nhận file gốc từ người gửi.
- Nhận `X25519 public key` của người nhận.
- Mã hóa file hoàn toàn tại trình duyệt.
- Ký ciphertext bằng Ed25519 private key của người gửi.
- Upload ciphertext + metadata lên backend.
- Nhận về SAS link để chia sẻ.

### Input/Output chính
- Input:
  - File cần chia sẻ.
  - Public key X25519 của người nhận (base64).
- Output:
  - `sas_url` (link tải file đã mã hóa, có thời hạn).
  - `blob_name`, `expires_at`.

### Trạng thái xử lý trên UI
- `idle` -> `encrypting` -> `uploading` -> `done` hoặc `error`.

---

## 3.3 Trang `Download` (Tải và giải mã)

### Nhiệm vụ
- Nhận SAS link từ người dùng.
- Tải ciphertext + metadata trực tiếp từ Azure Blob qua SAS URL.
- Xác thực chữ ký Ed25519.
- Dẫn xuất khóa đối xứng và giải mã AES-256-GCM tại client.
- Tự động lưu file gốc về máy.

### Input/Output chính
- Input:
  - SAS URL.
  - Keypair người nhận có sẵn trong localStorage.
- Output:
  - File plaintext tải về local machine.
  - Trạng thái thành công/thất bại.

### Trạng thái xử lý trên UI
- `idle` -> `downloading` -> `decrypting` -> `done` hoặc `error`.

---

## 4) Nhiệm vụ của từng chức năng (Backend API)

## 4.1 `GET /health`
- Kiểm tra backend sống.
- Trả về `{ "status": "ok" }`.

## 4.2 `POST /upload`
- Nhận:
  - `file`: ciphertext (`.enc`)
  - `metadata_json`: metadata mã hóa (JSON string)
- Thực hiện:
  - Upload blob vào container Azure.
  - Lưu metadata vào blob metadata: `encryption_metadata`.
  - Sinh SAS URL read-only (mặc định 24h).
- Trả về:
  - `sas_url`, `blob_name`, `expires_at`.

## 4.3 `GET /sas-token/{blob_name}`
- Sinh lại SAS token read-only cho blob có sẵn (1h).
- Dùng khi cần cấp lại link tải.

## 4.4 `GET /keys/{user_id}`
- Lấy public key từ Key Vault:
  - `x25519-{user_id}`
  - `ed25519-{user_id}`
- Trả về object key tương ứng.

## 4.5 `POST /keys`
- Mục tiêu: lưu public key người dùng lên Key Vault.
- **Trạng thái code hiện tại**: endpoint mới trả về `{status: "stored"}` nhưng chưa có thao tác ghi thực tế xuống Key Vault.

---

## 5) Flow hoạt động end-to-end của web

## 5.1 Flow A - Chuẩn bị khóa (lần đầu)

1. Người dùng mở trang `Keys`.
2. Bấm "Tạo Keypair mới".
3. Frontend tạo:
   - X25519 keypair
   - Ed25519 keypair
4. Lưu vào localStorage trình duyệt.
5. (Tùy chọn) nhập `userId` và bấm "Lưu Public Key lên Key Vault".
6. Backend nhận public keys qua `POST /keys`.

Kết quả: người dùng có đủ key để gửi/nhận file.

---

## 5.2 Flow B - Gửi file (Encrypt + Upload + Share)

1. Người gửi vào trang `Upload`.
2. Chọn file gốc.
3. Nhập X25519 public key của người nhận.
4. Frontend gọi `encryptFile(...)`:
   - Tạo ephemeral X25519 keypair mới cho file.
   - Tính shared secret với public key người nhận.
   - HKDF => AES key + nonce.
   - AES-256-GCM mã hóa file.
   - Ed25519 ký ciphertext.
   - Tạo metadata (ephemeral pubkey, nonce, signature, signer pubkey, file info).
5. Frontend gọi `POST /upload` gửi ciphertext + metadata.
6. Backend lưu blob + metadata lên Azure.
7. Backend trả SAS URL read-only (24h).
8. Người gửi copy SAS URL và gửi cho người nhận.

Kết quả: server chỉ giữ ciphertext; link chia sẻ có thời hạn.

---

## 5.3 Flow C - Nhận file (Download + Verify + Decrypt)

1. Người nhận vào trang `Download`.
2. Dán SAS URL.
3. Frontend tải blob trực tiếp từ Azure bằng SAS URL.
4. Lấy metadata từ header `x-ms-meta-encryption_metadata`.
5. Frontend gọi `decryptFile(...)`:
   - Verify Ed25519 signature trên ciphertext.
   - Dùng private key X25519 của người nhận + ephemeral pubkey để tạo shared secret.
   - HKDF => AES key + nonce.
   - Kiểm tra nonce khớp metadata.
   - AES-256-GCM decrypt (kiểm tra tag toàn vẹn).
6. Tạo blob local và tự động download file gốc.

Kết quả: file plaintext chỉ xuất hiện ở trình duyệt người nhận hợp lệ.

---

## 6) Chi tiết metadata mã hóa

Metadata đi kèm ciphertext gồm:
- `ephemeralPublicKey`: public key tạm thời của người gửi (base64)
- `nonce`: nonce AES-GCM (base64)
- `signature`: chữ ký Ed25519 trên ciphertext (base64)
- `signerPublicKey`: public key Ed25519 của người gửi (base64)
- `fileName`, `fileSize`, `mimeType`

Metadata này được lưu ở blob metadata (`encryption_metadata`) và được đọc lại khi download.

---

## 7) Biến môi trường và cấu hình quan trọng

## Backend
- `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_CONTAINER_NAME`
- `AZURE_KEY_VAULT_URL`
- `ALLOWED_ORIGINS` (danh sách domain FE, phân tách bằng dấu phẩy)

## Frontend
- `VITE_API_URL` (URL backend)

---

## 8) Trạng thái hiện tại và việc cần hoàn thiện thêm

- `POST /keys` hiện chưa thực sự ghi key xuống Key Vault (mới là stub logic).
- Chưa có cơ chế xác thực người dùng (authn/authz) cho API.
- Key lưu trong localStorage, phù hợp demo/POC; production nên cân nhắc cơ chế bảo vệ key tốt hơn (hardware-backed storage, passphrase wrapping, hoặc WebAuthn strategy).
- Chưa hỗ trợ cơ chế **thu hồi quyền truy cập (key revocation)** mà không cần tái mã hóa toàn bộ file: nếu thay đổi quyền người nhận, kiến trúc hiện tại phải mã hóa lại file từ đầu.

### Đề xuất hướng phát triển: Envelope Encryption

- Thay vì mã hóa trực tiếp file bằng shared secret theo từng người nhận, hệ thống tạo một `file_key` ngẫu nhiên (DEK) cho mỗi file.
- File được mã hóa một lần duy nhất bằng `file_key` (AES-256-GCM/chunked AES-GCM).
- Với mỗi người nhận được cấp quyền, `file_key` được mã hóa riêng (key wrapping) bằng public key của người đó và lưu ở server dưới dạng nhiều bản “wrapped file_key”.
- Khi cần thu hồi quyền một người dùng:
  - Chỉ cần xóa bản wrapped `file_key` tương ứng của người đó trên server.
  - Không cần tải xuống và tái mã hóa lại toàn bộ ciphertext của file.
- Cách tiếp cận này giúp tối ưu hiệu năng, đặc biệt với file lớn (GB) hoặc nhiều người nhận.

### Bảo vệ private key trong production

- `localStorage` phù hợp cho demo/POC nhưng chưa đủ an toàn cho môi trường thực tế.
- Nên bổ sung một trong các cơ chế:
  - **Passphrase-wrapping**: private key được mã hóa bằng khóa dẫn xuất từ passphrase (PBKDF2/Argon2/scrypt), chỉ giải mã tạm thời khi thao tác.
  - **WebAuthn / hardware-backed key storage**: tận dụng TPM/Secure Enclave/security key để giảm rủi ro lộ private key trên client.

---

## 9) Checklist vận hành nhanh cho team

- Bước 1: Người dùng tạo key ở trang `Keys`.
- Bước 2: Người gửi lấy public key người nhận.
- Bước 3: Người gửi upload file ở trang `Upload`, lấy SAS URL.
- Bước 4: Gửi SAS URL cho người nhận qua kênh an toàn.
- Bước 5: Người nhận dán link vào `Download` và giải mã.
- Bước 6: Nếu cần link mới, dùng endpoint cấp lại SAS.

