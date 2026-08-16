from __future__ import annotations

import logging
import uuid
from pathlib import Path

import aiofiles
from fastapi import UploadFile

from app.core.config import get_settings

logger = logging.getLogger(__name__)

BUCKETS = ("selfies", "garments", "vtos")


def _ensure_dirs() -> dict[str, Path]:
    root = Path(get_settings().storage_dir)
    dirs = {kind: root / kind for kind in BUCKETS}
    for d in dirs.values():
        d.mkdir(parents=True, exist_ok=True)
    return dirs


def public_url(kind: str, filename: str) -> str:
    return f"/api/media/{kind}/{filename}"


def absolute_path(kind: str, filename: str) -> Path:
    return _ensure_dirs()[kind] / filename


def _upload_supabase(kind: str, filename: str, data: bytes) -> str | None:
    from app.core.supabase_client import get_supabase

    client = get_supabase()
    if not client:
        return None
    try:
        try:
            client.storage.create_bucket(kind, options={"public": True})
        except Exception:
            pass
        client.storage.from_(kind).upload(
            filename,
            data,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )
        return client.storage.from_(kind).get_public_url(filename)
    except Exception as exc:
        logger.warning("Supabase storage upload failed (%s/%s): %s", kind, filename, exc)
        return None


async def save_upload(kind: str, upload: UploadFile, suffix: str | None = None) -> tuple[str, Path]:
    dirs = _ensure_dirs()
    ext = suffix or Path(upload.filename or "img.jpg").suffix or ".jpg"
    if not ext.startswith("."):
        ext = f".{ext}"
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = dirs[kind] / filename
    chunks: list[bytes] = []
    async with aiofiles.open(dest, "wb") as f:
        while chunk := await upload.read(1024 * 1024):
            chunks.append(chunk)
            await f.write(chunk)
    remote = _upload_supabase(kind, filename, b"".join(chunks))
    return remote or public_url(kind, filename), dest


async def save_bytes(kind: str, data: bytes, ext: str = ".jpg") -> tuple[str, Path]:
    dirs = _ensure_dirs()
    filename = f"{uuid.uuid4().hex}{ext}"
    dest = dirs[kind] / filename
    async with aiofiles.open(dest, "wb") as f:
        await f.write(data)
    remote = _upload_supabase(kind, filename, data)
    return remote or public_url(kind, filename), dest


def resolve_local(url: str) -> Path | None:
    """Map a stored URL back to a local path, downloading remote files if needed."""
    if not url:
        return None
    if url.startswith("/api/media/"):
        parts = url.strip("/").split("/")
        if len(parts) < 4:
            return None
        kind, filename = parts[2], parts[3]
        path = absolute_path(kind, filename)
        return path if path.exists() else None

    # Supabase public URL: .../storage/v1/object/public/{bucket}/{file}
    if "/storage/v1/object/public/" in url:
        tail = url.split("/storage/v1/object/public/", 1)[1]
        bits = tail.split("?", 1)[0].split("/")
        if len(bits) >= 2:
            kind, filename = bits[0], bits[-1]
            path = absolute_path(kind, filename) if kind in BUCKETS else None
            if path and path.exists():
                return path
            if path:
                downloaded = _download(url, path)
                if downloaded:
                    return path
    return None


def _download(url: str, dest: Path) -> bool:
    try:
        import httpx

        dest.parent.mkdir(parents=True, exist_ok=True)
        with httpx.Client(timeout=60.0) as client:
            r = client.get(url)
            r.raise_for_status()
            dest.write_bytes(r.content)
        return True
    except Exception as exc:
        logger.warning("Failed to cache remote file %s: %s", url, exc)
        return False
