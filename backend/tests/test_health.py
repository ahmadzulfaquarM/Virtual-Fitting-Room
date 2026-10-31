from fastapi.testclient import TestClient

from app import __version__
from app.main import SERVICE_NAME, app

client = TestClient(app)


def test_health_returns_ok_payload():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": SERVICE_NAME,
        "version": __version__,
    }


def test_health_rejects_non_get_methods():
    assert client.post("/health").status_code == 405


def test_cors_allows_vite_dev_origin():
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_does_not_allow_unknown_origin():
    response = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in response.headers


def test_unknown_route_returns_404():
    assert client.get("/does-not-exist").status_code == 404
