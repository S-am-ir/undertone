from fastapi import APIRouter

from app.core.config import get_settings
from app.core.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health():
    s = get_settings()
    if s.groq_api_key:
        llm = "groq"
    elif s.google_api_key:
        llm = "gemini"
    else:
        llm = "missing-key"
    return HealthResponse(
        status="ok",
        app=s.app_name,
        youcam="live" if s.youcam_enabled else "missing-key",
        llm=llm,
        supabase="on" if s.supabase_enabled else "local-json",
    )
