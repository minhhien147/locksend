# Dữ liệu huấn luyện LockSend AI

CSV **không** commit vào git (quá nặng). `train.py` hỗ trợ nhiều profile — chọn bằng `--dataset` hoặc `LOCKSEND_TRAIN_DATASET`.

## 1. TRUST Lab 2026 (khuyến nghị)

1. Tải [TRUST Lab Dataset](https://doi.org/10.82432/10317/21203) → `trustlab_dataset-main.zip`
2. Giải nén vào `locksend-ai/data/` — **giữ nguyên** cấu trúc `Datasets/` và file `.csv.gz` (không cần giải nén từng file)

Ví dụ path sau giải nén:

```text
locksend-ai/data/trustlab_dataset-main/trustlab_dataset-main/Datasets/
├── Benign/Benign.csv.gz.001 … .017
├── API/API.csv.gz.001 …
├── Bruteforce/Bruteforce.csv.gz
└── …
```

```powershell
cd locksend-ai
pip install -r requirements.txt

# Train nhanh (~ vài phút): 6 category + 2 part Benign
python train.py --dataset trustlab --trustlab-fast --benign-parts 2

# Train đầy đủ (lâu, cần RAM): tất cả category + 17 part Benign
python train.py --dataset trustlab --benign-parts 0 --max-rows 0
```

## 2. CSE-CIC-IDS2018

Tải từ [UNB CIC IDS 2018](https://www.unb.ca/cic/datasets/ids-2018.html), đặt CSV vào `data/cic2018/`:

```text
data/cic2018/02-14-2018.csv
data/cic2018/02-15-2018.csv
...
```

```powershell
python train.py --dataset cic2018
```

## 3. CIC-IDS2017 (legacy)

Tải [CIC-IDS2017](https://www.unb.ca/cic/datasets/ids-2017.html), đặt trực tiếp trong `data/`:

```powershell
python train.py --dataset cic2017
```

## 4. Tự chọn dataset có sẵn

```powershell
python train.py --dataset auto
```

Thứ tự: `trustlab` → `cic2018` → `cic2017`.

## Tùy chọn

| Biến / flag | Mặc định | Mô tả |
|-------------|----------|--------|
| `--dataset` / `LOCKSEND_TRAIN_DATASET` | `auto` | `trustlab`, `cic2018`, `cic2017`, `auto` |
| `--max-rows` / `LOCKSEND_TRAIN_MAX_ROWS` | `120000` | Subsample mỗi file; `0` = dùng hết |

Sau train: `models/model.pkl`, `models/metrics.json`.
