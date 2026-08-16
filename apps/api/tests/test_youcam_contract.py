from pathlib import Path

from app.core.config import Settings
from app.youcam.client import YouCamClient, _garment_category


def test_clothes_action_defaults_to_public_v3():
    settings = Settings(_env_file=None)
    assert settings.youcam_clothes_action == "cloth-v3"
    assert settings.youcam_clothes_fallback_action == "cloth-v4"


def test_clothes_category_mapping_is_explicit():
    assert _garment_category("clothes") == "auto"
    assert _garment_category("dress") == "full_body"
    assert _garment_category("top") == "upper_body"


def test_client_keeps_configured_clothes_actions():
    settings = Settings(
        _env_file=None,
        youcam_api_key="test",
        youcam_clothes_action="cloth-v3",
        youcam_clothes_fallback_action="cloth-v4",
    )
    client = YouCamClient(settings)
    assert client.settings.youcam_clothes_action == "cloth-v3"
    assert client.settings.youcam_clothes_fallback_action == "cloth-v4"
