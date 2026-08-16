from app.core.store import JsonSessionStore


def test_json_store_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    from app.core.config import get_settings

    get_settings.cache_clear()
    store = JsonSessionStore()
    created = store.create()
    created.intent_text = "date night"
    store.save(created)
    loaded = store.require(created.id)
    assert loaded.id == created.id
    assert loaded.intent_text == "date night"
    get_settings.cache_clear()


def test_normalize_live_shaped_bundle():
    from app.youcam.client import normalize_profile_bundle

    bundle = {
        "skin": {
            "result": {
                "output": {
                    "skin_age": 27,
                    "redness": 72,
                    "radiance": 40,
                    "concerns": [{"name": "redness", "score": 72}],
                }
            }
        },
        "color": {
            "result": {
                "output": {
                    "undertone": "cool",
                    "skin": {"hex": "#c4a484"},
                    "hair": {"hex": "#2a1a12"},
                }
            }
        },
        "fitzpatrick": {"result": {"output": {"type": "III"}}},
    }
    norm = normalize_profile_bundle(bundle)
    assert norm["undertone"] == "cool"
    assert norm["fitzpatrick"] == "III"
    assert any(c.name == "redness" and c.score == 72 for c in norm["concerns"])


def test_normalize_v2_live_shape():
    from app.youcam.client import normalize_profile_bundle

    bundle = {
        "skin": {
            "task_status": "success",
            "results": {
                "output": [
                    {"type": "redness", "ui_score": 80, "raw_score": 72.0},
                    {"type": "radiance", "ui_score": 40, "raw_score": 38.0},
                    {"type": "dark_circle_v2", "ui_score": 70, "raw_score": 65.0},
                ]
            },
        },
        "color": {
            "task_status": "success",
            "results": {
                "color": {
                    "skin_color": "#b9947c",
                    "hair_color": "#2a1a12",
                    "eye_color": "#293F9B",
                    "lip_color": "#D23245",
                    "eyebrow_color": "#5B2B31",
                }
            },
        },
        "fitzpatrick": {
            "task_status": "success",
            "results": {"fitzpatrick_scale": "III"},
        },
    }
    norm = normalize_profile_bundle(bundle)
    assert norm["fitzpatrick"] == "III"
    assert norm["undertone"] in {"cool", "warm", "neutral"}
    redness = next(c for c in norm["concerns"] if c.name == "redness")
    assert redness.score == 20
    radiance = next(c for c in norm["concerns"] if c.name == "radiance")
    assert radiance.score == 40
    assert any(c.name == "dark_circle" for c in norm["concerns"])
    assert any(p.role == "skin" and p.hex == "#b9947c" for p in norm["palette"])


def test_score_info_to_results():
    from app.youcam.client import score_info_to_results

    results = score_info_to_results(
        {
            "redness": {"raw_score": 72.0, "ui_score": 77},
            "pore": {
                "whole": {"raw_score": 49.2, "ui_score": 67},
                "nose": {"raw_score": 29.1, "ui_score": 58},
            },
            "all": {"score": 75.7},
            "skin_age": 37,
        }
    )
    types = {item["type"] for item in results["output"]}
    assert types == {"redness", "pore"}
    assert results["skin_age"] == 37


def test_face_focus_crop_shrinks_frame():
    from PIL import Image

    from app.youcam.client import _crop_face_focus

    img = Image.new("RGB", (1000, 1500), (180, 140, 120))
    cropped = _crop_face_focus(img, 0.56)
    assert cropped.size[0] == 560
    assert cropped.size[1] == 840
