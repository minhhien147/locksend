"""Kiểm tra model.pkl sau train — chạy: python verify_model.py"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

from predict import analyze_access, load_bundle

BASE = Path(__file__).resolve().parent
MODEL = BASE / "models" / "model.pkl"
METRICS = BASE / "models" / "metrics.json"


def main() -> None:
    print("=== File check ===")
    if not MODEL.is_file():
        print("FAIL: models/model.pkl không tồn tại")
        sys.exit(1)
    print(f"  model.pkl: {MODEL.stat().st_size / 1024 / 1024:.2f} MB")
    print(f"  metrics.json: {'OK' if METRICS.is_file() else 'MISSING'}")

    with open(METRICS, encoding="utf-8") as f:
        m = json.load(f)
    print("\n=== Metrics (test set) ===")
    for k, v in m.items():
        print(f"  {k}: {v}")

    bundle = load_bundle()
    cols = bundle["feature_columns"]
    print("\n=== Bundle ===")
    print(f"  version: {bundle.get('version')}")
    print(f"  dataset: {bundle.get('dataset')}")
    print(f"  trained_at: {bundle.get('trained_at')}")
    print(f"  feature count: {len(cols)}")
    print(f"  source files: {len(bundle.get('data_files', []))}")

    low = dict.fromkeys(cols, 0.0)
    high = dict.fromkeys(cols, 0.0)
    for c in cols:
        cl = c.lower()
        if "packets/s" in cl or "bytes/s" in cl:
            low[c] = 0.01
            high[c] = 5000.0
        elif "duration" in cl:
            low[c] = 1000.0
            high[c] = 1e9

    r_low = analyze_access(pd.DataFrame([low]), bundle)
    r_high = analyze_access(pd.DataFrame([high]), bundle)
    print("\n=== Smoke inference ===")
    print(f"  Low activity  -> score={r_low['risk_score']} {r_low['risk_level']} {r_low['decision']}")
    print(f"  High activity -> score={r_high['risk_score']} {r_high['risk_level']} {r_high['decision']}")

    backend = BASE.parent / "backend"
    if backend.is_dir():
        sys.path.insert(0, str(backend))
        from services.locksend_ai import _token_metric_to_cic

        mapped = _token_metric_to_cic(
            {
                "accesses_per_hour": 120,
                "ip_count": 3,
                "active_sessions": 2,
                "token_age_hours": 24,
            }
        )
        trustlab_keys = [
            "Flow Pkts/s",
            "Flow Byts/s",
            "Flow Duration",
            "Active Max",
            "Tot Fwd Pkts",
            "Subflow Fwd Pkts",
            "Dst Port",
        ]
        overlap = sum(1 for k in trustlab_keys if k in cols)
        print("\n=== LockSend backend mapping ===")
        print(f"  TRUST Lab keys in model: {overlap}/{len(trustlab_keys)}")
        missing = [k for k in trustlab_keys if k not in cols]
        if missing:
            print(f"  missing: {missing}")

        row = pd.DataFrame([{c: mapped.get(c, 0.0) for c in cols}])
        r_token = analyze_access(row, bundle)
        print(
            f"  Token-like (120 req/h) -> score={r_token['risk_score']} "
            f"{r_token['risk_level']} {r_token['decision']}"
        )

    print("\n=== PASS: model load + inference OK ===")


if __name__ == "__main__":
    main()
