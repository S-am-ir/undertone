"""Lean fusion pipeline. Uses LangGraph when available; falls back to sequential."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any, Optional, TypedDict

from app.core.config import get_settings
from app.core.files import resolve_local, save_bytes
from app.core.schemas import (
    Candidate,
    Guidance,
    ReasonItem,
    Session,
    VtoStatus,
)
from app.core.store import get_store
from app.services.llm_router import clean_model_text, get_llm
from app.services.color_extract import extract_garment_colors
from app.services.scoring import (
    blend_final,
    build_evidence_meters,
    build_guidance,
    pairwise_summary,
    score_garment,
    verdict_title,
)
from app.youcam.client import get_youcam_client

logger = logging.getLogger(__name__)


def _color_lean(family: str) -> tuple[bool, bool]:
    warm = family in {"red", "orange", "yellow", "cream", "pink", "brown"}
    cool = family in {"blue", "navy", "purple", "teal", "gray", "charcoal", "pink"}
    return warm, cool


async def _refresh_visual_evidence(session: Session) -> Session:
    """Refresh image evidence before scoring, including older saved sessions."""
    if not session.candidates:
        return session
    llm = get_llm()

    async def inspect(cand: Candidate) -> None:
        path = resolve_local(cand.image_url)
        if not path:
            return
        try:
            # Re-run local extraction so old sessions are repaired when their
            # images are available, rather than keeping a stale "white" read.
            features = extract_garment_colors(path)
            previous = cand.color_features or {}
            if previous.get("vision"):
                features["vision"] = previous["vision"]
            visual = features.get("vision") or await asyncio.to_thread(llm.inspect_garment, path)
            if visual:
                features["vision"] = visual
                family = str(visual.get("primary_family") or "unknown")
                confidence = float(visual.get("confidence") or 0)
                current = str(features.get("primary_family") or "unknown")
                if confidence >= 0.62 and family != "unknown":
                    features["primary_family"] = family
                    features["secondary_family"] = str(visual.get("secondary_family") or features.get("secondary_family") or family)
                    warm, cool = _color_lean(family)
                    features["warm_lean"] = warm
                    features["cool_lean"] = cool
                    features["color_source"] = "vision"
                elif current:
                    features["color_source"] = "pixel-analysis"
            cand.color_features = features
        except Exception as exc:
            logger.warning("Visual evidence refresh failed for %s: %s", cand.id, exc)

    await asyncio.gather(*(inspect(c) for c in session.candidates))
    return session


class FusionState(TypedDict, total=False):
    session_id: str
    top_k: int
    force_vto: bool
    session: dict
    error: str


def _score_all(session: Session) -> Session:
    if not session.profile:
        return session
    profile = session.profile
    for cand in session.candidates:
        rule, harmony, pref, tier, reasons, short = score_garment(
            profile,
            cand.color_features,
            session.intent,
            session.preference_text,
        )
        cand.rule_score = rule
        cand.harmony_score = harmony
        cand.preference_score = pref
        cand.tier = tier
        cand.reasons = reasons
        cand.short_verdict = short
        cand.final_score = blend_final(rule, pref, bool(session.preference_text.strip()))
        family = str(cand.color_features.get("primary_family") or "neutral")
        cand.verdict_title = verdict_title(tier, family)
        cand.evidence = build_evidence_meters(
            profile,
            cand.color_features,
            cand.final_score,
            harmony,
            session.intent,
        )
    return session


def _llm_enrich(session: Session) -> Session:
    if not session.profile or not session.candidates:
        return session
    llm = get_llm()
    payload = []
    for c in session.candidates:
        payload.append(
            {
                "id": c.id,
                "family": c.color_features.get("primary_family"),
                "hex": c.color_features.get("primary_hex"),
                "final_score": c.final_score,
                "tier": c.tier,
                "reasons": [r.model_dump() for r in c.reasons],
                "short_verdict": c.short_verdict,
            }
        )
    enriched = llm.enrich_reasons(
        session.profile,
        payload,
        session.intent_text,
        session.preference_text,
    )
    by_id = {e["id"]: e for e in enriched}
    for c in session.candidates:
        e = by_id.get(c.id)
        if not e:
            continue
        # Keep the deterministic verdict as the source of truth. The language
        # model may polish supporting reasons, but it must not replace a
        # profile-backed decision with a vague or visually ungrounded claim.
        extra_reasons = e.get("reasons") or []
        # keep rule reasons; append polished extras if new
        existing = {(r.signal, r.text) for r in c.reasons}
        for er in extra_reasons:
            if not isinstance(er, dict):
                continue
            er = dict(er)
            er["text"] = clean_model_text(er.get("text"))
            key = (er.get("signal", ""), er.get("text", ""))
            if key in existing or not er.get("text"):
                continue
            try:
                c.reasons.append(ReasonItem.model_validate(er))
            except Exception:
                pass
    return session


def _select_topk(session: Session, k: int) -> Session:
    ordered = sorted(session.candidates, key=lambda c: c.final_score, reverse=True)
    for i, c in enumerate(ordered):
        c.rank = i + 1
        c.is_topk = i < k
    # preserve list but ranked meta set
    id_order = {c.id: c for c in ordered}
    session.candidates = [id_order[c.id] for c in session.candidates]
    # actually sort candidates by rank for API convenience
    session.candidates = sorted(session.candidates, key=lambda c: c.rank or 999)
    if len(session.candidates) >= 2:
        winner, runner_up = session.candidates[0], session.candidates[1]
        session.comparison_summary = pairwise_summary(winner, runner_up)
        winner.comparison_note = session.comparison_summary
        runner_up.comparison_note = f"Compared with {winner.color_features.get('primary_family') or 'the leading option'}, this is the tradeoff: {runner_up.short_verdict}"
    else:
        session.comparison_summary = ""
    return session


async def _vto_topk(session: Session, force_vto: bool = False) -> Session:
    if not session.profile:
        return session
    person = resolve_local(session.profile.selfie_url)
    if not person:
        logger.warning("Selfie path missing for VTO")
        return session
    client = get_youcam_client()
    for cand in session.candidates:
        if not cand.is_topk and not force_vto:
            continue
        if cand.vto_status == VtoStatus.ready and cand.vto_url and not force_vto:
            continue
        garment = resolve_local(cand.image_url)
        if not garment:
            cand.vto_status = VtoStatus.error
            cand.vto_error = "Garment file missing"
            continue
        cand.vto_status = VtoStatus.running
        try:
            result = await client.vto_apparel(person, garment, cand.category or "clothes")
            stored = await _persist_vto_image(result)
            if stored:
                cand.vto_url = stored
                cand.vto_status = VtoStatus.ready
            else:
                cand.vto_status = VtoStatus.error
                cand.vto_error = "No VTO image in YouCam response"
        except Exception as exc:
            logger.exception("VTO failed for %s", cand.id)
            cand.vto_status = VtoStatus.error
            cand.vto_error = str(exc)
    return session


def _first_url(node: Any) -> str | None:
    if not isinstance(node, dict):
        return None
    for key in ("result_url", "url", "image_url", "file_url", "output_url"):
        val = node.get(key)
        if isinstance(val, str) and val.startswith("http"):
            return val
    output = node.get("output")
    if isinstance(output, str) and output.startswith("http"):
        return output
    if isinstance(output, dict):
        return _first_url(output)
    data = node.get("data")
    if isinstance(data, dict):
        return _first_url(data)
    results = node.get("results") or node.get("files")
    if isinstance(results, dict):
        return _first_url(results)
    if isinstance(results, list) and results:
        return _first_url(results[0]) if isinstance(results[0], dict) else None
    return None


async def _persist_vto_image(result: dict) -> str | None:
    raw = result.get("image_bytes")
    if isinstance(raw, (bytes, bytearray)) and raw:
        url, _ = await save_bytes("vtos", bytes(raw), ".jpg")
        return url
    remote = _first_url(result)
    if not remote:
        return None
    import httpx

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.get(remote)
        r.raise_for_status()
        url, _ = await save_bytes("vtos", r.content, ".jpg")
        return url


def _guidance(session: Session) -> Session:
    settings = get_settings()
    if not session.profile:
        return session
    g = build_guidance(session.profile, session.candidates, settings.weak_score_threshold)
    session.guidance = Guidance.model_validate(g)
    return session


async def run_fusion_pipeline(
    session_id: str,
    top_k: Optional[int] = None,
    force_vto: bool = False,
) -> Session:
    settings = get_settings()
    k = top_k or settings.vto_top_k
    store = get_store()
    session = store.require(session_id)

    if not session.profile:
        raise ValueError("Create a skin profile before analyzing garments")
    if not session.candidates:
        session.events.append("Analyze called with no candidates")
        store.save(session)
        return session

    session = await _refresh_visual_evidence(session)

    # Prefer LangGraph if import works; otherwise sequential
    try:
        session = await _run_langgraph(session, k, force_vto)
    except Exception as exc:
        logger.warning("LangGraph path failed (%s); using sequential", exc)
        session = _score_all(session)
        session = _llm_enrich(session)
        # re-blend after enrich (scores already set)
        for c in session.candidates:
            c.final_score = blend_final(
                c.rule_score, c.preference_score, bool(session.preference_text.strip())
            )
        session = _select_topk(session, k)
        session = await _vto_topk(session, force_vto=force_vto)
        session = _guidance(session)

    session.events.append(
        f"Analyzed {len(session.candidates)} candidates · Top-{k} VTO · "
        f"best score {max((c.final_score for c in session.candidates), default=0):.0f}"
    )
    store.save(session)
    return session


async def _run_langgraph(session: Session, k: int, force_vto: bool) -> Session:
    from langgraph.graph import END, StateGraph

    store_box: dict[str, Session] = {"s": session}

    def node_score(state: FusionState) -> FusionState:
        store_box["s"] = _score_all(store_box["s"])
        return state

    def node_llm(state: FusionState) -> FusionState:
        store_box["s"] = _llm_enrich(store_box["s"])
        s = store_box["s"]
        for c in s.candidates:
            c.final_score = blend_final(
                c.rule_score, c.preference_score, bool(s.preference_text.strip())
            )
        return state

    def node_topk(state: FusionState) -> FusionState:
        store_box["s"] = _select_topk(store_box["s"], state.get("top_k") or k)
        return state

    async def node_vto(state: FusionState) -> FusionState:
        store_box["s"] = await _vto_topk(store_box["s"], force_vto=bool(state.get("force_vto")))
        return state

    def node_guide(state: FusionState) -> FusionState:
        store_box["s"] = _guidance(store_box["s"])
        return state

    g = StateGraph(FusionState)
    g.add_node("score", node_score)
    g.add_node("llm", node_llm)
    g.add_node("topk", node_topk)
    g.add_node("vto", node_vto)
    g.add_node("guide", node_guide)
    g.set_entry_point("score")
    g.add_edge("score", "llm")
    g.add_edge("llm", "topk")
    g.add_edge("topk", "vto")
    g.add_edge("vto", "guide")
    g.add_edge("guide", END)
    app = g.compile()
    await app.ainvoke(
        {
            "session_id": session.id,
            "top_k": k,
            "force_vto": force_vto,
        }
    )
    return store_box["s"]
