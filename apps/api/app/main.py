from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.core.files import absolute_path
from app.routers import health, sessions

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # Local development may use a temporary frontend port while the normal
    # Compose app remains on 3000. Keep extension origins scoped separately.
    allow_origin_regex=r"(chrome-extension://[a-z]{32}|http://(localhost|127\.0\.0\.1):\d+)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure storage dirs exist
Path(settings.storage_dir).mkdir(parents=True, exist_ok=True)
Path(settings.data_dir).mkdir(parents=True, exist_ok=True)
for sub in ("selfies", "garments", "vtos"):
    (Path(settings.storage_dir) / sub).mkdir(parents=True, exist_ok=True)

app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(sessions.router, prefix=settings.api_prefix)


@app.get("/api/media/{kind}/{filename}")
async def media(kind: str, filename: str):
    from fastapi import HTTPException

    if kind not in {"selfies", "garments", "vtos"}:
        raise HTTPException(404, "Unknown media kind")
    path = absolute_path(kind, filename)
    if not path.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(path)


@app.get("/")
async def root():
    return {
        "app": settings.app_name,
        "docs": "/docs",
        "health": "/api/health",
    }
