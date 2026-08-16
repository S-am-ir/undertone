from fastapi.testclient import TestClient

from app.main import app


def test_health_reports_live_providers_not_mock():
    client = TestClient(app)
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert "mock" not in body["youcam"]
    assert "mock" not in body["llm"]
    assert body["supabase"] in {"on", "local-json"}
    assert body["youcam"] in {"live", "missing-key"}
