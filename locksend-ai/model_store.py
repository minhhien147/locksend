"""Resolve model path — hỗ trợ Volume Railway và tải model từ URL."""

from __future__ import annotations

import hashlib
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


def _checksum_path() -> str:
    return model_path() + ".sha256"


# A08: Tính checksum file ──────────────────────────────────────────────────────

def compute_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def save_checksum(model_file_path: str) -> str:
    """Tính và lưu SHA-256 của model.pkl vào model.pkl.sha256."""
    digest = compute_sha256(model_file_path)
    checksum_file = model_file_path + ".sha256"
    with open(checksum_file, "w", encoding="ascii") as f:
        f.write(digest)
    return digest


def verify_checksum(model_file_path: str) -> None:
    """
    A08 – Software & Data Integrity:
    Kiểm tra SHA-256 của model.pkl. Raise nếu không khớp.
    Bỏ qua nếu chưa có file .sha256 (lần đầu train local).
    """
    checksum_file = model_file_path + ".sha256"
    if not os.path.isfile(checksum_file):
        return  # chưa có checksum — lần đầu, bỏ qua

    with open(checksum_file, "r", encoding="ascii") as f:
        expected = f.read().strip().lower()

    if not expected:
        return

    actual = compute_sha256(model_file_path)
    if actual != expected:
        raise ValueError(
            f"[A08] Model checksum KHÔNG KHỚP! "
            f"expected={expected[:16]}… actual={actual[:16]}… "
            f"File có thể bị tamper: {model_file_path}"
        )


def ensure_model() -> str:
    """Trả về path model.pkl; tải từ LOCKSEND_AI_MODEL_URL nếu chưa có file."""
    path = model_path()
    if os.path.isfile(path):
        # A08: Xác minh checksum mỗi khi load
        verify_checksum(path)
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

    # A08: Lưu checksum sau khi tải xong
    digest = save_checksum(path)
    print(f"[model_store] SHA-256 đã lưu: {digest[:16]}…")

    return path
