# Dữ liệu huấn luyện LockSend AI

CSV **không** commit vào git (quá nặng). `train.py` hỗ trợ nhiều profile — chọn bằng `--dataset`, `--combine`, hoặc biến môi trường.

## Dataset được hỗ trợ (mới → cũ)

| Profile | Năm | Mô tả | Tải về |
|---------|-----|--------|--------|
| **trustlab** | 2026 | API/GraphQL/SOAP, credential attacks, 80 CICFlowMeter features | [DOI 10.82432/10317/21203](https://doi.org/10.82432/10317/21203) |
| **idsiot2024** | 2024 | IoT real-world, 12 attack types (~16M records) | [IEEE DataPort](https://ieee-dataport.org/documents/real-time-dataset-idsiot2024) (DOI 10.21227/gfaz-t124) |
| **ciciot2023** | 2023 | 33 IoT attacks, 47 flow features, 105 devices | [UNB CIC IoT 2023](https://www.unb.ca/cic/datasets/iotdataset-2023.html) / [IEEE](https://ieee-dataport.org/documents/ciciot2023-dataset) |
| **uwf_zeek24** | 2024 | Enterprise MITRE ATT&CK labeled Zeek traffic | [UWF Datasets](https://datasets.uwf.edu/) |
| **gotham2025** | 2025 | Large-scale IoT IDS, 78 virtual devices | [Zenodo](https://zenodo.org/records/14502760) |
| **cic2018** | 2018 | Brute-force Web/SSH, DoS, infiltration | [UNB CIC IDS 2018](https://www.unb.ca/cic/datasets/ids-2018.html) |
| **cic2017** | 2017 | DoS, botnet, DDoS (legacy) | [UNB CIC IDS 2017](https://www.unb.ca/cic/datasets/ids-2017.html) |

---

## 1. TRUST Lab 2026 (khuyến nghị cho LockSend)

1. Tải [TRUST Lab Dataset](https://doi.org/10.82432/10317/21203) → `trustlab_dataset-main.zip`
2. Giải nén vào `locksend-ai/data/` — **giữ nguyên** cấu trúc `Datasets/` và file `.csv.gz`

```text
locksend-ai/data/trustlab_dataset-main/trustlab_dataset-main/Datasets/
├── Benign/Benign.csv.gz.001 … .017
├── API/API.csv.gz.001 …
├── Bruteforce/Bruteforce.csv.gz
└── …
```

```powershell
python train.py --dataset trustlab --trustlab-fast --benign-parts 2
python train.py --dataset trustlab --benign-parts 0 --max-rows 0
```

---

## 2. IDSIoT2024 (mới 2024)

1. Tải từ [IEEE DataPort — IDSIoT2024](https://ieee-dataport.org/documents/real-time-dataset-idsiot2024)
2. Dùng file **`Preprocessed Balanced dataset.csv`** (hoặc `Preprocessed Imbalanced dataset.csv`)
3. Đặt vào `locksend-ai/data/idsiot2024/` (có thể giữ tên gốc)

```text
locksend-ai/data/idsiot2024/
└── Preprocessed Balanced dataset.csv
```

Nhãn benign: `Normal`. Các attack: ARP Poisoning, SQL Injection, SYN Flood, …

```powershell
python train.py --dataset idsiot2024
python train.py --dataset idsiot2024 --max-rows 500000
```

---

## 3. CICIoT2023

1. Tải CSV từ [UNB CIC IoT 2023](https://www.unb.ca/cic/datasets/iotdataset-2023.html) hoặc [IEEE DataPort](https://ieee-dataport.org/documents/ciciot2023-dataset)
2. Giải nén các file `part-*.csv` vào `locksend-ai/data/ciciot2023/`

```text
locksend-ai/data/ciciot2023/
├── part-00000-....csv
├── part-00001-....csv
└── …
```

```powershell
python train.py --dataset ciciot2023 --max-rows 200000
```

---

## 4. UWF-ZeekData24 (MITRE ATT&CK)

1. Truy cập [datasets.uwf.edu](https://datasets.uwf.edu/) → tải **UWF-ZeekData24**
2. Đặt file CSV vào `locksend-ai/data/uwf_zeek24/`

```powershell
python train.py --dataset uwf_zeek24
```

---

## 5. Gotham Dataset 2025

1. Tải [GothamDataset2025.zip](https://zenodo.org/records/14502760) (~24 GB)
2. Giải nén CSV vào `locksend-ai/data/gotham2025/`

```powershell
python train.py --dataset gotham2025 --max-rows 150000
```

---

## 6. Gộp nhiều dataset (độ chính xác cao nhất)

Khi gộp, `train.py` **union tất cả feature columns** — cột thiếu ở dataset khác được điền `0`.

```powershell
# Khuyến nghị: TRUST Lab (API) + IoT benchmarks
python train.py --combine trustlab,idsiot2024,ciciot2023 --max-rows 200000

# Đầy đủ hơn (cần RAM lớn, thời gian lâu)
python train.py --combine trustlab,idsiot2024,ciciot2023,uwf_zeek24,cic2018 --benign-parts 0 --max-rows 0
```

Biến môi trường: `LOCKSEND_TRAIN_COMBINE=trustlab,idsiot2024,ciciot2023`

---

## 7. CIC-IDS2018 / 2017 (legacy)

```text
data/cic2018/02-14-2018.csv …
data/Tuesday-WorkingHours.pcap_ISCX.csv …
```

```powershell
python train.py --dataset cic2018
python train.py --dataset cic2017
```

---

## 8. Tự chọn dataset có sẵn

```powershell
python train.py --dataset auto
```

Thứ tự ưu tiên: `trustlab` → `idsiot2024` → `ciciot2023` → `uwf_zeek24` → `gotham2025` → `cic2018` → `cic2017`.

---

## Tùy chọn CLI

| Biến / flag | Mặc định | Mô tả |
|-------------|----------|--------|
| `--dataset` / `LOCKSEND_TRAIN_DATASET` | `auto` | Một profile |
| `--combine` / `LOCKSEND_TRAIN_COMBINE` | — | Gộp nhiều profile (phẩy) |
| `--max-rows` / `LOCKSEND_TRAIN_MAX_ROWS` | `120000` | Subsample mỗi file/category; `0` = hết |
| `--trustlab-fast` | off | TRUST Lab: 6 category chính |
| `--benign-parts` | `2` | TRUST Lab: số part Benign (`0` = 17 part) |

Sau train: `models/model.pkl`, `models/metrics.json`.
