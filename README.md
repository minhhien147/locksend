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
