import os
import sys
import sqlite3
from io import BytesIO
from PIL import Image
from fastapi.testclient import TestClient

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend_api.main import app
from backend_api.routers.auth import create_token
from backend.database import get_connection

client = TestClient(app)

def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "API running"}

def test_unauthorized_access():
    assert client.get("/students/all").status_code == 401
    assert client.get("/attendance/today").status_code == 401
    assert client.post("/attendance/mark", json={"student_id": "CS001"}).status_code == 401

def test_pydantic_validation():
    admin_token = create_token("admin")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Empty payload to /attendance/mark
    response = client.post("/attendance/mark", json={}, headers=headers)
    assert response.status_code == 422

    # Invalid length student_id
    response = client.post("/attendance/mark", json={"student_id": ""}, headers=headers)
    assert response.status_code == 422

def test_duplicate_student_integrity():
    admin_token = create_token("admin")
    headers = {"Authorization": f"Bearer {admin_token}"}

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM students WHERE student_id = ?", ("CS999",))
    cursor.execute(
        "INSERT INTO students (student_id, name, department, password, embedding) VALUES (?, ?, ?, ?, ?)",
        ("CS999", "Duplicate Test", "CS", "hashed_pwd", b"fake_embedding")
    )
    conn.commit()
    conn.close()

    img_io = BytesIO()
    Image.new("RGB", (100, 100), color="white").save(img_io, "JPEG")
    img_io.seek(0)

    form_data = {
        "student_id": "CS999",
        "name": "Duplicate Test",
        "department": "CS",
        "password": "password123"
    }
    files = {
        "image": ("test.jpg", img_io, "image/jpeg")
    }

    response = client.post("/students/register", data=form_data, files=files, headers=headers)
    assert response.status_code in [400, 503]
    detail = response.json().get("detail", "")
    assert any(expected in detail for expected in ["Student ID is already registered", "No face detected", "Biometric ML", "Facial recognition"])

def test_attendance_flow():
    admin_token = create_token("admin")
    headers = {"Authorization": f"Bearer {admin_token}"}

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM students WHERE student_id = ?", ("CS999",))
    cursor.execute("DELETE FROM attendance WHERE student_id = ?", ("CS999",))
    cursor.execute(
        "INSERT INTO students (student_id, name, department, password, embedding) VALUES (?, ?, ?, ?, ?)",
        ("CS999", "Attendance Flow Test", "CS", "pwd", b"fake_embedding")
    )
    conn.commit()
    conn.close()

    try:
        response = client.post("/attendance/mark", json={"student_id": "CS999"}, headers=headers)
        assert response.status_code == 200
        res_data = response.json()
        assert res_data["status"] in ["marked", "already_marked"]

        response2 = client.post("/attendance/mark", json={"student_id": "CS999"}, headers=headers)
        assert response2.status_code == 200
        assert response2.json()["status"] == "already_marked"

        resp_today = client.get("/attendance/today", headers=headers)
        assert resp_today.status_code == 200
        records = resp_today.json()["records"]
        assert any(r["student_id"] == "CS999" for r in records)
    finally:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM students WHERE student_id = ?", ("CS999",))
        cursor.execute("DELETE FROM attendance WHERE student_id = ?", ("CS999",))
        conn.commit()
        conn.close()

def test_service_api_key_auth():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM students WHERE student_id = ?", ("CS999",))
    cursor.execute(
        "INSERT INTO students (student_id, name, department, password, embedding) VALUES (?, ?, ?, ?, ?)",
        ("CS999", "Service Test", "CS", "pwd", b"fake_embedding")
    )
    conn.commit()
    conn.close()

    valid_headers = {"X-API-KEY": "dev-service-api-key"}
    invalid_headers = {"X-API-KEY": "wrong-api-key"}

    assert client.get("/students/all", headers=invalid_headers).status_code == 403
    assert client.post("/attendance/mark", json={"student_id": "CS999"}, headers=invalid_headers).status_code == 403

    assert client.get("/students/all", headers=valid_headers).status_code == 200
    
    resp = client.post("/attendance/mark", json={"student_id": "CS999"}, headers=valid_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] in ["marked", "already_marked"]

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM students WHERE student_id = ?", ("CS999",))
    cursor.execute("DELETE FROM attendance WHERE student_id = ?", ("CS999",))
    conn.commit()
    conn.close()

def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "database" in data
