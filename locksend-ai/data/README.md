# Dữ liệu CIC-IDS2017

Các file `.csv` **không** được commit (hàng trăm MB mỗi file).

## Cách lấy data

1. Tải [CIC-IDS2017](https://www.unb.ca/cic/datasets/ids-2017.html) và trích các file tương ứng tên trong `train.py`, **hoặc**
2. Copy từ máy đã có (vd. `E:\locksend-ai\data\*.csv`) vào thư mục này:

```powershell
Copy-Item E:\locksend-ai\data\*.csv .\data\
```

Sau đó chạy `python train.py` từ thư mục `locksend-ai/`.
