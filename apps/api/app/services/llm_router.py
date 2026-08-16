"""LLM router: Groq primary → Gemini fallback. No mock provider."""

from __future__ import annotations

import json
import logging
import re
import base64
from pathlib import Path
from typing import Any, Optional

from app.core.config import get_settings
from app.core.schemas import IntentStruct, SkinProfile

logger = logging.getLogger(__name__)


class LLMError(RuntimeError):
    pass


def clean_model_text(value: Any) -> str:
    """Keep model copy presentation-safe before it enters a user-facing DTO."""
    return re.sub(r"\s+", " ", re.sub(r"#[0-9a-f]{3,8}\b", "that shade", re.sub(r"```(?:json|text|markdown)?|```", "", str(value or ""), flags=re.IGNORECASE))).strip()


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            return json.loads(m.group(0))
        raise


class LLMRouter:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _chat(self, system: str, user: str) -> tuple[str, str]:
        """Returns (content, provider_used). Raises if no provider is configured."""
        if not self.settings.llm_enabled:
            raise LLMError("GROQ_API_KEY or GOOGLE_API_KEY is required. Add it to .env.")

        errors: list[str] = []
        if self.settings.groq_api_key and self.settings.llm_primary == "groq":
            try:
                return self._groq(system, user), "groq"
            except Exception as exc:
                errors.append(f"groq: {exc}")
                logger.warning("Groq failed, trying Gemini: %s", exc)

        if self.settings.google_api_key:
            try:
                return self._gemini(system, user), "gemini"
            except Exception as exc:
                errors.append(f"gemini: {exc}")
                logger.warning("Gemini failed: %s", exc)

        if self.settings.groq_api_key and self.settings.llm_primary != "groq":
            try:
                return self._groq(system, user), "groq"
            except Exception as exc:
                errors.append(f"groq: {exc}")

        raise LLMError(f"All LLM providers failed: {'; '.join(errors)}")

    def _groq(self, system: str, user: str) -> str:
        from langchain_core.messages import HumanMessage, SystemMessage
        from langchain_groq import ChatGroq

        llm = ChatGroq(
            model=self.settings.llm_primary_model,
            api_key=self.settings.groq_api_key,
            temperature=0.3,
        )
        msg = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
        return str(msg.content)

    def _gemini(self, system: str, user: str) -> str:
        from langchain_core.messages import HumanMessage, SystemMessage
        from langchain_google_genai import ChatGoogleGenerativeAI

        llm = ChatGoogleGenerativeAI(
            model=self.settings.llm_fallback_model,
            google_api_key=self.settings.google_api_key,
            temperature=0.3,
        )
        msg = llm.invoke([SystemMessage(content=system), HumanMessage(content=user)])
        return str(msg.content)

    def parse_intent(self, text: str) -> IntentStruct:
        if not text.strip():
            return IntentStruct(raw_text="")
        system = (
            "You extract fashion styling intent as compact JSON with keys: "
            "occasion, formality, color_lean, vibe, constraints (array of strings). "
            "No markdown."
        )
        try:
            content, _provider = self._chat(system, f"User said: {text}")
            data = _extract_json(content)
            return IntentStruct(
                occasion=data.get("occasion"),
                formality=data.get("formality"),
                color_lean=data.get("color_lean"),
                vibe=data.get("vibe"),
                constraints=list(data.get("constraints") or []),
                raw_text=text,
            )
        except Exception as exc:
            logger.warning("Intent parse fell back to keywords: %s", exc)
            return _keyword_intent(text)

    def enrich_reasons(
        self,
        profile: SkinProfile,
        items: list[dict[str, Any]],
        intent_text: str = "",
        preference_text: str = "",
    ) -> list[dict[str, Any]]:
        if not items:
            return []
        if not self.settings.llm_enabled:
            return items
        system = (
            "You are Undertone, a skin-aware stylist. Given a skin profile and ranked garments, "
            "return JSON {\"items\":[{\"id\":\"...\",\"short_verdict\":\"one sentence\","
            "\"extra_reason\":{\"signal\":\"...\",\"direction\":\"support|conflict|neutral\",\"text\":\"...\"}}]}. "
            "Use only the supplied garment color and evidence; never invent a color or quote numeric scores. "
            "No medical claims. No markdown."
        )
        compact_profile = {
            "undertone": profile.undertone,
            "depth": profile.depth,
            "contrast": profile.contrast,
            "concerns": [{"name": c.name, "score": c.score} for c in profile.concerns[:6]],
        }
        user = json.dumps(
            {
                "profile": compact_profile,
                "intent": intent_text,
                "preference": preference_text,
                "items": items,
            }
        )
        try:
            content, _provider = self._chat(system, user)
            data = _extract_json(content)
            by_id = {x["id"]: x for x in data.get("items", []) if "id" in x}
            out = []
            for it in items:
                merged = dict(it)
                extra = by_id.get(it["id"]) or {}
                if extra.get("short_verdict"):
                    merged["short_verdict"] = clean_model_text(extra["short_verdict"])
                if extra.get("extra_reason"):
                    extra_reason = dict(extra["extra_reason"])
                    extra_reason["text"] = clean_model_text(extra_reason.get("text"))
                    merged.setdefault("reasons", [])
                    merged["reasons"] = list(merged["reasons"]) + [extra_reason]
                out.append(merged)
            return out
        except Exception as exc:
            logger.warning("enrich_reasons skipped (rule reasons kept): %s", exc)
            return items

    def inspect_garment(self, image_path: Path) -> dict[str, Any]:
        """Visually verify a garment before language or ranking is generated.

        The deterministic extractor is fast but can mistake white ecommerce
        backdrops for a garment. Vision is used as corroboration, not as the
        scoring engine, and returns a deliberately small JSON contract.
        """
        if not image_path.exists() or not self.settings.llm_enabled:
            return {}
        prompt = (
            "Inspect this ecommerce garment image. Ignore the page/studio background, model skin, "
            "and any white margin. Identify the garment closest to the torso/neckline. Return JSON only: "
            "{\"primary_family\":\"black|white|cream|gray|charcoal|red|orange|yellow|green|teal|navy|blue|purple|pink|brown|unknown\","
            "\"secondary_family\":\"...\",\"garment_type\":\"short phrase\","
            "\"crop_quality\":\"good|background-heavy|unclear\",\"confidence\":0.0}. "
            "Do not give styling advice and do not infer colour from the background."
        )
        image_data = base64.b64encode(image_path.read_bytes()).decode("ascii")
        errors: list[str] = []
        if self.settings.groq_api_key:
            try:
                import httpx

                response = httpx.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self.settings.groq_api_key}"},
                    json={
                        "model": self.settings.vision_primary_model,
                        "temperature": 0,
                        "response_format": {"type": "json_object"},
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": prompt},
                                    {
                                        "type": "image_url",
                                        "image_url": {"url": f"data:image/jpeg;base64,{image_data}"},
                                    },
                                ],
                            }
                        ],
                    },
                    timeout=45,
                )
                response.raise_for_status()
                content = response.json()["choices"][0]["message"]["content"]
                return _normalise_visual_result(_extract_json(str(content)))
            except Exception as exc:
                errors.append(f"groq vision: {exc}")
                logger.warning("Garment vision verification via Groq failed: %s", exc)

        if self.settings.google_api_key:
            try:
                import httpx

                response = httpx.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{self.settings.vision_fallback_model}:generateContent",
                    params={"key": self.settings.google_api_key},
                    json={
                        "contents": [
                            {
                                "parts": [
                                    {"text": prompt},
                                    {"inline_data": {"mime_type": "image/jpeg", "data": image_data}},
                                ]
                            }
                        ],
                        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
                    },
                    timeout=45,
                )
                response.raise_for_status()
                content = response.json()["candidates"][0]["content"]["parts"][0]["text"]
                return _normalise_visual_result(_extract_json(str(content)))
            except Exception as exc:
                errors.append(f"gemini vision: {exc}")
                logger.warning("Garment vision verification via Gemini failed: %s", exc)

        if errors:
            logger.info("Garment visual verification unavailable: %s", "; ".join(errors))
        return {}

    def profile_summary(self, profile: SkinProfile) -> str:
        system = (
            "Write one elegant sentence summarizing a skin-and-color profile "
            "for a fashion app. No markdown."
        )
        user = json.dumps(
            {
                "undertone": profile.undertone,
                "depth": profile.depth,
                "contrast": profile.contrast,
                "top_concerns": [
                    {"name": c.name, "score": c.score}
                    for c in sorted(profile.concerns, key=lambda x: -x.score)[:3]
                ],
            }
        )
        try:
            content, _provider = self._chat(system, user)
            return clean_model_text(content.strip().strip('"'))
        except Exception as exc:
            logger.warning("Profile summary template used: %s", exc)
            top = sorted(profile.concerns, key=lambda x: -x.score)[:2]
            bits = ", ".join(f"{c.name} {int(c.score)}" for c in top) or "balanced skin signals"
            return (
                f"{profile.undertone.capitalize()} undertone, {profile.depth} depth, "
                f"{profile.contrast} contrast — watching {bits}."
            )


def _keyword_intent(text: str) -> IntentStruct:
    t = text.lower()
    occasion = None
    formality = None
    vibe = None
    color_lean = None
    constraints: list[str] = []
    if "date" in t:
        occasion = "date"
        vibe = "romantic"
        formality = "smart-casual"
    if "interview" in t or "work" in t or "office" in t:
        occasion = "work"
        formality = "formal"
    if "wedding" in t:
        occasion = "wedding"
        formality = "formal"
    if "casual" in t:
        formality = "casual"
    for color in ("gold", "red", "blue", "black", "navy", "green", "pink", "white"):
        if color in t:
            color_lean = color
            break
    if "not red" in t or "no red" in t:
        constraints.append("avoid red")
    return IntentStruct(
        occasion=occasion,
        formality=formality,
        color_lean=color_lean,
        vibe=vibe,
        constraints=constraints,
        raw_text=text,
    )


def _normalise_visual_result(result: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "black", "white", "cream", "gray", "charcoal", "red", "orange", "yellow",
        "green", "teal", "navy", "blue", "purple", "pink", "brown", "unknown",
    }
    primary = str(result.get("primary_family") or "unknown").lower().strip()
    secondary = str(result.get("secondary_family") or "unknown").lower().strip()
    try:
        confidence = max(0.0, min(1.0, float(result.get("confidence", 0))))
    except (TypeError, ValueError):
        confidence = 0.0
    return {
        "primary_family": primary if primary in allowed else "unknown",
        "secondary_family": secondary if secondary in allowed else "unknown",
        "garment_type": str(result.get("garment_type") or "garment")[:60],
        "crop_quality": str(result.get("crop_quality") or "unclear"),
        "confidence": confidence,
    }


_router: Optional[LLMRouter] = None


def get_llm() -> LLMRouter:
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router
