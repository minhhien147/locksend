"""Resolve model path — hỗ trợ Volume Railway và tải model từ URL."""

from __future__ import annotations

import os
import urllib.error
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODELS_DIR = os.path.join(BASE_DIR, "models")


def models_dir() -> str:
    custom = os.getenv("LOCKSEND_AI_MODELS_DIR", "").strip()
    return custom if custom else DEFAULT_MODELS_DIR


def model_path() -> str:
    return os.path.join(models_dir(), "model.pkl")


def ensure_model() -> str:
    """Trả về path model.pkl; tải từ LOCKSEND_AI_MODEL_URL nếu chưa có file."""
    path = model_path()
    if os.path.isfile(path):
        return path

    url = os.getenv("LOCKSEND_AI_MODEL_URL", "").strip()
    if not url:
        raise FileNotFoundError(
            f"Chưa có model tại {path}. "
            "Train local: python train.py — hoặc set LOCKSEND_AI_MODEL_URL / Volume + LOCKSEND_AI_MODELS_DIR."
        )

    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    timeout = int(os.getenv("LOCKSEND_AI_MODEL_DOWNLOAD_TIMEOUT", "600"))
    try:
        with urllib.request.urlopen(url, timeout=timeout) as res, open(path, "wb") as out:
            while True:
                chunk = res.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
    except urllib.error.URLError as exc:
        raise FileNotFoundError(f"Không tải được model từ {url}: {exc}") from exc

    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        raise FileNotFoundError(f"Tải model thất bại — file rỗng: {path}")

    return path
