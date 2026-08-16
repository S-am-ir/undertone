"""Supabase client. Returns None when credentials are missing."""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_client: Any = None
_failed = False


def get_supabase():
    """Service-role client, or None if not configured / init failed."""
    global _client, _failed
    if _failed:
        return None
    if _client is not None:
        return _client
    settings = get_settings()
    if not settings.supabase_enabled:
        return None
    try:
        from supabase import create_client

        _client = create_client(settings.supabase_url, settings.supabase_server_key)
        return _client
    except Exception as exc:
        logger.warning("Supabase client init failed, using local store: %s", exc)
        _failed = True
        return None


def reset_supabase_client() -> None:
    global _client, _failed
    _client = None
    _failed = False
