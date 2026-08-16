from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ConcernScore(BaseModel):
    name: str
    score: float = Field(ge=0, le=100)
    severity: str = "low"  # low | medium | high


class ColorSwatch(BaseModel):
    role: str  # skin | hair | eye | lip | brow
    hex: str
    label: Optional[str] = None


class SkinProfile(BaseModel):
    session_id: str
    selfie_url: str
    undertone: str = "neutral"  # cool | warm | neutral
    depth: str = "medium"  # light | medium | deep
    contrast: str = "medium"  # low | medium | high
    fitzpatrick: Optional[str] = None
    skin_age: Optional[float] = None
    concerns: list[ConcernScore] = Field(default_factory=list)
    palette: list[ColorSwatch] = Field(default_factory=list)
    summary: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class IntentStruct(BaseModel):
    occasion: Optional[str] = None
    formality: Optional[str] = None
    color_lean: Optional[str] = None
    constraints: list[str] = Field(default_factory=list)
    vibe: Optional[str] = None
    raw_text: str = ""


class ReasonItem(BaseModel):
    signal: str
    direction: str  # support | conflict | neutral
    text: str


class EvidenceMeter(BaseModel):
    key: str
    label: str
    score: float = Field(ge=0, le=100)
    tone: str = "balanced"  # positive | caution | balanced
    detail: str


class VtoStatus(str, Enum):
    none = "none"
    queued = "queued"
    running = "running"
    ready = "ready"
    error = "error"


class Candidate(BaseModel):
    id: str
    session_id: str
    image_url: str
    category: str = "clothes"
    label: Optional[str] = None
    color_features: dict[str, Any] = Field(default_factory=dict)
    rule_score: float = 0.0
    harmony_score: float = 0.0
    preference_score: float = 0.0
    final_score: float = 0.0
    tier: str = "mixed"  # strong | mixed | caution
    reasons: list[ReasonItem] = Field(default_factory=list)
    short_verdict: str = ""
    verdict_title: str = ""
    evidence: list[EvidenceMeter] = Field(default_factory=list)
    comparison_note: str = ""
    rank: Optional[int] = None
    is_topk: bool = False
    vto_status: VtoStatus = VtoStatus.none
    vto_url: Optional[str] = None
    vto_error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Guidance(BaseModel):
    needed: bool = False
    headline: str = ""
    tips: list[str] = Field(default_factory=list)


class Session(BaseModel):
    id: str
    user_id: Optional[str] = None
    intent_text: str = ""
    intent: Optional[IntentStruct] = None
    preference_text: str = ""
    profile: Optional[SkinProfile] = None
    candidates: list[Candidate] = Field(default_factory=list)
    comparison_summary: str = ""
    guidance: Optional[Guidance] = None
    events: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SessionCreateResponse(BaseModel):
    id: str
    created_at: datetime


class SessionSummary(BaseModel):
    id: str
    title: str = "Untitled session"
    candidate_count: int = 0
    has_profile: bool = False
    created_at: datetime
    updated_at: datetime


class IntentUpdate(BaseModel):
    text: str


class PreferenceUpdate(BaseModel):
    text: str


class AnalyzeRequest(BaseModel):
    force_vto: bool = False
    top_k: Optional[int] = None


class WorkspaceResponse(BaseModel):
    session: Session


class HealthResponse(BaseModel):
    status: str
    app: str
    youcam: str
    llm: str
    supabase: str
