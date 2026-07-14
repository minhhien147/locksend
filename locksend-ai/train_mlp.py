"""
LockSend AI — Deep MLP Trainer (PyTorch)

Kiến trúc: IDSNet — 8 fully-connected layers, ~8.2 triệu tham số
Mục đích: phân loại traffic mạng benign/attack (IDS) với độ chính xác cao.

Dùng cùng dataset pipeline với train.py (trustlab, CIC-IDS, …).
Bundle output tương thích 100% với predict.py — không cần sửa inference.

Chạy:
    python train_mlp.py                      # auto dataset
    python train_mlp.py --dataset ciciot2023
    python train_mlp.py --epochs 30 --batch-size 2048
    python train_mlp.py --compare-rf          # so sánh RF vs MLP sau khi train

Env:
    LOCKSEND_TRAIN_DATASET    dataset profile (mặc định: auto)
    LOCKSEND_TRAIN_MAX_ROWS   subsample (mặc định: 120000)
"""

from __future__ import annotations

import argparse
import json
import os
import pickle
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

# ── Import dataset utilities từ train.py ──────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent))
from train import (
    COMBINED_PROFILE,
    DECISION_MAP,
    LOCKSEND_FEATURE_MAP,
    MODELS_DIR,
    PROFILES,
    RISK_THRESHOLDS,
    clean_features,
    load_combined_dataset,
    load_profile_raw,
    parse_combine_list,
    profile_available,
    resolve_profile,
)

try:
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import (
        accuracy_score, f1_score, precision_score,
        recall_score, roc_auc_score, classification_report,
    )
    from sklearn.model_selection import train_test_split
except ImportError as e:
    print(f"Thiếu thư viện: {e}")
    print("Cài đặt: pip install torch scikit-learn")
    sys.exit(1)

MODEL_MLP_PATH = MODELS_DIR / "model_mlp.pkl"
METRICS_MLP_PATH = MODELS_DIR / "metrics_mlp.json"


# ── Kiến trúc mạng ────────────────────────────────────────────────────────────

class IDSNet(nn.Module):
    """
    Deep MLP cho bài toán phân loại traffic IDS.

    Kiến trúc 8 lớp với skip connection và BatchNorm:
      Input(77) → 2048 → 2048 → 1024 → 1024 → 512 → 256 → 128 → 1
    Tổng tham số: ~8.2 triệu
    """

    def __init__(self, n_features: int):
        super().__init__()

        self.input_proj = nn.Sequential(
            nn.Linear(n_features, 2048),
            nn.BatchNorm1d(2048),
            nn.ReLU(),
            nn.Dropout(0.3),
        )

        # Block 1: 2048 → 2048 (residual)
        self.block1 = nn.Sequential(
            nn.Linear(2048, 2048),
            nn.BatchNorm1d(2048),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(2048, 2048),
            nn.BatchNorm1d(2048),
        )
        self.relu1 = nn.ReLU()

        # Block 2: 2048 → 1024
        self.block2 = nn.Sequential(
            nn.Linear(2048, 1024),
            nn.BatchNorm1d(1024),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(1024, 1024),
            nn.BatchNorm1d(1024),
            nn.ReLU(),
        )

        # Block 3: 1024 → 512
        self.block3 = nn.Sequential(
            nn.Linear(1024, 512),
            nn.BatchNorm1d(512),
            nn.ReLU(),
            nn.Dropout(0.2),
        )

        # Head
        self.head = nn.Sequential(
            nn.Linear(512, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(256, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Linear(128, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.input_proj(x)
        x = self.relu1(self.block1(x) + x)   # residual
        x = self.block2(x)
        x = self.block3(x)
        return self.head(x).squeeze(1)

    @staticmethod
    def count_parameters(model: "IDSNet") -> int:
        return sum(p.numel() for p in model.parameters() if p.requires_grad)


# ── Sklearn-compatible wrapper ─────────────────────────────────────────────────

class MLPPredictor:
    """
    Bọc IDSNet thành interface tương thích sklearn (predict_proba).
    predict.py gọi model.predict_proba(X)[0, 1] — hoạt động không đổi.
    """

    def __init__(
        self,
        net: IDSNet,
        scaler: StandardScaler,
        feature_columns: list[str],
        device: str = "cpu",
    ):
        self.net = net
        self.scaler = scaler
        self.feature_columns = feature_columns
        self.device = device
        self.n_features_in_ = len(feature_columns)

    def _prepare(self, X: pd.DataFrame) -> torch.Tensor:
        X_aligned = pd.DataFrame(0.0, index=X.index, columns=self.feature_columns)
        for col in self.feature_columns:
            if col in X.columns:
                X_aligned[col] = X[col].values
        arr = self.scaler.transform(X_aligned.values.astype(np.float32))
        return torch.tensor(arr, dtype=torch.float32).to(self.device)

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        self.net.eval()
        with torch.no_grad():
            logits = self.net(self._prepare(X))
            probs = torch.sigmoid(logits).cpu().numpy()
        return np.column_stack([1 - probs, probs])

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return (self.predict_proba(X)[:, 1] >= 0.5).astype(int)


# ── Training loop ──────────────────────────────────────────────────────────────

def train_epoch(
    net: IDSNet,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    criterion: nn.Module,
    device: str,
) -> float:
    net.train()
    total_loss = 0.0
    for X_batch, y_batch in loader:
        X_batch, y_batch = X_batch.to(device), y_batch.to(device)
        optimizer.zero_grad()
        loss = criterion(net(X_batch), y_batch)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * len(y_batch)
    return total_loss / len(loader.dataset)


@torch.no_grad()
def eval_epoch(
    net: IDSNet,
    loader: DataLoader,
    criterion: nn.Module,
    device: str,
) -> tuple[float, float]:
    net.eval()
    total_loss = 0.0
    all_probs, all_labels = [], []
    for X_batch, y_batch in loader:
        X_batch, y_batch = X_batch.to(device), y_batch.to(device)
        logits = net(X_batch)
        total_loss += criterion(logits, y_batch).item() * len(y_batch)
        all_probs.extend(torch.sigmoid(logits).cpu().tolist())
        all_labels.extend(y_batch.cpu().tolist())
    avg_loss = total_loss / len(loader.dataset)
    preds = [1 if p >= 0.5 else 0 for p in all_probs]
    acc = accuracy_score(all_labels, preds)
    return avg_loss, acc


def train_model(
    X: pd.DataFrame,
    y: pd.Series,
    *,
    epochs: int,
    batch_size: int,
    lr: float,
    device: str,
) -> tuple[MLPPredictor, dict[str, Any]]:

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y,
    )

    # Scale
    scaler = StandardScaler()
    X_train_np = scaler.fit_transform(X_train.values.astype(np.float32))
    X_test_np  = scaler.transform(X_test.values.astype(np.float32))

    # Tensors
    X_tr = torch.tensor(X_train_np, dtype=torch.float32)
    y_tr = torch.tensor(y_train.values, dtype=torch.float32)
    X_te = torch.tensor(X_test_np,  dtype=torch.float32)
    y_te = torch.tensor(y_test.values,  dtype=torch.float32)

    train_loader = DataLoader(TensorDataset(X_tr, y_tr), batch_size=batch_size, shuffle=True,  num_workers=0)
    test_loader  = DataLoader(TensorDataset(X_te, y_te), batch_size=batch_size, shuffle=False, num_workers=0)

    # Model
    net = IDSNet(n_features=X_train_np.shape[1]).to(device)
    n_params = IDSNet.count_parameters(net)
    print(f"\n{'='*50}")
    print(f"  IDSNet — {n_params:,} tham số ({n_params/1e6:.2f}M)")
    print(f"  Device: {device}")
    print(f"  Train: {len(X_train):,}  Test: {len(X_test):,}")
    print(f"  Epochs: {epochs}  Batch: {batch_size}  LR: {lr}")
    print(f"{'='*50}")

    # Class weight cho imbalanced dataset
    pos_weight_val = float((y_train == 0).sum()) / max(float((y_train == 1).sum()), 1)
    criterion = nn.BCEWithLogitsLoss(
        pos_weight=torch.tensor([pos_weight_val], dtype=torch.float32).to(device)
    )
    optimizer = torch.optim.AdamW(net.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer, max_lr=lr, steps_per_epoch=len(train_loader), epochs=epochs,
    )

    best_val_loss = float("inf")
    best_state = None
    history: list[dict] = []

    for epoch in range(1, epochs + 1):
        t0 = time.time()
        train_loss = train_epoch(net, train_loader, optimizer, criterion, device)
        scheduler.step()
        val_loss, val_acc = eval_epoch(net, test_loader, criterion, device)
        elapsed = time.time() - t0

        print(
            f"  Epoch {epoch:>3}/{epochs} | "
            f"train_loss={train_loss:.4f}  val_loss={val_loss:.4f}  "
            f"val_acc={val_acc:.4f}  ({elapsed:.1f}s)"
        )
        history.append({"epoch": epoch, "train_loss": train_loss, "val_loss": val_loss, "val_acc": val_acc})

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state = {k: v.cpu().clone() for k, v in net.state_dict().items()}

    # Restore best
    if best_state:
        net.load_state_dict(best_state)

    # Final metrics
    net.eval()
    predictor = MLPPredictor(net, scaler, list(X.columns), device=device)
    y_prob = predictor.predict_proba(X_test)[:, 1]
    y_pred = (y_prob >= 0.5).astype(int)
    y_true = y_test.values

    metrics: dict[str, Any] = {
        "accuracy":     float(accuracy_score(y_true, y_pred)),
        "precision":    float(precision_score(y_true, y_pred, zero_division=0)),
        "recall":       float(recall_score(y_true, y_pred, zero_division=0)),
        "f1":           float(f1_score(y_true, y_pred, zero_division=0)),
        "roc_auc":      float(roc_auc_score(y_true, y_prob)),
        "train_size":   int(len(X_train)),
        "test_size":    int(len(X_test)),
        "attack_ratio": float(y.mean()),
        "n_params":     n_params,
        "epochs":       epochs,
        "batch_size":   batch_size,
        "history":      history,
    }

    print(f"\n{'='*50}")
    print("  === Final Metrics ===")
    for k in ["accuracy", "precision", "recall", "f1", "roc_auc"]:
        print(f"    {k:<12}: {metrics[k]:.4f}")
    print(f"    n_params    : {n_params:,} ({n_params/1e6:.2f}M)")
    print(f"\n{classification_report(y_true, y_pred, target_names=['BENIGN','ATTACK'])}")
    print(f"{'='*50}")

    return predictor, metrics


# ── Save bundle ────────────────────────────────────────────────────────────────

def save_bundle(
    predictor: MLPPredictor,
    metrics: dict[str, Any],
    profile: Any,
    source_files: list[str],
    label_col: str,
    *,
    overwrite_main: bool,
) -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    bundle = {
        "model":                  predictor,
        "model_type":             "mlp",
        "feature_columns":        predictor.feature_columns,
        "label_col":              label_col,
        "benign_labels":          sorted(profile.benign_labels),
        "dataset":                profile.name,
        "dataset_description":    profile.description,
        "risk_thresholds":        RISK_THRESHOLDS,
        "decision_map":           DECISION_MAP,
        "locksend_feature_map":   LOCKSEND_FEATURE_MAP,
        "data_files":             source_files,
        "metrics":                metrics,
        "trained_at":             datetime.now(timezone.utc).isoformat(),
        "version":                f"locksend-ai-mlp-{profile.name}-2026",
        "architecture": {
            "type":        "IDSNet",
            "n_params":    metrics["n_params"],
            "layers":      "77→2048→2048→1024→1024→512→256→128→1",
            "activation":  "ReLU + BatchNorm + Dropout",
            "residual":    True,
            "optimizer":   "AdamW + OneCycleLR",
        },
    }

    with open(MODEL_MLP_PATH, "wb") as f:
        pickle.dump(bundle, f)

    # Fix #7 — A08: Auto-save SHA256 checksum cho model MLP
    from model_store import save_checksum
    mlp_digest = save_checksum(str(MODEL_MLP_PATH))

    metrics_out = {
        **{k: v for k, v in metrics.items() if k != "history"},
        "dataset": profile.name,
        "version": bundle["version"],
        "architecture": bundle["architecture"],
    }
    with open(METRICS_MLP_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics_out, f, indent=2, ensure_ascii=False)

    print(f"\nModel MLP: {MODEL_MLP_PATH}")
    print(f"SHA-256  : {mlp_digest[:16]}… → {MODEL_MLP_PATH}.sha256")
    print(f"Metrics  : {METRICS_MLP_PATH}")

    if overwrite_main:
        import shutil
        main_path = MODELS_DIR / "model.pkl"
        shutil.copy2(MODEL_MLP_PATH, main_path)
        shutil.copy2(METRICS_MLP_PATH, MODELS_DIR / "metrics.json")
        # Fix #7: Cập nhật checksum cho model.pkl chính sau khi copy
        main_digest = save_checksum(str(main_path))
        print(f"→ Đã ghi đè model.pkl chính (backend sẽ dùng MLP)")
        print(f"   SHA-256 model.pkl: {main_digest[:16]}…")
    else:
        print("→ Chưa ghi đè model.pkl — thêm --set-main để kích hoạt cho backend")


# ── Compare RF vs MLP ─────────────────────────────────────────────────────────

def compare_with_rf(mlp_metrics: dict[str, Any]) -> None:
    rf_path = MODELS_DIR / "metrics.json"
    if not rf_path.is_file():
        print("\n[so sánh] Không tìm thấy metrics.json của RF")
        return

    with open(rf_path) as f:
        rf = json.load(f)

    keys = ["accuracy", "precision", "recall", "f1", "roc_auc"]
    print("\n" + "="*58)
    print(f"  {'Metric':<14} {'Random Forest':>15}  {'MLP (IDSNet)':>15}")
    print("-"*58)
    for k in keys:
        rf_v  = rf.get(k, 0)
        mlp_v = mlp_metrics.get(k, 0)
        diff  = mlp_v - rf_v
        arrow = "↑" if diff > 0 else ("↓" if diff < 0 else "=")
        print(f"  {k:<14} {rf_v:>15.4f}  {mlp_v:>15.4f}  {arrow}{abs(diff):.4f}")
    print("-"*58)
    rf_params  = rf.get("architecture", {}).get("n_params", "~23,220 nodes")
    mlp_params = mlp_metrics.get("n_params", 0)
    print(f"  {'params':<14} {str(rf_params):>15}  {mlp_params:>15,}")
    print("="*58)


# ── CLI ────────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train LockSend AI — Deep MLP (PyTorch)")
    p.add_argument("--dataset", "-d",
        default=os.getenv("LOCKSEND_TRAIN_DATASET", "auto"),
        choices=[*PROFILES.keys(), "auto"],
        help="Dataset profile (mặc định: auto)")
    p.add_argument("--combine", "-c",
        default=os.getenv("LOCKSEND_TRAIN_COMBINE", "").strip(),
        metavar="A,B,C",
        help="Gộp nhiều profile: trustlab,idsiot2024,ciciot2023")
    p.add_argument("--max-rows", type=int,
        default=int(os.getenv("LOCKSEND_TRAIN_MAX_ROWS", "120000")),
        help="Subsample tối đa mỗi file/category (0 = dùng hết)")
    p.add_argument("--epochs", type=int,
        default=int(os.getenv("MLP_EPOCHS", "20")),
        help="Số epoch train (mặc định: 20)")
    p.add_argument("--batch-size", type=int,
        default=int(os.getenv("MLP_BATCH_SIZE", "2048")),
        help="Batch size (mặc định: 2048)")
    p.add_argument("--lr", type=float,
        default=float(os.getenv("MLP_LR", "1e-3")),
        help="Learning rate (mặc định: 0.001)")
    p.add_argument("--device",
        default=os.getenv("MLP_DEVICE", "cuda" if torch.cuda.is_available() else "cpu"),
        help="cpu / cuda (tự động chọn nếu không set)")
    p.add_argument("--set-main", action="store_true",
        default=os.getenv("MLP_SET_MAIN", "").lower() in ("1", "true", "yes"),
        help="Ghi đè model.pkl chính để backend dùng MLP ngay")
    p.add_argument("--compare-rf", action="store_true",
        help="In bảng so sánh RF vs MLP sau khi train")
    p.add_argument("--trustlab-fast", action="store_true",
        default=os.getenv("LOCKSEND_TRUSTLAB_FAST", "").lower() in ("1", "true", "yes"))
    p.add_argument("--benign-parts", type=int,
        default=int(os.getenv("LOCKSEND_TRUSTLAB_BENIGN_PARTS", "2")))
    return p.parse_args()


def main() -> None:
    args = parse_args()
    max_rows: int | None = args.max_rows if args.max_rows > 0 else None
    benign_parts: int | None = args.benign_parts if args.benign_parts > 0 else None

    print(f"{'='*50}")
    print("  LockSend AI — Deep MLP Trainer")
    print(f"{'='*50}")

    if args.combine:
        names   = parse_combine_list(args.combine)
        profile = COMBINED_PROFILE
        print(f"Datasets (combined): {', '.join(names)}")
        X, y, sources = load_combined_dataset(
            names, max_rows,
            trustlab_fast=args.trustlab_fast,
            benign_parts=benign_parts,
        )
        label_col = "combined"
    else:
        profile = resolve_profile(args.dataset)
        print(f"Dataset: {profile.name} — {profile.description}")
        df, label_col, sources = load_profile_raw(
            profile, max_rows,
            trustlab_fast=args.trustlab_fast,
            benign_parts=benign_parts,
        )
        X, y = clean_features(df, label_col, profile.benign_labels)

    print(f"Features: {len(X.columns)}  Samples: {len(X):,}  Attack ratio: {y.mean():.2%}")

    predictor, metrics = train_model(
        X, y,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        device=args.device,
    )

    if args.combine:
        metrics["combine_profiles"] = parse_combine_list(args.combine)

    save_bundle(predictor, metrics, profile, sources, label_col, overwrite_main=args.set_main)

    if args.compare_rf:
        compare_with_rf(metrics)


if __name__ == "__main__":
    main()
