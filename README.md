# Secure File Sharing System

**Tài liệu đầy đủ để tái hiện / clone dự án:** [DOCUMENTATION_VI.md](./DOCUMENTATION_VI.md) (kiến trúc thực tế, API, DB, crypto, env, gap FE/BE).

Hệ thống lưu trữ và chia sẻ file an toàn trên Azure Blob Storage sử dụng mã hóa hybrid:
**X25519 + HKDF + AES-256-GCM + Ed25519**

## Kiến trúc

```
secure-file-sharing/
├── backend/        # FastAPI + Azure SDK
├── frontend/       # React 18 + Vite + TypeScript + TailwindCSS
├── azure-deploy.md
└── README.md
```

## Công nghệ

| Layer | Stack |
|---|---|
| Frontend | React 18, Vite, TypeScript, TailwindCSS, @noble/curves |
| Backend | FastAPI, Python 3.13, Uvicorn |
| Azure | Blob Storage, Key Vault, App Service, Managed Identity |
| Mã hóa | X25519, HKDF-SHA256, AES-256-GCM, Ed25519, SHA-256 (checksum) |

## Chạy local

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

## Nguyên tắc bảo mật
- Client-side encryption 100% — mã hóa/giải mã hoàn toàn ở trình duyệt
- Azure chỉ lưu ciphertext, không bao giờ thấy plaintext
- Managed Identity cho tất cả kết nối Azure
- SAS Token ngắn hạn, chỉ quyền Read, HTTPS only
- **SHA-256 checksum plaintext 2 chiều**: tính trước mã hóa (người gửi) → verify sau giải mã (người nhận) — phát hiện tức thời nếu nội dung bị thay thế hoặc nhiễm mã độc

## Sơ đồ kiến trúc tổng quan

```text
                 +------------------------------+
                 |   Recipient Browser (React)  |
                 | - Paste SAS URL              |
                 | - Verify Ed25519 signature   |
                 | - Decrypt AES-GCM (client)   |
                 +---------------^--------------+
                                 |
                                 | HTTPS (SAS URL, read-only, time-limited)
                                 |
+----------------+      +--------+---------+      +---------------------------+
| Sender Browser | ---> |   FastAPI API    | ---> | Azure Blob Storage        |
| (React)        |      |   (backend)      |      | - ciphertext only         |
| - Encrypt file |      | - Upload endpoint|      | - metadata encryption     |
| - Sign payload |      | - SAS generator  |      | - no plaintext            |
+----------------+      +--------+---------+      +---------------------------+
                                 |
                                 | Managed Identity
                                 v
                      +---------------------------+
                      | Azure Key Vault           |
                      | - public keys (X25519/Ed)|
                      +---------------------------+
```

## Trust boundaries

- **Boundary A — Browser trust zone**: plaintext và private key chỉ tồn tại tại client.
- **Boundary B — Backend/API zone**: xử lý upload/cấp SAS, không giải mã file.
- **Boundary C — Storage zone (Azure Blob)**: chỉ lưu ciphertext + metadata.
- **Boundary D — Key service zone (Key Vault)**: lưu/truy xuất public key, không chứa plaintext.

## Luồng dữ liệu bảo mật

1. Sender chọn file ở `Upload` page.
2. Browser tính **SHA-256 của plaintext** (checksum trước mã hóa).
3. Browser thực hiện X25519 + HKDF → AES-256-GCM để mã hóa file; SHA-256 hash được lưu trong metadata.
4. Browser ký dữ liệu bằng Ed25519 (file nhỏ: ký ciphertext; file lớn: ký manifest kèm per-chunk SHA-256).
5. Backend nhận ciphertext → tính **SHA-256 ciphertext** server-side (audit trail) → lưu lên Azure Blob.
6. Backend trả SAS URL read-only có thời hạn.
7. Recipient dùng SAS URL để tải ciphertext trực tiếp từ Blob.
8. Recipient verify chữ ký Ed25519, giải mã AES-GCM hoàn toàn trong browser.
9. Browser tính lại **SHA-256 của plaintext vừa giải mã** → so sánh với giá trị trong metadata → **cảnh báo nếu không khớp** (phát hiện mã độc / nội dung bị thay thế).

## Lưu ý hiện tại

- Đây là kiến trúc **client-side encryption POC/production-ready foundation**.
- Muốn đạt production đầy đủ cần bổ sung: authn/authz, key revocation theo Envelope Encryption, và hardening private key storage (passphrase wrapping/WebAuthn).

## Task board triển khai production

### Phase 1 - Security baseline (ưu tiên cao)

- [ ] **BE-SEC-01**: Thêm JWT auth middleware cho FastAPI.
- [ ] **BE-SEC-02**: Bảo vệ endpoint `/upload`, `/upload/multipart/*`, `/sas-token/*`, `/keys/*` bằng token.
- [ ] **BE-SEC-03**: Áp RBAC cơ bản (`owner`, `recipient`, `admin`).
- [ ] **BE-KEY-01**: Hoàn thiện `POST /keys` ghi public key thật lên Key Vault (không còn stub).
- [ ] **BE-KEY-02**: Validate key input (base64, đúng độ dài, reject malformed).
- [ ] **BE-OBS-01**: Structured logging + request ID + error mapping chuẩn.
- [ ] **OPS-SEC-01**: Rà soát CORS allowlist, tắt wildcard trong production.

**Definition of Done (Phase 1):**
- Tất cả endpoint nhạy cảm trả `401/403` khi không hợp lệ.
- `POST /keys` lưu thành công và đọc lại được qua `GET /keys/{user_id}`.
- Log có request ID, không lộ thông tin nhạy cảm.

### Phase 2 - Envelope Encryption + revoke access

- [ ] **ARCH-ENV-01**: Chuyển mô hình mã hóa file sang `file_key` (DEK) ngẫu nhiên cho mỗi file.
- [ ] **ARCH-ENV-02**: Mỗi recipient có 1 bản `wrapped_file_key` riêng.
- [ ] **DB-01**: Tạo schema metadata:
  - `files` (owner_id, blob_name, alg, chunk_size, chunk_count, created_at)
  - `file_recipients` (file_id, recipient_id, wrapped_file_key, status, revoked_at)
- [ ] **BE-ENV-01**: API tạo file metadata + lưu wrapped keys theo danh sách recipient.
- [ ] **BE-ENV-02**: API revoke recipient (xóa/disable wrapped key) **không re-encrypt file**.
- [ ] **FE-ENV-01**: Upload UI hỗ trợ nhiều recipient.
- [ ] **FE-ENV-02**: Download flow lấy wrapped key của user hiện tại trước khi decrypt.

**Definition of Done (Phase 2):**
- Revoke 1 user không ảnh hưởng user còn lại.
- Không cần upload lại hoặc mã hóa lại ciphertext khi revoke.

### Phase 3 - Large-file reliability + client key hardening

- [ ] **FE-STR-01**: Streaming download/decrypt theo chunk (không load toàn blob vào RAM).
- [ ] **FE-STR-02**: Resume/retry chunk khi mất mạng.
- [ ] **FE-KEY-01**: Passphrase wrapping cho private key (PBKDF2/Argon2 + AES-GCM).
- [ ] **FE-KEY-02**: Auto-lock key trong memory sau timeout.
- [ ] **FE-KEY-03**: Nghiên cứu/POC WebAuthn hardware-backed key.
- [ ] **BE-RATE-01**: Rate limit + quota per user cho upload/download.
- [ ] **OPS-MON-01**: Metrics + alert (error rate, upload fail, latency, memory).

**Definition of Done (Phase 3):**
- File lớn (5GB-10GB) chạy ổn định với chunked pipeline.
- Private key không còn lưu raw trong `localStorage`.

## Chi tiết ticket kỹ thuật đề xuất

### Backend

- [ ] Thêm module `auth.py` (verify JWT, role extraction).
- [ ] Thêm dependency injection `get_current_user()` cho các route.
- [ ] Tách `main.py` thành router: `upload_router`, `keys_router`, `files_router`.
- [ ] Chuẩn hóa response model và error code (`400/401/403/404/409/500`).
- [ ] Thêm bảng mapping file-owner-recipient (nếu dùng DB: Postgres/Cosmos).

### Frontend

- [ ] Tạo `AuthContext` quản lý token/session.
- [ ] Guard route theo trạng thái đăng nhập.
- [ ] Tách crypto storage thành abstraction: `LocalStorageKeyStore` / `WrappedKeyStore`.
- [ ] Upload page: chọn nhiều recipient + hiển thị trạng thái wrapped-key.
- [ ] Download page: fallback message rõ khi user bị revoke.

### DevOps

- [ ] Tách config `dev/staging/prod` cho CORS, API URL, logging level.
- [ ] Secret management bằng Azure Key Vault references/App Service settings.
- [ ] CI pipeline: `lint -> type-check -> unit test -> build`.
- [ ] CD có smoke test sau deploy.

### Test

- [ ] Unit test crypto helper (nonce uniqueness, manifest sign/verify).
- [ ] Integration test multipart upload (`init/chunk/finalize`) + lỗi mạng.
- [ ] Integration test envelope revoke flow.
- [ ] E2E test: upload -> share -> download -> revoke -> download fail.

## Mốc bàn giao đề xuất

- **Milestone A (7 ngày):** Auth + `POST /keys` hoàn chỉnh + bảo vệ endpoint.
- **Milestone B (14-21 ngày):** Envelope Encryption + revoke flow.
- **Milestone C (7-10 ngày):** Streaming download + key wrapping + monitoring.
