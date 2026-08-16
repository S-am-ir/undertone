from app.core.schemas import Candidate, ConcernScore, SkinProfile
from app.services.demo_assets import DEMO_FILES, build_demo_garments, build_demo_selfie
from app.services.scoring import build_guidance, score_garment


def test_demo_assets_generate():
    selfie = build_demo_selfie()
    garments = build_demo_garments()
    assert len(selfie) > 1000
    assert len(garments) == len(DEMO_FILES) - 1
    assert all(len(data) > 500 for _, data in garments)


def test_guidance_when_all_weak():
    profile = SkinProfile(
        session_id="s",
        selfie_url="/x",
        undertone="cool",
        concerns=[ConcernScore(name="redness", score=80, severity="high")],
    )
    cands = [
        Candidate(id="1", session_id="s", image_url="/g", final_score=40, tier="caution"),
        Candidate(id="2", session_id="s", image_url="/g", final_score=42, tier="caution"),
    ]
    g = build_guidance(profile, cands, threshold=55)
    assert g["needed"] is True
    assert "better direction" in g["headline"].lower() or "ideal" in g["headline"].lower()
    assert len(g["tips"]) >= 1


def test_skin_signal_in_reasons():
    profile = SkinProfile(
        session_id="s",
        selfie_url="/x",
        undertone="cool",
        concerns=[ConcernScore(name="redness", score=80, severity="high")],
    )
    hot = {
        "primary_family": "red",
        "primary_hex": "#cc2233",
        "saturation": 0.7,
        "value": 0.55,
        "warm_lean": True,
        "cool_lean": False,
    }
    _, _, _, _, reasons, short = score_garment(profile, hot)
    signals = {r.signal for r in reasons}
    assert "redness" in signals or "undertone" in signals
    assert short
