# LockSend AI (monorepo)

Random Forest phát hiện hành vi bất thường (CIC-IDS2017) — dùng cho **Token Security** trong LockSend.

Nằm trong repo: `secure-file-sharing/locksend-ai/`

## Cấu trúc

```
locksend-ai/
├── predict.py      # inference + SHAP
├── train.py        # huấn luyện
├── server.py       # HTTP service (host riêng Ubuntu)
├── requirements.txt
├── data/           # CSV CIC-IDS2017 (gitignore — xem data/README.md)
├── models/
│   ├── model.pkl   # gitignore — tạo bằng train.py
│   └── metrics.json
└── deploy/
    └── locksend-ai.service
```

## Dataset

| File | Vai trò |
|------|---------|
| `Tuesday-WorkingHours.pcap_ISCX.csv` | BENIGN + brute-force |
| `Wednesday-workingHours.pcap_ISCX.csv` | BENIGN + DoS |
| `Friday-WorkingHours-Morning.pcap_ISCX.csv` | BENIGN + Botnet |
| `Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv` | BENIGN + DDoS |

Đặt CSV vào `data/` (không commit — quá nặng). Xem [data/README.md](./data/README.md).

## Train & chạy local

```powershell
cd locksend-ai
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# TRUST Lab 2026 (khuyến nghị) — CSV trong data/trustlab/
python train.py --dataset trustlab

# Hoặc tự chọn: auto | cic2018 | cic2017
python train.py --dataset auto
python predict.py
```

Dataset: [data/README.md](./data/README.md)

## HTTP service (VPS / local)

```bash
cd /opt/secure-file-sharing/locksend-ai
source venv/bin/activate
export LOCKSEND_AI_API_KEY="your-secret"
uvicorn server:app --host 0.0.0.0 --port 8100
```

Backend LockSend (`.env`):

```env
LOCKSEND_AI_URL=http://<host-ai>:8100
LOCKSEND_AI_API_KEY=your-secret
```

## Railway (service riêng)

Root Directory: `/` — repo [minhhien147/locksend-ai](https://github.com/minhhien147/locksend-ai).

**Biến bắt buộc trên Railway (service locksend-ai):**

```env
LOCKSEND_AI_API_KEY=<shared-secret>
LOCKSEND_AI_MODEL_URL=https://<storage>/model.pkl?<sas-read-only>
```

`model.pkl` **không** có trong git (~95MB). Upload lên Blob/R2/S3 → SAS URL.

Tuỳ chọn Volume thay URL:

```env
LOCKSEND_AI_MODELS_DIR=/data
# copy model.pkl vào volume /data/
```

Healthcheck Railway: `GET /health/live` (liveness). Backend kiểm tra `GET /health` → `ready: true` sau khi model load.

Backend cùng project (private networking):

```env
LOCKSEND_AI_URL=http://${{locksend-ai.RAILWAY_PRIVATE_DOMAIN}}:${{locksend-ai.PORT}}
LOCKSEND_AI_API_KEY=<cùng-secret>
```

## Tích hợp backend

- **Local:** backend tự dùng `<repo>/locksend-ai` qua `backend/services/locksend_ai.py`
- **Remote:** chỉ cần `LOCKSEND_AI_URL` — không cài ML libs trên backend

## Risk → quyết định

| Score | Level | Decision |
|-------|-------|----------|
| 0.0–0.2 | NORMAL | ALLOW |
| 0.2–0.5 | LOW | ALLOW |
| 0.5–0.8 | HIGH | MONITOR |
| ≥ 0.8 | CRITICAL | REVOKE |
