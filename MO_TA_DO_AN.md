# Mô tả đồ án: Secure File Sharing System

## 1) Tên đề tài
**Hệ thống lưu trữ và chia sẻ tệp an toàn (Secure File Sharing) trên Azure** với mô hình **client-side encryption**.

## 2) Bối cảnh & vấn đề
Trong các hệ thống chia sẻ file thông thường, dữ liệu thường được lưu trữ dạng plaintext trên server/storage hoặc server nắm giữ khóa giải mã. Điều này làm tăng rủi ro rò rỉ dữ liệu khi:
- Storage bị lộ/đọc trộm
- Server bị xâm nhập
- Sai cấu hình quyền truy cập

Đồ án hướng tới mô hình **Zero-knowledge** ở mức ứng dụng: **server và cloud storage chỉ thấy ciphertext**, không thấy nội dung file.

## 3) Mục tiêu
- **Mã hóa/giải mã 100% trên trình duyệt** (client-side encryption).
- **Chia sẻ file qua link tải có thời hạn (SAS URL)**, giới hạn quyền (read-only).
- Đảm bảo **bí mật + toàn vẹn + xác thực nguồn gửi** ở mức dữ liệu.
- **Phát hiện mã độc và giả mạo nội dung** qua cơ chế checksum SHA-256 hai chiều (người gửi tính trước khi mã hóa, người nhận xác minh sau khi giải mã).
- Tạo nền tảng mở rộng cho **envelope encryption** (nhiều người nhận, thu hồi quyền mà không cần mã hóa lại file).

## 4) Phạm vi (scope)
### Trong phạm vi hiện tại (theo code hiện tại)
- Frontend web:
  - Trang **Keys**: tạo/lưu keypair; upload public key.
  - Trang **Upload**: mã hóa + ký + upload ciphertext; **tính SHA-256 checksum plaintext** trước mã hóa; hiển thị hash để người gửi chia sẻ ngoài băng tần.
  - Trang **Download**: tải ciphertext + verify chữ ký + giải mã + **verify SHA-256 checksum** sau khi giải mã; cảnh báo nếu nội dung bị thay thế.
- Backend API:
  - Upload blob mã hóa lên **Azure Blob Storage**.
  - Sinh **SAS URL** để chia sẻ tải ciphertext trực tiếp từ Blob.
  - **Tính SHA-256 ciphertext server-side**, lưu vào blob metadata làm audit trail.
  - Tích hợp **Azure Key Vault** để đọc/ghi public key (hoàn chỉnh — `GET /keys/{user_id}` và `POST /keys` với `set_secret`).

### Ngoài phạm vi (định hướng phát triển)
- Hardening lưu trữ private key (passphrase wrapping/WebAuthn).
- Streaming download/decrypt theo chunk (không load toàn bộ blob vào RAM).
- Tích hợp VirusTotal API để tra cứu SHA-256 hash tự động sau khi giải mã.
- Key rotation tự động khi người dùng tạo keypair mới.

## 5) Công nghệ sử dụng
- **Frontend**: React + Vite + TypeScript + TailwindCSS, `@noble/curves`
- **Backend**: FastAPI (Python), Uvicorn, Azure SDK
- **Cloud**: Azure Blob Storage, Azure Key Vault, App Service (Managed Identity)
- **Crypto primitives**:
  - **X25519**: trao đổi khóa/derivation secret
  - **HKDF-SHA256**: dẫn xuất khóa
  - **AES-256-GCM**: mã hóa đối xứng (confidentiality + integrity)
  - **Ed25519**: chữ ký số (xác thực + toàn vẹn)
  - **SHA-256** (`crypto.subtle.digest` / `hashlib`): checksum toàn vẹn plaintext — phát hiện giả mạo và mã độc

## 6) Kiến trúc tổng quan
### Thành phần
- **Browser (người gửi)**: mã hóa file + ký dữ liệu + gửi ciphertext lên backend.
- **Backend (FastAPI)**: nhận ciphertext, upload lên Blob, sinh SAS URL, làm trung gian với Key Vault.
- **Azure Blob Storage**: lưu ciphertext + metadata mã hóa (không lưu plaintext).
- **Azure Key Vault**: lưu/truy xuất public key (X25519/Ed25519).

### Trust boundaries (ranh giới tin cậy)
- **Browser zone**: nơi duy nhất plaintext và private key xuất hiện.
- **Backend/API zone**: không giải mã, không thấy plaintext.
- **Storage zone**: chỉ ciphertext.
- **Key service zone**: lưu public key; không lưu plaintext/private key.

## 7) Luồng hoạt động chính
### 7.1) Chuẩn bị khóa (Keys)
1. Người dùng tạo **X25519 + Ed25519 keypair** trên trình duyệt.
2. Private key được giữ ở client (hiện tại lưu `localStorage`).
3. Public key có thể upload lên hệ thống (Key Vault) theo `userId`.

### 7.2) Gửi file (Encrypt + Upload + Share)
1. Người gửi chọn file, nhập **X25519 public key** của người nhận.
2. Trình duyệt tạo ephemeral key, tính shared secret (X25519), dẫn xuất AES key + nonce (HKDF).
3. **SHA-256** tính checksum của plaintext gốc trước khi mã hóa → lưu vào metadata.
4. **AES-256-GCM** mã hóa file → ciphertext.
5. **Ed25519** ký ciphertext (single-shot) hoặc ký manifest kèm per-chunk checksums (chunked) + tạo metadata.
6. Backend nhận ciphertext → tính **SHA-256 ciphertext server-side** → lưu vào blob metadata làm audit trail → upload lên Blob.
7. Backend trả về **SAS URL read-only có thời hạn** và người gửi có thể chia sẻ **SHA-256 hash plaintext** ngoài băng tần.

> **Chunked (file ≥ 64MB):** mỗi chunk được tính SHA-256 plaintext riêng trước khi mã hóa; toàn bộ mảng checksums được ký bởi Ed25519 trong manifest.

### 7.3) Nhận file (Download + Verify + Decrypt)
1. Người nhận dán SAS URL.
2. Trình duyệt tải ciphertext trực tiếp từ Blob; lấy metadata mã hóa.
3. Verify chữ ký Ed25519 trên ciphertext (single-shot) hoặc trên manifest (chunked, bao gồm per-chunk SHA-256).
4. Dẫn xuất lại AES key + nonce (từ X25519 recipient private key + ephemeral pubkey) và giải mã AES-GCM.
5. **Verify SHA-256 của plaintext** vừa giải mã so với giá trị lưu trong metadata — nếu không khớp, trình duyệt cảnh báo ngay: `"SHA-256 không khớp — file có thể bị thay nội dung hoặc nhiễm mã độc!"`.
6. Tải file plaintext về máy người nhận; hiển thị SHA-256 để đối chiếu với hash người gửi cung cấp.

## 8) Thiết kế dữ liệu (Database) cho giai đoạn mở rộng
Repo đã có schema Postgres cho Phase 2 (envelope encryption) tại `backend/db/schema.sql`, gồm:
- `users`, `user_public_keys`: quản lý danh tính và phiên bản public key.
- `files`: metadata của blob mã hóa.
- `file_recipients`: **wrapped_file_key** cho từng người nhận + trạng thái thu hồi.
- `upload_sessions`: theo dõi multipart upload.

Mục tiêu: **thu hồi quyền (revoke) người nhận bằng cách xóa/đánh dấu wrapped key**, không cần mã hóa lại blob.

## 9) Đảm bảo an toàn thông tin (security properties)
- **Confidentiality**: AES-256-GCM, plaintext không rời khỏi browser.
- **Integrity**: tag của AES-GCM + chữ ký Ed25519 + **SHA-256 checksum plaintext** (verify 2 chiều: gửi và nhận).
- **Authenticity**: recipient kiểm tra chữ ký để biết ciphertext do người gửi hợp lệ tạo.
- **Least privilege sharing**: SAS URL ngắn hạn, read-only, HTTPS.
- **Anti-malware / Content substitution detection**:
  - *Client-side (quan trọng nhất)*: SHA-256 của plaintext được tính và lưu trong metadata mã hóa trước khi upload; sau khi giải mã, SHA-256 được tính lại và so sánh — bất kỳ sự thay thế nội dung nào (kể cả thay bằng mã độc) đều bị phát hiện tức thời.
  - *Chunked mode*: SHA-256 từng chunk plaintext được ký cùng Ed25519 manifest — phát hiện từng chunk bị sửa đổi độc lập.
  - *Server-side*: SHA-256 ciphertext được tính khi upload, lưu vào blob metadata phục vụ audit trail và phát hiện lỗi in-transit.

### Mô hình đe dọa được giảm thiểu

| Mối đe dọa | Cơ chế bảo vệ |
|---|---|
| Đọc trộm file trên Azure Blob | AES-256-GCM — server chỉ thấy ciphertext |
| Giả mạo người gửi | Ed25519 signature trên ciphertext/manifest |
| Thay thế nội dung file bằng mã độc | SHA-256 plaintext verify sau giải mã |
| Chunk bị sửa đổi (file lớn) | SHA-256 per-chunk trong Ed25519-signed manifest |
| Lỗi truyền tải (in-transit corruption) | GCM auth tag + SHA-256 ciphertext server-side |
| Link tải bị lộ | SAS URL ngắn hạn, read-only, HTTPS |

## 10) Hướng dẫn cài đặt/chạy local (tóm tắt)
### Backend
```bash
cd backend
venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 11) Hạn chế hiện tại & hướng phát triển

### Đã hoàn thiện
- **JWT + RBAC**: toàn bộ endpoint nhạy cảm (`/upload`, `/upload/multipart/*`, `/keys`, `/files/*`) đều được bảo vệ bởi `require_roles` / `get_current_user`.
- **`POST /keys`**: ghi public key thật lên Azure Key Vault (`set_secret`) đồng thời upsert vào DB — không còn là stub.
- **Revoke quyền truy cập**: endpoint `POST /files/{file_id}/revoke/{recipient_id}` đã hoàn chỉnh — chỉ owner/admin được revoke, không cần mã hóa lại blob.
- **SHA-256 checksum plaintext**: tính và verify 2 chiều, cảnh báo mã độc/giả mạo sau giải mã.

### Còn hạn chế / cần cải thiện
- **Private key lưu `localStorage`** phù hợp demo/POC; production cần passphrase wrapping (PBKDF2/Argon2 + AES-GCM) hoặc WebAuthn/hardware-backed key.
- **Streaming download**: file lớn vẫn load toàn bộ ciphertext vào RAM trước khi giải mã; cần streaming theo chunk để tránh OOM với file nhiều GB.
- **Tích hợp VirusTotal / threat intelligence**: SHA-256 plaintext hiện chỉ hiển thị để đối chiếu thủ công — vì server không bao giờ có plaintext, hash phải do client gửi lên riêng sau khi giải mã để tra cứu tự động (ngoài phạm vi hiện tại).
- **Endpoint audit blob integrity**: backend checksum ciphertext hiện chỉ lưu vào blob metadata; chưa có endpoint để kiểm tra lại tính toàn vẹn của blob sau khi lưu trữ.
- **Key rotation tự động**: khi người dùng tạo keypair mới, các file cũ vẫn mã hóa bằng key cũ; cần cơ chế re-wrap wrapped keys theo phiên bản key mới.

## 12) Tài liệu liên quan trong repo
- `README.md`: tổng quan kiến trúc + hướng dẫn chạy nhanh + roadmap.
- `HUONG_DAN_CHUC_NANG_VA_FLOW_WEB.md`: mô tả chi tiết chức năng và flow theo code hiện tại.
- `backend/db/schema.sql` và `backend/db/README.md`: thiết kế CSDL cho Phase 2 (envelope encryption).

