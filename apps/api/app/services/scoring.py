"""Deterministic fusion rules — skin profile changes garment scores."""

from __future__ import annotations

from typing import Any, Optional

from app.core.schemas import Candidate, EvidenceMeter, IntentStruct, ReasonItem, SkinProfile


def _concern_map(profile: SkinProfile) -> dict[str, float]:
    return {c.name.lower(): c.score for c in profile.concerns}


def score_garment(
    profile: SkinProfile,
    color_features: dict[str, Any],
    intent: Optional[IntentStruct] = None,
    preference_text: str = "",
) -> tuple[float, float, float, str, list[ReasonItem], str]:
    """
    Returns:
      rule_score, harmony_score, preference_score, tier, reasons, short_verdict
    """
    reasons: list[ReasonItem] = []
    harmony = 70.0
    family = str(color_features.get("primary_family") or "gray")
    sat = float(color_features.get("saturation") or 0.3)
    value = float(color_features.get("value") or 0.5)
    warm = bool(color_features.get("warm_lean"))
    cool = bool(color_features.get("cool_lean"))
    concerns = _concern_map(profile)

    # Undertone harmony
    if profile.undertone == "cool":
        if cool and family not in {"orange", "yellow"}:
            harmony += 12
            reasons.append(
                ReasonItem(
                    signal="undertone",
                    direction="support",
                    text=f"Cool undertone pairs cleanly with {family} tones.",
                )
            )
        elif warm and family in {"orange", "yellow", "red", "pink"}:
            harmony -= 16
            reasons.append(
                ReasonItem(
                    signal="undertone",
                    direction="conflict",
                    text=f"Warm {family} can fight a cool undertone near the face.",
                )
            )
    elif profile.undertone == "warm":
        if warm:
            harmony += 12
            reasons.append(
                ReasonItem(
                    signal="undertone",
                    direction="support",
                    text=f"Warm undertone is flattered by {family}.",
                )
            )
        elif cool and family in {"blue", "navy", "purple"} and sat > 0.45:
            harmony -= 10
            reasons.append(
                ReasonItem(
                    signal="undertone",
                    direction="conflict",
                    text=f"Icy high-sat {family} can wash warm skin.",
                )
            )
    else:
        harmony += 4
        reasons.append(
            ReasonItem(
                signal="undertone",
                direction="neutral",
                text="Neutral undertone keeps a wider color band open.",
            )
        )

    # Redness modifier
    redness = concerns.get("redness", 40)
    if redness >= 60:
        if family in {"red", "orange", "pink"} and sat > 0.35:
            harmony -= 14
            reasons.append(
                ReasonItem(
                    signal="redness",
                    direction="conflict",
                    text="Elevated redness today — hot reds/pinks near the face amplify it.",
                )
            )
        elif family in {"blue", "green", "teal", "navy", "gray", "cream"}:
            harmony += 10
            reasons.append(
                ReasonItem(
                    signal="redness",
                    direction="support",
                    text="Softer cool/neutral tones calm elevated redness.",
                )
            )

    # Radiance / dullness (high radiance score in some APIs = good; we treat low as dull)
    radiance = concerns.get("radiance", 50)
    # YouCam radiance: treat low as dull; mid-high as healthy glow
    if radiance <= 40:
        if family in {"gray", "cream", "beige"} and sat < 0.2:
            harmony -= 8
            reasons.append(
                ReasonItem(
                    signal="radiance",
                    direction="conflict",
                    text="Low radiance + muddy neutrals can flatten the face further.",
                )
            )
        elif 0.25 <= sat <= 0.65 and value > 0.35:
            harmony += 8
            reasons.append(
                ReasonItem(
                    signal="radiance",
                    direction="support",
                    text="Clean mid-value color adds life when radiance is low.",
                )
            )

    # Depth / value
    if profile.depth == "light" and value < 0.18 and sat < 0.2:
        harmony -= 6
        reasons.append(
            ReasonItem(
                signal="depth",
                direction="conflict",
                text="Very dark low-sat pieces can overpower light depth without contrast planning.",
            )
        )
    if profile.depth == "deep" and value > 0.85 and sat < 0.15:
        harmony -= 6
        reasons.append(
            ReasonItem(
                signal="depth",
                direction="conflict",
                text="Washed pale neutrals can read dull on deeper skin.",
            )
        )

    # Contrast
    if profile.contrast == "high" and sat > 0.5:
        harmony += 5
        reasons.append(
            ReasonItem(
                signal="contrast",
                direction="support",
                text="High facial contrast supports stronger garment color.",
            )
        )
    if profile.contrast == "low" and sat > 0.7:
        harmony -= 6
        reasons.append(
            ReasonItem(
                signal="contrast",
                direction="conflict",
                text="Very loud saturation can overwhelm low facial contrast.",
            )
        )

    harmony = max(5.0, min(98.0, harmony))

    # Preference axis
    pref = 50.0
    pref_l = (preference_text or "").lower()
    if pref_l:
        hits = 0
        for token in [family, color_features.get("primary_hex", ""), *(preference_text.lower().split())]:
            t = str(token).lower().lstrip("#")
            if t and t in pref_l:
                hits += 1
        # color word match
        color_words = [
            "gold", "red", "blue", "green", "black", "white", "navy", "pink",
            "purple", "orange", "yellow", "cream", "gray", "grey", "brown", "olive",
        ]
        for w in color_words:
            if w in pref_l and (w == family or w in family):
                hits += 2
                reasons.append(
                    ReasonItem(
                        signal="preference",
                        direction="support",
                        text=f"Matches your stated lean toward {w}.",
                    )
                )
        pref = min(95.0, 45 + hits * 12)

    # Intent soft boost
    intent_boost = 0.0
    if intent:
        blob = " ".join(
            filter(
                None,
                [
                    intent.occasion,
                    intent.formality,
                    intent.vibe,
                    intent.color_lean,
                    " ".join(intent.constraints or []),
                ],
            )
        ).lower()
        if "formal" in blob or "interview" in blob or "work" in blob:
            if family in {"navy", "black", "gray", "charcoal", "cream", "white"}:
                intent_boost += 6
        if "date" in blob or "romantic" in blob or "evening" in blob:
            if family in {"red", "pink", "purple", "navy", "black"} or sat > 0.35:
                intent_boost += 5
        if intent.color_lean and intent.color_lean.lower() in family:
            intent_boost += 8

    rule_score = max(5.0, min(98.0, harmony + intent_boost * 0.5))
    # final blend later in preference node; here expose components
    # Keep the preview tier aligned with the score the pipeline persists. The
    # old split made good looks read as "mixed" in the UI even when their
    # stored final score was already strong.
    final_preview = (
        0.55 * rule_score + 0.45 * pref
        if preference_text.strip()
        else 0.85 * rule_score + 0.15 * pref
    )

    tier = "strong" if final_preview >= 72 else "caution" if final_preview < 55 else "mixed"
    short = _short_verdict(tier, family, profile, reasons)
    return rule_score, harmony, pref, tier, reasons[:5], short


def _clamp(value: float) -> float:
    return round(max(8.0, min(98.0, value)), 1)


def build_evidence_meters(
    profile: SkinProfile,
    color_features: dict[str, Any],
    rule_score: float,
    harmony_score: float,
    intent: Optional[IntentStruct] = None,
) -> list[EvidenceMeter]:
    """Turn the deterministic fusion evidence into user-facing dimensions.

    These are not YouCam-native garment scores. They are our transparent
    interpretation of YouCam profile signals plus measured garment color.
    """
    family = str(color_features.get("primary_family") or "neutral")
    sat = float(color_features.get("saturation") or 0.3)
    value = float(color_features.get("value") or 0.5)
    concerns = _concern_map(profile)
    meters: list[EvidenceMeter] = []

    color_tone = "positive" if harmony_score >= 74 else "caution" if harmony_score < 58 else "balanced"
    meters.append(
        EvidenceMeter(
            key="color_relationship",
            label="Color relationship",
            score=_clamp(harmony_score),
            tone=color_tone,
            detail=(
                f"{family.capitalize()} sits comfortably with your {profile.undertone} undertone."
                if color_tone == "positive"
                else f"{family.capitalize()} creates a more nuanced relationship with your {profile.undertone} undertone."
            ),
        )
    )

    contrast_score = 58.0
    if profile.contrast == "high":
        contrast_score += 20 if sat >= 0.42 or value < 0.25 else 4
    elif profile.contrast == "low":
        contrast_score += 18 if sat < 0.58 else -8
    else:
        contrast_score += 12 if 0.18 <= sat <= 0.72 else 2
    meters.append(
        EvidenceMeter(
            key="face_contrast",
            label="Face-to-garment contrast",
            score=_clamp(contrast_score),
            tone="positive" if contrast_score >= 72 else "caution" if contrast_score < 52 else "balanced",
            detail=(
                f"The value and intensity give your {profile.contrast}-contrast coloring enough definition."
                if contrast_score >= 72
                else "The color may need styling support so it does not overpower or flatten your natural contrast."
            ),
        )
    )

    redness = concerns.get("redness", 40.0)
    radiance = concerns.get("radiance", 60.0)
    complexion_score = 70.0
    if redness >= 60 and family in {"red", "orange", "pink"} and sat > 0.35:
        complexion_score -= 22
    elif redness >= 60 and family in {"blue", "green", "teal", "navy", "gray", "cream"}:
        complexion_score += 12
    if radiance <= 40 and 0.25 <= sat <= 0.68 and value > 0.35:
        complexion_score += 8
    meters.append(
        EvidenceMeter(
            key="complexion_effect",
            label="Complexion effect",
            score=_clamp(complexion_score),
            tone="positive" if complexion_score >= 72 else "caution" if complexion_score < 52 else "balanced",
            detail=(
                "The color gives the face a calmer, clearer frame today."
                if complexion_score >= 72
                else "The color may pull attention toward the complexion, especially near the face."
                if complexion_score < 52
                else "The effect is fairly balanced against today’s visible skin signals."
            ),
        )
    )

    if intent and any((intent.occasion, intent.formality, intent.vibe, intent.color_lean)):
        meters.append(
            EvidenceMeter(
                key="moment_fit",
                label="Moment fit",
                score=_clamp(rule_score + 4),
                tone="positive" if rule_score >= 72 else "caution" if rule_score < 55 else "balanced",
                detail="This read uses the occasion and mood you gave Undertone, not a generic dress code label.",
            )
        )
    return meters


def verdict_title(tier: str, family: str) -> str:
    if tier == "strong":
        return f"{family.capitalize()} is a strong direction"
    if tier == "caution":
        return f"{family.capitalize()} needs a little more thought"
    return f"{family.capitalize()} is a considered option"


def pairwise_summary(winner: Candidate, runner_up: Candidate) -> str:
    winner_family = str(winner.color_features.get("primary_family") or "this color")
    runner_family = str(runner_up.color_features.get("primary_family") or "the other option")
    winner_support = next((r.text for r in winner.reasons if r.direction == "support"), "")
    runner_conflict = next((r.text for r in runner_up.reasons if r.direction == "conflict"), "")
    if winner_support and runner_conflict:
        support = winner_support.rstrip(".!?")
        conflict = runner_conflict.rstrip(".!?")
        return (
            f"{winner_family.capitalize()} edges out {runner_family} because "
            f"{support[0].lower() + support[1:]}. The tradeoff is that "
            f"{conflict[0].lower() + conflict[1:]}"
        )
    delta = abs(winner.final_score - runner_up.final_score)
    if delta < 4:
        return f"These are close. {winner_family.capitalize()} leads by a narrow margin, so the choice comes down to the mood you want."
    return f"{winner_family.capitalize()} gives the clearer overall read on your profile than {runner_family}."


def blend_final(harmony_or_rule: float, preference_score: float, has_preference: bool) -> float:
    if has_preference:
        return round(0.55 * harmony_or_rule + 0.45 * preference_score, 2)
    return round(0.85 * harmony_or_rule + 0.15 * preference_score, 2)


def _short_verdict(
    tier: str, family: str, profile: SkinProfile, reasons: list[ReasonItem]
) -> str:
    conflict = next((r for r in reasons if r.direction == "conflict"), None)
    support = next((r for r in reasons if r.direction == "support"), None)
    if tier == "strong":
        base = f"Strong match — {family} works with your {profile.undertone} undertone"
        if support:
            return f"{base}. {support.text}"
        return base + "."
    if tier == "caution":
        if conflict:
            return f"Caution — {conflict.text}"
        return f"Caution — {family} is a weaker fit for your coloring today."
    if support and conflict:
        return f"Mixed — {support.text} But {conflict.text[0].lower() + conflict.text[1:]}"
    return f"Mixed fit for {family} on your profile today."


def build_guidance(
    profile: SkinProfile,
    candidates: list[Candidate],
    threshold: float = 55.0,
) -> dict[str, Any]:
    if not candidates:
        return {
            "needed": True,
            "headline": "Add a garment you're considering",
            "tips": [
                "Crop or upload 1–3 pieces you're actually deciding between.",
                f"With your {profile.undertone} undertone, start with colors that support it.",
            ],
        }
    top = max(c.final_score for c in candidates)
    if top >= threshold:
        return {"needed": False, "headline": "", "tips": []}

    tips: list[str] = []
    if profile.undertone == "cool":
        tips.append("Look for cooler mid-tones: soft navy, emerald, blue-red, silver-leaning neutrals.")
    elif profile.undertone == "warm":
        tips.append("Lean warm: terracotta, olive, soft gold, cream, warm neutrals.")
    else:
        tips.append("You can wear both camps — prefer balanced mid-tones over extremes.")

    redness = next((c.score for c in profile.concerns if c.name == "redness"), 0)
    if redness >= 60:
        tips.append("Redness is elevated today — keep high-sat warm reds away from the face.")

    tips.append("If you love a clashing color, choose a softer saturation or wear it lower on the body.")

    return {
        "needed": True,
        "headline": "None of these are ideal — here's a better direction",
        "tips": tips,
    }
