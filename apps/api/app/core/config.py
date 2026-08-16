from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parents[2]


def _repo_root(api_root: Path) -> Path:
    """Monorepo root locally (`youcam/`). In Docker the API is copied to /app, so there is no parent above /."""
    try:
        return api_root.parents[1]
    except IndexError:
        return api_root


REPO_ROOT = _repo_root(API_ROOT)


def _env_files() -> tuple[Path, ...]:
    files: list[Path] = []
    for candidate in (REPO_ROOT / ".env", API_ROOT / ".env"):
        if candidate.is_file() and candidate not in files:
            files.append(candidate)
    return tuple(files)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_files(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Undertone"
    app_env: str = "development"
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    storage_dir: str = str(API_ROOT / "storage")
    data_dir: str = str(API_ROOT / "data")

    # YouCam / Perfect Corp — live only
    youcam_api_key: str = ""
    youcam_api_secret: str = ""
    youcam_base_url: str = "https://yce-api-01.makeupar.com"
    # The current public Clothes API is cloth-v3. Keep the fallback configurable
    # because some existing hackathon accounts may still expose an older/private
    # action used by earlier local runs.
    youcam_clothes_action: str = "cloth-v3"
    youcam_clothes_fallback_action: str = "cloth-v4"

    # LLM — Groq primary, Gemini fallback
    groq_api_key: str = ""
    google_api_key: str = ""
    llm_primary: str = "groq"
    llm_primary_model: str = "openai/gpt-oss-120b"
    llm_fallback: str = "gemini"
    llm_fallback_model: str = "gemini-2.5-flash"
    # Visual verification is deliberately separate from text styling. It sees
    # the garment reference before any language is generated.
    vision_primary_model: str = "qwen/qwen3.6-27b"
    vision_fallback_model: str = "gemini-2.5-flash"

    # Fusion (fixed DAG — not an agent loop)
    vto_top_k: int = 3
    max_candidates: int = 30
    weak_score_threshold: float = 55.0

    # Supabase — primary store when URL + secret are set
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_publishable_key: str = ""
    supabase_service_role_key: str = ""
    supabase_secret_key: str = ""
    auth_disabled: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def youcam_enabled(self) -> bool:
        return bool(self.youcam_api_key)

    @property
    def llm_enabled(self) -> bool:
        return bool(self.groq_api_key or self.google_api_key)

    @property
    def supabase_server_key(self) -> str:
        return self.supabase_service_role_key or self.supabase_secret_key

    @property
    def supabase_public_key(self) -> str:
        return self.supabase_anon_key or self.supabase_publishable_key

    @property
    def supabase_enabled(self) -> bool:
        return bool(self.supabase_url and self.supabase_server_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
