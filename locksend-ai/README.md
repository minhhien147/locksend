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
python train.py
python predict.py
```

## HTTP service (Ubuntu)

```bash
cd /opt/secure-file-sharing/locksend-ai
source venv/bin/activate
export LOCKSEND_AI_API_KEY="your-secret"
uvicorn server:app --host 0.0.0.0 --port 8100
```

Backend LockSend (`.env`):

```env
LOCKSEND_AI_URL=http://<ubuntu-ip>:8100
LOCKSEND_AI_API_KEY=your-secret
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
