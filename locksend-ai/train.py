"""
LockSend AI – Huấn luyện Random Forest trên CIC-IDS2017

Dataset (proxy cho hành vi truy cập token):
  - Tuesday:   BENIGN + brute-force (FTP/SSH Patator)
  - Wednesday: BENIGN + DoS (Hulk, GoldenEye, Slowloris, ...)
  - Friday AM: BENIGN + Botnet
  - Friday PM: BENIGN + DDoS flood

Nhãn: BENIGN=0 (an toàn), ATTACK=1 (đáng ngờ)
Risk score = P(ATTACK) → map ALLOW / MONITOR / REVOKE
"""

from __future__ import annotations

import json
import os
import pickle
import sys
import warnings

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
from datetime import datetime, timezone

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

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
MODELS_DIR = os.path.join(BASE_DIR, "models")
MODEL_PATH = os.path.join(MODELS_DIR, "model.pkl")
METRICS_PATH = os.path.join(MODELS_DIR, "metrics.json")

# LockSend: normal + brute-force + DoS + Bot + DDoS
DATA_FILES = [
    "Tuesday-WorkingHours.pcap_ISCX.csv",
    "Wednesday-workingHours.pcap_ISCX.csv",
    "Friday-WorkingHours-Morning.pcap_ISCX.csv",
    "Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv",
]

LABEL_COL = " Label"
BENIGN = "BENIGN"

# Giới hạn mẫu mỗi file để train nhanh trên máy thường (None = dùng hết)
MAX_ROWS_PER_FILE: int | None = 120_000

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


def strip_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = df.columns.str.strip()
    return df


def load_dataset(files: list[str]) -> pd.DataFrame:
    frames = []
    for fname in files:
        path = os.path.join(DATA_DIR, fname)
        if not os.path.exists(path):
            raise FileNotFoundError(f"Thiếu file: {path}")

        print(f"Đọc {fname} ...")
        df = pd.read_csv(path, low_memory=False)
        df = strip_columns(df)

        if MAX_ROWS_PER_FILE and len(df) > MAX_ROWS_PER_FILE:
            # Giữ tỷ lệ nhãn khi subsample
            label = LABEL_COL.strip()
            parts = []
            for lbl, grp in df.groupby(label):
                n = max(1, int(MAX_ROWS_PER_FILE * len(grp) / len(df)))
                parts.append(grp.sample(n=min(n, len(grp)), random_state=42))
            df = pd.concat(parts, ignore_index=True)
            print(f"  → subsample {len(df):,} dòng")

        frames.append(df)
        print(f"  → {len(df):,} dòng, nhãn: {df[LABEL_COL.strip()].value_counts().to_dict()}")

    combined = pd.concat(frames, ignore_index=True)
    print(f"Tổng: {len(combined):,} dòng")
    return combined


def clean_features(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    label_col = LABEL_COL.strip()
    y_raw = df[label_col].astype(str).str.strip()
    y = (y_raw != BENIGN).astype(int)

    X = df.drop(columns=[label_col])
    # Bỏ cột trùng tên (CIC-IDS2017 có Fwd Header Length.1)
    X = X.loc[:, ~X.columns.duplicated()]

    X = X.replace([np.inf, -np.inf], np.nan)
    X = X.fillna(0)

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


def save_bundle(model, feature_columns: list[str], metrics: dict) -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)
    bundle = {
        "model": model,
        "feature_columns": feature_columns,
        "label_col": LABEL_COL.strip(),
        "benign_label": BENIGN,
        "risk_thresholds": RISK_THRESHOLDS,
        "decision_map": DECISION_MAP,
        "locksend_feature_map": {
            "request_rate": ["Flow Packets/s", "Flow Bytes/s", "Fwd Packets/s", "Bwd Packets/s"],
            "long_activity": ["Flow Duration", "Active Max", "Idle Max"],
            "concurrent_load": ["Total Fwd Packets", "Total Backward Packets", "Subflow Fwd Packets"],
            "unusual_endpoint": ["Destination Port"],
        },
        "data_files": DATA_FILES,
        "metrics": metrics,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "version": "locksend-ai-1.0",
    }
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(bundle, f)
    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    print(f"\nĐã lưu model: {MODEL_PATH}")
    print(f"Metrics JSON: {METRICS_PATH}")


def main() -> None:
    df = load_dataset(DATA_FILES)
    X, y = clean_features(df)
    model, metrics = train_model(X, y)
    save_bundle(model, list(X.columns), metrics)


if __name__ == "__main__":
    main()
