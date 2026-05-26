# Secure File Sharing System

**Tài liệu đầy đủ để tái hiện / clone dự án:** [DOCUMENTATION_VI.md](./DOCUMENTATION_VI.md) (kiến trúc thực tế, API, DB, crypto, env, gap FE/BE).

Hệ thống lưu trữ và chia sẻ file an toàn trên Azure Blob Storage sử dụng mã hóa hybrid:
**X25519 + HKDF + AES-256-GCM + Ed25519**

## Kiến trúc

```
secure-file-sharing/
├── backend/        # FastAPI + Azure SDK
├── frontend/       # React 18 + Vite + TypeScript + TailwindCSS
├── locksend-ai/    # ML token security (Random Forest + optional HTTP service)
├── azure-deploy.md
└── README.md
```

## Công nghệ

| Layer | Stack |
|---|---|
| Frontend | React 18, Vite, TypeScript, TailwindCSS, @noble/curves |
| Backend | FastAPI, Python 3.13, Uvicorn, SQLAlchemy, Alembic |
| Database | PostgreSQL (`encrypted_key_blob`, public keys, auth, file metadata) |
| Azure | Blob Storage, Key Vault *(public keys, tuỳ chọn)*, Managed Identity |
| Mã hóa file | X25519, HKDF-SHA256, AES-256-GCM, Ed25519, SHA-256 (checksum) |
| Mã hóa keypair | PBKDF2-SHA256 (310k iter) + AES-256-GCM (passphrase client) |

## Chạy local

### Backend
```bash
cd backend
# Sao chép .env.example → .env, điền DATABASE_URL
venv\Scripts\activate   # Windows
pip install -r requirements.txt
# Migration DB (cột encrypted_key_blob trên user_public_keys)
$env:DATABASE_URL = "postgresql+asyncpg://user:pass@localhost:5433/secure_file_sharing"
python -m alembic upgrade head
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### LockSend AI (tuỳ chọn — Admin Token Security)

Monorepo: thư mục `locksend-ai/`. Backend mặc định load model local từ đó (hoặc `LOCKSEND_AI_URL` nếu host riêng Ubuntu).

```bash
cd locksend-ai
pip install -r requirements.txt
# Đặt CSV vào data/ (xem locksend-ai/data/README.md), rồi:
python train.py
```

Chi tiết: [locksend-ai/README.md](./locksend-ai/README.md)

## Nguyên tắc bảo mật
- Client-side encryption 100% — mã hóa/giải mã file hoàn toàn ở trình duyệt
- Azure chỉ lưu ciphertext file, không bao giờ thấy plaintext
- **Zero-knowledge keypair**: server không nhận private key plaintext hay passphrase; chỉ lưu `encrypted_key_blob` (đã mã hóa bằng passphrase phía client)
- Private key plaintext chỉ trong **RAM**; không lưu vào localStorage / IndexedDB / cookie
- **sessionStorage** chỉ giữ session wrapper (key bọc AES ephemeral per-tab) — đóng tab là mất; không chứa passphrase
- Managed Identity cho kết nối Azure (khi deploy cloud)
- SAS Token ngắn hạn, chỉ quyền Read, HTTPS only
- **SHA-256 checksum plaintext 2 chiều**: tính trước mã hóa → verify sau giải mã
- Auto-lock vault sau **15 phút** không hoạt động; **logout** xóa RAM + sessionStorage

## Quản lý private key (zero-knowledge)

### Dữ liệu lưu ở đâu

| Vị trí | Nội dung | Ghi chú |
|--------|----------|---------|
| **RAM** (`keyVault`) | Private key plaintext | Mất khi đóng tab / logout / timeout |
| **sessionStorage** | Wrapper AES (không có passphrase) | Chỉ cùng tab; hỗ trợ F5 không nhập lại passphrase |
| **PostgreSQL** | `public_key_*`, `encrypted_key_blob` | Server không giải mã được blob |
| **localStorage** | ❌ Không dùng cho private key | Có thể migrate key cũ một lần rồi xóa |

Module FE: `frontend/src/utils/keyVault.ts`, `crypto.ts` (`encryptKeyBlob` / `decryptKeyBlob`).

API BE:
- `GET /keys/my-encrypted-blob` — lấy blob của user đang đăng nhập
- `POST /keys` — lưu public keys + `encrypted_key_blob` (optional)

Migration: `f1a2b3c4d5e6_add_encrypted_key_blob.py` → cột `user_public_keys.encrypted_key_blob`.

### Luồng chính

1. **Tạo key lần đầu** (`/keys`): sinh X25519 + Ed25519 → passphrase → mã hóa blob → upload server → `setKeys()` (RAM + session wrapper).
2. **Đăng nhập máy/tab mới**: login (JWT + refresh cookie) ≠ unlock key → nhập passphrase → giải blob trên client.
3. **F5 cùng tab**: `restoreFromSession()` từ sessionStorage → không cần passphrase (nếu wrapper còn).
4. **Logout / đóng tab / 15 phút idle**: `clearAll()` — xóa RAM + sessionStorage; blob trên DB vẫn còn.
5. **Khóa phiên** (UI Keys): khóa mềm — xóa RAM, giữ wrapper; F5 có thể vào lại không cần passphrase.
6. **Xóa session…** (UI Keys): bỏ phiên unlock trên trình duyệt; blob server vẫn còn — mở lại bằng passphrase.

Đăng nhập tài khoản và mở khóa key là **hai lớp độc lập** (auth cookie vs crypto vault).

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
                      | PostgreSQL                |
                      | - public keys             |
                      | - encrypted_key_blob (ZK) |
                      +---------------------------+
                      | Azure Key Vault (optional)|
                      | - public keys mirror      |
                      +---------------------------+
```

## Trust boundaries

- **Boundary A — Browser trust zone**: plaintext file và private key chỉ trong RAM; session wrapper trong sessionStorage (per-tab).
- **Boundary B — Backend/API zone**: upload/cấp SAS, lưu blob key đã mã hóa; không biết passphrase, không giải mã file.
- **Boundary C — Storage zone (Azure Blob)**: chỉ ciphertext file + metadata.
- **Boundary D — DB zone (PostgreSQL)**: public keys + `encrypted_key_blob`; không có private key plaintext.

## Luồng dữ liệu file (upload / download)

1. User mở khóa keypair (passphrase hoặc restore session) — `keyVault.getKeys()`.
2. Sender chọn file ở trang **Upload**.
3. Browser tính SHA-256 plaintext → mã hóa X25519 + HKDF + AES-256-GCM → ký Ed25519.
4. Backend lưu ciphertext lên Azure Blob, trả SAS URL.
5. Recipient tải ciphertext qua SAS → verify chữ ký → giải mã trong browser → so sánh SHA-256 plaintext.

Chi tiết API, schema DB, gap FE/BE: [DOCUMENTATION_VI.md](./DOCUMENTATION_VI.md).
