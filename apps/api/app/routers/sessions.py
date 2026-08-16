from __future__ import annotations

import io
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from PIL import Image

from app.core.files import resolve_local, save_bytes, save_upload
from app.core.schemas import (
    AnalyzeRequest,
    Candidate,
    ColorSwatch,
    ConcernScore,
    IntentUpdate,
    PreferenceUpdate,
    Session,
    SessionCreateResponse,
    SessionSummary,
    SkinProfile,
    VtoStatus,
    WorkspaceResponse,
)
from app.core.store import get_store
from app.graph.pipeline import run_fusion_pipeline
from app.services.color_extract import extract_garment_colors
from app.services.demo_assets import build_demo_garments, build_demo_selfie
from app.services.llm_router import get_llm
from app.youcam.client import YouCamError, get_youcam_client, normalize_profile_bundle

router = APIRouter(tags=["sessions"])


def _demo_profile(session_id: str, selfie_url: str) -> SkinProfile:
    """Stable local profile used only when the optional live demo call is unavailable."""
    return SkinProfile(
        session_id=session_id,
        selfie_url=selfie_url,
        undertone="warm",
        depth="medium",
        contrast="medium",
        fitzpatrick="III",
        skin_age=28,
        concerns=[
            ConcernScore(name="redness", score=34, severity="low"),
            ConcernScore(name="radiance", score=74, severity="low"),
            ConcernScore(name="texture", score=30, severity="low"),
        ],
        palette=[
            ColorSwatch(role="skin", hex="#E2BCA4", label="Warm medium skin"),
            ColorSwatch(role="hair", hex="#3A2A22", label="Deep brown hair"),
            ColorSwatch(role="eye", hex="#4A332A", label="Warm brown eyes"),
            ColorSwatch(role="lip", hex="#B06262", label="Muted rose lip"),
        ],
        summary="A warm, medium-depth color signature with balanced contrast and a naturally healthy glow.",
        raw={"source": "local_demo_fixture"},
    )


@router.post("/sessions", response_model=SessionCreateResponse)
async def create_session():
    session = get_store().create()
    return SessionCreateResponse(id=session.id, created_at=session.created_at)


@router.get("/sessions", response_model=list[SessionSummary])
async def list_sessions():
    return get_store().list()


@router.get("/sessions/{session_id}", response_model=Session)
async def get_session(session_id: str):
    try:
        return get_store().require(session_id)
    except KeyError:
        raise HTTPException(404, "Session not found")


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    store = get_store()
    try:
        session = store.require(session_id)
    except KeyError:
        raise HTTPException(404, "Session not found")

    media_urls = [session.profile.selfie_url] if session.profile else []
    media_urls.extend(url for candidate in session.candidates for url in (candidate.image_url, candidate.vto_url) if url)
    for url in media_urls:
        path = resolve_local(url)
        if path and path.is_file():
            try:
                path.unlink()
            except OSError:
                pass
    store.delete(session_id)
    return {"deleted": True, "id": session_id}


@router.get("/sessions/{session_id}/workspace", response_model=WorkspaceResponse)
async def workspace(session_id: str):
    try:
        session = get_store().require(session_id)
    except KeyError:
        raise HTTPException(404, "Session not found")
    return WorkspaceResponse(session=session)


@router.post("/sessions/{session_id}/profile", response_model=SkinProfile)
async def create_profile(session_id: str, file: UploadFile = File(...)):
    store = get_store()
    try:
        session = store.require(session_id)
    except KeyError:
        raise HTTPException(404, "Session not found")

    url, path = await save_upload("selfies", file)
    client = get_youcam_client()
    try:
        bundle = await client.full_profile_bundle(path)
    except YouCamError as exc:
        raise HTTPException(502, f"YouCam profile failed: {exc}") from exc
    norm = normalize_profile_bundle(bundle)
    if not norm["concerns"] and not norm["palette"]:
        detail = "; ".join(bundle.get("partial_errors") or ["YouCam returned no skin or color data"])
        raise HTTPException(502, f"YouCam profile failed: {detail}")

    profile = SkinProfile(
        session_id=session_id,
        selfie_url=url,
        undertone=norm["undertone"],
        depth=norm["depth"],
        contrast=norm["contrast"],
        fitzpatrick=norm.get("fitzpatrick"),
        skin_age=norm.get("skin_age"),
        concerns=norm["concerns"],
        palette=norm["palette"],
        raw=norm.get("raw") or bundle,
    )
    profile.summary = get_llm().profile_summary(profile)
    session.profile = profile
    session.events.append("Skin profile built from selfie")
    store.save(session)
    return profile


@router.put("/sessions/{session_id}/intent", response_model=Session)
async def set_intent(session_id: str, body: IntentUpdate):
    store = get_store()
    try:
        session = store.require(session_id)
    except KeyError:
        raise HTTPException(404, "Session not found")
    session.intent_text = body.text
    session.intent = get_llm().parse_intent(body.text)
    session.events.append(f"Intent set: {body.text[:80]}")
    store.save(session)
    return session


@router.put("/sessions/{session_id}/preference", response_model=Session)
async def set_preference(session_id: str, body: PreferenceUpdate):
    store = get_store()
    try:
        session = store.require(session_id)
    except KeyError:
        raise HTTPException(404, "Session not found")
    session.preference_text = body.text
    session.events.append(f"Preference: {body.text[:80]}")
    store.save(session)
    if session.candidates and session.profile:
        session = await run_fusion_pipeline(session_id)
    return session


@router.post("/sessions/{session_id}/candidates", response_model=Session)
async def add_candidates(
    session_id: str,
    files: list[UploadFile] = File(...),
    category: str = Form("clothes"),
):
    store = get_store()
    try:
        session = store.require(session_id)
    except KeyError:
        raise HTTPException(404, "Session not found")

    from app.core.config import get_settings

    settings = get_settings()
    remaining = settings.max_candidates - len(session.candidates)
    if remaining <= 0:
        raise HTTPException(400, f"Max {settings.max_candidates} candidates per session")

    for upload in files[:remaining]:
        url, path = await save_upload("garments", upload)
        features = extract_garment_colors(path)
        cand = Candidate(
            id=str(uuid.uuid4()),
            session_id=session_id,
            image_url=url,
            category=category,
            label=upload.filename,
            color_features=features,
        )
        session.candidates.append(cand)
        session.events.append(f"Added garment {upload.filename or cand.id[:8]}")

    store.save(session)
    return session


@router.post("/sessions/{session_id}/candidates/crop", response_model=Session)
async def add_cropped_candidate(
    session_id: str,
    file: UploadFile = File(...),
    x: float = Form(...),
    y: float = Form(...),
    width: float = Form(...),
    height: float = Form(...),
    category: str = Form("clothes"),
):
    """Crop box values are ratios 0–1 relative to image size."""
    store = get_store()
    try:
        session = store.require(session_id)
    except KeyError:
        raise HTTPException(404, "Session not found")

    from app.core.config import get_settings

    settings = get_settings()
    if len(session.candidates) >= settings.max_candidates:
        raise HTTPException(400, f"Max {settings.max_candidates} candidates per session")

    raw = await file.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = img.size
    left = int(max(0, min(w - 1, x * w)))
    top = int(max(0, min(h - 1, y * h)))
    right = int(max(left + 1, min(w, (x + width) * w)))
    bottom = int(max(top + 1, min(h, (y + height) * h)))
    cropped = img.crop((left, top, right, bottom))
    buf = io.BytesIO()
    cropped.save(buf, format="JPEG", quality=92)
    url, path = await save_bytes("garments", buf.getvalue(), ".jpg")
    features = extract_garment_colors(path)
    cand = Candidate(
        id=str(uuid.uuid4()),
        session_id=session_id,
        image_url=url,
        category=category,
        label="cropped",
        color_features=features,
    )
    session.candidates.append(cand)
    session.events.append("Added cropped garment")
    store.save(session)
    return session


@router.post("/sessions/{session_id}/analyze", response_model=Session)
async def analyze(session_id: str, body: AnalyzeRequest | None = None):
    body = body or AnalyzeRequest()
    try:
        get_store().require(session_id)
    except KeyError:
        raise HTTPException(404, "Session not found")
    try:
        return await run_fusion_pipeline(
            session_id,
            top_k=body.top_k,
            force_vto=body.force_vto,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except YouCamError as exc:
        raise HTTPException(502, f"YouCam analyze failed: {exc}") from exc
    except Exception as exc:
        raise HTTPException(500, f"Analyze failed: {exc}")


@router.post("/candidates/{candidate_id}/vto", response_model=Session)
async def force_candidate_vto(candidate_id: str, session_id: str):
    """Promote a non-Top-K item to VTO on demand."""
    store = get_store()
    try:
        session = store.require(session_id)
    except KeyError:
        raise HTTPException(404, "Session not found")

    cand = next((c for c in session.candidates if c.id == candidate_id), None)
    if not cand:
        raise HTTPException(404, "Candidate not found")
    cand.is_topk = True
    cand.vto_status = VtoStatus.queued
    store.save(session)
    return await run_fusion_pipeline(session_id, force_vto=False)


@router.delete("/sessions/{session_id}/candidates/{candidate_id}", response_model=Session)
async def delete_candidate(session_id: str, candidate_id: str):
    store = get_store()
    try:
        session = store.require(session_id)
    except KeyError:
        raise HTTPException(404, "Session not found")
    before = len(session.candidates)
    session.candidates = [c for c in session.candidates if c.id != candidate_id]
    if len(session.candidates) == before:
        raise HTTPException(404, "Candidate not found")
    session.events.append(f"Removed candidate {candidate_id[:8]}")
    store.save(session)
    return session


@router.post("/sessions/{session_id}/demo", response_model=Session)
async def seed_demo(session_id: str, run_analyze: bool = True):
    """
    One-click demo using the canonical real selfie and two real garments.
    Optional full analysis lets judges open a finished workspace immediately.
    """
    store = get_store()
    try:
        session = store.require(session_id)
    except KeyError:
        raise HTTPException(404, "Session not found")

    # Profile from the canonical real demo selfie.
    selfie_bytes = build_demo_selfie()
    url, path = await save_bytes("selfies", selfie_bytes, ".jpg")
    client = get_youcam_client()
    try:
        bundle = await client.full_profile_bundle(path)
        norm = normalize_profile_bundle(bundle)
        if not norm["concerns"] and not norm["palette"]:
            raise YouCamError("YouCam returned no profile signals for the local demo portrait")
        profile = SkinProfile(
            session_id=session_id,
            selfie_url=url,
            undertone=norm["undertone"],
            depth=norm["depth"],
            contrast=norm["contrast"],
            fitzpatrick=norm.get("fitzpatrick"),
            skin_age=norm.get("skin_age"),
            concerns=norm["concerns"],
            palette=norm["palette"],
            raw=norm.get("raw") or bundle,
        )
        profile.summary = get_llm().profile_summary(profile)
    except Exception as exc:
        # The demo must remain filmable when API credentials, quota, or face
        # detection are unavailable. Real user uploads still use the strict
        # live endpoint above.
        session.events.append(f"Live demo profile unavailable; used local profile ({type(exc).__name__})")
        profile = _demo_profile(session_id, url)
    session.profile = profile

    # Reset candidates and load the same real garments shown in the product story.
    session.candidates = []
    from app.core.config import get_settings

    settings = get_settings()
    for label, data in build_demo_garments()[: settings.max_candidates]:
        gurl, gpath = await save_bytes("garments", data, ".jpg")
        features = extract_garment_colors(gpath)
        cand = Candidate(
            id=str(uuid.uuid4()),
            session_id=session_id,
            image_url=gurl,
            category="clothes",
            label=label,
            color_features=features,
        )
        session.candidates.append(cand)

    # Default date-night intent for a filmable path
    intent_text = "going on a date tomorrow night, want something soft and elegant"
    session.intent_text = intent_text
    session.intent = get_llm().parse_intent(intent_text)
    session.preference_text = ""
    session.guidance = None
    session.events.append("Demo pack loaded (canonical real selfie + 2 garments)")
    store.save(session)

    if run_analyze:
        session = await run_fusion_pipeline(session_id)
    return session
