import pytest
from fastapi.testclient import TestClient
from backend_api.main import app

client = TestClient(app)

def test_unauthenticated_protected_route_fails():
    res = client.get("/attendance/today")
    assert res.status_code in [401, 403]

def test_health_check_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert "timezone" in data
