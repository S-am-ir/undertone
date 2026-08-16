"""Session store: Supabase first, local JSON fallback."""

from __future__ import annotations

import json
import logging
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.config import get_settings
from app.core.schemas import Candidate, Guidance, IntentStruct, Session, SessionSummary, SkinProfile

logger = logging.getLogger(__name__)


class JsonSessionStore:
    def __init__(self) -> None:
        settings = get_settings()
        self._dir = Path(settings.data_dir)
        self._dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _path(self, session_id: str) -> Path:
        return self._dir / f"{session_id}.json"

    def create(self, user_id: Optional[str] = None) -> Session:
        session = Session(id=str(uuid.uuid4()), user_id=user_id)
        self.save(session)
        return session

    def get(self, session_id: str) -> Optional[Session]:
        path = self._path(session_id)
        if not path.exists():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return Session.model_validate(data)

    def save(self, session: Session) -> Session:
        session.updated_at = datetime.utcnow()
        with self._lock:
            self._path(session.id).write_text(
                session.model_dump_json(indent=2),
                encoding="utf-8",
            )
        return session

    def require(self, session_id: str) -> Session:
        session = self.get(session_id)
        if not session:
            raise KeyError(f"Session not found: {session_id}")
        return session

    def list(self) -> list[SessionSummary]:
        summaries: list[SessionSummary] = []
        for path in self._dir.glob("*.json"):
            try:
                session = Session.model_validate(json.loads(path.read_text(encoding="utf-8")))
                summaries.append(
                    SessionSummary(
                        id=session.id,
                        title=session.intent_text.strip()[:64] or "Untitled session",
                        candidate_count=len(session.candidates),
                        has_profile=bool(session.profile),
                        created_at=session.created_at,
                        updated_at=session.updated_at,
                    )
                )
            except Exception as exc:
                logger.warning("Skipping invalid session file %s: %s", path, exc)
        return sorted(summaries, key=lambda item: item.updated_at, reverse=True)

    def delete(self, session_id: str) -> None:
        self._path(session_id).unlink(missing_ok=True)


class SupabaseSessionStore:
    def __init__(self, client) -> None:
        self.client = client

    def create(self, user_id: Optional[str] = None) -> Session:
        session = Session(id=str(uuid.uuid4()), user_id=user_id)
        self.save(session)
        return session

    def get(self, session_id: str) -> Optional[Session]:
        row = (
            self.client.table("sessions")
            .select("*")
            .eq("id", session_id)
            .limit(1)
            .execute()
        )
        if not row.data:
            return None
        rec = row.data[0]
        payload = rec.get("payload")
        if payload:
            return Session.model_validate(payload)

        profile_rows = (
            self.client.table("skin_profiles")
            .select("*")
            .eq("session_id", session_id)
            .limit(1)
            .execute()
        )
        cand_rows = (
            self.client.table("candidates").select("*").eq("session_id", session_id).execute()
        )
        profile = None
        if profile_rows.data:
            p = profile_rows.data[0]
            profile = SkinProfile(
                session_id=session_id,
                selfie_url=p.get("selfie_path") or "",
                undertone=p.get("undertone") or "neutral",
                depth=p.get("depth") or "medium",
                contrast=p.get("contrast") or "medium",
                fitzpatrick=p.get("fitzpatrick"),
                skin_age=p.get("skin_age"),
                concerns=p.get("concerns") or [],
                palette=p.get("palette") or [],
                summary=p.get("summary") or "",
                raw=p.get("raw") or {},
            )
        intent = rec.get("intent_struct") or {}
        return Session(
            id=session_id,
            user_id=rec.get("user_id"),
            intent_text=rec.get("intent_text") or "",
            intent=IntentStruct.model_validate(intent) if intent else None,
            preference_text=rec.get("preference_text") or "",
            profile=profile,
            candidates=[_candidate_from_row(c) for c in (cand_rows.data or [])],
            guidance=Guidance.model_validate(rec["guidance"]) if rec.get("guidance") else None,
            events=rec.get("events") or [],
        )

    def save(self, session: Session) -> Session:
        session.updated_at = datetime.utcnow()
        payload = json.loads(session.model_dump_json())
        self.client.table("sessions").upsert(
            {
                "id": session.id,
                "user_id": session.user_id,
                "intent_text": session.intent_text,
                "intent_struct": session.intent.model_dump() if session.intent else {},
                "preference_text": session.preference_text,
                "events": session.events,
                "guidance": session.guidance.model_dump() if session.guidance else None,
                "payload": payload,
                "updated_at": session.updated_at.isoformat(),
            }
        ).execute()

        if session.profile:
            p = session.profile
            self.client.table("skin_profiles").delete().eq("session_id", session.id).execute()
            self.client.table("skin_profiles").insert(
                {
                    "session_id": session.id,
                    "selfie_path": p.selfie_url,
                    "undertone": p.undertone,
                    "depth": p.depth,
                    "contrast": p.contrast,
                    "fitzpatrick": p.fitzpatrick,
                    "skin_age": p.skin_age,
                    "concerns": [c.model_dump() for c in p.concerns],
                    "palette": [c.model_dump() for c in p.palette],
                    "summary": p.summary,
                    "raw": p.raw,
                }
            ).execute()

        self.client.table("candidates").delete().eq("session_id", session.id).execute()
        if session.candidates:
            rows = []
            for c in session.candidates:
                rows.append(
                    {
                        "id": c.id,
                        "session_id": session.id,
                        "image_path": c.image_url,
                        "category": c.category,
                        "label": c.label,
                        "color_features": c.color_features,
                        "rule_score": c.rule_score,
                        "harmony_score": c.harmony_score,
                        "preference_score": c.preference_score,
                        "final_score": c.final_score,
                        "tier": c.tier,
                        "reasons": [r.model_dump() for r in c.reasons],
                        "short_verdict": c.short_verdict,
                        "rank": c.rank,
                        "is_topk": c.is_topk,
                        "vto_status": c.vto_status.value if hasattr(c.vto_status, "value") else c.vto_status,
                        "vto_path": c.vto_url,
                    }
                )
            self.client.table("candidates").insert(rows).execute()
        return session

    def require(self, session_id: str) -> Session:
        session = self.get(session_id)
        if not session:
            raise KeyError(f"Session not found: {session_id}")
        return session

    def list(self) -> list[SessionSummary]:
        rows = self.client.table("sessions").select("id,intent_text,payload,created_at,updated_at").order("updated_at", desc=True).limit(50).execute()
        summaries: list[SessionSummary] = []
        for row in rows.data or []:
            payload = row.get("payload") or {}
            created_at = _parse_datetime(row.get("created_at")) or datetime.utcnow()
            updated_at = _parse_datetime(row.get("updated_at")) or created_at
            summaries.append(
                SessionSummary(
                    id=row["id"],
                    title=(row.get("intent_text") or payload.get("intent_text") or "").strip()[:64] or "Untitled session",
                    candidate_count=len(payload.get("candidates") or []),
                    has_profile=bool(payload.get("profile")),
                    created_at=created_at,
                    updated_at=updated_at,
                )
            )
        return summaries

    def delete(self, session_id: str) -> None:
        self.client.table("candidates").delete().eq("session_id", session_id).execute()
        self.client.table("skin_profiles").delete().eq("session_id", session_id).execute()
        self.client.table("sessions").delete().eq("id", session_id).execute()


def _candidate_from_row(c: dict) -> Candidate:
    return Candidate(
        id=c["id"],
        session_id=c["session_id"],
        image_url=c.get("image_path") or "",
        category=c.get("category") or "clothes",
        label=c.get("label"),
        color_features=c.get("color_features") or {},
        rule_score=c.get("rule_score") or 0,
        harmony_score=c.get("harmony_score") or 0,
        preference_score=c.get("preference_score") or 0,
        final_score=c.get("final_score") or 0,
        tier=c.get("tier") or "mixed",
        reasons=c.get("reasons") or [],
        short_verdict=c.get("short_verdict") or "",
        rank=c.get("rank"),
        is_topk=bool(c.get("is_topk")),
        vto_status=c.get("vto_status") or "none",
        vto_url=c.get("vto_path"),
    )


class FallbackStore:
    """Supabase primary; JSON always written and used if cloud is down."""

    def __init__(self) -> None:
        self.local = JsonSessionStore()
        self.cloud: Optional[SupabaseSessionStore] = None
        from app.core.supabase_client import get_supabase

        client = get_supabase()
        if client:
            self.cloud = SupabaseSessionStore(client)

    def create(self, user_id: Optional[str] = None) -> Session:
        if self.cloud:
            try:
                session = self.cloud.create(user_id)
                self.local.save(session)
                return session
            except Exception as exc:
                logger.warning("Supabase create failed, using local JSON: %s", exc)
        return self.local.create(user_id)

    def get(self, session_id: str) -> Optional[Session]:
        if self.cloud:
            try:
                session = self.cloud.get(session_id)
                if session:
                    try:
                        self.local.save(session)
                    except Exception:
                        pass
                    return session
            except Exception as exc:
                logger.warning("Supabase get failed, using local JSON: %s", exc)
        return self.local.get(session_id)

    def save(self, session: Session) -> Session:
        self.local.save(session)
        if self.cloud:
            try:
                self.cloud.save(session)
            except Exception as exc:
                logger.warning("Supabase save failed, local JSON kept: %s", exc)
        return session

    def require(self, session_id: str) -> Session:
        session = self.get(session_id)
        if not session:
            raise KeyError(f"Session not found: {session_id}")
        return session

    def list(self) -> list[SessionSummary]:
        if self.cloud:
            try:
                return self.cloud.list()
            except Exception as exc:
                logger.warning("Supabase session list failed, using local JSON: %s", exc)
        return self.local.list()

    def delete(self, session_id: str) -> None:
        self.local.delete(session_id)
        if self.cloud:
            try:
                self.cloud.delete(session_id)
            except Exception as exc:
                logger.warning("Supabase session delete failed: %s", exc)


def _parse_datetime(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None
    return None


_store: Optional[FallbackStore] = None


def get_store() -> FallbackStore:
    global _store
    if _store is None:
        _store = FallbackStore()
    return _store


# Back-compat alias
SessionStore = FallbackStore
