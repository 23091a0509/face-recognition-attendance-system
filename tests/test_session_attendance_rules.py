import pytest
from datetime import datetime, timedelta
from backend_api.routers.attendance import evaluate_student_attendance, parse_time_to_24h

def test_parse_time_to_24h():
    assert parse_time_to_24h("9:00 AM") == "09:00:00"
    assert parse_time_to_24h("1:00 PM") == "13:00:00"
    assert parse_time_to_24h("09:30") == "09:30:00"
    assert parse_time_to_24h("13:15:00") == "13:15:00"

def test_session_never_recognized_is_absent():
    session = {
        "start_time": "09:00:00",
        "end_time": "13:00:00",
        "full_day_threshold": 75.0,
        "half_day_threshold": 40.0
    }
    result = evaluate_student_attendance(session, [])
    assert result["status"] == "Absent"
    assert result["minutes_attended"] == 0
    assert "Never recognized" in result["reason"]

def test_session_full_day_both_halves():
    session = {
        "start_time": "09:00:00",
        "end_time": "13:00:00",
        "full_day_threshold": 75.0,
        "half_day_threshold": 40.0
    }
    today = datetime.now().strftime("%Y-%m-%d")
    logs = [
        {"timestamp": f"{today}T09:10:00", "time": "09:10:00", "confidence": 98.0},
        {"timestamp": f"{today}T10:00:00", "time": "10:00:00", "confidence": 98.0},
        {"timestamp": f"{today}T11:45:00", "time": "11:45:00", "confidence": 98.0},
        {"timestamp": f"{today}T12:50:00", "time": "12:50:00", "confidence": 98.0}
    ]
    result = evaluate_student_attendance(session, logs)
    assert result["status"] == "Full Day"
    assert result["halves_attended"]["first_half"] is True
    assert result["halves_attended"]["second_half"] is True
    assert "Full Day" in result["status"]

def test_session_half_day_first_half_only():
    session = {
        "start_time": "09:00:00",
        "end_time": "13:00:00",
        "full_day_threshold": 75.0,
        "half_day_threshold": 40.0
    }
    today = datetime.now().strftime("%Y-%m-%d")
    # Only logged between 09:05 and 10:45 (midpoint is 11:00)
    logs = [
        {"timestamp": f"{today}T09:05:00", "time": "09:05:00", "confidence": 97.0},
        {"timestamp": f"{today}T10:55:00", "time": "10:55:00", "confidence": 97.0}
    ]
    result = evaluate_student_attendance(session, logs)
    assert result["status"] == "Half Day"
    assert result["halves_attended"]["first_half"] is True
    assert result["halves_attended"]["second_half"] is False
    assert "Present only during first half" in result["reason"]

def test_session_leaves_before_threshold_is_absent():
    session = {
        "start_time": "09:00:00",
        "end_time": "13:00:00",
        "full_day_threshold": 75.0,
        "half_day_threshold": 40.0
    }
    today = datetime.now().strftime("%Y-%m-%d")
    # Present for only 10 minutes total (10m out of 240m = 4% < 40%)
    logs = [
        {"timestamp": f"{today}T09:05:00", "time": "09:05:00", "confidence": 97.0},
        {"timestamp": f"{today}T09:15:00", "time": "09:15:00", "confidence": 97.0}
    ]
    result = evaluate_student_attendance(session, logs)
    assert result["status"] == "Absent"
    assert "Leaves before required threshold" in result["reason"]
