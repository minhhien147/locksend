"""
LockSend AI – Huấn luyện Random Forest (CICFlowMeter features).

Dataset profiles (LOCKSEND_TRAIN_DATASET hoặc --dataset):
  - trustlab  — TRUST Lab 2026 (khuyến nghị): REST/GraphQL/API + credential attacks
  - cic2018   — CSE-CIC-IDS2018: brute-force Web/SSH, DoS, infiltration
  - cic2017   — CIC-IDS2017 (legacy mặc định cũ)
  - auto      — ưu tiên trustlab → cic2018 → cic2017 nếu có file trong data/

Nhãn nhị phân: benign → 0 (ALLOW), attack → 1 → risk score P(ATTACK)
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import os
import pickle
import re
import sys
import warnings
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

warnings.filterwarnings("ignore")

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"
MODEL_PATH = MODELS_DIR / "model.pkl"
METRICS_PATH = MODELS_DIR / "metrics.json"

RISK_THRESHOLDS = {
    "NORMAL": (0.0, 0.2),
    "LOW": (0.2, 0.5),
    "HIGH": (0.5, 0.8),
    "CRITICAL": (0.8, 1.0),
}

DECISION_MAP = {
    "NORMAL": "ALLOW",
    "LOW": "ALLOW",
    "HIGH": "MONITOR",
    "CRITICAL": "REVOKE",
}

LOCKSEND_FEATURE_MAP = {
    "request_rate": ["Flow Packets/s", "Flow Bytes/s", "Fwd Packets/s", "Bwd Packets/s"],
    "long_activity": ["Flow Duration", "Active Max", "Idle Max"],
    "concurrent_load": ["Total Fwd Packets", "Total Backward Packets", "Subflow Fwd Packets"],
    "unusual_endpoint": ["Destination Port"],
}


@dataclass(frozen=True)
class DatasetProfile:
    name: str
    subdir: str
    files: tuple[str, ...] | None
    label_cols: tuple[str, ...] = ("Label", " Label", "label")
    benign_labels: frozenset[str] = frozenset({"BENIGN", "Benign", "benign"})
    version: str = "locksend-ai-1.0"
    description: str = ""
    # None = glob mọi *.csv trong subdir (TRUST Lab)
    glob_csv: bool = False


PROFILES: dict[str, DatasetProfile] = {
    "cic2017": DatasetProfile(
        name="cic2017",
        subdir=".",
        files=(
            "Tuesday-WorkingHours.pcap_ISCX.csv",
            "Wednesday-workingHours.pcap_ISCX.csv",
            "Friday-WorkingHours-Morning.pcap_ISCX.csv",
            "Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv",
        ),
        label_cols=(" Label", "Label"),
        benign_labels=frozenset({"BENIGN"}),
        version="locksend-ai-cic2017",
        description="CIC-IDS2017 — brute-force FTP/SSH, DoS, botnet, DDoS",
    ),
    "cic2018": DatasetProfile(
        name="cic2018",
        subdir="cic2018",
        files=(
            "02-14-2018.csv",
            "02-15-2018.csv",
            "02-16-2018.csv",
            "02-20-2018.csv",
            "02-22-2018.csv",
            "02-23-2018.csv",
            "03-01-2018.csv",
            "03-02-2018.csv",
        ),
        label_cols=(" Label", "Label"),
        benign_labels=frozenset({"BENIGN", "Benign"}),
        version="locksend-ai-cic2018",
        description="CSE-CIC-IDS2018 — SSH/FTP brute-force, Web attacks, DoS/DDoS, botnet",
    ),
    "trustlab": DatasetProfile(
        name="trustlab",
        subdir=".",
        files=None,
        glob_csv=True,
        label_cols=("Label", " Label", "label"),
        benign_labels=frozenset({"Benign", "BENIGN", "benign"}),
        version="locksend-ai-trustlab-2026",
        description="TRUST Lab 2026 — API/GraphQL/SOAP, credential attacks, 80 CICFlowMeter features",
    ),
}

# Thứ tự category TRUST Lab (tên thư mục trong Datasets/)
TRUSTLAB_CATEGORY_ORDER: tuple[str, ...] = (
    "Benign",
    "Bruteforce",
    "API",
    "WebBased",
    "DoS",
    "DDoS",
    "PortScan",
    "Slowloris",
    "DNS",
    "Exfiltration",
    "C2Beaconing",
    "Exploitation",
    "Evasion",
    "MITM",
    "BufferOverflow",
    "TLSSSL",
)

# Train nhanh: bỏ qua Benign 17 phần (dùng --benign-parts)
TRUSTLAB_FAST_CATEGORIES: frozenset[str] = frozenset(
    {"Benign", "Bruteforce", "API", "WebBased", "DoS", "DDoS"}
)

TRUSTLAB_GZ_RE = re.compile(r".*\.csv\.gz(?:\.\d{3})?$", re.IGNORECASE)

# TRUST Lab khuyến nghị bỏ cột định danh (README dataset)
DROP_FEATURE_COLUMNS: frozenset[str] = frozenset(
    {
        "flow id",
        "src ip",
        "dst ip",
        "timestamp",
    }
)


def strip_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out.columns = out.columns.str.strip()
    return out


def _data_root(profile: DatasetProfile) -> Path:
    root = DATA_DIR / profile.subdir if profile.subdir != "." else DATA_DIR
    return root.resolve()


def find_trustlab_root() -> Path | None:
    """Tìm thư mục Datasets/ TRUST Lab (zip giải nén trong data/)."""
    candidates = [
        DATA_DIR / "trustlab_dataset-main" / "trustlab_dataset-main" / "Datasets",
        DATA_DIR / "trustlab_dataset-main" / "Datasets",
        DATA_DIR / "trustlab" / "Datasets",
        DATA_DIR / "trustlab",
    ]
    for c in candidates:
        if c.is_dir() and any(c.rglob("*.csv.gz*")):
            return c.resolve()
    for p in DATA_DIR.rglob("Datasets"):
        if p.is_dir() and any(p.rglob("*.csv.gz*")):
            return p.resolve()
    return None


def _is_trustlab_gz(path: Path) -> bool:
    return bool(TRUSTLAB_GZ_RE.match(path.name))


def discover_trustlab_groups(root: Path) -> dict[str, list[Path]]:
    groups: dict[str, list[Path]] = {}
    for p in root.rglob("*"):
        if not p.is_file() or not _is_trustlab_gz(p):
            continue
        if p.parent == root:
            key = p.name.split(".csv.gz")[0]
        else:
            key = p.parent.name
        groups.setdefault(key, []).append(p)
    for key in groups:
        groups[key] = sorted(groups[key], key=lambda x: x.name)
    return groups


def _is_split_gz(parts: list[Path]) -> bool:
    return len(parts) > 1 or any(".csv.gz." in p.name for p in parts)


def read_trustlab_gz(parts: list[Path], *, nrows: int | None = None) -> pd.DataFrame:
    """Đọc .csv.gz hoặc file split (ghép các part; partial split cần nrows)."""
    if not _is_split_gz(parts) and parts[0].name.endswith(".csv.gz"):
        return pd.read_csv(parts[0], compression="gzip", low_memory=False, nrows=nrows)

    buf = io.BytesIO()
    for p in parts:
        buf.write(p.read_bytes())
    buf.seek(0)
    with gzip.GzipFile(fileobj=buf) as gz:
        return pd.read_csv(gz, low_memory=False, nrows=nrows)


def _order_trustlab_groups(
    groups: dict[str, list[Path]],
    *,
    fast: bool,
    benign_parts: int | None,
) -> list[tuple[str, list[Path]]]:
    ordered: list[tuple[str, list[Path]]] = []
    seen: set[str] = set()

    for cat in TRUSTLAB_CATEGORY_ORDER:
        if cat not in groups:
            continue
        if fast and cat not in TRUSTLAB_FAST_CATEGORIES:
            continue
        parts = groups[cat]
        if cat == "Benign" and benign_parts is not None and benign_parts > 0:
            parts = parts[:benign_parts]
        ordered.append((cat, parts))
        seen.add(cat)

    for cat in sorted(groups.keys()):
        if cat in seen:
            continue
        if fast and cat not in TRUSTLAB_FAST_CATEGORIES:
            continue
        parts = groups[cat]
        if cat == "Benign" and benign_parts is not None and benign_parts > 0:
            parts = parts[:benign_parts]
        ordered.append((cat, parts))

    return ordered


def _discover_csv_files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    return sorted(root.rglob("*.csv"))


def _resolve_trustlab_sources(
    *,
    fast: bool,
    benign_parts: int | None,
) -> list[tuple[str, list[Path]]]:
    root = find_trustlab_root()
    if root is None:
        raise FileNotFoundError(
            "Không tìm thấy TRUST Lab (.csv.gz) trong locksend-ai/data/.\n"
            "Giải nén trustlab_dataset-main.zip vào data/ — giữ nguyên thư mục Datasets/.\n"
            "Tải: https://doi.org/10.82432/10317/21203"
        )
    groups = discover_trustlab_groups(root)
    sources = _order_trustlab_groups(groups, fast=fast, benign_parts=benign_parts)
    if not sources:
        raise FileNotFoundError(f"Không có category .csv.gz hợp lệ trong {root}")
    print(f"[trustlab] Root: {root}")
    print(f"[trustlab] Categories: {[s[0] for s in sources]}")
    return sources


def _resolve_files(profile: DatasetProfile) -> list[Path]:
    root = _data_root(profile)
    if profile.glob_csv:
        tl = find_trustlab_root()
        if tl is not None:
            raise RuntimeError("_resolve_files: dùng _resolve_trustlab_sources cho trustlab")
        paths = _discover_csv_files(root)
        if not paths:
            raise FileNotFoundError(
                f"Không tìm thấy CSV TRUST Lab trong {root}.\n"
                "Tải: https://doi.org/10.82432/10317/21203 → giải nén vào locksend-ai/data/"
            )
        return paths
    if not profile.files:
        raise ValueError(f"Profile {profile.name} thiếu danh sách files")
    paths = []
    for fname in profile.files:
        p = root / fname
        if not p.is_file():
            raise FileNotFoundError(f"Thiếu file: {p}")
        paths.append(p)
    return paths


def resolve_profile(name: str) -> DatasetProfile:
    key = name.strip().lower()
    if key == "auto":
        for candidate in ("trustlab", "cic2018", "cic2017"):
            try:
                if candidate == "trustlab":
                    if find_trustlab_root() is None:
                        raise FileNotFoundError
                else:
                    _resolve_files(PROFILES[candidate])
                print(f"[auto] Chọn dataset: {candidate}")
                return PROFILES[candidate]
            except (FileNotFoundError, RuntimeError):
                continue
        raise FileNotFoundError(
            "Không tìm thấy dataset nào trong data/. "
            "Giải nén TRUST Lab vào data/ hoặc đặt CSV cic2018/cic2017."
        )
    if key not in PROFILES:
        raise ValueError(f"Dataset không hỗ trợ: {name}. Chọn: {', '.join(PROFILES)} hoặc auto")
    return PROFILES[key]


def _detect_label_col(df: pd.DataFrame, candidates: tuple[str, ...]) -> str:
    cols = {c.strip(): c for c in df.columns}
    stripped = set(cols.keys())
    for cand in candidates:
        key = cand.strip()
        if key in stripped:
            return cols[key]
    raise KeyError(
        f"Không tìm thấy cột nhãn trong {list(df.columns)[:8]}... "
        f"(đã thử: {list(candidates)})"
    )


def _subsample_df(
    df: pd.DataFrame,
    label_col: str,
    max_rows: int | None,
) -> pd.DataFrame:
    if not max_rows or len(df) <= max_rows:
        return df
    label_key = label_col.strip()
    parts = []
    for _, grp in df.groupby(df[label_key].astype(str).str.strip(), dropna=False):
        n = max(1, int(max_rows * len(grp) / len(df)))
        parts.append(grp.sample(n=min(n, len(grp)), random_state=42))
    out = pd.concat(parts, ignore_index=True)
    print(f"  → subsample {len(out):,} dòng")
    return out


def load_trustlab_dataset(
    profile: DatasetProfile,
    max_rows_per_category: int | None,
    *,
    fast: bool,
    benign_parts: int | None,
) -> tuple[pd.DataFrame, str, list[str]]:
    sources = _resolve_trustlab_sources(fast=fast, benign_parts=benign_parts)
    all_groups = discover_trustlab_groups(find_trustlab_root() or Path("."))
    frames: list[pd.DataFrame] = []
    label_col_name = ""
    source_names: list[str] = []

    for category, parts in sources:
        part_label = f"{len(parts)} part(s)" if len(parts) > 1 else parts[0].name
        print(f"Đọc {category} ({part_label}) ...")

        total_parts = len(all_groups.get(category, parts))
        partial_split = _is_split_gz(parts) and len(parts) < total_parts
        read_nrows: int | None = None
        if partial_split:
            read_nrows = max_rows_per_category or 120_000
            print(f"  → partial split ({len(parts)}/{total_parts} part), đọc tối đa {read_nrows:,} dòng")

        try:
            df = read_trustlab_gz(parts, nrows=read_nrows)
        except (EOFError, OSError, pd.errors.ParserError, ValueError) as exc:
            print(f"  ⚠ Bỏ qua {category}: file lỗi hoặc tải chưa đủ — {exc}")
            continue

        df = strip_columns(df)
        label_col_name = _detect_label_col(df, profile.label_cols)
        df = _subsample_df(df, label_col_name, max_rows_per_category)
        frames.append(df)
        source_names.append(f"{category}/[{part_label}]")
        print(
            f"  → {len(df):,} dòng, nhãn: "
            f"{df[label_col_name].astype(str).str.strip().value_counts().head(3).to_dict()}"
        )

    if not frames:
        raise RuntimeError("Không đọc được category nào — kiểm tra file .csv.gz (tải lại nếu corrupt).")

    combined = pd.concat(frames, ignore_index=True, sort=False)
    print(f"Tổng (trustlab): {len(combined):,} dòng từ {len(frames)}/{len(sources)} categories")
    return combined, label_col_name.strip(), source_names


def load_dataset(
    profile: DatasetProfile,
    max_rows_per_file: int | None,
) -> tuple[pd.DataFrame, str]:
    paths = _resolve_files(profile)
    frames: list[pd.DataFrame] = []
    label_col_name = ""

    for path in paths:
        rel = path.relative_to(_data_root(profile)) if profile.subdir != "." else path.name
        print(f"Đọc {rel} ...")
        df = pd.read_csv(path, low_memory=False)
        df = strip_columns(df)
        label_col_name = _detect_label_col(df, profile.label_cols)
        df = _subsample_df(df, label_col_name, max_rows_per_file)

        frames.append(df)
        print(
            f"  → {len(df):,} dòng, nhãn: "
            f"{df[label_col_name.strip()].astype(str).str.strip().value_counts().head(5).to_dict()}"
        )

    combined = pd.concat(frames, ignore_index=True, sort=False)
    print(f"Tổng ({profile.name}): {len(combined):,} dòng từ {len(paths)} file")
    return combined, label_col_name.strip()


def clean_features(
    df: pd.DataFrame,
    label_col: str,
    benign_labels: frozenset[str],
) -> tuple[pd.DataFrame, pd.Series]:
    y_raw = df[label_col].astype(str).str.strip()
    y = (~y_raw.isin(benign_labels)).astype(int)

    X = df.drop(columns=[label_col])
    drop_cols = [c for c in X.columns if c.strip().lower() in DROP_FEATURE_COLUMNS]
    if drop_cols:
        X = X.drop(columns=drop_cols)
    X = X.loc[:, ~X.columns.duplicated()]
    X = X.replace([np.inf, -np.inf], np.nan).fillna(0)

    for col in X.select_dtypes(include=["object"]).columns:
        X[col] = pd.to_numeric(X[col], errors="coerce").fillna(0)

    return X, y


def train_model(X: pd.DataFrame, y: pd.Series) -> tuple[RandomForestClassifier, dict]:
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=120,
        max_depth=24,
        min_samples_leaf=2,
        class_weight="balanced",
        n_jobs=-1,
        random_state=42,
    )
    print("Đang train Random Forest ...")
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1": float(f1_score(y_test, y_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, y_prob)),
        "train_size": int(len(X_train)),
        "test_size": int(len(X_test)),
        "attack_ratio": float(y.mean()),
    }
    print("\n=== Metrics ===")
    for k, v in metrics.items():
        if isinstance(v, float):
            print(f"  {k}: {v:.4f}")
        else:
            print(f"  {k}: {v}")
    print("\n", classification_report(y_test, y_pred, target_names=["BENIGN", "ATTACK"]))

    return model, metrics


def save_bundle(
    model: RandomForestClassifier,
    feature_columns: list[str],
    metrics: dict,
    profile: DatasetProfile,
    source_files: list[str],
    label_col: str,
) -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    bundle = {
        "model": model,
        "feature_columns": feature_columns,
        "label_col": label_col,
        "benign_labels": sorted(profile.benign_labels),
        "dataset": profile.name,
        "dataset_description": profile.description,
        "risk_thresholds": RISK_THRESHOLDS,
        "decision_map": DECISION_MAP,
        "locksend_feature_map": LOCKSEND_FEATURE_MAP,
        "data_files": source_files,
        "metrics": metrics,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "version": profile.version,
    }
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(bundle, f)
    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump({**metrics, "dataset": profile.name, "version": profile.version}, f, indent=2)
    print(f"\nĐã lưu model: {MODEL_PATH}")
    print(f"Metrics JSON: {METRICS_PATH}")
    print(f"Dataset: {profile.name} ({profile.version})")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train LockSend AI Random Forest")
    parser.add_argument(
        "--dataset",
        "-d",
        default=os.getenv("LOCKSEND_TRAIN_DATASET", "auto"),
        choices=[*PROFILES.keys(), "auto"],
        help="Dataset profile (mặc định: auto hoặc LOCKSEND_TRAIN_DATASET)",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=int(os.getenv("LOCKSEND_TRAIN_MAX_ROWS", "120000")),
        help="Subsample tối đa mỗi file/category (0 = dùng hết)",
    )
    parser.add_argument(
        "--trustlab-fast",
        action="store_true",
        default=os.getenv("LOCKSEND_TRUSTLAB_FAST", "").lower() in ("1", "true", "yes"),
        help="TRUST Lab: chỉ Benign (vài part) + Bruteforce/API/WebBased/DoS/DDoS",
    )
    parser.add_argument(
        "--benign-parts",
        type=int,
        default=int(os.getenv("LOCKSEND_TRUSTLAB_BENIGN_PARTS", "2")),
        help="TRUST Lab: số part Benign.csv.gz.00N (0 = tất cả 17 part; mặc định 2 khi train nhanh)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    max_rows: int | None = args.max_rows if args.max_rows > 0 else None
    profile = resolve_profile(args.dataset)
    print(f"=== LockSend AI train — {profile.name} ===")
    print(profile.description or "")

    if profile.name == "trustlab":
        benign_parts: int | None = args.benign_parts if args.benign_parts > 0 else None
        if not args.trustlab_fast and benign_parts is not None and benign_parts <= 2:
            print(
                "[trustlab] Gợi ý: train đầy đủ dùng --benign-parts 0; "
                "train nhanh thêm --trustlab-fast"
            )
        df, label_col, source_names = load_trustlab_dataset(
            profile,
            max_rows,
            fast=args.trustlab_fast,
            benign_parts=benign_parts,
        )
    else:
        paths = _resolve_files(profile)
        source_names = [str(p.relative_to(BASE_DIR)) for p in paths]
        df, label_col = load_dataset(profile, max_rows)

    X, y = clean_features(df, label_col, profile.benign_labels)
    model, metrics = train_model(X, y)
    save_bundle(model, list(X.columns), metrics, profile, source_names, label_col)


if __name__ == "__main__":
    main()
