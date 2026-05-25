"""
LockSend AI — HTTP service (host riêng trên Ubuntu / VPS).

Chạy:
  uvicorn server:app --host 0.0.0.0 --port 8100

Env:
  LOCKSEND_AI_API_KEY  - (tuỳ chọn) Bearer token; backend gửi kèm khi gọi
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


def _get_bundle() -> dict[str, Any]:
    global _bundle
    if _bundle is None:
        _bundle = load_bundle()
    return _bundle


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


@app.on_event("startup")
def startup() -> None:
    _get_bundle()


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
    except FileNotFoundError as exc:
        return {"ready": False, "error": str(exc), "hint": "python train.py"}


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
