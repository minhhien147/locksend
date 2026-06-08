"""
LockSend AI — HTTP service (VPS, Railway, local).

Chạy:
  uvicorn server:app --host 0.0.0.0 --port 8100
  # Railway: sh start.sh (railway.json)

Env:
  LOCKSEND_AI_API_KEY       - (tuỳ chọn) Bearer token; backend gửi kèm khi gọi
  LOCKSEND_AI_MODELS_DIR    - thư mục chứa model.pkl (Volume Railway: /data)
  LOCKSEND_AI_MODEL_URL     - URL tải model.pkl lúc startup nếu file chưa có
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from predict import analyze_access, load_bundle

API_KEY = os.getenv("LOCKSEND_AI_API_KEY", "").strip()

app = FastAPI(title="LockSend AI Service", version="1.0.0")
_bundle: dict[str, Any] | None = None
_load_error: str | None = None


def _get_bundle() -> dict[str, Any]:
    global _bundle, _load_error
    if _bundle is not None:
        return _bundle
    if _load_error is not None:
        raise RuntimeError(_load_error)
    try:
        _bundle = load_bundle()
        _load_error = None
        return _bundle
    except Exception as exc:
        _load_error = str(exc)
        raise


def _verify_api_key(authorization: str | None = Header(default=None)) -> None:
    if not API_KEY:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    if authorization[7:] != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")


class AnalyzeRequest(BaseModel):
    features: dict[str, float] = Field(
        description="Partial CIC-IDS2017 feature dict (missing cols → 0)"
    )


class BatchAnalyzeRequest(BaseModel):
    items: list[dict[str, float]]


@app.get("/health/live")
def health_live() -> dict[str, str]:
    """Liveness — Railway healthcheck (không load model)."""
    return {"status": "ok"}


@app.get("/health")
def health() -> dict[str, Any]:
    try:
        bundle = _get_bundle()
        return {
            "ready": True,
            "version": bundle.get("version", "unknown"),
            "trained_at": bundle.get("trained_at"),
            "metrics": bundle.get("metrics", {}),
        }
    except Exception as exc:
        return {
            "ready": False,
            "error": str(exc),
            "hint": "Set LOCKSEND_AI_MODEL_URL hoặc LOCKSEND_AI_MODELS_DIR + model.pkl",
        }


@app.post("/analyze", dependencies=[Depends(_verify_api_key)])
def analyze_one(body: AnalyzeRequest) -> dict[str, Any]:
    import pandas as pd

    bundle = _get_bundle()
    row = pd.DataFrame([body.features])
    return analyze_access(row, bundle=bundle)


@app.post("/analyze/batch", dependencies=[Depends(_verify_api_key)])
def analyze_many(body: BatchAnalyzeRequest) -> dict[str, Any]:
    import pandas as pd

    bundle = _get_bundle()
    results = []
    for feat in body.items:
        row = pd.DataFrame([feat])
        results.append(analyze_access(row, bundle=bundle))
    return {"results": results, "count": len(results)}
