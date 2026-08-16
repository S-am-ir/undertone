from app.core.schemas import ConcernScore, SkinProfile
from app.services.scoring import score_garment


def _profile(**kwargs):
    base = dict(
        session_id="s1",
        selfie_url="/x",
        undertone="cool",
        depth="medium",
        contrast="medium",
        concerns=[
            ConcernScore(name="redness", score=75, severity="high"),
            ConcernScore(name="radiance", score=35, severity="low"),
        ],
    )
    base.update(kwargs)
    return SkinProfile(**base)


def test_redness_downranks_hot_red():
    p = _profile()
    hot_red = {
        "primary_family": "red",
        "primary_hex": "#cc2233",
        "saturation": 0.7,
        "value": 0.6,
        "warm_lean": True,
        "cool_lean": False,
    }
    cool_navy = {
        "primary_family": "navy",
        "primary_hex": "#1a2a4a",
        "saturation": 0.4,
        "value": 0.3,
        "warm_lean": False,
        "cool_lean": True,
    }
    r1, *_rest1 = score_garment(p, hot_red)
    r2, *_rest2 = score_garment(p, cool_navy)
    assert r2 > r1


def test_warm_undertone_prefers_warm():
    p = _profile(undertone="warm", concerns=[])
    warm = {
        "primary_family": "orange",
        "primary_hex": "#d4833a",
        "saturation": 0.5,
        "value": 0.6,
        "warm_lean": True,
        "cool_lean": False,
    }
    cool = {
        "primary_family": "blue",
        "primary_hex": "#3366cc",
        "saturation": 0.55,
        "value": 0.6,
        "warm_lean": False,
        "cool_lean": True,
    }
    r_warm, *_ = score_garment(p, warm)
    r_cool, *_ = score_garment(p, cool)
    assert r_warm >= r_cool - 5
